/**
 * Rule-based gesture classifier.
 * Takes Hand landmarks and returns detected gestures using geometric analysis.
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
 * Compute curl amount for a finger.
 * Uses a hybrid of joint angles and tip-to-MCP distance ratio.
 * Returns 0 = fully extended, 1 = fully curled.
 *
 * The angle-based approach can be unreliable when camera depth (z) is noisy.
 * Adding a distance ratio (tip-to-MCP vs MCP-to-wrist) provides a more
 * robust signal: curled fingers have tips close to their MCP joints.
 */
export function fingerCurl(landmarks: Landmark[], finger: FingerName): number {
  const idx = FINGER_INDICES[finger]
  const mcp = landmarks[idx.mcp]
  const pip = landmarks[idx.pip]
  const dip = landmarks[idx.dip]
  const tip = landmarks[idx.tip]

  // Angle-based curl: straight = pi, bent = 0
  const angle1 = angleBetween(mcp, pip, dip)
  const angle2 = angleBetween(pip, dip, tip)
  const avgAngle = (angle1 + angle2) / 2
  const angleCurl = Math.max(0, Math.min(1, 1 - avgAngle / Math.PI))

  // Distance-based curl: how close is the tip to the MCP relative to finger length?
  // Extended finger: tip far from MCP. Curled: tip close to MCP.
  const tipToMcp = distance(tip, mcp)
  // Approximate max finger length as sum of bone segments
  const boneLen = distance(mcp, pip) + distance(pip, dip) + distance(dip, tip)
  const distRatio = boneLen > 0.001 ? tipToMcp / boneLen : 1
  // distRatio ~1 when straight, ~0.3 when curled. Map to curl value.
  const distCurl = Math.max(0, Math.min(1, 1 - distRatio))

  // Blend: weight distance ratio more heavily since it's less affected by z-noise
  return angleCurl * 0.4 + distCurl * 0.6
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

  const extensionValues = fingers.map((f) => (f.extended ? 1 : 0))
  const palmOpenness = extensionValues.reduce<number>((a, b) => a + b, 0) / 5

  // Flatness: measure how coplanar the fingertips are by checking
  // deviation of fingertip z-values from the wrist plane
  const wristZ = landmarks[LANDMARK.WRIST].z
  const tipIndices = [
    LANDMARK.THUMB_TIP,
    LANDMARK.INDEX_TIP,
    LANDMARK.MIDDLE_TIP,
    LANDMARK.RING_TIP,
    LANDMARK.PINKY_TIP
  ]
  const zDiffs = tipIndices.map((i) => Math.abs(landmarks[i].z - wristZ))
  const avgZDiff = zDiffs.reduce((a, b) => a + b, 0) / zDiffs.length
  // Normalize flatness: lower z deviation = flatter
  const handFlatness = Math.max(0, Math.min(1, 1 - avgZDiff * 10))

  return {
    fingers,
    thumbIndexDistance: thumbIndexDist,
    thumbMiddleDistance: thumbMiddleDist,
    palmOpenness,
    handFlatness
  }
}

// ─── Gesture Detection Functions ────────────────────────────────────

/**
 * Detect pinch gesture: thumb tip close to index tip.
 */
export function detectPinch(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): { detected: boolean; distance: number } {
  const thumbTip = hand.landmarks[LANDMARK.THUMB_TIP]
  const indexTip = hand.landmarks[LANDMARK.INDEX_TIP]
  const distSq = distanceSquared(thumbTip, indexTip)
  const thresholdSq = config.pinchThreshold * config.pinchThreshold

  return {
    detected: distSq < thresholdSq,
    distance: Math.sqrt(distSq)
  }
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
  const pose = analyzeHandPose(lm, config)
  return pose.handFlatness > 0.7
}

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
 */
export function classifyGesture(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): { type: GestureType; confidence: number } | null {
  if (hand.score < config.minConfidence) {
    return null
  }

  const lm = hand.landmarks

  // P2-48: Pre-compute all 5 finger curls once to avoid redundant
  // recomputation across multiple detect* calls.
  const curls: Record<FingerName, number> = {
    thumb: fingerCurl(lm, 'thumb'),
    index: fingerCurl(lm, 'index'),
    middle: fingerCurl(lm, 'middle'),
    ring: fingerCurl(lm, 'ring'),
    pinky: fingerCurl(lm, 'pinky')
  }

  // Check fist early — all fingers curled. Must come before pinch because
  // a closed fist naturally brings thumb tip near index tip, falsely triggering pinch.
  // Thumb uses a much lower threshold because it curls sideways and MediaPipe
  // consistently underreports its curl value (often 0.1-0.2 even when fully curled).
  const fourFingersCurled = curls.index > config.curlThreshold
    && curls.middle > config.curlThreshold
    && curls.ring > config.curlThreshold
    && curls.pinky > config.curlThreshold
  const thumbCurledForFist = curls.thumb > 0.08
  if (fourFingersCurled && thumbCurledForFist) {
    const avgCurl = (curls.index + curls.middle + curls.ring + curls.pinky) / 4
    return { type: GestureType.Fist, confidence: Math.min(1, avgCurl) }
  }

  // Check pinch — thumb tip close to index tip, but index must not be fully curled
  // (otherwise it's a fist, not a pinch)
  const pinch = detectPinch(hand, config)
  if (pinch.detected) {
    const pinchThreshold = Math.max(0.001, config.pinchThreshold)
    const confidence = Math.max(0, Math.min(1, 1 - pinch.distance / pinchThreshold))
    return { type: GestureType.Pinch, confidence }
  }

  // Pre-compute shared finger state
  const indexExt = curls.index < config.extensionThreshold
  const thumbExt = curls.thumb < config.extensionThreshold
  const middleCurled = curls.middle > config.curlThreshold
  const ringCurled = curls.ring > config.curlThreshold
  const pinkyCurled = curls.pinky > config.curlThreshold
  const otherCurls = [curls.middle, curls.ring, curls.pinky]
  const avgOtherCurl = otherCurls.reduce((a, b) => a + b, 0) / otherCurls.length

  // Check L-shape — thumb + index extended, rest curled. More specific than
  // Point (which only needs index), so it must be checked first.
  if (thumbExt && indexExt && middleCurled && ringCurled && pinkyCurled) {
    const avgCurl = (curls.middle + curls.ring + curls.pinky) / 3
    return { type: GestureType.LShape, confidence: Math.min(1, avgCurl + 0.3) }
  }

  // Check point — index finger is clearly the most extended finger.
  // Uses relative comparison instead of absolute thresholds because
  // MediaPipe z-depth is unreliable at many camera angles, causing
  // curled fingers to report low curl values (0.1-0.3).
  const absoluteMatch = indexExt && middleCurled && ringCurled && pinkyCurled
  const relativeMatch = indexExt && (avgOtherCurl - curls.index) > 0.1

  if (absoluteMatch || relativeMatch) {
    const confidence = Math.max(0.5, Math.min(1, (avgOtherCurl - curls.index) * 3 + 0.5))
    return { type: GestureType.Point, confidence }
  }

  // Check flat drag and open palm — need all extended (use cached curls)
  const allExtended = FINGER_NAMES.every((name) => curls[name] < config.extensionThreshold)

  if (allExtended) {
    const pose = analyzeHandPose(lm, config)
    // Check flat drag — all extended + flat
    if (pose.handFlatness > 0.7) {
      return { type: GestureType.FlatDrag, confidence: pose.handFlatness }
    }
    // Check open palm — all extended (least specific)
    return { type: GestureType.OpenPalm, confidence: pose.palmOpenness }
  }

  return null
}
