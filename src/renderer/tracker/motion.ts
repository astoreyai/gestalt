/**
 * Hand motion metrics tracker.
 * Computes per-hand velocity, rotation rate, and z-depth from sequential LandmarkFrames.
 * Pre-allocates output objects to minimize GC pressure.
 */

import type { LandmarkFrame, Handedness } from '@shared/protocol'
import { LANDMARK } from '@shared/protocol'
import { SavitzkyGolayFilter } from './sg-filter'

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
  /**
   * EMA time constant in ms — derived from configured alpha assuming 30fps reference.
   * tau = -dt_ref / ln(1 - alpha), where dt_ref = 33.3ms (30fps).
   * Per-frame alpha is then: 1 - exp(-dt / tau), making smoothing frame-rate-independent.
   */
  private readonly tau: number
  private readonly states: Map<Handedness, HandState> = new Map()
  /** Savitzky-Golay pre-filters per hand for velocity/rotation smoothing */
  private readonly _sgVelocity: Map<Handedness, SavitzkyGolayFilter> = new Map()
  private readonly _sgRotation: Map<Handedness, SavitzkyGolayFilter> = new Map()
  /** Pre-allocated output objects per hand to avoid GC */
  private readonly _outputLeft: HandMotionMetrics = { velocity: 0, rotationRate: 0, distanceFromOrigin: 0, handedness: 'left' }
  private readonly _outputRight: HandMotionMetrics = { velocity: 0, rotationRate: 0, distanceFromOrigin: 0, handedness: 'right' }
  /** Reusable output array */
  private readonly _results: HandMotionMetrics[] = []

  constructor(smoothingAlpha: number = 0.3) {
    const alpha = Math.max(0.01, Math.min(0.99, smoothingAlpha))
    // Convert per-frame alpha at 30fps reference to time constant
    this.tau = -33.333 / Math.log(1 - alpha)
    // Initialize SG filters for both hands
    this._sgVelocity.set('left', new SavitzkyGolayFilter())
    this._sgVelocity.set('right', new SavitzkyGolayFilter())
    this._sgRotation.set('left', new SavitzkyGolayFilter())
    this._sgRotation.set('right', new SavitzkyGolayFilter())
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

      // Compute orientation angle — average (dx, dy) components then single atan2
      // (arithmetic averaging of atan2 angles is invalid at the +/-pi boundary)
      const mcpIndices = [LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP]
      let avgDx = 0, avgDy = 0
      for (const idx of mcpIndices) {
        const mcp = lm[idx]
        avgDx += mcp.x - wrist.x
        avgDy += mcp.y - wrist.y
      }
      const angle = Math.atan2(avgDy / mcpIndices.length, avgDx / mcpIndices.length)

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

      // Savitzky-Golay pre-filter: smooth noisy finite differences before EMA
      const sgVel = this._sgVelocity.get(hand.handedness)!
      const sgRot = this._sgRotation.get(hand.handedness)!
      const filteredVelocity = sgVel.filter(rawVelocity)
      const filteredRotation = sgRot.filter(rawRotation)

      // Frame-rate-independent EMA: alpha_dt = 1 - exp(-dt / tau)
      const alpha = 1 - Math.exp(-dt / this.tau)
      state.smoothedVelocity = alpha * filteredVelocity + (1 - alpha) * state.smoothedVelocity
      state.smoothedRotation = alpha * filteredRotation + (1 - alpha) * state.smoothedRotation

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
      this._sgVelocity.get(handedness)?.reset()
      this._sgRotation.get(handedness)?.reset()
    } else {
      for (const state of this.states.values()) {
        state.initialized = false
      }
      for (const sg of this._sgVelocity.values()) sg.reset()
      for (const sg of this._sgRotation.values()) sg.reset()
    }
  }
}
