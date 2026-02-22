/**
 * Gesture event fan-out to connected programs.
 * Filters events based on program capability subscriptions.
 */

import { WebSocket } from 'ws'
import type { BusGestureMessage } from '@shared/bus-protocol'
import { ProgramRegistry } from './registry'

/** Static gesture→capability mapping (hoisted from shouldReceive to avoid per-call allocation) */
const GESTURE_TO_CAPABILITY: Readonly<Record<string, readonly string[]>> = {
  'pinch': ['select', 'click'],
  'twist': ['rotate'],
  'two_hand_pinch': ['zoom', 'scale'],
  'flat_drag': ['pan', 'move'],
  'point': ['cursor', 'hover'],
  'open_palm': ['deselect', 'release'],
  'fist': ['cancel', 'stop'],
  'l_shape': ['menu', 'shortcut']
}

export class GestureFanout {
  private registry: ProgramRegistry

  constructor(registry: ProgramRegistry) {
    this.registry = registry
  }

  /** Broadcast a gesture event to all programs that care about it */
  broadcastGesture(gesture: BusGestureMessage): void {
    const gestureName = gesture.name
    const msg = JSON.stringify(gesture)

    for (const program of this.registry.listPrograms()) {
      // Send if program has matching capability or has wildcard '*'
      if (this.shouldReceive(program.capabilities, gestureName)) {
        this.safeSend(program.ws, msg)
      }
    }
  }

  /** Forward data to a specific program by name */
  forwardData(programName: string, payload: unknown): void {
    const program = this.registry.getByName(programName)
    if (program) {
      this.safeSend(program.ws, JSON.stringify({
        type: 'data',
        program: programName,
        payload
      }))
    }
  }

  /** Broadcast to all programs (for status updates, etc.) */
  broadcastAll(message: string): void {
    for (const program of this.registry.listPrograms()) {
      this.safeSend(program.ws, message)
    }
  }

  /** Check if a program should receive a gesture based on capabilities */
  shouldReceive(capabilities: string[], gestureName: string): boolean {
    if (capabilities.length === 0) return true // No filter = receive all
    if (capabilities.includes('*')) return true // Wildcard
    if (capabilities.includes(gestureName)) return true // Direct match

    // Capability mapping: 'rotate' matches 'twist', 'select' matches 'pinch', etc.
    const mappedCapabilities = GESTURE_TO_CAPABILITY[gestureName] ?? []
    return mappedCapabilities.some(cap => capabilities.includes(cap))
  }

  /** Send message safely, handling closed connections */
  private safeSend(ws: WebSocket, message: string): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message)
    }
  }
}
