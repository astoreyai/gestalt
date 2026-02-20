/**
 * Connector SDK — minimal helper for external programs to connect
 * to the Tracking app's WebSocket bus.
 *
 * Usage (Node.js):
 *   import { connect } from './sdk'
 *   const conn = await connect('my-program', ['rotate', 'select'])
 *   conn.onGesture((gesture) => console.log(gesture))
 *   conn.sendData({ action: 'hello' })
 *   conn.disconnect()
 *
 * Usage (Browser):
 *   const conn = await connect('my-program', ['rotate'], { url: 'ws://localhost:9876' })
 */

import type {
  BusRegisterMessage,
  BusGestureMessage,
  BusDataMessage,
  BusMessage,
  BusStatusMessage
} from '@shared/bus-protocol'

export interface ConnectorOptions {
  url?: string // WebSocket URL, default ws://localhost:9876
  reconnect?: boolean // Auto-reconnect on disconnect
  reconnectDelay?: number // ms between reconnect attempts
  maxReconnectAttempts?: number // Max reconnect attempts (default 10)
}

export interface TrackingConnection {
  onGesture(handler: (gesture: BusGestureMessage) => void): void
  onData(handler: (data: BusDataMessage) => void): void
  onStatus(handler: (status: BusStatusMessage) => void): void
  onDisconnect(handler: () => void): void
  sendData(payload: unknown): void
  disconnect(): void
  isConnected(): boolean
}

export async function connect(
  programName: string,
  capabilities: string[] = [],
  options: ConnectorOptions = {}
): Promise<TrackingConnection> {
  const url = options.url ?? 'ws://localhost:9876'
  const shouldReconnect = options.reconnect ?? false
  const baseDelay = options.reconnectDelay ?? 1000
  const maxAttempts = options.maxReconnectAttempts ?? 10
  const MAX_DELAY = 30000

  const handlers = {
    gesture: [] as Array<(g: BusGestureMessage) => void>,
    data: [] as Array<(d: BusDataMessage) => void>,
    status: [] as Array<(s: BusStatusMessage) => void>,
    disconnect: [] as Array<() => void>
  }

  let currentWs: WebSocket | null = null
  let reconnectAttempts = 0
  let intentionalClose = false

  function setupWs(ws: WebSocket): void {
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as BusMessage
        switch (msg.type) {
          case 'gesture':
            handlers.gesture.forEach(h => h(msg))
            break
          case 'data':
            handlers.data.forEach(h => h(msg))
            break
          case 'status':
            handlers.status.forEach(h => h(msg))
            break
          case 'ping':
            ws.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }))
            break
        }
      } catch {
        // Invalid message, ignore
      }
    }

    ws.onclose = () => {
      handlers.disconnect.forEach(h => h())

      if (shouldReconnect && !intentionalClose && reconnectAttempts < maxAttempts) {
        const delay = Math.min(baseDelay * Math.pow(2, reconnectAttempts), MAX_DELAY)
        reconnectAttempts++
        setTimeout(() => {
          attemptReconnect()
        }, delay)
      }
    }
  }

  function attemptReconnect(): void {
    const ws = new WebSocket(url)
    currentWs = ws

    ws.onopen = () => {
      // Re-register with the bus
      const registerMsg: BusRegisterMessage = {
        type: 'register',
        program: programName,
        capabilities
      }
      ws.send(JSON.stringify(registerMsg))
    }

    ws.onerror = () => {
      // Error during reconnect — onclose will handle retry
    }

    setupWs(ws)
  }

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    currentWs = ws

    ws.onopen = () => {
      // Register with the bus
      const registerMsg: BusRegisterMessage = {
        type: 'register',
        program: programName,
        capabilities
      }
      ws.send(JSON.stringify(registerMsg))

      const connection: TrackingConnection = {
        onGesture: (handler) => handlers.gesture.push(handler),
        onData: (handler) => handlers.data.push(handler),
        onStatus: (handler) => handlers.status.push(handler),
        onDisconnect: (handler) => handlers.disconnect.push(handler),

        sendData: (payload: unknown) => {
          if (currentWs && currentWs.readyState === WebSocket.OPEN) {
            const msg: BusDataMessage = {
              type: 'data',
              program: programName,
              payload
            }
            currentWs.send(JSON.stringify(msg))
          }
        },

        disconnect: () => {
          intentionalClose = true
          currentWs?.close()
        },

        isConnected: () => currentWs !== null && currentWs.readyState === WebSocket.OPEN
      }

      resolve(connection)
    }

    setupWs(ws)

    ws.onerror = (err) => {
      reject(err)
    }
  })
}
