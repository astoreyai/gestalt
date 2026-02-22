/**
 * Hand motion metrics tracker.
 * Computes per-hand velocity, rotation rate, and z-depth from sequential LandmarkFrames.
 * Pre-allocates output objects to minimize GC pressure.
 */

import type { LandmarkFrame, Handedness } from '@shared/protocol'
import { LANDMARK } from '@shared/protocol'

const TWO_PI = 2 * Math.PI

export interface HandMotionMetrics {
  velocity: number          // normalized units/sec
  rotationRate: number      // radians/sec
  distanceFromOrigin: number // wrist z-depth [0,1]
  handedness: Handedness
}

interface HandState {
  centerX: number
  centerY: number
  centerZ: number
  angle: number
  timestamp: number
  smoothedVelocity: number
  smoothedRotation: number
  initialized: boolean
}

export class HandMotionTracker {
  private readonly alpha: number
  private readonly states: Map<Handedness, HandState> = new Map()
  /** Pre-allocated output objects per hand to avoid GC */
  private readonly _outputLeft: HandMotionMetrics = { velocity: 0, rotationRate: 0, distanceFromOrigin: 0, handedness: 'left' }
  private readonly _outputRight: HandMotionMetrics = { velocity: 0, rotationRate: 0, distanceFromOrigin: 0, handedness: 'right' }
  /** Reusable output array */
  private readonly _results: HandMotionMetrics[] = []

  constructor(smoothingAlpha: number = 0.3) {
    this.alpha = Math.max(0, Math.min(1, smoothingAlpha))
  }

  update(frame: LandmarkFrame): HandMotionMetrics[] {
    this._results.length = 0

    for (const hand of frame.hands) {
      const lm = hand.landmarks
      const wrist = lm[LANDMARK.WRIST]
      const middleMcp = lm[LANDMARK.MIDDLE_MCP]

      // Hand center (palm center approximation)
      const cx = (wrist.x + middleMcp.x) / 2
      const cy = (wrist.y + middleMcp.y) / 2
      const cz = (wrist.z + middleMcp.z) / 2

      // Compute orientation angle (average atan2 of 3 MCP joints relative to wrist)
      const mcpIndices = [LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP]
      let sumAngle = 0
      for (const idx of mcpIndices) {
        const mcp = lm[idx]
        sumAngle += Math.atan2(mcp.y - wrist.y, mcp.x - wrist.x)
      }
      const angle = sumAngle / mcpIndices.length

      const state = this.states.get(hand.handedness)
      const out = hand.handedness === 'left' ? this._outputLeft : this._outputRight
      out.handedness = hand.handedness
      out.distanceFromOrigin = Math.abs(wrist.z)

      if (!state || !state.initialized) {
        // First frame for this hand — no velocity/rotation
        this.states.set(hand.handedness, {
          centerX: cx, centerY: cy, centerZ: cz,
          angle,
          timestamp: frame.timestamp,
          smoothedVelocity: 0,
          smoothedRotation: 0,
          initialized: true
        })
        out.velocity = 0
        out.rotationRate = 0
        this._results.push(out)
        continue
      }

      const dt = frame.timestamp - state.timestamp

      // Stale or zero dt — treat as reset
      if (dt <= 0 || dt > 500) {
        state.centerX = cx
        state.centerY = cy
        state.centerZ = cz
        state.angle = angle
        state.timestamp = frame.timestamp
        state.smoothedVelocity = 0
        state.smoothedRotation = 0
        out.velocity = 0
        out.rotationRate = 0
        this._results.push(out)
        continue
      }

      const dtSec = dt / 1000

      // Velocity: euclidean distance of center delta
      const dx = cx - state.centerX
      const dy = cy - state.centerY
      const dz = cz - state.centerZ
      const rawVelocity = Math.sqrt(dx * dx + dy * dy + dz * dz) / dtSec

      // Rotation: angle delta with wrapping
      let dAngle = angle - state.angle
      if (dAngle > Math.PI) dAngle -= TWO_PI
      if (dAngle < -Math.PI) dAngle += TWO_PI
      const rawRotation = Math.abs(dAngle) / dtSec

      // EMA smoothing
      state.smoothedVelocity = this.alpha * rawVelocity + (1 - this.alpha) * state.smoothedVelocity
      state.smoothedRotation = this.alpha * rawRotation + (1 - this.alpha) * state.smoothedRotation

      // Update state
      state.centerX = cx
      state.centerY = cy
      state.centerZ = cz
      state.angle = angle
      state.timestamp = frame.timestamp

      out.velocity = state.smoothedVelocity
      out.rotationRate = state.smoothedRotation
      this._results.push(out)
    }

    return this._results
  }

  reset(handedness?: Handedness): void {
    if (handedness) {
      const state = this.states.get(handedness)
      if (state) state.initialized = false
    } else {
      for (const state of this.states.values()) {
        state.initialized = false
      }
    }
  }
}
