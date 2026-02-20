/**
 * Example connector — demonstrates how to connect an external program
 * to the Tracking app's gesture bus.
 *
 * Run with: npx tsx src/main/connectors/example.ts
 */

import WebSocket from 'ws'
import type { BusRegisterMessage, BusMessage, BusGestureMessage } from '@shared/bus-protocol'

const WS_URL = process.env.TRACKING_BUS_URL ?? 'ws://localhost:9876'

async function main(): Promise<void> {
  console.log(`Connecting to Tracking bus at ${WS_URL}...`)

  const ws = new WebSocket(WS_URL)

  ws.on('open', () => {
    console.log('Connected!')

    // Register our program with capabilities
    const register: BusRegisterMessage = {
      type: 'register',
      program: 'example-connector',
      capabilities: ['rotate', 'select', 'zoom']
    }
    ws.send(JSON.stringify(register))
    console.log('Registered as "example-connector"')
  })

  ws.on('message', (raw: Buffer) => {
    const msg = JSON.parse(raw.toString()) as BusMessage

    switch (msg.type) {
      case 'gesture': {
        const g = msg as BusGestureMessage
        console.log(`Gesture: ${g.name} (${g.phase}) hand=${g.hand} pos=[${g.position.join(', ')}]`)
        break
      }
      case 'status':
        console.log(`Bus status: ${msg.programs.length} programs connected`)
        break
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: msg.timestamp }))
        break
      case 'error':
        console.error(`Bus error: ${msg.message}`)
        break
      default:
        console.log('Unknown message:', msg)
    }
  })

  ws.on('close', () => {
    console.log('Disconnected from bus')
    process.exit(0)
  })

  ws.on('error', (err) => {
    console.error('Connection error:', err.message)
    process.exit(1)
  })

  // Keep alive
  process.on('SIGINT', () => {
    console.log('\nDisconnecting...')
    ws.close()
  })
}

main()
