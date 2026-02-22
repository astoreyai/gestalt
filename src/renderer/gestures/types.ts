/**
 * Gesture recognizer types.
 * Re-exports shared protocol types and defines gesture-specific types.
 */

export { GestureType, GesturePhase } from '@shared/protocol'
export type { GestureEvent } from '@shared/protocol'

/** State of a single finger (curl amount and extension) */
export interface FingerState {
  /** Whether the finger is considered extended */
  extended: boolean
  /** Curl amount: 0 = fully extended, 1 = fully curled */
  curl: number
}

/** Finger name constants */
export type FingerName = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky'

/** Analyzed pose of a single hand */
export interface HandPose {
  /** State of each finger in order: thumb, index, middle, ring, pinky */
  fingers: [FingerState, FingerState, FingerState, FingerState, FingerState]
  /** Distance between thumb tip and index tip (normalized) */
  thumbIndexDistance: number
  /** Distance between thumb tip and middle tip (normalized) */
  thumbMiddleDistance: number
  /** Palm openness — average extension of all fingers (0 = closed, 1 = open) */
  palmOpenness: number
  /** Hand flatness — how coplanar the fingers are (0 = curled, 1 = flat) */
  handFlatness: number
}

/** Per-gesture tuning configuration */
export interface GestureConfig {
  /** Pinch detection threshold — max distance between thumb and index tips */
  pinchThreshold: number
  /** Finger curl threshold — above this value a finger is considered curled */
  curlThreshold: number
  /** Finger extension threshold — below this value a finger is considered extended */
  extensionThreshold: number
  /** Minimum onset frames before transition to hold (debounce) */
  minOnsetFrames: number
  /** Minimum hold duration in ms before confirming hold */
  minHoldDuration: number
  /** Cooldown duration in ms after release before re-triggering */
  cooldownDuration: number
  /** Minimum confidence to consider a gesture detected */
  minConfidence: number
  /** Twist detection minimum rotation in radians */
  twistMinRotation: number
  /** Sensitivity 0-1, higher = more sensitive (easier to trigger gestures) */
  sensitivity?: number
  /** Grace period (ms) for aligning two-hand onset timing */
  twoHandOnsetGrace: number
  /** Normalized z-delta threshold for dolly detection */
  dollyZThreshold: number
  /** Multiplier for dolly camera movement speed */
  dollySpeed: number
  /** Multiplier for orbit camera movement speed */
  orbitSpeed: number
  /** Hysteresis margin for threshold comparisons (prevents boundary flickering). Default: 0.04 */
  hysteresisMargin: number
}

/** Sensible default gesture configuration */
export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  pinchThreshold: 0.12,
  curlThreshold: 0.35,
  extensionThreshold: 0.55,
  minOnsetFrames: 2,
  minHoldDuration: 40,
  cooldownDuration: 80,
  minConfidence: 0.5,
  twistMinRotation: 0.3,
  twoHandOnsetGrace: 100,
  dollyZThreshold: 0.02,
  dollySpeed: 1.0,
  orbitSpeed: 1.0,
  hysteresisMargin: 0.04
}
