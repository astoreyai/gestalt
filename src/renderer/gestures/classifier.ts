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

/** Angle at point b formed by vectors b->a and b->c, in radians */
export function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z }

  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z
  const magBA = Math.sqrt(ba.x * ba.x + ba.y * ba.y + ba.z * ba.z)
  const magBC = Math.sqrt(bc.x * bc.x + bc.y * bc.y + bc.z * bc.z)

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
 * Uses the angle between MCP->PIP->DIP joints.
 * Returns 0 = fully extended, 1 = fully curled.
 *
 * A straight finger has angle ~pi (180 degrees), curled ~0.
 * We normalize: curl = 1 - (angle / pi)
 */
export function fingerCurl(landmarks: Landmark[], finger: FingerName): number {
  const idx = FINGER_INDICES[finger]
  const mcp = landmarks[idx.mcp]
  const pip = landmarks[idx.pip]
  const dip = landmarks[idx.dip]
  const tip = landmarks[idx.tip]

  // Use average of two angles: MCP-PIP-DIP and PIP-DIP-TIP
  const angle1 = angleBetween(mcp, pip, dip)
  const angle2 = angleBetween(pip, dip, tip)
  const avgAngle = (angle1 + angle2) / 2

  // Normalize: straight = pi radians = 0 curl, bent = 0 radians = 1 curl
  return Math.max(0, Math.min(1, 1 - avgAngle / Math.PI))
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
  const dist = distance(thumbTip, indexTip)

  return {
    detected: dist < config.pinchThreshold,
    distance: dist
  }
}

/**
 * Detect point gesture: only index finger extended, rest curled.
 */
export function detectPoint(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): boolean {
  const lm = hand.landmarks
  const indexExt = fingerExtended(lm, 'index', config)
  const thumbCurled = fingerCurl(lm, 'thumb') > config.curlThreshold
  const middleCurled = fingerCurl(lm, 'middle') > config.curlThreshold
  const ringCurled = fingerCurl(lm, 'ring') > config.curlThreshold
  const pinkyCurled = fingerCurl(lm, 'pinky') > config.curlThreshold

  return indexExt && thumbCurled && middleCurled && ringCurled && pinkyCurled
}

/**
 * Detect open palm: all fingers extended.
 */
export function detectOpenPalm(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): boolean {
  const lm = hand.landmarks
  return FINGER_NAMES.every((name) => fingerExtended(lm, name, config))
}

/**
 * Detect fist: all fingers curled.
 */
export function detectFist(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): boolean {
  const lm = hand.landmarks
  return FINGER_NAMES.every((name) => fingerCurl(lm, name) > config.curlThreshold)
}

/**
 * Detect L-shape: thumb + index extended, rest curled.
 */
export function detectLShape(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): boolean {
  const lm = hand.landmarks
  const thumbExt = fingerExtended(lm, 'thumb', config)
  const indexExt = fingerExtended(lm, 'index', config)
  const middleCurled = fingerCurl(lm, 'middle') > config.curlThreshold
  const ringCurled = fingerCurl(lm, 'ring') > config.curlThreshold
  const pinkyCurled = fingerCurl(lm, 'pinky') > config.curlThreshold

  return thumbExt && indexExt && middleCurled && ringCurled && pinkyCurled
}

/**
 * Detect flat drag: all fingers extended and hand is flat.
 */
export function detectFlatDrag(
  hand: Hand,
  config: GestureConfig = DEFAULT_GESTURE_CONFIG
): boolean {
  const lm = hand.landmarks
  const allExtended = FINGER_NAMES.every((name) => fingerExtended(lm, name, config))
  const pose = analyzeHandPose(lm, config)

  return allExtended && pose.handFlatness > 0.7
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

  // Check pinch first — very specific
  const pinch = detectPinch(hand, config)
  if (pinch.detected) {
    // Confidence inversely proportional to distance (closer = more confident)
    const pinchThreshold = Math.max(0.001, config.pinchThreshold)
    const confidence = Math.max(0, Math.min(1, 1 - pinch.distance / pinchThreshold))
    return { type: GestureType.Pinch, confidence }
  }

  // Check point — only index extended
  if (detectPoint(hand, config)) {
    const curl = fingerCurl(hand.landmarks, 'index')
    return { type: GestureType.Point, confidence: Math.max(0.5, 1 - curl) }
  }

  // Check L-shape — thumb + index
  if (detectLShape(hand, config)) {
    return { type: GestureType.LShape, confidence: 0.85 }
  }

  // Check fist — all curled
  if (detectFist(hand, config)) {
    const avgCurl =
      FINGER_NAMES.reduce((sum, name) => sum + fingerCurl(hand.landmarks, name), 0) / 5
    return { type: GestureType.Fist, confidence: Math.min(1, avgCurl) }
  }

  // Check flat drag — all extended + flat
  if (detectFlatDrag(hand, config)) {
    const pose = analyzeHandPose(hand.landmarks, config)
    return { type: GestureType.FlatDrag, confidence: pose.handFlatness }
  }

  // Check open palm — all extended (least specific)
  if (detectOpenPalm(hand, config)) {
    const pose = analyzeHandPose(hand.landmarks, config)
    return { type: GestureType.OpenPalm, confidence: pose.palmOpenness }
  }

  return null
}
