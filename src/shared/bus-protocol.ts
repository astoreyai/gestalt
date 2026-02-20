/**
 * WebSocket connector bus protocol types.
 * Used by external programs connecting to the tracking app.
 */

import type { GestureType, GesturePhase } from './protocol'

/** Message from an external program registering itself */
export interface BusRegisterMessage {
  type: 'register'
  program: string
  capabilities: string[] // e.g., ['rotate', 'select', 'zoom']
}

/** Gesture event broadcast to connected programs */
export interface BusGestureMessage {
  type: 'gesture'
  name: GestureType
  phase: GesturePhase
  hand: 'left' | 'right'
  position: [number, number, number] // [x, y, z]
  confidence: number
  data?: Record<string, number>
}

/** Data payload from/to an external program */
export interface BusDataMessage {
  type: 'data'
  program: string
  payload: unknown
}

/** Health check */
export interface BusPingMessage {
  type: 'ping'
  timestamp: number
}

export interface BusPongMessage {
  type: 'pong'
  timestamp: number
}

/** Error notification */
export interface BusErrorMessage {
  type: 'error'
  code: string
  message: string
}

/** Connection status update */
export interface BusStatusMessage {
  type: 'status'
  programs: Array<{
    name: string
    capabilities: string[]
    connectedAt: number
  }>
}

export type BusMessage =
  | BusRegisterMessage
  | BusGestureMessage
  | BusDataMessage
  | BusPingMessage
  | BusPongMessage
  | BusErrorMessage
  | BusStatusMessage
