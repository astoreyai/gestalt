import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { connect, type ConnectorOptions } from '../sdk'

// ─── Mock WebSocket ────────────────────────────────────────────────

type WSHandler = (event?: unknown) => void

class MockWebSocket {
  static OPEN = 1
  static CLOSED = 3
  static instances: MockWebSocket[] = []

  readyState = MockWebSocket.OPEN
  onopen: WSHandler | null = null
  onclose: WSHandler | null = null
  onerror: WSHandler | null = null
  onmessage: WSHandler | null = null

  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  })

  constructor(public url: string) {
    MockWebSocket.instances.push(this)
    // Fire onopen via microtask (works with both real and fake timers)
    Promise.resolve().then(() => this.onopen?.())
  }

  /** Test helper: simulate the connection being closed by server */
  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED
    this.onclose?.()
  }

  /** Test helper: simulate error */
  simulateError(err: Error): void {
    this.onerror?.(err)
  }
}

// Replace global WebSocket with mock
const originalWebSocket = globalThis.WebSocket
beforeEach(() => {
  MockWebSocket.instances = []
  ;(globalThis as Record<string, unknown>).WebSocket = MockWebSocket as unknown as typeof WebSocket
})
afterEach(() => {
  ;(globalThis as Record<string, unknown>).WebSocket = originalWebSocket
})

// ─── Tests ─────────────────────────────────────────────────────────

describe('SDK Connector', () => {
  it('should connect and register with the bus', async () => {
    const conn = await connect('test-program', ['rotate', 'select'])
    expect(conn.isConnected()).toBe(true)

    // Should have sent a register message
    const ws = MockWebSocket.instances[0]
    expect(ws.send).toHaveBeenCalledOnce()
    const msg = JSON.parse(ws.send.mock.calls[0][0])
    expect(msg.type).toBe('register')
    expect(msg.program).toBe('test-program')
    expect(msg.capabilities).toEqual(['rotate', 'select'])
  })

  it('should attempt reconnection on close when reconnect=true', async () => {
    vi.useFakeTimers()
    const options: ConnectorOptions = { reconnect: true, reconnectDelay: 100 }
    const conn = await connect('test-program', [], options)
    expect(MockWebSocket.instances).toHaveLength(1)

    // Simulate server-side close
    MockWebSocket.instances[0].simulateClose()

    // Advance time past reconnectDelay
    await vi.advanceTimersByTimeAsync(150)

    // A new WebSocket should have been created for reconnection
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2)
    vi.useRealTimers()
  })

  it('should use exponential backoff for reconnect delay', async () => {
    vi.useFakeTimers()
    const options: ConnectorOptions = { reconnect: true, reconnectDelay: 100 }
    const conn = await connect('test-program', [], options)

    // First disconnect
    MockWebSocket.instances[0].simulateClose()
    await vi.advanceTimersByTimeAsync(100) // 100ms * 2^0 = 100ms
    expect(MockWebSocket.instances).toHaveLength(2)

    // Second disconnect (simulate the reconnection WS closing immediately)
    MockWebSocket.instances[1].simulateClose()
    // Should wait 200ms (100ms * 2^1)
    await vi.advanceTimersByTimeAsync(150) // Not enough yet
    expect(MockWebSocket.instances).toHaveLength(2) // No new connection yet
    await vi.advanceTimersByTimeAsync(100) // Now 250ms total > 200ms
    expect(MockWebSocket.instances).toHaveLength(3)

    vi.useRealTimers()
  })

  it('should stop reconnecting after max retries', async () => {
    vi.useFakeTimers()
    const options: ConnectorOptions = {
      reconnect: true,
      reconnectDelay: 10,
      maxReconnectAttempts: 2
    }
    const conn = await connect('test-program', [], options)

    // Disconnect and reconnect attempt 1
    MockWebSocket.instances[0].simulateClose()
    await vi.advanceTimersByTimeAsync(20)
    expect(MockWebSocket.instances).toHaveLength(2)

    // Disconnect and reconnect attempt 2
    MockWebSocket.instances[1].simulateClose()
    await vi.advanceTimersByTimeAsync(50)
    expect(MockWebSocket.instances).toHaveLength(3)

    // Disconnect — should NOT reconnect (max retries reached)
    MockWebSocket.instances[2].simulateClose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(MockWebSocket.instances).toHaveLength(3) // No more

    vi.useRealTimers()
  })

  it('should not reconnect when reconnect=false', async () => {
    vi.useFakeTimers()
    const options: ConnectorOptions = { reconnect: false }
    const conn = await connect('test-program', [], options)

    MockWebSocket.instances[0].simulateClose()
    await vi.advanceTimersByTimeAsync(5000)

    // Only the original WebSocket, no reconnection attempts
    expect(MockWebSocket.instances).toHaveLength(1)
    vi.useRealTimers()
  })

  it('should not reconnect by default (reconnect not set)', async () => {
    vi.useFakeTimers()
    const conn = await connect('test-program', [])

    MockWebSocket.instances[0].simulateClose()
    await vi.advanceTimersByTimeAsync(5000)

    expect(MockWebSocket.instances).toHaveLength(1)
    vi.useRealTimers()
  })
})
