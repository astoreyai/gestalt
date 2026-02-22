/**
 * Tracking quality scorer.
 * Measures bone-length consistency to estimate tracking confidence.
 * A well-tracked hand has consistent bone proportions relative to palm size.
 */

import type { Landmark } from '@shared/protocol'
import { LANDMARK } from '@shared/protocol'

/** Bone segment definition: [startIdx, endIdx] */
const BONE_SEGMENTS: [number, number][] = [
  // Index finger chain
  [LANDMARK.INDEX_MCP, LANDMARK.INDEX_PIP],
  [LANDMARK.INDEX_PIP, LANDMARK.INDEX_DIP],
  [LANDMARK.INDEX_DIP, LANDMARK.INDEX_TIP],
  // Middle finger chain
  [LANDMARK.MIDDLE_MCP, LANDMARK.MIDDLE_PIP],
  [LANDMARK.MIDDLE_PIP, LANDMARK.MIDDLE_DIP],
  [LANDMARK.MIDDLE_DIP, LANDMARK.MIDDLE_TIP],
  // Ring finger
  [LANDMARK.RING_MCP, LANDMARK.RING_PIP],
  [LANDMARK.RING_PIP, LANDMARK.RING_DIP],
  [LANDMARK.RING_DIP, LANDMARK.RING_TIP],
  // Pinky
  [LANDMARK.PINKY_MCP, LANDMARK.PINKY_PIP],
  [LANDMARK.PINKY_PIP, LANDMARK.PINKY_DIP],
  [LANDMARK.PINKY_DIP, LANDMARK.PINKY_TIP],
  // Thumb
  [LANDMARK.THUMB_MCP, LANDMARK.THUMB_IP],
  [LANDMARK.THUMB_IP, LANDMARK.THUMB_TIP],
]

/**
 * Expected bone-length ratios relative to palm size (wrist-to-middle-MCP).
 * Based on anthropometric phalangeal proportions (Buchholz et al. 1992, Garrett 1971).
 * Values are averages across adult male/female hands normalized to palm length.
 */
const EXPECTED_RATIOS: number[] = [
  0.47, 0.26, 0.19,  // Index: MCP-PIP, PIP-DIP, DIP-TIP
  0.52, 0.30, 0.20,  // Middle: MCP-PIP, PIP-DIP, DIP-TIP
  0.45, 0.27, 0.19,  // Ring: MCP-PIP, PIP-DIP, DIP-TIP
  0.35, 0.20, 0.16,  // Pinky: MCP-PIP, PIP-DIP, DIP-TIP
  0.32, 0.24,         // Thumb: MCP-IP, IP-TIP
]

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

/**
 * Compute instantaneous tracking quality from a set of 21 landmarks.
 * Returns a score in [0, 100] where 100 = perfect bone proportions.
 */
export function computeTrackingQuality(landmarks: Landmark[]): number {
  if (landmarks.length < 21) return 0

  // Palm size = wrist to middle MCP
  const palmSize = dist(landmarks[LANDMARK.WRIST], landmarks[LANDMARK.MIDDLE_MCP])
  if (palmSize < 0.000001) return 0

  let totalDeviation = 0
  for (let i = 0; i < BONE_SEGMENTS.length; i++) {
    const [a, b] = BONE_SEGMENTS[i]
    const actual = dist(landmarks[a], landmarks[b])
    const ratio = actual / palmSize
    const expected = EXPECTED_RATIOS[i]
    totalDeviation += Math.abs(ratio - expected)
  }

  const meanDeviation = totalDeviation / BONE_SEGMENTS.length
  // Score: 100 * (1 - deviation), clamped. Multiplier 1.5 (not 2) to avoid
  // over-penalizing natural jitter — mean deviation of 0.3 still yields ~55%.
  const score = 100 * Math.max(0, Math.min(1, 1 - meanDeviation * 1.5))
  return Math.round(score * 10) / 10
}

/**
 * Tracking quality tracker with ring buffer averaging.
 */
export class TrackingQualityTracker {
  private readonly buffer: number[]
  private readonly windowSize: number
  private writeIndex = 0
  private count = 0
  private _quality = 0

  constructor(windowSize: number = 10) {
    this.windowSize = Math.max(1, windowSize)
    this.buffer = new Array(this.windowSize).fill(0)
  }

  update(landmarks: Landmark[]): number {
    const q = computeTrackingQuality(landmarks)
    this.buffer[this.writeIndex] = q
    this.writeIndex = (this.writeIndex + 1) % this.windowSize
    this.count = Math.min(this.count + 1, this.windowSize)

    // Compute average
    let sum = 0
    for (let i = 0; i < this.count; i++) {
      sum += this.buffer[i]
    }
    this._quality = sum / this.count
    return this._quality
  }

  get quality(): number {
    return this._quality
  }

  reset(): void {
    this.buffer.fill(0)
    this.writeIndex = 0
    this.count = 0
    this._quality = 0
  }
}
