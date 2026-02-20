/**
 * Feature extraction from hand landmarks for gesture classification.
 *
 * Extracts a 14-dimensional feature vector from 21 MediaPipe hand landmarks:
 *   [0..4]   5 finger curl values (thumb, index, middle, ring, pinky)
 *   [5..9]   5 finger extension values (tip-to-wrist distance / palm size)
 *   [10]     thumb-index distance (pinch indicator)
 *   [11]     thumb-middle distance
 *   [12]     palm openness (avg tip distance from palm center)
 *   [13]     hand spread (max distance between any two fingertips)
 *
 * All values are normalized to [0, 1].
 */

import { type Landmark, LANDMARK } from '@shared/protocol'
import { fingerCurl, distance } from './classifier'
import type { FingerName } from './types'

/** Finger names in standard order */
const FINGERS: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky']

/** Fingertip landmark indices in standard order */
const TIP_INDICES = [
  LANDMARK.THUMB_TIP,
  LANDMARK.INDEX_TIP,
  LANDMARK.MIDDLE_TIP,
  LANDMARK.RING_TIP,
  LANDMARK.PINKY_TIP
]

/** Clamp a value to [0, 1] */
function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.max(0, Math.min(1, v))
}

/**
 * Compute the palm size as the distance from wrist to middle MCP.
 * Used as a normalization factor for distance-based features.
 * Returns a small floor value if the distance is near zero.
 */
function palmSize(landmarks: Landmark[]): number {
  const d = distance(landmarks[LANDMARK.WRIST], landmarks[LANDMARK.MIDDLE_MCP])
  return Math.max(d, 0.001)
}

/**
 * Compute the center of the palm as the centroid of wrist and the five MCP joints.
 */
function palmCenter(landmarks: Landmark[]): Landmark {
  const mcpIndices = [
    LANDMARK.WRIST,
    LANDMARK.THUMB_CMC,
    LANDMARK.INDEX_MCP,
    LANDMARK.MIDDLE_MCP,
    LANDMARK.RING_MCP,
    LANDMARK.PINKY_MCP
  ]
  let sx = 0, sy = 0, sz = 0
  for (const idx of mcpIndices) {
    sx += landmarks[idx].x
    sy += landmarks[idx].y
    sz += landmarks[idx].z
  }
  const n = mcpIndices.length
  return { x: sx / n, y: sy / n, z: sz / n }
}

/**
 * Extract a numeric feature vector from 21 landmarks for gesture classification.
 *
 * Returns an array of 14 numbers, all in [0, 1].
 */
export function extractFeatures(landmarks: Landmark[]): number[] {
  const palm = palmSize(landmarks)

  // --- 5 finger curl values [0..4] ---
  const curls = FINGERS.map(f => clamp01(fingerCurl(landmarks, f)))

  // --- 5 finger extension values [5..9] ---
  // Tip-to-wrist distance normalized by palm size, then clamped to [0, 1]
  const wrist = landmarks[LANDMARK.WRIST]
  const extensions = TIP_INDICES.map(tipIdx => {
    const tipDist = distance(landmarks[tipIdx], wrist)
    // Typical extended finger reaches ~2-3x palm size from wrist
    // We normalize by (2 * palmSize) to map most values into [0, 1]
    return clamp01(tipDist / (2 * palm))
  })

  // --- thumb-index distance [10] ---
  const thumbIndexDist = distance(
    landmarks[LANDMARK.THUMB_TIP],
    landmarks[LANDMARK.INDEX_TIP]
  )
  const thumbIndex = clamp01(thumbIndexDist / palm)

  // --- thumb-middle distance [11] ---
  const thumbMiddleDist = distance(
    landmarks[LANDMARK.THUMB_TIP],
    landmarks[LANDMARK.MIDDLE_TIP]
  )
  const thumbMiddle = clamp01(thumbMiddleDist / palm)

  // --- palm openness [12] ---
  // Average distance of all fingertips from palm center, normalized by palm size
  const center = palmCenter(landmarks)
  let tipDistSum = 0
  for (const tipIdx of TIP_INDICES) {
    tipDistSum += distance(landmarks[tipIdx], center)
  }
  const avgTipDist = tipDistSum / TIP_INDICES.length
  const palmOpenness = clamp01(avgTipDist / (2 * palm))

  // --- hand spread [13] ---
  // Max distance between any two fingertips, normalized by palm size
  let maxSpread = 0
  for (let i = 0; i < TIP_INDICES.length; i++) {
    for (let j = i + 1; j < TIP_INDICES.length; j++) {
      const d = distance(landmarks[TIP_INDICES[i]], landmarks[TIP_INDICES[j]])
      if (d > maxSpread) maxSpread = d
    }
  }
  const handSpread = clamp01(maxSpread / (3 * palm))

  return [
    ...curls,       // 0..4
    ...extensions,  // 5..9
    thumbIndex,     // 10
    thumbMiddle,    // 11
    palmOpenness,   // 12
    handSpread      // 13
  ]
}
