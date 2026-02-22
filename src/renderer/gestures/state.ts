/**
 * Gesture state machine and engine.
 * Manages gesture lifecycle: idle -> onset -> hold -> release -> cooldown -> idle
 * Processes LandmarkFrames to emit GestureEvents.
 */

import {
  type Hand,
  type LandmarkFrame,
  type GestureEvent,
  type Handedness,
  GestureType,
  GesturePhase,
  LANDMARK
} from '@shared/protocol'
import { type GestureConfig, DEFAULT_GESTURE_CONFIG } from './types'
import { classifyGesture, detectPinch, distance, resetPinchVelocity } from './classifier'
import { computeTrackingQuality } from '../tracker/quality'

const TWO_PI = 2 * Math.PI

// ─── State Machine ──────────────────────────────────────────────────

/** Internal states of the gesture state machine */
export enum GestureState {
  Idle = 'idle',
  Onset = 'onset',
  Hold = 'hold',
  Release = 'release',
  Cooldown = 'cooldown'
}

/**
 * State machine for a single gesture type.
 * Tracks the lifecycle of gesture detection with debouncing and cooldown.
 */
export class GestureStateMachine {
  private state: GestureState = GestureState.Idle
  private onsetFrameCount = 0
  private onsetStartTime = 0
  private holdStartTime = 0
  private releaseTime = 0
  /** Counts consecutive non-detected frames before confirming release (debounce) */
  private releaseDebounceCount = 0

  constructor(
    private readonly minOnsetFrames: number = DEFAULT_GESTURE_CONFIG.minOnsetFrames,
    private readonly minHoldDuration: number = DEFAULT_GESTURE_CONFIG.minHoldDuration,
    private readonly cooldownDuration: number = DEFAULT_GESTURE_CONFIG.cooldownDuration,
    /** Minimum consecutive non-detected frames before release fires. Default: 1 */
    private readonly minReleaseFrames: number = 1
  ) {}

  /** Get the current internal state */
  getState(): GestureState {
    return this.state
  }

  /** Reset the state machine back to idle */
  reset(): void {
    this.state = GestureState.Idle
    this.onsetFrameCount = 0
    this.onsetStartTime = 0
    this.holdStartTime = 0
    this.releaseTime = 0
    this.releaseDebounceCount = 0
  }

  /**
   * Update the state machine with a new detection result.
   * @param detected - Whether the gesture was detected in this frame
   * @param timestamp - Current frame timestamp (ms)
   * @returns The phase transition event if a state change occurred, null otherwise
   */
  update(detected: boolean, timestamp: number): GesturePhase | null {
    switch (this.state) {
      // Hold is the most frequent state (continuous gestures) — check first
      case GestureState.Hold:
        if (!detected) {
          this.releaseDebounceCount++
          // Require minReleaseFrames consecutive non-detections before releasing.
          // Absorbs single-frame detection dropouts from noisy MediaPipe output.
          if (this.releaseDebounceCount >= this.minReleaseFrames) {
            this.state = GestureState.Release
            this.releaseTime = timestamp
            this.releaseDebounceCount = 0
            return GesturePhase.Release
          }
          return GesturePhase.Hold
        }
        this.releaseDebounceCount = 0
        return GesturePhase.Hold

      case GestureState.Idle:
        if (detected) {
          this.state = GestureState.Onset
          this.onsetFrameCount = 1
          this.onsetStartTime = timestamp
          return GesturePhase.Onset
        }
        return null

      case GestureState.Onset:
        if (!detected) {
          this.state = GestureState.Release
          this.releaseTime = timestamp
          return GesturePhase.Release
        }
        this.onsetFrameCount++
        if (
          this.onsetFrameCount >= this.minOnsetFrames &&
          timestamp - this.onsetStartTime >= this.minHoldDuration
        ) {
          this.state = GestureState.Hold
          this.holdStartTime = timestamp
          return GesturePhase.Hold
        }
        return null

      case GestureState.Cooldown:
        if (timestamp - this.releaseTime >= this.cooldownDuration) {
          // Cooldown expired + gesture still detected => direct re-onset
          if (detected) {
            this.state = GestureState.Onset
            this.onsetFrameCount = 1
            this.onsetStartTime = timestamp
            return GesturePhase.Onset
          }
          this.state = GestureState.Idle
          this.onsetFrameCount = 0
        }
        return null

      case GestureState.Release:
        this.state = GestureState.Cooldown
        this.releaseTime = timestamp
        return null

      default:
        return null
    }
  }
}

// ─── Gesture Engine ─────────────────────────────────────────────────

/** Stored hand orientation for twist detection */
interface HandOrientation {
  /** Angle of the index finger MCP -> wrist vector on the xy plane */
  angle: number
  timestamp: number
}

// ─── Gesture Index Mapping (avoids per-frame string concat) ─────

/** All gesture types in a fixed order for numeric indexing. */
const ALL_GESTURE_TYPES: readonly GestureType[] = [
  GestureType.Pinch,
  GestureType.Point,
  GestureType.OpenPalm,
  GestureType.Fist,
  GestureType.LShape,
  GestureType.FlatDrag,
  GestureType.Twist,
  GestureType.TwoHandPinch,
  GestureType.TwoHandRotate,
  GestureType.TwoHandPush
] as const

/** Map GestureType enum value -> numeric index for O(1) array lookup. */
const GESTURE_INDEX: Record<string, number> = {}
for (let i = 0; i < ALL_GESTURE_TYPES.length; i++) {
  GESTURE_INDEX[ALL_GESTURE_TYPES[i]] = i
}

/** Hand index: left = 0, right = 1. */
function handIndex(hand: Handedness): number {
  return hand === 'left' ? 0 : 1
}

/**
 * Main gesture recognition engine.
 * Takes LandmarkFrames, runs classifiers, manages state machines,
 * and emits GestureEvents.
 */
/** Single-hand gesture types checked per frame (extracted to avoid per-frame allocation) */
const SINGLE_HAND_TYPES: readonly GestureType[] = [
  GestureType.Pinch,
  GestureType.Point,
  GestureType.OpenPalm,
  GestureType.Fist,
  GestureType.LShape,
  GestureType.FlatDrag
] as const

export class GestureEngine {
  /**
   * 2D array of state machines: [handIndex (0|1)][gestureIndex].
   * Pre-allocated eagerly to avoid per-frame Map lookups and string concatenation.
   */
  private stateMachineGrid: GestureStateMachine[][]
  private previousOrientations: Map<Handedness, HandOrientation> = new Map()
  private config: GestureConfig

  /** Pooled Maps reused per frame to avoid allocation */
  private readonly _handCentersPool = new Map<Handedness, { x: number; y: number; z: number }>()
  private readonly _pinchResultsPool = new Map<Handedness, { detected: boolean; distance: number }>()

  /** Cached effective config — invalidated when updateConfig is called */
  private _effectiveConfig: GestureConfig | null = null

  constructor(config: Partial<GestureConfig> = {}) {
    this.config = { ...DEFAULT_GESTURE_CONFIG, ...config }
    this.stateMachineGrid = this._createStateMachineGrid()
  }

  /** Create the full 2D grid of state machines (2 hands x N gesture types). */
  private _createStateMachineGrid(): GestureStateMachine[][] {
    const grid: GestureStateMachine[][] = [[], []]
    for (let h = 0; h < 2; h++) {
      for (let g = 0; g < ALL_GESTURE_TYPES.length; g++) {
        grid[h][g] = new GestureStateMachine(
          this.config.minOnsetFrames,
          this.config.minHoldDuration,
          this.config.cooldownDuration
        )
      }
    }
    return grid
  }

  /** Get the state machine for a gesture-hand combination via O(1) array lookup. */
  private getStateMachine(gestureType: GestureType, hand: Handedness): GestureStateMachine {
    return this.stateMachineGrid[handIndex(hand)][GESTURE_INDEX[gestureType]]
  }

  /** Compute hand orientation angle for twist detection using multiple landmarks for robustness */
  private computeHandAngle(hand: Hand): number {
    const wrist = hand.landmarks[LANDMARK.WRIST]
    // Average the MCP dx/dy vectors then use a single atan2 (1 call instead of 3)
    const idx = hand.landmarks[LANDMARK.INDEX_MCP]
    const mid = hand.landmarks[LANDMARK.MIDDLE_MCP]
    const rng = hand.landmarks[LANDMARK.RING_MCP]
    const avgDx = (idx.x + mid.x + rng.x) / 3 - wrist.x
    const avgDy = (idx.y + mid.y + rng.y) / 3 - wrist.y
    return Math.atan2(avgDy, avgDx)
  }

  /** Detect twist gesture based on hand rotation over time */
  private detectTwist(
    hand: Hand,
    timestamp: number
  ): { detected: boolean; rotation: number } {
    const currentAngle = this.computeHandAngle(hand)
    const prev = this.previousOrientations.get(hand.handedness)

    // Store the current orientation
    this.previousOrientations.set(hand.handedness, {
      angle: currentAngle,
      timestamp
    })

    if (!prev) {
      return { detected: false, rotation: 0 }
    }

    const dt = timestamp - prev.timestamp
    // Ignore if too much time has passed (stale data)
    if (dt > 500 || dt <= 0) {
      return { detected: false, rotation: 0 }
    }

    let rotation = currentAngle - prev.angle
    // Normalize to [-pi, pi]
    if (rotation > Math.PI) rotation -= TWO_PI
    if (rotation < -Math.PI) rotation += TWO_PI

    return {
      detected: Math.abs(rotation) > this.config.twistMinRotation,
      rotation
    }
  }

  /** Tracks previous classification per hand for hysteresis */
  private _lastClassification: [GestureType | null, GestureType | null] = [null, null]
  /** Tracks which hands were present in the previous frame (for pinch velocity reset) */
  private _previousHandedness: Set<Handedness> = new Set()

  /** Tracks last pinch onset timestamp per hand for twoHandOnsetGrace */
  private _pinchOnsetTime: [number, number] = [0, 0]

  /** Pre-allocated position objects for handCenter to avoid per-call allocation */
  private readonly _handCenterLeft = { x: 0, y: 0, z: 0 }
  private readonly _handCenterRight = { x: 0, y: 0, z: 0 }



  /** Get the center position of a hand (palm center approximation) */
  private handCenter(hand: Hand): { x: number; y: number; z: number } {
    const wrist = hand.landmarks[LANDMARK.WRIST]
    const middleMcp = hand.landmarks[LANDMARK.MIDDLE_MCP]
    const out = hand.handedness === 'left' ? this._handCenterLeft : this._handCenterRight
    out.x = (wrist.x + middleMcp.x) / 2
    out.y = (wrist.y + middleMcp.y) / 2
    out.z = (wrist.z + middleMcp.z) / 2
    return out
  }

  /** Pre-allocated position objects per hand for gesturePosition (zero GC) */
  private readonly _gesturePositionLeft = { x: 0, y: 0, z: 0 }
  private readonly _gesturePositionRight = { x: 0, y: 0, z: 0 }

  /** Get gesture-specific position: finger tip for Point, pinch midpoint for Pinch, palm for others */
  private gesturePosition(hand: Hand, gestureType: GestureType): { x: number; y: number; z: number } {
    const out = hand.handedness === 'left' ? this._gesturePositionLeft : this._gesturePositionRight
    if (gestureType === GestureType.Point) {
      const tip = hand.landmarks[LANDMARK.INDEX_TIP]
      out.x = tip.x; out.y = tip.y; out.z = tip.z
    } else if (gestureType === GestureType.Pinch) {
      const thumb = hand.landmarks[LANDMARK.THUMB_TIP]
      const index = hand.landmarks[LANDMARK.INDEX_TIP]
      out.x = (thumb.x + index.x) / 2
      out.y = (thumb.y + index.y) / 2
      out.z = (thumb.z + index.z) / 2
    } else {
      const center = this.handCenter(hand)
      out.x = center.x; out.y = center.y; out.z = center.z
    }
    return out
  }

  /**
   * Process a single landmark frame and return all gesture events.
   */
  processFrame(frame: LandmarkFrame): GestureEvent[] {
    const events: GestureEvent[] = []
    const { hands, timestamp } = frame
    const effectiveConfig = this.getEffectiveConfig()

    // Reset pinch velocity for hands that disappeared since last frame
    const currentHandedness = new Set<Handedness>()
    for (const hand of hands) currentHandedness.add(hand.handedness)
    for (const prev of this._previousHandedness) {
      if (!currentHandedness.has(prev)) {
        resetPinchVelocity(prev)
      }
    }
    this._previousHandedness = currentHandedness

    // ─── Pre-compute per-hand results (reuse pooled Maps) ─
    const handCenters = this._handCentersPool
    const pinchResults = this._pinchResultsPool
    handCenters.clear()
    pinchResults.clear()

    for (const hand of hands) {
      handCenters.set(hand.handedness, this.handCenter(hand))
      pinchResults.set(hand.handedness, detectPinch(hand, effectiveConfig))
    }

    // ─── Single-hand gestures ─────────────────────────────────
    for (const hand of hands) {
      // Classify the primary gesture for this hand (with hysteresis from previous frame)
      const hIdx = handIndex(hand.handedness)
      const cachedPinch = pinchResults.get(hand.handedness)!
      // Sprint 1e: pass trackingQuality to gate confidence when tracking is poor
      const trackingQuality = computeTrackingQuality(hand.landmarks)
      const classification = classifyGesture(hand, effectiveConfig, this._lastClassification[hIdx], cachedPinch, trackingQuality)
      this._lastClassification[hIdx] = classification?.type ?? null

      // Also check for twist independently
      const twist = this.detectTwist(hand, timestamp)

      // Update all state machines for this hand
      for (const gestureType of SINGLE_HAND_TYPES) {
        const detected = classification?.type === gestureType
        const sm = this.getStateMachine(gestureType, hand.handedness)
        const phase = sm.update(detected, timestamp)

        if (phase !== null) {
          events.push({
            type: gestureType,
            phase,
            hand: hand.handedness,
            confidence: detected ? classification!.confidence : 0,
            position: this.gesturePosition(hand, gestureType),
            timestamp,
            data: gestureType === GestureType.Pinch
              ? { distance: cachedPinch.distance }
              : undefined
          })
        }
      }

      // Twist state machine
      {
        const sm = this.getStateMachine(GestureType.Twist, hand.handedness)
        const phase = sm.update(twist.detected, timestamp)

        if (phase !== null) {
          events.push({
            type: GestureType.Twist,
            phase,
            hand: hand.handedness,
            confidence: twist.detected ? Math.min(1, Math.abs(twist.rotation) / (effectiveConfig.twistMinRotation * 3)) : 0,
            position: handCenters.get(hand.handedness)!,
            timestamp,
            data: { rotation: twist.rotation }
          })
        }
      }
    }

    // ─── Two-hand gestures ────────────────────────────────────
    if (hands.length >= 2) {
      const leftHand = hands.find((h) => h.handedness === 'left')
      const rightHand = hands.find((h) => h.handedness === 'right')

      if (leftHand && rightHand) {
        // Reuse cached pinch results from the per-hand loop above
        const leftPinch = pinchResults.get('left')!
        const rightPinch = pinchResults.get('right')!

        // Track per-hand pinch onset timestamps
        if (leftPinch.detected) { if (this._pinchOnsetTime[0] === 0) this._pinchOnsetTime[0] = timestamp }
        else { this._pinchOnsetTime[0] = 0 }
        if (rightPinch.detected) { if (this._pinchOnsetTime[1] === 0) this._pinchOnsetTime[1] = timestamp }
        else { this._pinchOnsetTime[1] = 0 }

        // Two-hand onset grace: both hands count as pinching if the second hand
        // starts pinching within `twoHandOnsetGrace` ms of the first
        const grace = effectiveConfig.twoHandOnsetGrace
        let twoHandPinchDetected = leftPinch.detected && rightPinch.detected
        if (!twoHandPinchDetected && grace > 0) {
          const lt = this._pinchOnsetTime[0]
          const rt = this._pinchOnsetTime[1]
          if (lt > 0 && rt > 0 && Math.abs(lt - rt) <= grace) {
            twoHandPinchDetected = true
          }
        }

        const sm = this.getStateMachine(GestureType.TwoHandPinch, 'right')
        const phase = sm.update(twoHandPinchDetected, timestamp)

        if (phase !== null) {
          // Reuse cached hand center positions
          const leftCenter = handCenters.get('left')!
          const rightCenter = handCenters.get('right')!
          const handDistance = distance(
            leftHand.landmarks[LANDMARK.THUMB_TIP],
            rightHand.landmarks[LANDMARK.THUMB_TIP]
          )

          events.push({
            type: GestureType.TwoHandPinch,
            phase,
            hand: 'right', // Primary hand for two-hand gestures
            confidence: twoHandPinchDetected
              ? Math.max(0.3, Math.min(1,
                  1 - Math.min(leftPinch.distance, rightPinch.distance) / effectiveConfig.pinchThreshold
                ))
              : 0,
            position: {
              x: (leftCenter.x + rightCenter.x) / 2,
              y: (leftCenter.y + rightCenter.y) / 2,
              z: (leftCenter.z + rightCenter.z) / 2
            },
            timestamp,
            data: {
              leftPinchDistance: leftPinch.distance,
              rightPinchDistance: rightPinch.distance,
              handDistance
            }
          })
        }
      }
    }

    return events
  }

  /** Reset all state machines */
  reset(): void {
    for (let h = 0; h < 2; h++) {
      for (let g = 0; g < ALL_GESTURE_TYPES.length; g++) {
        this.stateMachineGrid[h][g].reset()
      }
    }
    this.previousOrientations.clear()
  }

  /** Update configuration */
  updateConfig(config: Partial<GestureConfig>): void {
    const prev = this.config
    this.config = { ...prev, ...config }
    this._effectiveConfig = null // invalidate cached effective config
    // Only recreate state machines if timing parameters changed
    if (
      this.config.minOnsetFrames !== prev.minOnsetFrames ||
      this.config.minHoldDuration !== prev.minHoldDuration ||
      this.config.cooldownDuration !== prev.cooldownDuration
    ) {
      this.stateMachineGrid = this._createStateMachineGrid()
    }
  }

  /** Get current configuration */
  getConfig(): Readonly<GestureConfig> {
    return { ...this.config }
  }

  /**
   * Get configuration with thresholds scaled by sensitivity.
   * sensitivity=1.0 -> very sensitive -> gestures trigger easily
   *   pinchThreshold scaled up (allow bigger gap to count as pinch)
   *   curlThreshold scaled down (less curl needed)
   *   extensionThreshold scaled up inversely (less extension needed)
   *   twistMinRotation scaled down (less rotation needed)
   * sensitivity=0.0 -> strict -> gestures hard to trigger
   */
  getEffectiveConfig(): GestureConfig {
    if (this._effectiveConfig) return this._effectiveConfig
    const s = this.config.sensitivity ?? 0.5
    const scale = 0.5 + s // range [0.5, 1.5]
    this._effectiveConfig = {
      ...this.config,
      pinchThreshold: this.config.pinchThreshold * scale,
      extensionThreshold: this.config.extensionThreshold * (2 - scale),
      curlThreshold: this.config.curlThreshold * (2 - scale),
      twistMinRotation: this.config.twistMinRotation * (2 - scale),
      // Scale hysteresis proportionally so high-sensitivity doesn't make gestures overly sticky
      hysteresisMargin: this.config.hysteresisMargin * scale
    }
    return this._effectiveConfig
  }
}
