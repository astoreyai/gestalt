/**
 * WebSocket server for the connector bus.
 * External programs connect to receive gesture events and send data.
 */

import { WebSocketServer, WebSocket } from 'ws'
import { randomBytes, timingSafeEqual } from 'crypto'
import { URL } from 'url'
import type { BusMessage, BusGestureMessage } from '@shared/bus-protocol'
import { ProgramRegistry, type RegisteredProgram } from './registry'
import { GestureFanout } from './fanout'
import { ConnectionManager } from './connections'

export interface BusServerConfig {
  port: number
  heartbeatInterval?: number // ms, default 30000
  connectionTimeout?: number // ms, default 10000
  authenticate?: boolean // default true — require token auth on connection
}

/** Maximum payload size in bytes (64KB) */
const MAX_PAYLOAD = 64 * 1024

/** Maximum messages per client per second */
const RATE_LIMIT = 100

/** Rate limit window in milliseconds */
const RATE_WINDOW_MS = 1000

export class BusServer {
  private wss: WebSocketServer | null = null
  private registry: ProgramRegistry
  private fanout: GestureFanout
  private connections: ConnectionManager
  private config: BusServerConfig
  private running = false
  /** Per-client rate tracking: clientId -> ring buffer state */
  private rateLimits: Map<string, { buf: number[]; head: number; count: number }> = new Map()
  /** Authentication token — clients must provide this to connect */
  private token: string

  constructor(config: BusServerConfig) {
    this.config = config
    this.token = randomBytes(16).toString('hex')
    this.registry = new ProgramRegistry()
    this.fanout = new GestureFanout(this.registry)
    this.connections = new ConnectionManager({
      heartbeatInterval: config.heartbeatInterval ?? 30000,
      connectionTimeout: config.connectionTimeout ?? 10000
    })
  }

  /** Get the authentication token for this server instance */
  getToken(): string {
    return this.token
  }

  /** Start the WebSocket server, retrying up to 3 ports on EADDRINUSE */
  async start(): Promise<void> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this._tryStart(this.config.port + attempt)
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (!lastError.message.includes('EADDRINUSE')) throw lastError
        console.warn(`[BusServer] Port ${this.config.port + attempt} in use, retrying...`)
      }
    }
    throw lastError!
  }

  /** Attempt to start the WebSocket server on a specific port */
  private _tryStart(port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port,
          host: '127.0.0.1',
          maxPayload: MAX_PAYLOAD
        })

        this.wss.on('listening', () => {
          this.running = true
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[BusServer] Listening on port ${port}`)
          }
          resolve()
        })

        this.wss.on('connection', (ws, req) => {
          // Token authentication
          // NOTE (P2-31 accepted risk): Token is passed via URL query parameter.
          // This is a design trade-off — WebSocket upgrade requests do not support
          // custom headers in browser clients. The risk is mitigated by binding to
          // 127.0.0.1 only and using short-lived per-session tokens.
          if (this.config.authenticate !== false) {
            const url = new URL(req.url ?? '', `http://${req.headers.host ?? 'localhost'}`)
            const clientToken = url.searchParams.get('token')
            if (
              !clientToken ||
              clientToken.length !== this.token.length ||
              !timingSafeEqual(Buffer.from(clientToken), Buffer.from(this.token))
            ) {
              ws.close(1008, 'Unauthorized')
              return
            }
          }

          const clientId = this.connections.addConnection(ws)
          if (!clientId) {
            // Connection limit reached — ws already closed by ConnectionManager
            return
          }
          const ip = req.socket.remoteAddress ?? 'unknown'
          if (process.env.NODE_ENV !== 'production') {
            console.log(`[BusServer] Client connected: ${clientId} from ${ip}`)
          }

          ws.on('message', (data) => {
            if (this.isRateLimited(clientId)) {
              console.warn(`[BusServer] Rate limit exceeded for ${clientId}, disconnecting`)
              this.sendError(ws, 'RATE_LIMITED', 'Too many messages')
              ws.close(1008, 'Rate limit exceeded')
              return
            }
            this.handleMessage(clientId, ws, data.toString())
          })

          ws.on('close', () => {
            if (process.env.NODE_ENV !== 'production') {
              console.log(`[BusServer] Client disconnected: ${clientId}`)
            }
            this.registry.unregisterByConnectionId(clientId)
            this.connections.removeConnection(clientId)
            this.rateLimits.delete(clientId)
          })

          ws.on('error', (err) => {
            console.error(`[BusServer] Client error ${clientId}:`, err.message)
          })
        })

        this.wss.on('error', (err) => {
          console.error('[BusServer] Server error:', err)
          reject(err)
        })

        // Start heartbeat monitoring
        this.connections.startHeartbeat()
      } catch (err) {
        reject(err)
      }
    })
  }

  /**
   * Check if a client has exceeded the message rate limit.
   * Uses a ring buffer per client for O(1) eviction instead of array.shift().
   */
  private isRateLimited(clientId: string): boolean {
    const now = Date.now()
    let state = this.rateLimits.get(clientId)
    if (!state) {
      state = { buf: new Array(RATE_LIMIT + 1).fill(0), head: 0, count: 0 }
      this.rateLimits.set(clientId, state)
    }

    // Evict expired entries
    const cutoff = now - RATE_WINDOW_MS
    while (state.count > 0 && state.buf[state.head] <= cutoff) {
      state.head = (state.head + 1) % state.buf.length
      state.count--
    }

    if (state.count > RATE_LIMIT) return true

    // Push to tail
    const tail = (state.head + state.count) % state.buf.length
    state.buf[tail] = now
    state.count++

    return state.count > RATE_LIMIT
  }

  /** Handle an incoming message from a client */
  private handleMessage(clientId: string, ws: WebSocket, raw: string): void {
    let msg: unknown
    try {
      msg = JSON.parse(raw)
    } catch {
      this.sendError(ws, 'PARSE_ERROR', 'Invalid JSON message')
      return
    }

    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || !('type' in msg)) {
      this.sendError(ws, 'VALIDATION_ERROR', 'Missing message type')
      return
    }

    const busMsg = msg as BusMessage

    switch (busMsg.type) {
      case 'register':
        if (typeof busMsg.program !== 'string' || !busMsg.program || busMsg.program.length > 100) {
          this.sendError(ws, 'VALIDATION_ERROR', 'Invalid program name')
          return
        }
        if (!Array.isArray(busMsg.capabilities) ||
            !busMsg.capabilities.every(c => typeof c === 'string')) {
          this.sendError(ws, 'VALIDATION_ERROR', 'Invalid capabilities array')
          return
        }
        this.registry.register(clientId, ws, busMsg.program, busMsg.capabilities)
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[BusServer] Registered program: ${busMsg.program} (${busMsg.capabilities.join(', ')})`)
        }
        this.broadcastStatus()
        break

      case 'data':
        if (typeof busMsg.program !== 'string' || !busMsg.program) {
          this.sendError(ws, 'VALIDATION_ERROR', 'Invalid program name in data message')
          return
        }
        if (busMsg.payload === undefined || busMsg.payload === null) {
          this.sendError(ws, 'VALIDATION_ERROR', 'Missing payload in data message')
          return
        }
        // Forward data to the appropriate program
        this.fanout.forwardData(busMsg.program, busMsg.payload)
        break

      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: busMsg.timestamp }))
        this.connections.markAlive(clientId)
        break

      default:
        this.sendError(ws, 'UNKNOWN_TYPE', `Unknown message type: ${(busMsg as BusMessage).type}`)
    }
  }

  /** Broadcast a gesture event to all registered programs */
  broadcastGesture(gesture: BusGestureMessage): void {
    if (!this.running) return
    this.fanout.broadcastGesture(gesture)
  }

  /** Send error to a specific client */
  private sendError(ws: WebSocket, code: string, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'error', code, message }))
    }
  }

  /** Broadcast current status to all connected clients */
  broadcastStatus(): void {
    const programs = this.registry.listPrograms()
    const statusMsg = JSON.stringify({
      type: 'status',
      programs: programs.map(p => ({
        name: p.name,
        capabilities: p.capabilities,
        connectedAt: p.connectedAt
      }))
    })

    this.wss?.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(statusMsg)
      }
    })
  }

  /** Get list of connected programs */
  getPrograms(): RegisteredProgram[] {
    return this.registry.listPrograms()
  }

  /** Check if server is running */
  isRunning(): boolean {
    return this.running
  }

  /** Get server port */
  getPort(): number {
    return this.config.port
  }

  /** Stop the WebSocket server */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.connections.stopHeartbeat()
      this.registry.clear()
      this.rateLimits.clear()
      this.running = false

      if (this.wss) {
        this.wss.close(() => {
          this.wss = null
          if (process.env.NODE_ENV !== 'production') {
            console.log('[BusServer] Stopped')
          }
          resolve()
        })
      } else {
        resolve()
      }
    })
  }
}
