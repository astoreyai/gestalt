/**
 * Rule-based gesture classifier.
 * Takes Hand landmarks and returns detected gestures using geometric analysis.
 *
 * Accuracy improvements over baseline:
 *   1. World landmarks for curl (better 3D geometry than normalized coords)
 *   2. Thumb-specific curl via opposition distance
 *   3. Orientation-adaptive angle/distance blend weights
 *   4. Pinch approach-vector gating (prevents crossing false positives)
 */

import { type Landmark, type Hand, LANDMARK, GestureType } from '@shared/protocol'
import {
  type FingerName,
  type FingerState,
  type HandPose,
  type GestureConfig,
  DEFAULT_GESTURE_CONFIG
} from './types'

// ─── Geometric Helpers ──────────────────────────────────────────────

/** 3D Euclidean distance between two landmarks */
export function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  const result = Math.sqrt(dx * dx + dy * dy + dz * dz)
  return Number.isFinite(result) ? result : 0
}

/** Squared 3D Euclidean distance (avoids Math.sqrt for threshold comparisons) */
export function distanceSquared(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}

/** Precomputed constant: 1/PI for fingerCurl angle normalization */
const INV_PI = 1 / Math.PI

// Pre-allocated vectors for angleBetween to avoid per-call object allocation
const _ba = { x: 0, y: 0, z: 0 }
const _bc = { x: 0, y: 0, z: 0 }

/** Angle at point b formed by vectors b->a and b->c, in radians */
export function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  _ba.x = a.x - b.x; _ba.y = a.y - b.y; _ba.z = a.z - b.z
  _bc.x = c.x - b.x; _bc.y = c.y - b.y; _bc.z = c.z - b.z

  const dot = _ba.x * _bc.x + _ba.y * _bc.y + _ba.z * _bc.z
  const magBA = Math.sqrt(_ba.x * _ba.x + _ba.y * _ba.y + _ba.z * _ba.z)
  const magBC = Math.sqrt(_bc.x * _bc.x + _bc.y * _bc.y + _bc.z * _bc.z)

  if (magBA === 0 || magBC === 0) return 0

  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)))
  const angle = Math.acos(cosAngle)
  return Number.isFinite(angle) ? angle : 0
}

// ─── Palm Normal & Orientation ──────────────────────────────────────

// Pre-allocated cross product vector
const _palmNormal = { x: 0, y: 0, z: 0 }

/**
 * Compute palm normal vector and return the camera-facing factor [0,1].
 * 1.0 = palm faces camera directly (z-axis aligned)
 * 0.0 = palm is edge-on (z-axis perpendicular to camera)
 *
 * Used to adaptively weight angle vs distance curl measurement.
 */
export function computePalmFacing(landmarks: Landmark[]): number {
  const wrist = landmarks[LANDMARK.WRIST]
  const indexMcp = landmarks[LANDMARK.INDEX_MCP]
  const pinkyMcp = landmarks[LANDMARK.PINKY_MCP]

  // Two vectors on the palm plane
  const ax = indexMcp.x - wrist.x
  const ay = indexMcp.y - wrist.y
  const az = indexMcp.z - wrist.z
  const bx = pinkyMcp.x - wrist.x
  const by = pinkyMcp.y - wrist.y
  const bz = pinkyMcp.z - wrist.z

  // Cross product = palm normal
  _palmNormal.x = ay * bz - az * by
  _palmNormal.y = az * bx - ax * bz
  _palmNormal.z = ax * by - ay * bx

  const mag = Math.sqrt(
    _palmNormal.x * _palmNormal.x +
    _palmNormal.y * _palmNormal.y +
    _palmNormal.z * _palmNormal.z
  )

  if (mag < 0.000001) return 0.5

  // Camera looks along -z in normalized coords. Palm normal z-component
  // tells us how much the palm faces the camera.
  const facing = Math.abs(_palmNormal.z / mag)
  return Math.max(0, Math.min(1, facing))
}

// ─── Finger Landmark Indices ────────────────────────────────────────

interface FingerIndices {
  mcp: number
  pip: number
  dip: number
  tip: number
}

const FINGER_INDICES: Record<FingerName, FingerIndices> = {
  thumb: {
    mcp: LANDMARK.THUMB_CMC,
    pip: LANDMARK.THUMB_MCP,
    dip: LANDMARK.THUMB_IP,
    tip: LANDMARK.THUMB_TIP
  },
  index: {
    mcp: LANDMARK.INDEX_MCP,
    pip: LANDMARK.INDEX_PIP,
    dip: LANDMARK.INDEX_DIP,
    tip: LANDMARK.INDEX_TIP
  },
  middle: {
    mcp: LANDMARK.MIDDLE_MCP,
    pip: LANDMARK.MIDDLE_PIP,
    dip: LANDMARK.MIDDLE_DIP,
    tip: LANDMARK.MIDDLE_TIP
  },
  ring: {
    mcp: LANDMARK.RING_MCP,
    pip: LANDMARK.RING_PIP,
    dip: LANDMARK.RING_DIP,
    tip: LANDMARK.RING_TIP
  },
  pinky: {
    mcp: LANDMARK.PINKY_MCP,
    pip: LANDMARK.PINKY_PIP,
    dip: LANDMARK.PINKY_DIP,
    tip: LANDMARK.PINKY_TIP
  }
}

const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky']

// ─── Finger Analysis ────────────────────────────────────────────────

/**
 * Compute curl amount for a finger using world landmarks when available.
 * Returns 0 = fully extended, 1 = fully curled.
 *
 * Improvements:
 * - Uses world landmarks (metric 3D) for distance-based curl when available
 *   (better depth than normalized screen coords)
 * - Thumb uses opposition distance instead of standard curl
 * - Orientation-adaptive blend weights: when palm faces camera, angles
 *   are reliable; when edge-on, distance is more robust
 */
export function fingerCurl(
  landmarks: Landmark[],
  finger: FingerName,
  worldLandmarks?: Landmark[],
  palmFacing?: number
): number {
  // Thumb uses a specialized opposition-based measurement
  if (finger === 'thumb') {
    return thumbCurl(landmarks, worldLandmarks)
  }

  const idx = FINGER_INDICES[finger]

  // Use world landmarks for distance-based curl if available (better 3D geometry)
  const distLm = worldLandmarks && worldLandmarks.length === 21 ? worldLandmarks : landmarks
  const angleLm = landmarks // angles work fine with normalized coords

  // Angle-based curl: straight = pi, bent = 0
  const angle1 = angleBetween(angleLm[idx.mcp], angleLm[idx.pip], angleLm[idx.dip])
  const angle2 = angleBetween(angleLm[idx.pip], angleLm[idx.dip], angleLm[idx.tip])
  const avgAngle = (angle1 + angle2) / 2
  const angleCurl = Math.max(0, Math.min(1, 1 - avgAngle * INV_PI))

  // Distance-based curl using world landmarks (metric space, no aspect-ratio distortion)
  const tipToMcpSq = distanceSquared(distLm[idx.tip], distLm[idx.mcp])
  const boneSq1 = distanceSquared(distLm[idx.mcp], distLm[idx.pip])
  const boneSq2 = distanceSquared(distLm[idx.pip], distLm[idx.dip])
  const boneSq3 = distanceSquared(distLm[idx.dip], distLm[idx.tip])
  const boneLen = Math.sqrt(boneSq1) + Math.sqrt(boneSq2) + Math.sqrt(boneSq3)
  const boneLenSq = boneLen * boneLen
  const distRatio = boneLenSq > 0.000001 ? Math.sqrt(tipToMcpSq / boneLenSq) : 1
  const distCurl = Math.max(0, Math.min(1, 1 - distRatio))

  // Orientation-adaptive blend weights:
  // Palm facing camera → angles reliable (weight 0.5/0.5)
  // Palm edge-on → distances more robust (weight 0.2/0.8)
  const facing = palmFacing ?? 0.5
  const angleWeight = 0.2 + facing * 0.3 // range [0.2, 0.5]
  const distWeight = 1.0 - angleWeight    // range [0.5, 0.8]

  return angleCurl * angleWeight + distCurl * distWeight
}

/**
 * Thumb-specific curl using opposition distance.
 * The thumb doesn't curl like other fingers — it opposes (rotates toward the palm).
 * Measures distance from thumb tip to palm center, normalized by palm size.
 *
 * Returns 0 = fully extended/abducted, 1 = fully curled/opposed.
 */
function thumbCurl(landmarks: Landmark[], worldLandmarks?: Landmark[]): number {
  const lm = worldLandmarks && worldLandmarks.length === 21 ? worldLandmarks : landmarks

  const thumbTip = lm[LANDMARK.THUMB_TIP]
  const thumbCmc = lm[LANDMARK.THUMB_CMC]
  const wrist = lm[LANDMARK.WRIST]
  const middleMcp = lm[LANDMARK.MIDDLE_MCP]
  const indexMcp = lm[LANDMARK.INDEX_MCP]

  // Palm center approximation
  const palmCenterX = (wrist.x + middleMcp.x + indexMcp.x) / 3
  const palmCenterY = (wrist.y + middleMcp.y + indexMcp.y) / 3
  const palmCenterZ = (wrist.z + middleMcp.z + indexMcp.z) / 3
  const palmCenter = { x: palmCenterX, y: palmCenterY, z: palmCenterZ }

  // Thumb tip to palm center distance (opposition metric)
  const tipToPalm = distance(thumbTip, palmCenter)

  // Max reach: thumb CMC to palm center + thumb chain length
  const cmcToPalm = distance(thumbCmc, palmCenter)
  const thumbChain = distance(lm[LANDMARK.THUMB_CMC], lm[LANDMARK.THUMB_MCP])
    + distance(lm[LANDMARK.THUMB_MCP], lm[LANDMARK.THUMB_IP])
    + distance(lm[LANDMARK.THUMB_IP], lm[LANDMARK.THUMB_TIP])
  const maxReach = cmcToPalm + thumbChain * 0.6

  if (maxReach < 0.000001) return 0

  // Close to palm = curled (high), far from palm = extended (low)
  const extensionRatio = Math.min(tipToPalm / maxReach, 1.0)
  const curl = 1.0 - extensionRatio

  // Also factor in the basic angle between CMC→MCP→IP
  const angle = angleBetween(lm[LANDMARK.THUMB_CMC], lm[LANDMARK.THUMB_MCP], lm[LANDMARK.THUMB_IP])
  const angleCurl = Math.max(0, Math.min(1, 1 - angle * INV_PI))

  // Blend: 70% opposition, 30% angle
  return curl * 0.7 + angleCurl * 0.3
}

/**
 * Determine whether a finger is extended using angle between joints.
 * A finger is extended if its curl is below the extension threshold.
 */
export function fingerExtended(
  landmarks: Landmark[],
  finger: FingerName,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): boolean {
  const curl = fingerCurl(landmarks, finger)
  return curl < config.extensionThreshold
}

/**
 * Analyze the complete pose of a hand.
 */
export function analyzeHandPose(
  landmarks: Landmark[],
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): HandPose {
  const fingers = FINGER_NAMES.map((name) => {
    const curl = fingerCurl(landmarks, name)
    return {
      extended: curl < config.extensionThreshold,
      curl
    } as FingerState
  }) as [FingerState, FingerState, FingerState, FingerState, FingerState]

  const thumbIndexDist = distance(
    landmarks[LANDMARK.THUMB_TIP],
    landmarks[LANDMARK.INDEX_TIP]
  )
  const thumbMiddleDist = distance(
    landmarks[LANDMARK.THUMB_TIP],
    landmarks[LANDMARK.MIDDLE_TIP]
  )

  let extSum = 0
  for (const f of fingers) {
    if (f.extended) extSum++
  }
  const palmOpenness = extSum / 5

  const handFlatness = computeHandFlatness(landmarks)

  return {
    fingers,
    thumbIndexDistance: thumbIndexDist,
    thumbMiddleDistance: thumbMiddleDist,
    palmOpenness,
    handFlatness
  }
}

/**
 * Compute hand flatness only — lightweight alternative to analyzeHandPose
 * when only flatness is needed (e.g. FlatDrag detection in classifyGesture).
 */
export function computeHandFlatness(landmarks: Landmark[]): number {
  const wristZ = landmarks[LANDMARK.WRIST].z
  const tipIndices = [
    LANDMARK.THUMB_TIP, LANDMARK.INDEX_TIP, LANDMARK.MIDDLE_TIP,
    LANDMARK.RING_TIP, LANDMARK.PINKY_TIP
  ]
  let sumZDiff = 0
  for (const i of tipIndices) {
    sumZDiff += Math.abs(landmarks[i].z - wristZ)
  }
  return Math.max(0, Math.min(1, 1 - (sumZDiff / tipIndices.length) * 10))
}

// ─── Pinch Velocity Tracking ────────────────────────────────────────

/**
 * Tracks previous thumb/index tip positions for approach-vector gating.
 * Stored per hand (module-level to persist across classify calls).
 */
interface PinchVelocityState {
  prevThumb: { x: number; y: number; z: number } | null
  prevIndex: { x: number; y: number; z: number } | null
}

const _pinchVelocity: Record<string, PinchVelocityState> = {
  left: { prevThumb: null, prevIndex: null },
  right: { prevThumb: null, prevIndex: null }
}

/**
 * Check if thumb and index tips are approaching each other (dot product > 0).
 * Returns true if tips are converging or already very close, false if diverging.
 */
function areFingersApproaching(hand: Hand): boolean {
  const state = _pinchVelocity[hand.handedness]
  const thumb = hand.landmarks[LANDMARK.THUMB_TIP]
  const index = hand.landmarks[LANDMARK.INDEX_TIP]

  if (!state.prevThumb || !state.prevIndex) {
    state.prevThumb = { x: thumb.x, y: thumb.y, z: thumb.z }
    state.prevIndex = { x: index.x, y: index.y, z: index.z }
    return true // No history — allow pinch
  }

  // Velocity vectors
  const thumbVx = thumb.x - state.prevThumb.x
  const thumbVy = thumb.y - state.prevThumb.y
  const indexVx = index.x - state.prevIndex.x
  const indexVy = index.y - state.prevIndex.y

  // Relative velocity: index relative to thumb
  const relVx = indexVx - thumbVx
  const relVy = indexVy - thumbVy

  // Direction from thumb to index
  const dirX = index.x - thumb.x
  const dirY = index.y - thumb.y

  // Dot product: positive = moving apart, negative = approaching
  const dot = relVx * dirX + relVy * dirY

  // Update previous positions
  state.prevThumb.x = thumb.x; state.prevThumb.y = thumb.y; state.prevThumb.z = thumb.z
  state.prevIndex.x = index.x; state.prevIndex.y = index.y; state.prevIndex.z = index.z

  // Already very close — always allow (they've made contact)
  const distSq = distanceSquared(thumb, index)
  if (distSq < 0.005) return true

  // dot < 0 means approaching; dot >= 0 means separating
  // Small threshold to avoid rejecting slow approaches
  return dot < 0.001
}

/** Reset pinch velocity tracking (call on hand tracking loss) */
export function resetPinchVelocity(handedness?: string): void {
  if (handedness) {
    const s = _pinchVelocity[handedness]
    if (s) { s.prevThumb = null; s.prevIndex = null }
  } else {
    _pinchVelocity.left = { prevThumb: null, prevIndex: null }
    _pinchVelocity.right = { prevThumb: null, prevIndex: null }
  }
}

// ─── Gesture Detection Functions ────────────────────────────────────

/**
 * Detect pinch gesture: thumb tip close to index tip.
 * Distance is normalized by palm size (wrist-to-middle-MCP) so the
 * same threshold works across different hand sizes and camera distances.
 *
 * Enhancement: approach-vector gating prevents false positives from
 * thumb and index crossing paths without intentional pinch.
 */
export function detectPinch(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): { detected: boolean; distance: number } {
  const thumbTip = hand.landmarks[LANDMARK.THUMB_TIP]
  const indexTip = hand.landmarks[LANDMARK.INDEX_TIP]
  const rawDistSq = distanceSquared(thumbTip, indexTip)

  // Normalize by palm size for hand-size invariance (compare squared to avoid sqrt when possible)
  const palmDistSq = distanceSquared(hand.landmarks[LANDMARK.WRIST], hand.landmarks[LANDMARK.MIDDLE_MCP])
  const palmNormSq = Math.max(palmDistSq, 0.000001)
  // Compare squared: rawDistSq / palmNormSq < threshold^2
  const thresholdSq = config.pinchThreshold * config.pinchThreshold
  const distBelowThreshold = rawDistSq / palmNormSq < thresholdSq
  // Only compute sqrt for the distance value (needed for confidence)
  const normalizedDist = Math.sqrt(rawDistSq / palmNormSq)

  // Approach-vector gating: reject if fingers are diverging (crossing, not pinching)
  const approaching = areFingersApproaching(hand)
  const detected = distBelowThreshold && approaching

  return { detected, distance: normalizedDist }
}

/**
 * Detect point gesture: only index finger extended, rest curled.
 * Accepts optional pre-computed curls to avoid redundant fingerCurl() calls.
 */
export function detectPoint(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG,
  curls?: Record<FingerName, number>
): boolean {
  const lm = hand.landmarks
  const c = curls ?? { thumb: fingerCurl(lm, 'thumb'), index: fingerCurl(lm, 'index'), middle: fingerCurl(lm, 'middle'), ring: fingerCurl(lm, 'ring'), pinky: fingerCurl(lm, 'pinky') }
  const indexExt = c.index < config.extensionThreshold
  const middleCurled = c.middle > config.curlThreshold
  const ringCurled = c.ring > config.curlThreshold
  const pinkyCurled = c.pinky > config.curlThreshold

  return indexExt && middleCurled && ringCurled && pinkyCurled
}

/**
 * Detect open palm: all fingers extended.
 */
export function detectOpenPalm(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG,
  curls?: Record<FingerName, number>
): boolean {
  const lm = hand.landmarks
  const c = curls ?? { thumb: fingerCurl(lm, 'thumb'), index: fingerCurl(lm, 'index'), middle: fingerCurl(lm, 'middle'), ring: fingerCurl(lm, 'ring'), pinky: fingerCurl(lm, 'pinky') }
  return FINGER_NAMES.every((name) => c[name] < config.extensionThreshold)
}

/**
 * Detect fist: all fingers curled.
 */
export function detectFist(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG,
  curls?: Record<FingerName, number>
): boolean {
  const lm = hand.landmarks
  const c = curls ?? { thumb: fingerCurl(lm, 'thumb'), index: fingerCurl(lm, 'index'), middle: fingerCurl(lm, 'middle'), ring: fingerCurl(lm, 'ring'), pinky: fingerCurl(lm, 'pinky') }
  return FINGER_NAMES.every((name) => c[name] > config.curlThreshold)
}

/**
 * Detect L-shape: thumb + index extended, rest curled.
 */
export function detectLShape(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG,
  curls?: Record<FingerName, number>
): boolean {
  const lm = hand.landmarks
  const c = curls ?? { thumb: fingerCurl(lm, 'thumb'), index: fingerCurl(lm, 'index'), middle: fingerCurl(lm, 'middle'), ring: fingerCurl(lm, 'ring'), pinky: fingerCurl(lm, 'pinky') }
  const thumbExt = c.thumb < config.extensionThreshold
  const indexExt = c.index < config.extensionThreshold
  const middleCurled = c.middle > config.curlThreshold
  const ringCurled = c.ring > config.curlThreshold
  const pinkyCurled = c.pinky > config.curlThreshold

  return thumbExt && indexExt && middleCurled && ringCurled && pinkyCurled
}

/**
 * Detect flat drag: all fingers extended and hand is flat.
 */
export function detectFlatDrag(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG,
  curls?: Record<FingerName, number>
): boolean {
  const lm = hand.landmarks
  const c = curls ?? { thumb: fingerCurl(lm, 'thumb'), index: fingerCurl(lm, 'index'), middle: fingerCurl(lm, 'middle'), ring: fingerCurl(lm, 'ring'), pinky: fingerCurl(lm, 'pinky') }
  const allExtended = FINGER_NAMES.every((name) => c[name] < config.extensionThreshold)
  if (!allExtended) return false
  return computeHandFlatness(lm) > 0.7
}

// Pre-allocated curls object reused by classifyGesture to avoid per-call allocation
const _curls: Record<FingerName, number> = { thumb: 0, index: 0, middle: 0, ring: 0, pinky: 0 }

// ─── Main Classifier ────────────────────────────────────────────────

/**
 * Classify the primary gesture from a hand's landmarks.
 * Returns the gesture type and confidence, or null if no gesture detected.
 *
 * Priority order (most specific to least):
 * 1. Pinch (very specific thumb-index distance)
 * 2. Point (one finger extended)
 * 3. L-Shape (two fingers)
 * 4. Fist (all curled)
 * 5. Flat Drag (all extended + flat)
 * 6. Open Palm (all extended)
 *
 * @param previousType Optional previous classification for hysteresis — the
 *   current gesture type gets a margin bonus to prevent boundary flickering.
 */
export function classifyGesture(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG,
  previousType?: GestureType | null,
  cachedPinch?: { detected: boolean; distance: number }
): { type: GestureType; confidence: number } | null {
  if (hand.score < config.minConfidence) {
    return null
  }

  const lm = hand.landmarks
  const wlm = hand.worldLandmarks
  const hm = config.hysteresisMargin ?? 0.04

  // Compute palm facing for orientation-adaptive curl weights
  const palmFacing = computePalmFacing(lm)

  // P2-48: Pre-compute all 5 finger curls once, reusing module-level buffer
  // Pass world landmarks and palm facing for improved accuracy
  const curls = _curls
  curls.thumb = fingerCurl(lm, 'thumb', wlm, palmFacing)
  curls.index = fingerCurl(lm, 'index', wlm, palmFacing)
  curls.middle = fingerCurl(lm, 'middle', wlm, palmFacing)
  curls.ring = fingerCurl(lm, 'ring', wlm, palmFacing)
  curls.pinky = fingerCurl(lm, 'pinky', wlm, palmFacing)

  // Hysteresis: if the previous classification matches the current candidate,
  // apply a margin bonus (lower curl threshold, higher pinch threshold) so
  // the gesture is "sticky" at boundaries.
  const curlThr = (gestureType: GestureType) =>
    previousType === gestureType ? config.curlThreshold - hm : config.curlThreshold
  const extThr = (gestureType: GestureType) =>
    previousType === gestureType ? config.extensionThreshold + hm : config.extensionThreshold

  // Pre-compute pinch distance for both fist-exclusion and pinch detection
  const pinchThr = previousType === GestureType.Pinch
    ? config.pinchThreshold + hm
    : config.pinchThreshold
  const pinch = cachedPinch && pinchThr === config.pinchThreshold
    ? cachedPinch
    : detectPinch(hand, { ...config, pinchThreshold: pinchThr })

  // Check fist — all fingers curled. Must come before pinch in priority because
  // a closed fist naturally brings thumb tip near index tip, falsely triggering pinch.
  // HOWEVER: if thumb+index are in clear pinch range, this is a pinch NOT a fist,
  // even if other fingers happen to be curled (natural resting pose during pinch).
  const fistCurlThr = curlThr(GestureType.Fist)
  const fourFingersCurled = curls.index > fistCurlThr
    && curls.middle > fistCurlThr
    && curls.ring > fistCurlThr
    && curls.pinky > fistCurlThr
  const thumbCurledForFist = curls.thumb > 0.08
  // Pinch exclusion: if thumb-index distance is within pinch threshold, it's a pinch not a fist
  const inPinchRange = pinch.detected || pinch.distance < pinchThr * 1.2
  if (fourFingersCurled && thumbCurledForFist && !inPinchRange) {
    const avgCurl = (curls.thumb + curls.index + curls.middle + curls.ring + curls.pinky) / 5
    return { type: GestureType.Fist, confidence: Math.min(1, avgCurl) }
  }

  // Check pinch — thumb tip close to index tip
  // Hysteresis: if already pinching, use a wider threshold to maintain
  if (pinch.detected) {
    const confidence = Math.max(0.3, Math.min(1, 1 - pinch.distance / pinchThr))
    return { type: GestureType.Pinch, confidence }
  }

  // Pre-compute shared finger state with hysteresis-aware thresholds
  const lCurlThr = curlThr(GestureType.LShape)
  const indexExt = curls.index < extThr(GestureType.LShape)
  const thumbExt = curls.thumb < extThr(GestureType.LShape)
  const middleCurled = curls.middle > lCurlThr
  const ringCurled = curls.ring > lCurlThr
  const pinkyCurled = curls.pinky > lCurlThr
  const avgOtherCurl = (curls.middle + curls.ring + curls.pinky) / 3

  // Check L-shape — thumb + index extended, rest curled. More specific than
  // Point (which only needs index), so it must be checked first.
  if (thumbExt && indexExt && middleCurled && ringCurled && pinkyCurled) {
    const extQuality = ((1 - curls.thumb) + (1 - curls.index)) / 2
    const curlQuality = (curls.middle + curls.ring + curls.pinky) / 3
    return { type: GestureType.LShape, confidence: Math.min(1, (extQuality + curlQuality) / 2) }
  }

  // Check point — index finger is clearly the most extended finger.
  // Uses relative comparison instead of absolute thresholds because
  // MediaPipe z-depth is unreliable at many camera angles, causing
  // curled fingers to report low curl values (0.1-0.3).
  const absoluteMatch = indexExt && middleCurled && ringCurled && pinkyCurled
  const relativeMatch = indexExt && (avgOtherCurl - curls.index) > 0.1

  if (absoluteMatch || relativeMatch) {
    // Confidence based on how clearly index is distinguished from other fingers
    const curlDiff = avgOtherCurl - curls.index
    const confidence = Math.max(0.3, Math.min(1, curlDiff / 0.2))
    return { type: GestureType.Point, confidence }
  }

  // Check flat drag and open palm — need all extended (use cached curls)
  const palmExtThr = extThr(GestureType.OpenPalm)
  const allExtended = FINGER_NAMES.every((name) => curls[name] < palmExtThr)

  if (allExtended) {
    // Use lightweight flatness check instead of full analyzeHandPose
    const flatness = computeHandFlatness(lm)
    // Check flat drag — all extended + flat (hysteresis: 0.70 to enter, 0.65 to exit)
    const flatThreshold = previousType === GestureType.FlatDrag ? 0.65 : 0.70
    if (flatness > flatThreshold) {
      return { type: GestureType.FlatDrag, confidence: flatness }
    }
    // Check open palm — all extended (least specific)
    let extSum = 0
    for (const name of FINGER_NAMES) {
      if (curls[name] < palmExtThr) extSum++
    }
    return { type: GestureType.OpenPalm, confidence: extSum / 5 }
  }

  return null
}
