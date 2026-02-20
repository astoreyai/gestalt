/**
 * Connection health monitoring for the connector bus.
 * Handles heartbeat ping/pong and auto-cleanup of dead connections.
 */

import { WebSocket } from 'ws'

export interface ConnectionInfo {
  id: string
  ws: WebSocket
  alive: boolean
  connectedAt: number
  lastActivity: number
}

export interface ConnectionManagerConfig {
  heartbeatInterval: number // ms between heartbeat checks
  connectionTimeout: number // ms before considering connection dead
}

export class ConnectionManager {
  private connections: Map<string, ConnectionInfo> = new Map()
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private config: ConnectionManagerConfig
  private nextId = 1
  private readonly MAX_CONNECTIONS = 200

  constructor(config: ConnectionManagerConfig) {
    this.config = config
  }

  /** Add a new connection and return its ID, or null if limit reached */
  addConnection(ws: WebSocket): string | null {
    if (this.connections.size >= this.MAX_CONNECTIONS) {
      ws.close(1013, 'Maximum connections reached')
      return null
    }
    const id = `conn_${this.nextId++}`
    this.connections.set(id, {
      id,
      ws,
      alive: true,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    })
    return id
  }

  /** Remove a connection by ID */
  removeConnection(id: string): void {
    this.connections.delete(id)
  }

  /** Mark a connection as alive (called on pong/message) */
  markAlive(id: string): void {
    const conn = this.connections.get(id)
    if (conn) {
      conn.alive = true
      conn.lastActivity = Date.now()
    }
  }

  /** Start periodic heartbeat checks */
  startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.checkHeartbeats()
    }, this.config.heartbeatInterval)
  }

  /** Stop heartbeat monitoring */
  stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /** Check all connections and terminate dead ones */
  private checkHeartbeats(): void {
    const now = Date.now()

    for (const [id, conn] of this.connections) {
      if (!conn.alive) {
        // Was marked not alive on previous check — terminate
        console.warn(`[ConnectionManager] Terminating dead connection: ${id}`)
        conn.ws.terminate()
        this.connections.delete(id)
        continue
      }

      // Check for timeout
      if (now - conn.lastActivity > this.config.connectionTimeout) {
        conn.alive = false
        // Send ping to check if still alive
        if (conn.ws.readyState === WebSocket.OPEN) {
          conn.ws.ping()
        }
      }
    }
  }

  /** Get all active connections */
  getConnections(): ConnectionInfo[] {
    return Array.from(this.connections.values())
  }

  /** Get number of active connections */
  get size(): number {
    return this.connections.size
  }
}
