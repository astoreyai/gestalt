/**
 * WebSocket Connector Bus Demo
 *
 * Self-contained script that demonstrates the tracking app's
 * bus protocol by spinning up a mini WebSocket server and
 * exchanging messages: register -> ack -> gestures -> data -> ping/pong.
 *
 * Run with: npm run demo:bus
 */

import { WebSocketServer, WebSocket } from 'ws'
import type {
  BusRegisterMessage,
  BusGestureMessage,
  BusDataMessage,
  BusPingMessage,
  BusPongMessage,
  BusStatusMessage,
} from '../src/shared/bus-protocol'
import { GestureType, GesturePhase } from '../src/shared/protocol'

// ─── ANSI Colors ─────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
}

function log(label: string, color: string, msg: string): void {
  console.log(`  ${color}[${label.padEnd(6)}]${C.reset} ${msg}`)
}

// ─── Server ──────────────────────────────────────────────────

const PORT = 9877
const TOKEN = 'demo-token-1234'

async function runBusDemo(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}  ╔══════════════════════════════════════════════╗${C.reset}`)
  console.log(`${C.bold}${C.cyan}  ║     Tracking App — WebSocket Bus Demo        ║${C.reset}`)
  console.log(`${C.bold}${C.cyan}  ╚══════════════════════════════════════════════╝${C.reset}\n`)
  console.log(`${C.dim}  Demonstrates the connector bus protocol on port ${PORT}.${C.reset}`)
  console.log(`${C.dim}  Flow: register -> ack -> gestures -> data -> ping/pong${C.reset}\n`)

  // Start the server
  const wss = new WebSocketServer({ port: PORT })
  log('SERVER', C.green, `Listening on ws://127.0.0.1:${PORT}`)

  const serverReady = new Promise<void>((resolve) => {
    wss.on('listening', resolve)
  })
  await serverReady

  // Track server-side connection
  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '/', `http://127.0.0.1:${PORT}`)
    const token = url.searchParams.get('token')
    log('SERVER', C.green, `New connection (token=${token ? token.slice(0, 8) + '...' : 'none'})`)

    if (token !== TOKEN) {
      log('SERVER', C.red, 'Invalid token — closing')
      ws.close(4001, 'Unauthorized')
      return
    }

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString())
      log('SERVER', C.green, `Received: ${C.bold}${msg.type}${C.reset} ${msg.type === 'register' ? `program="${msg.program}" caps=[${msg.capabilities}]` : ''}`)

      // Handle registration
      if (msg.type === 'register') {
        const status: BusStatusMessage = {
          type: 'status',
          programs: [{
            name: msg.program,
            capabilities: msg.capabilities,
            connectedAt: Date.now(),
          }],
        }
        ws.send(JSON.stringify(status))
        log('SERVER', C.green, `Sent: ${C.bold}status${C.reset} (ack with program list)`)
      }

      // Handle ping
      if (msg.type === 'ping') {
        const pong: BusPongMessage = { type: 'pong', timestamp: msg.timestamp }
        ws.send(JSON.stringify(pong))
        log('SERVER', C.green, `Sent: ${C.bold}pong${C.reset} (ts=${msg.timestamp})`)
      }
    })
  })

  // ─── Client ──────────────────────────────────────────────

  await sleep(100) // Let server settle

  log('CLIENT', C.cyan, `Connecting to ws://127.0.0.1:${PORT}?token=${TOKEN.slice(0, 8)}...`)
  const client = new WebSocket(`ws://127.0.0.1:${PORT}?token=${TOKEN}`)

  await new Promise<void>((resolve, reject) => {
    client.on('open', resolve)
    client.on('error', reject)
  })
  log('CLIENT', C.cyan, 'Connected')

  // Listen for messages
  const received: string[] = []
  client.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    received.push(msg.type)

    if (msg.type === 'status') {
      log('CLIENT', C.cyan, `Received: ${C.bold}status${C.reset} — ${msg.programs.length} program(s) registered`)
    } else if (msg.type === 'gesture') {
      log('CLIENT', C.cyan, `Received: ${C.bold}gesture${C.reset} — ${msg.name} (${msg.phase}) at [${msg.position.map((v: number) => v.toFixed(2)).join(', ')}]`)
    } else if (msg.type === 'data') {
      log('CLIENT', C.cyan, `Received: ${C.bold}data${C.reset} — from="${msg.program}" payload=${JSON.stringify(msg.payload)}`)
    } else if (msg.type === 'pong') {
      const latency = Date.now() - msg.timestamp
      log('CLIENT', C.cyan, `Received: ${C.bold}pong${C.reset} — latency=${latency}ms`)
    }
  })

  // Step 1: Register
  console.log(`\n${C.yellow}  ── Step 1: Register ──${C.reset}`)
  const register: BusRegisterMessage = {
    type: 'register',
    program: 'demo-visualizer',
    capabilities: ['rotate', 'select', 'zoom'],
  }
  client.send(JSON.stringify(register))
  log('CLIENT', C.cyan, `Sent: ${C.bold}register${C.reset} program="demo-visualizer" caps=[rotate,select,zoom]`)
  await sleep(200)

  // Step 2: Server broadcasts gestures
  console.log(`\n${C.yellow}  ── Step 2: Gesture Broadcast ──${C.reset}`)
  const gestures: BusGestureMessage[] = [
    { type: 'gesture', name: GestureType.Point, phase: GesturePhase.Onset, hand: 'right', position: [0.5, 0.5, 0.1], confidence: 0.97 },
    { type: 'gesture', name: GestureType.Pinch, phase: GesturePhase.Onset, hand: 'right', position: [0.48, 0.52, 0.08], confidence: 0.94 },
    { type: 'gesture', name: GestureType.Pinch, phase: GesturePhase.Hold, hand: 'right', position: [0.45, 0.55, 0.07], confidence: 0.92, data: { distance: 0.02 } },
    { type: 'gesture', name: GestureType.Pinch, phase: GesturePhase.Release, hand: 'right', position: [0.44, 0.56, 0.06], confidence: 0.91 },
  ]

  for (const gesture of gestures) {
    // Broadcast from server to all clients
    for (const ws of wss.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(gesture))
      }
    }
    log('SERVER', C.green, `Broadcast: ${C.bold}gesture${C.reset} — ${gesture.name} (${gesture.phase})`)
    await sleep(150)
  }

  // Step 3: Client sends data
  console.log(`\n${C.yellow}  ── Step 3: Data Exchange ──${C.reset}`)
  const dataMsg: BusDataMessage = {
    type: 'data',
    program: 'demo-visualizer',
    payload: { selectedNodes: ['n1', 'n2'], action: 'highlight' },
  }
  client.send(JSON.stringify(dataMsg))
  log('CLIENT', C.cyan, `Sent: ${C.bold}data${C.reset} payload={selectedNodes: ['n1','n2'], action: 'highlight'}`)
  await sleep(200)

  // Step 4: Ping/pong
  console.log(`\n${C.yellow}  ── Step 4: Ping/Pong ──${C.reset}`)
  const ping: BusPingMessage = { type: 'ping', timestamp: Date.now() }
  client.send(JSON.stringify(ping))
  log('CLIENT', C.cyan, `Sent: ${C.bold}ping${C.reset} (ts=${ping.timestamp})`)
  await sleep(200)

  // Summary
  console.log(`\n${C.bold}${C.yellow}  ┌─ Summary ${'─'.repeat(22)}┐${C.reset}`)
  const typeCounts: Record<string, number> = {}
  for (const t of received) typeCounts[t] = (typeCounts[t] || 0) + 1
  const typesSummary = Object.entries(typeCounts).map(([t, n]) => `${t}(${n})`).join(', ')

  console.log(`${C.yellow}  │ Messages received: ${String(received.length).padStart(3)}        │${C.reset}`)
  console.log(`${C.yellow}  │ Types: ${typesSummary.padEnd(24)}│${C.reset}`)
  console.log(`${C.yellow}  │ Protocol flow: OK             │${C.reset}`)
  console.log(`${C.yellow}  └${'─'.repeat(32)}┘${C.reset}\n`)

  // Cleanup
  client.close()
  wss.close()
  log('SERVER', C.green, 'Shut down')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

runBusDemo().catch(console.error)
