import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ProgramRegistry } from '../registry'
import { GestureFanout } from '../fanout'
import { ConnectionManager } from '../connections'
import { BusServer } from '../server'
import { WebSocket, WebSocketServer } from 'ws'
import type { BusGestureMessage } from '@shared/bus-protocol'
import { createServer, type AddressInfo } from 'net'
import { URL } from 'url'

// Mock WebSocket
function createMockWs(readyState: number = WebSocket.OPEN): WebSocket {
  return {
    readyState,
    send: vi.fn(),
    ping: vi.fn(),
    terminate: vi.fn(),
    on: vi.fn(),
    close: vi.fn()
  } as unknown as WebSocket
}

describe('ProgramRegistry', () => {
  let registry: ProgramRegistry

  beforeEach(() => {
    registry = new ProgramRegistry()
  })

  it('should start empty', () => {
    expect(registry.size).toBe(0)
    expect(registry.listPrograms()).toEqual([])
  })

  it('should register a program', () => {
    const ws = createMockWs()
    registry.register('conn_1', ws, 'blender', ['rotate', 'select'])
    expect(registry.size).toBe(1)
    const programs = registry.listPrograms()
    expect(programs[0].name).toBe('blender')
    expect(programs[0].capabilities).toEqual(['rotate', 'select'])
  })

  it('should update on re-registration', () => {
    const ws = createMockWs()
    registry.register('conn_1', ws, 'blender', ['rotate'])
    registry.register('conn_1', ws, 'blender-v2', ['rotate', 'zoom'])
    expect(registry.size).toBe(1)
    expect(registry.listPrograms()[0].name).toBe('blender-v2')
  })

  it('should register multiple programs', () => {
    registry.register('conn_1', createMockWs(), 'blender', ['rotate'])
    registry.register('conn_2', createMockWs(), 'obs', ['select'])
    expect(registry.size).toBe(2)
  })

  it('should unregister by connection ID', () => {
    registry.register('conn_1', createMockWs(), 'blender', ['rotate'])
    registry.unregisterByConnectionId('conn_1')
    expect(registry.size).toBe(0)
  })

  it('should unregister by name', () => {
    registry.register('conn_1', createMockWs(), 'blender', ['rotate'])
    registry.register('conn_2', createMockWs(), 'obs', ['select'])
    registry.unregisterByName('blender')
    expect(registry.size).toBe(1)
    expect(registry.listPrograms()[0].name).toBe('obs')
  })

  it('should get program by name', () => {
    registry.register('conn_1', createMockWs(), 'blender', ['rotate'])
    const program = registry.getByName('blender')
    expect(program).toBeDefined()
    expect(program?.name).toBe('blender')
  })

  it('should return undefined for unknown program', () => {
    expect(registry.getByName('unknown')).toBeUndefined()
  })

  it('should get programs by capability', () => {
    registry.register('conn_1', createMockWs(), 'blender', ['rotate', 'select'])
    registry.register('conn_2', createMockWs(), 'obs', ['select'])
    registry.register('conn_3', createMockWs(), 'custom', ['zoom'])

    const rotating = registry.getByCapability('rotate')
    expect(rotating.length).toBe(1)
    expect(rotating[0].name).toBe('blender')

    const selecting = registry.getByCapability('select')
    expect(selecting.length).toBe(2)
  })

  it('should clear all registrations', () => {
    registry.register('conn_1', createMockWs(), 'blender', ['rotate'])
    registry.register('conn_2', createMockWs(), 'obs', ['select'])
    registry.clear()
    expect(registry.size).toBe(0)
  })
})

describe('GestureFanout', () => {
  let registry: ProgramRegistry
  let fanout: GestureFanout

  beforeEach(() => {
    registry = new ProgramRegistry()
    fanout = new GestureFanout(registry)
  })

  const mockGesture: BusGestureMessage = {
    type: 'gesture',
    name: 'pinch',
    phase: 'onset',
    hand: 'right',
    position: [0.5, 0.3, 0.1],
    confidence: 0.95
  }

  it('should broadcast to all programs when no capabilities filter', () => {
    const ws = createMockWs()
    registry.register('conn_1', ws, 'blender', [])
    fanout.broadcastGesture(mockGesture)
    expect(ws.send).toHaveBeenCalledOnce()
  })

  it('should broadcast to programs with matching capability', () => {
    const ws1 = createMockWs()
    const ws2 = createMockWs()
    registry.register('conn_1', ws1, 'blender', ['select'])
    registry.register('conn_2', ws2, 'obs', ['zoom'])

    fanout.broadcastGesture(mockGesture) // pinch → maps to 'select'
    expect(ws1.send).toHaveBeenCalledOnce() // Has 'select' capability
    expect(ws2.send).not.toHaveBeenCalled() // Does not match
  })

  it('should broadcast to programs with wildcard capability', () => {
    const ws = createMockWs()
    registry.register('conn_1', ws, 'monitor', ['*'])
    fanout.broadcastGesture(mockGesture)
    expect(ws.send).toHaveBeenCalledOnce()
  })

  it('should not send to closed connections', () => {
    const ws = createMockWs(WebSocket.CLOSED)
    registry.register('conn_1', ws, 'blender', ['*'])
    fanout.broadcastGesture(mockGesture)
    expect(ws.send).not.toHaveBeenCalled()
  })

  it('should forward data to specific program', () => {
    const ws = createMockWs()
    registry.register('conn_1', ws, 'blender', [])
    fanout.forwardData('blender', { action: 'rotate', angle: 45 })
    expect(ws.send).toHaveBeenCalledOnce()
    const sent = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0])
    expect(sent.type).toBe('data')
    expect(sent.program).toBe('blender')
    expect(sent.payload.action).toBe('rotate')
  })

  it('should not forward data to unknown program', () => {
    fanout.forwardData('unknown', { test: true })
    // Should not throw
  })

  it('should correctly map gesture names to capabilities', () => {
    expect(fanout.shouldReceive(['select'], 'pinch')).toBe(true)
    expect(fanout.shouldReceive(['click'], 'pinch')).toBe(true)
    expect(fanout.shouldReceive(['rotate'], 'twist')).toBe(true)
    expect(fanout.shouldReceive(['zoom'], 'two_hand_pinch')).toBe(true)
    expect(fanout.shouldReceive(['pan'], 'flat_drag')).toBe(true)
    expect(fanout.shouldReceive(['cursor'], 'point')).toBe(true)
    expect(fanout.shouldReceive(['deselect'], 'open_palm')).toBe(true)
    expect(fanout.shouldReceive(['cancel'], 'fist')).toBe(true)
    expect(fanout.shouldReceive(['menu'], 'l_shape')).toBe(true)
  })

  it('should reject non-matching capabilities', () => {
    expect(fanout.shouldReceive(['zoom'], 'pinch')).toBe(false)
    expect(fanout.shouldReceive(['select'], 'fist')).toBe(false)
  })

  it('should accept direct gesture name as capability', () => {
    expect(fanout.shouldReceive(['pinch'], 'pinch')).toBe(true)
    expect(fanout.shouldReceive(['fist'], 'fist')).toBe(true)
  })

  it('should broadcast all to all programs', () => {
    const ws1 = createMockWs()
    const ws2 = createMockWs()
    registry.register('conn_1', ws1, 'a', ['select'])
    registry.register('conn_2', ws2, 'b', ['zoom'])
    fanout.broadcastAll('{"type":"test"}')
    expect(ws1.send).toHaveBeenCalledOnce()
    expect(ws2.send).toHaveBeenCalledOnce()
  })
})

describe('ConnectionManager', () => {
  let manager: ConnectionManager

  beforeEach(() => {
    manager = new ConnectionManager({
      heartbeatInterval: 1000,
      connectionTimeout: 5000
    })
  })

  it('should add connections with unique IDs', () => {
    const ws1 = createMockWs()
    const ws2 = createMockWs()
    const id1 = manager.addConnection(ws1)
    const id2 = manager.addConnection(ws2)
    expect(id1).not.toBe(id2)
    expect(manager.size).toBe(2)
  })

  it('should remove connections', () => {
    const id = manager.addConnection(createMockWs())
    manager.removeConnection(id)
    expect(manager.size).toBe(0)
  })

  it('should mark connections alive', () => {
    const ws = createMockWs()
    const id = manager.addConnection(ws)
    manager.markAlive(id)
    const conn = manager.getConnections().find(c => c.id === id)
    expect(conn?.alive).toBe(true)
  })

  it('should handle marking nonexistent connection', () => {
    manager.markAlive('nonexistent') // Should not throw
  })

  it('should list all connections', () => {
    manager.addConnection(createMockWs())
    manager.addConnection(createMockWs())
    manager.addConnection(createMockWs())
    expect(manager.getConnections().length).toBe(3)
  })

  it('should start and stop heartbeat', () => {
    manager.startHeartbeat()
    manager.stopHeartbeat()
    // Should not throw or leak timers
  })

  it('should stop heartbeat idempotently', () => {
    manager.stopHeartbeat()
    manager.stopHeartbeat()
    // Should not throw
  })
})

// ──────────────────────────────────────────────────────────────────────
// BusServer Lifecycle Tests
// ──────────────────────────────────────────────────────────────────────

/** Find an available port by binding to port 0 and reading the assigned port */
function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, () => {
      const port = (srv.address() as AddressInfo).port
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

describe('BusServer lifecycle', () => {
  let server: BusServer | null = null

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = null
    }
  })

  it('should start successfully on available port', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()
    expect(server.isRunning()).toBe(true)
    expect(server.getPort()).toBe(port)
  })

  it('should stop cleanly', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()
    expect(server.isRunning()).toBe(true)

    await server.stop()
    expect(server.isRunning()).toBe(false)
    server = null // Already stopped
  })

  it('should stop cleanly even when never started', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    // Never started — stop should resolve gracefully
    await server.stop()
    expect(server.isRunning()).toBe(false)
    server = null
  })

  it('should retry on EADDRINUSE', async () => {
    // Reserve 3 consecutive ports: block the first, leave the rest free
    const port = await getAvailablePort()
    // Verify port+1 is also free (avoid contention with parallel tests)
    const checker = createServer()
    await new Promise<void>((resolve, reject) => {
      checker.listen(port + 1, '127.0.0.1', () => {
        checker.close(() => resolve())
      })
      checker.on('error', () => reject(new Error('port+1 unavailable')))
    })

    // Occupy the first port with a plain WebSocketServer
    const blocker = new WebSocketServer({ port, host: '127.0.0.1' })
    await new Promise<void>((resolve) => blocker.on('listening', resolve))

    try {
      server = new BusServer({ port, authenticate: false })
      await server.start()
      // Should have succeeded on port+1 or port+2
      expect(server.isRunning()).toBe(true)
    } finally {
      blocker.close()
    }
  }, 10000)

  it('should throw after exhausting retry attempts', async () => {
    const port = await getAvailablePort()

    // Occupy ports: port, port+1, port+2
    const blockers: WebSocketServer[] = []
    for (let i = 0; i < 3; i++) {
      const b = new WebSocketServer({ port: port + i })
      await new Promise<void>((resolve) => b.on('listening', resolve))
      blockers.push(b)
    }

    try {
      server = new BusServer({ port, authenticate: false })
      await expect(server.start()).rejects.toThrow()
      server = null // start failed, nothing to stop
    } finally {
      for (const b of blockers) b.close()
    }
  })

  it('should throw non-EADDRINUSE errors immediately', async () => {
    // Port 1 is privileged — should fail with EACCES (not EADDRINUSE)
    // so it should NOT retry
    server = new BusServer({ port: 1, authenticate: false })
    await expect(server.start()).rejects.toThrow()
    server = null
  })
})

// ──────────────────────────────────────────────────────────────────────
// BusServer Message Validation Tests
// ──────────────────────────────────────────────────────────────────────

describe('BusServer message validation', () => {
  let server: BusServer | null = null
  let port: number

  beforeEach(async () => {
    port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = null
    }
  })

  function connectClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`)
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
    })
  }

  function waitForMessage(ws: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      ws.on('message', (data) => {
        // Skip status messages that arrive on connect
        const msg = JSON.parse(data.toString())
        if (msg.type === 'error') {
          resolve(msg)
        }
      })
    })
  }

  it('should reject invalid JSON', async () => {
    const ws = await connectClient()
    const errorPromise = waitForMessage(ws)

    ws.send('this is not valid json{{{')

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('PARSE_ERROR')

    ws.close()
  })

  it('should reject messages without type field', async () => {
    const ws = await connectClient()
    const errorPromise = waitForMessage(ws)

    // Valid JSON but missing required 'type' field
    ws.send(JSON.stringify({ program: 'test', capabilities: [] }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')

    ws.close()
  })

  it('should reject non-object JSON values', async () => {
    const ws = await connectClient()
    const errorPromise = waitForMessage(ws)

    // Valid JSON but not an object
    ws.send(JSON.stringify('just a string'))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')

    ws.close()
  })

  it('should reject null JSON', async () => {
    const ws = await connectClient()
    const errorPromise = waitForMessage(ws)

    ws.send('null')

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')

    ws.close()
  })

  it('should reject JSON array', async () => {
    const ws = await connectClient()
    const errorPromise = waitForMessage(ws)

    ws.send(JSON.stringify([1, 2, 3]))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')

    ws.close()
  })

  it('should accept valid ping messages', async () => {
    const ws = await connectClient()

    const pongPromise = new Promise<Record<string, unknown>>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'pong') {
          resolve(msg)
        }
      })
    })

    ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))

    const pongMsg = await pongPromise
    expect(pongMsg.type).toBe('pong')

    ws.close()
  })
})

// ──────────────────────────────────────────────────────────────────────
// Registry Max Programs Limit
// ──────────────────────────────────────────────────────────────────────

describe('ProgramRegistry max programs limit', () => {
  let registry: ProgramRegistry

  beforeEach(() => {
    registry = new ProgramRegistry()
  })

  it('should enforce MAX_PROGRAMS limit', () => {
    // Register 100 programs (the limit)
    for (let i = 0; i < 100; i++) {
      registry.register(`conn_${i}`, createMockWs(), `prog_${i}`, [])
    }
    expect(registry.size).toBe(100)

    // 101st registration should throw
    expect(() => {
      registry.register('conn_100', createMockWs(), 'prog_100', [])
    }).toThrow('Maximum number of programs')
  })

  it('should allow re-registration of existing connection within limit', () => {
    for (let i = 0; i < 100; i++) {
      registry.register(`conn_${i}`, createMockWs(), `prog_${i}`, [])
    }
    // Re-registering an existing connection should succeed
    expect(() => {
      registry.register('conn_0', createMockWs(), 'prog_0_updated', ['cap'])
    }).not.toThrow()
    expect(registry.size).toBe(100)
  })

  it('should allow new registrations after unregister', () => {
    for (let i = 0; i < 100; i++) {
      registry.register(`conn_${i}`, createMockWs(), `prog_${i}`, [])
    }
    // Remove one
    registry.unregisterByConnectionId('conn_50')
    expect(registry.size).toBe(99)

    // Now we can register a new one
    expect(() => {
      registry.register('conn_new', createMockWs(), 'prog_new', [])
    }).not.toThrow()
    expect(registry.size).toBe(100)
  })
})

// ──────────────────────────────────────────────────────────────────────
// WebSocket Server Hardening Tests
// ──────────────────────────────────────────────────────────────────────

describe('BusServer hardening', () => {
  let server: BusServer | null = null

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = null
    }
  })

  it('should bind to localhost (127.0.0.1) only', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()

    // Connect from localhost — should work
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })
    ws.close()
  })

  it('should reject messages exceeding maxPayload (64KB)', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()

    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    // Send a message larger than 64KB
    const oversizedPayload = 'x'.repeat(65 * 1024)

    const errorPromise = new Promise<void>((resolve) => {
      ws.on('close', () => resolve())
      ws.on('error', () => resolve())
    })

    ws.send(oversizedPayload)
    await errorPromise
    // Connection should have been terminated
  })
})

// ──────────────────────────────────────────────────────────────────────
// Rate Limiting Tests
// ──────────────────────────────────────────────────────────────────────

describe('BusServer rate limiting', () => {
  let server: BusServer | null = null

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = null
    }
  })

  it('should allow messages under the rate limit', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()

    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    // Send a few pings — well under the limit
    for (let i = 0; i < 5; i++) {
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
    }

    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 50))

    // Should still be connected
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('should reject clients exceeding 100 messages/second', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()

    const ws = new WebSocket(`ws://127.0.0.1:${port}`)
    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    const closedPromise = new Promise<boolean>((resolve) => {
      ws.on('close', () => resolve(true))
      // Give it up to 2 seconds to be terminated
      setTimeout(() => resolve(false), 2000)
    })

    // Flood with 150 messages rapidly
    for (let i = 0; i < 150; i++) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
      }
    }

    const wasClosed = await closedPromise
    expect(wasClosed).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Authentication Tests
// ──────────────────────────────────────────────────────────────────────

describe('Authentication', () => {
  let server: BusServer | null = null

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = null
    }
  })

  it('should reject connections without token', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: true })
    await server.start()

    const ws = new WebSocket(`ws://127.0.0.1:${port}`)

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })

    const result = await closePromise
    expect(result.code).toBe(1008)
    expect(result.reason).toBe('Unauthorized')
  })

  it('should reject connections with wrong token', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: true })
    await server.start()

    const ws = new WebSocket(`ws://127.0.0.1:${port}?token=wrong-token-value`)

    const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }))
    })

    const result = await closePromise
    expect(result.code).toBe(1008)
    expect(result.reason).toBe('Unauthorized')
  })

  it('should accept connections with correct token', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: true })
    await server.start()

    const token = server.getToken()
    expect(token).toBeDefined()
    expect(token.length).toBe(32) // 16 bytes as hex = 32 chars

    const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`)

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    // Should be connected
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })

  it('should skip auth when authenticate=false', async () => {
    const port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()

    // Connect without any token
    const ws = new WebSocket(`ws://127.0.0.1:${port}`)

    await new Promise<void>((resolve, reject) => {
      ws.on('open', resolve)
      ws.on('error', reject)
    })

    // Should be connected even without token
    expect(ws.readyState).toBe(WebSocket.OPEN)
    ws.close()
  })
})

// ──────────────────────────────────────────────────────────────────────
// Register Message Validation Tests
// ──────────────────────────────────────────────────────────────────────

describe('BusServer register validation', () => {
  let server: BusServer | null = null
  let port: number

  beforeEach(async () => {
    port = await getAvailablePort()
    server = new BusServer({ port, authenticate: false })
    await server.start()
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = null
    }
  })

  function connectClient(): Promise<WebSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://localhost:${port}`)
      ws.on('open', () => resolve(ws))
      ws.on('error', reject)
    })
  }

  function waitForError(ws: WebSocket): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'error') {
          resolve(msg)
        }
      })
    })
  }

  it('should reject register with missing program name', async () => {
    const ws = await connectClient()
    const errorPromise = waitForError(ws)

    ws.send(JSON.stringify({ type: 'register', capabilities: ['rotate'] }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')
    expect(errorMsg.message).toBe('Invalid program name')

    ws.close()
  })

  it('should reject register with empty program name', async () => {
    const ws = await connectClient()
    const errorPromise = waitForError(ws)

    ws.send(JSON.stringify({ type: 'register', program: '', capabilities: ['rotate'] }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')
    expect(errorMsg.message).toBe('Invalid program name')

    ws.close()
  })

  it('should reject register with program name exceeding 100 chars', async () => {
    const ws = await connectClient()
    const errorPromise = waitForError(ws)

    const longName = 'x'.repeat(101)
    ws.send(JSON.stringify({ type: 'register', program: longName, capabilities: [] }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')
    expect(errorMsg.message).toBe('Invalid program name')

    ws.close()
  })

  it('should reject register with non-string program name', async () => {
    const ws = await connectClient()
    const errorPromise = waitForError(ws)

    ws.send(JSON.stringify({ type: 'register', program: 42, capabilities: [] }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')
    expect(errorMsg.message).toBe('Invalid program name')

    ws.close()
  })

  it('should reject register with non-array capabilities', async () => {
    const ws = await connectClient()
    const errorPromise = waitForError(ws)

    ws.send(JSON.stringify({ type: 'register', program: 'blender', capabilities: 'rotate' }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')
    expect(errorMsg.message).toBe('Invalid capabilities array')

    ws.close()
  })

  it('should reject register with non-string items in capabilities', async () => {
    const ws = await connectClient()
    const errorPromise = waitForError(ws)

    ws.send(JSON.stringify({ type: 'register', program: 'blender', capabilities: ['rotate', 123] }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')
    expect(errorMsg.message).toBe('Invalid capabilities array')

    ws.close()
  })

  it('should accept valid register message', async () => {
    const ws = await connectClient()

    // Wait for the status broadcast that follows a successful register
    const statusPromise = new Promise<Record<string, unknown>>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString())
        if (msg.type === 'status') {
          resolve(msg)
        }
      })
    })

    ws.send(JSON.stringify({ type: 'register', program: 'blender', capabilities: ['rotate', 'select'] }))

    const statusMsg = await statusPromise
    expect(statusMsg.type).toBe('status')
    expect(Array.isArray(statusMsg.programs)).toBe(true)

    ws.close()
  })

  it('should reject data message with missing program', async () => {
    const ws = await connectClient()
    const errorPromise = waitForError(ws)

    ws.send(JSON.stringify({ type: 'data', payload: { action: 'test' } }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')

    ws.close()
  })

  it('should reject data message with missing payload', async () => {
    const ws = await connectClient()
    const errorPromise = waitForError(ws)

    ws.send(JSON.stringify({ type: 'data', program: 'blender' }))

    const errorMsg = await errorPromise
    expect(errorMsg.type).toBe('error')
    expect(errorMsg.code).toBe('VALIDATION_ERROR')

    ws.close()
  })
})
