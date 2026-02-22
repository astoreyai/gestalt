/**
 * Two-hand gesture coordinator.
 * Sits between GestureEngine events and the dispatcher to resolve
 * two-hand gesture combinations. Tracks inter-hand distance and
 * z-axis deltas for dolly/scale/zoom detection.
 */

import {
  type GestureEvent,
  GestureType,
  GesturePhase
} from '@shared/protocol'
import { type GestureConfig, DEFAULT_GESTURE_CONFIG } from './types'

/** Result of two-hand coordination for a single frame */
export interface TwoHandCoordResult {
  /** Synthesized two-hand gesture event (null if no two-hand combo detected) */
  twoHandAction: GestureEvent | null
  /** Whether to suppress the left hand's individual gesture */
  suppressLeft: boolean
  /** Whether to suppress the right hand's individual gesture */
  suppressRight: boolean
  /** Inter-hand distance delta since last frame (for scale/zoom) */
  handDistanceDelta: number
  /** Left hand z-axis delta since last frame (for dolly) */
  leftZDelta: number
  /** Right hand z-axis delta since last frame (for dolly) */
  rightZDelta: number
}

/**
 * Combination matrix entry — maps a pair of gesture types to a
 * two-hand gesture type that should be emitted.
 */
interface ComboEntry {
  leftType: GestureType
  rightType: GestureType
  resultType: GestureType
  /** Whether the combo is symmetric (left/right order doesn't matter) */
  symmetric: boolean
}

/** The combination matrix for two-hand gesture resolution */
const COMBO_MATRIX: ComboEntry[] = [
  // Both Pinch → TwoHandPinch (scale or zoom, dispatcher decides based on target)
  { leftType: GestureType.Pinch, rightType: GestureType.Pinch, resultType: GestureType.TwoHandPinch, symmetric: true },
  // Both OpenPalm → TwoHandPush (dolly)
  { leftType: GestureType.OpenPalm, rightType: GestureType.OpenPalm, resultType: GestureType.TwoHandPush, symmetric: true },
  // Both Twist → TwoHandRotate (orbit or roll, dispatcher decides based on direction)
  { leftType: GestureType.Twist, rightType: GestureType.Twist, resultType: GestureType.TwoHandRotate, symmetric: true },
  // Point + Point → measurement
  { leftType: GestureType.Point, rightType: GestureType.Point, resultType: GestureType.Point, symmetric: true },
  // Fist + Fist → fold
  { leftType: GestureType.Fist, rightType: GestureType.Fist, resultType: GestureType.Fist, symmetric: true },
]

/**
 * Coordinates two-hand gestures by consuming per-hand GestureEvents
 * and emitting synthesized two-hand events when a combination is detected.
 */
export class TwoHandCoordinator {
  /** Previous inter-hand distance for delta computation */
  private previousHandDistance: number | null = null
  /** Previous left hand z position */
  private previousLeftZ: number | null = null
  /** Previous right hand z position */
  private previousRightZ: number | null = null
  /** Timestamp of the last left hand onset (for grace period alignment) */
  private leftOnsetTimestamp: number | null = null
  /** Timestamp of the last right hand onset (for grace period alignment) */
  private rightOnsetTimestamp: number | null = null
  /** Cached left event from onset grace period */
  private pendingLeft: GestureEvent | null = null
  /** Cached right event from onset grace period */
  private pendingRight: GestureEvent | null = null

  private config: GestureConfig

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config }
  }

  /** Update configuration */
  updateConfig(config: Partial<GestureConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** Reset all tracked state */
  reset(): void {
    this.previousHandDistance = null
    this.previousLeftZ = null
    this.previousRightZ = null
    this.leftOnsetTimestamp = null
    this.rightOnsetTimestamp = null
    this.pendingLeft = null
    this.pendingRight = null
  }

  /**
   * Resolve two-hand gesture coordination for a single frame.
   *
   * @param leftEvent  Best gesture event from the left hand (null if no left hand)
   * @param rightEvent Best gesture event from the right hand (null if no right hand)
   * @param timestamp  Current frame timestamp (ms)
   * @returns Coordination result with optional two-hand action and suppression flags
   */
  resolve(
    leftEvent: GestureEvent | null,
    rightEvent: GestureEvent | null,
    timestamp: number
  ): TwoHandCoordResult {
    const noResult: TwoHandCoordResult = {
      twoHandAction: null,
      suppressLeft: false,
      suppressRight: false,
      handDistanceDelta: 0,
      leftZDelta: 0,
      rightZDelta: 0
    }

    // Need both hands present for two-hand gestures
    if (!leftEvent || !rightEvent) {
      // Reset tracking when a hand disappears
      if (!leftEvent) {
        this.pendingLeft = null
        this.leftOnsetTimestamp = null
      }
      if (!rightEvent) {
        this.pendingRight = null
        this.rightOnsetTimestamp = null
      }
      // Reset inter-hand tracking
      this.previousHandDistance = null
      if (!leftEvent) this.previousLeftZ = null
      if (!rightEvent) this.previousRightZ = null
      return noResult
    }

    // Both hands have events — check for release (don't coordinate releases)
    if (leftEvent.phase === GesturePhase.Release || rightEvent.phase === GesturePhase.Release) {
      this.previousHandDistance = null
      return noResult
    }

    // ─── Onset Grace Period ─────────────────────────────────
    // Track onset timestamps so we can align two-hand onsets
    // that arrive within the grace window
    if (leftEvent.phase === GesturePhase.Onset) {
      this.leftOnsetTimestamp = timestamp
      this.pendingLeft = leftEvent
    }
    if (rightEvent.phase === GesturePhase.Onset) {
      this.rightOnsetTimestamp = timestamp
      this.pendingRight = rightEvent
    }

    // Use pending events if within grace period
    const effectiveLeft = leftEvent.phase === GesturePhase.Onset || leftEvent.phase === GesturePhase.Hold
      ? leftEvent
      : this.pendingLeft && (timestamp - (this.leftOnsetTimestamp ?? 0)) < this.config.twoHandOnsetGrace
        ? this.pendingLeft
        : leftEvent
    const effectiveRight = rightEvent.phase === GesturePhase.Onset || rightEvent.phase === GesturePhase.Hold
      ? rightEvent
      : this.pendingRight && (timestamp - (this.rightOnsetTimestamp ?? 0)) < this.config.twoHandOnsetGrace
        ? this.pendingRight
        : rightEvent

    // ─── Compute Deltas ─────────────────────────────────────

    // Inter-hand distance for scale/zoom
    const currentHandDistance = this.computeHandDistance(effectiveLeft, effectiveRight)
    let handDistanceDelta = 0
    if (this.previousHandDistance !== null) {
      handDistanceDelta = currentHandDistance - this.previousHandDistance
    }
    this.previousHandDistance = currentHandDistance

    // Z-axis deltas for dolly
    const currentLeftZ = effectiveLeft.position.z
    const currentRightZ = effectiveRight.position.z
    let leftZDelta = 0
    let rightZDelta = 0
    if (this.previousLeftZ !== null) {
      leftZDelta = currentLeftZ - this.previousLeftZ
    }
    if (this.previousRightZ !== null) {
      rightZDelta = currentRightZ - this.previousRightZ
    }
    this.previousLeftZ = currentLeftZ
    this.previousRightZ = currentRightZ

    // ─── Match Combination Matrix ───────────────────────────

    const combo = this.findCombo(effectiveLeft.type, effectiveRight.type)
    if (!combo) {
      // Check asymmetric combos that don't go through the matrix
      const asymmetricResult = this.resolveAsymmetricCombo(
        effectiveLeft, effectiveRight, timestamp, handDistanceDelta, leftZDelta, rightZDelta
      )
      if (asymmetricResult) return asymmetricResult
      return { ...noResult, handDistanceDelta, leftZDelta, rightZDelta }
    }

    // Synthesize the two-hand gesture event
    const midpoint = {
      x: (effectiveLeft.position.x + effectiveRight.position.x) / 2,
      y: (effectiveLeft.position.y + effectiveRight.position.y) / 2,
      z: (effectiveLeft.position.z + effectiveRight.position.z) / 2
    }

    const combinedConfidence = Math.min(effectiveLeft.confidence, effectiveRight.confidence)

    // Merge data from both hands
    const mergedData: Record<string, number> = {
      handDistance: currentHandDistance,
      handDistanceDelta,
      leftZDelta,
      rightZDelta,
      ...(effectiveLeft.data ?? {}),
      ...(effectiveRight.data ?? {})
    }

    // Determine the phase — both must be in Hold for the combo to be Hold
    let phase = GesturePhase.Hold
    if (effectiveLeft.phase === GesturePhase.Onset || effectiveRight.phase === GesturePhase.Onset) {
      phase = GesturePhase.Onset
    }

    const twoHandAction: GestureEvent = {
      type: combo.resultType,
      phase,
      hand: 'right', // Convention: two-hand events use 'right' as primary
      confidence: combinedConfidence,
      position: midpoint,
      timestamp,
      data: mergedData
    }

    return {
      twoHandAction,
      suppressLeft: true,
      suppressRight: true,
      handDistanceDelta,
      leftZDelta,
      rightZDelta
    }
  }

  /**
   * Find a matching combo in the combination matrix.
   */
  private findCombo(leftType: GestureType, rightType: GestureType): ComboEntry | null {
    for (const entry of COMBO_MATRIX) {
      if (entry.leftType === leftType && entry.rightType === rightType) {
        return entry
      }
      if (entry.symmetric && entry.leftType === rightType && entry.rightType === leftType) {
        return entry
      }
    }
    return null
  }

  /**
   * Handle asymmetric combos that don't fit the simple matrix
   * (e.g., Pinch + FlatDrag, Pinch + OpenPalm).
   */
  private resolveAsymmetricCombo(
    left: GestureEvent,
    right: GestureEvent,
    timestamp: number,
    handDistanceDelta: number,
    leftZDelta: number,
    rightZDelta: number
  ): TwoHandCoordResult | null {
    const lType = left.type
    const rType = right.type

    // Pinch + FlatDrag → both hands contribute distinct actions
    if (
      (lType === GestureType.Pinch && rType === GestureType.FlatDrag) ||
      (lType === GestureType.FlatDrag && rType === GestureType.Pinch)
    ) {
      const midpoint = {
        x: (left.position.x + right.position.x) / 2,
        y: (left.position.y + right.position.y) / 2,
        z: (left.position.z + right.position.z) / 2
      }

      return {
        twoHandAction: {
          type: GestureType.TwoHandPinch,
          phase: GesturePhase.Hold,
          hand: 'right',
          confidence: Math.min(left.confidence, right.confidence),
          position: midpoint,
          timestamp,
          data: {
            handDistance: this.computeHandDistance(left, right),
            handDistanceDelta,
            leftType: gestureTypeToNumber(lType),
            rightType: gestureTypeToNumber(rType)
          }
        },
        suppressLeft: true,
        suppressRight: true,
        handDistanceDelta,
        leftZDelta,
        rightZDelta
      }
    }

    // Pinch + OpenPalm → unfold
    if (
      (lType === GestureType.Pinch && rType === GestureType.OpenPalm) ||
      (lType === GestureType.OpenPalm && rType === GestureType.Pinch)
    ) {
      return {
        twoHandAction: {
          type: GestureType.TwoHandPush,
          phase: GesturePhase.Hold,
          hand: 'right',
          confidence: Math.min(left.confidence, right.confidence),
          position: {
            x: (left.position.x + right.position.x) / 2,
            y: (left.position.y + right.position.y) / 2,
            z: (left.position.z + right.position.z) / 2
          },
          timestamp,
          data: {
            handDistance: this.computeHandDistance(left, right),
            handDistanceDelta,
            leftType: gestureTypeToNumber(lType),
            rightType: gestureTypeToNumber(rType)
          }
        },
        suppressLeft: true,
        suppressRight: true,
        handDistanceDelta,
        leftZDelta,
        rightZDelta
      }
    }

    return null
  }

  /**
   * Compute the Euclidean distance between two hand positions.
   */
  private computeHandDistance(left: GestureEvent, right: GestureEvent): number {
    const dx = left.position.x - right.position.x
    const dy = left.position.y - right.position.y
    const dz = left.position.z - right.position.z
    return Math.sqrt(dx * dx + dy * dy + dz * dz)
  }
}

/** Map GestureType enum to a numeric value for inclusion in data records */
function gestureTypeToNumber(type: GestureType): number {
  const mapping: Record<GestureType, number> = {
    [GestureType.Pinch]: 0,
    [GestureType.Point]: 1,
    [GestureType.OpenPalm]: 2,
    [GestureType.Twist]: 3,
    [GestureType.TwoHandPinch]: 4,
    [GestureType.TwoHandRotate]: 5,
    [GestureType.TwoHandPush]: 6,
    [GestureType.FlatDrag]: 7,
    [GestureType.Fist]: 8,
    [GestureType.LShape]: 9
  }
  return mapping[type] ?? -1
}
