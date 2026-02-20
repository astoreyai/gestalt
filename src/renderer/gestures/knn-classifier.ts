/**
 * Lightweight KNN (K-Nearest Neighbors) gesture classifier.
 * Can be trained on per-user gesture samples from calibration profiles
 * to augment or replace the rule-based classifier.
 *
 * Pure TypeScript — no Electron/browser dependencies.
 */

import { GestureType } from '@shared/protocol'
import type { GestureSample, Landmark } from '@shared/protocol'

// ─── Types ──────────────────────────────────────────────────────────

export interface KnnResult {
  type: GestureType
  confidence: number // 0-1, based on vote proportion
  distance: number // Average distance to k nearest neighbors
}

export interface KnnClassifierOptions {
  k?: number // Number of neighbors (default: 5)
  maxDistance?: number // Maximum distance threshold (default: 2.0)
}

// ─── Feature Extraction ─────────────────────────────────────────────

/** 3D Euclidean distance between two landmarks */
function dist(a: Landmark, b: Landmark): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2)
}

// Key landmark indices
const WRIST = 0
const THUMB_TIP = 4
const INDEX_MCP = 5
const INDEX_TIP = 8
const MIDDLE_MCP = 9
const MIDDLE_TIP = 12
const RING_TIP = 16
const PINKY_TIP = 20

/**
 * Simple feature extraction for KNN -- distances between key landmarks.
 * Produces a 9-element feature vector normalized by palm size.
 */
export function extractSimpleFeatures(landmarks: Landmark[]): number[] {
  const palmSize = dist(landmarks[WRIST], landmarks[MIDDLE_MCP]) || 0.001

  // Normalized tip-to-wrist distances (5 features)
  const thumbDist = dist(landmarks[THUMB_TIP], landmarks[WRIST]) / palmSize
  const indexDist = dist(landmarks[INDEX_TIP], landmarks[WRIST]) / palmSize
  const middleDist = dist(landmarks[MIDDLE_TIP], landmarks[WRIST]) / palmSize
  const ringDist = dist(landmarks[RING_TIP], landmarks[WRIST]) / palmSize
  const pinkyDist = dist(landmarks[PINKY_TIP], landmarks[WRIST]) / palmSize

  // Inter-tip distances (3 features)
  const thumbIndex = dist(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / palmSize
  const indexMiddle = dist(landmarks[INDEX_TIP], landmarks[MIDDLE_TIP]) / palmSize
  const thumbPinky = dist(landmarks[THUMB_TIP], landmarks[PINKY_TIP]) / palmSize

  // Palm openness (1 feature)
  const palmCenter: Landmark = {
    x: (landmarks[INDEX_MCP].x + landmarks[MIDDLE_MCP].x) / 2,
    y: (landmarks[INDEX_MCP].y + landmarks[MIDDLE_MCP].y) / 2,
    z: (landmarks[INDEX_MCP].z + landmarks[MIDDLE_MCP].z) / 2
  }
  const avgTipDist =
    (dist(landmarks[THUMB_TIP], palmCenter) +
      dist(landmarks[INDEX_TIP], palmCenter) +
      dist(landmarks[MIDDLE_TIP], palmCenter) +
      dist(landmarks[RING_TIP], palmCenter) +
      dist(landmarks[PINKY_TIP], palmCenter)) /
    (5 * palmSize)

  return [thumbDist, indexDist, middleDist, ringDist, pinkyDist, thumbIndex, indexMiddle, thumbPinky, avgTipDist]
}

// ─── KNN Classifier ─────────────────────────────────────────────────

/** Euclidean distance between two feature vectors */
function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0
  const len = Math.min(a.length, b.length)
  for (let i = 0; i < len; i++) {
    sum += (a[i] - b[i]) ** 2
  }
  return Math.sqrt(sum)
}

export class KnnClassifier {
  private samples: GestureSample[] = []
  private k: number
  private maxDistance: number

  constructor(options?: KnnClassifierOptions) {
    this.k = options?.k ?? 5
    this.maxDistance = options?.maxDistance ?? 2.0
  }

  /** Train with samples from a calibration profile */
  train(samples: GestureSample[]): void {
    this.samples.push(...samples)
  }

  /** Clear all training data */
  clear(): void {
    this.samples = []
  }

  /** Check if classifier has enough data to classify */
  isTrained(): boolean {
    return this.samples.length >= this.k
  }

  /** Get the number of training samples */
  sampleCount(): number {
    return this.samples.length
  }

  /** Get sample counts per gesture type */
  sampleCountsByType(): Map<GestureType, number> {
    const counts = new Map<GestureType, number>()
    for (const sample of this.samples) {
      counts.set(sample.gestureType, (counts.get(sample.gestureType) ?? 0) + 1)
    }
    return counts
  }

  /** Classify a feature vector using KNN */
  classify(features: number[]): KnnResult | null {
    if (!this.isTrained()) {
      return null
    }

    // Calculate distances to all training samples
    const distances: Array<{ type: GestureType; distance: number }> = this.samples.map((sample) => ({
      type: sample.gestureType,
      distance: euclideanDistance(features, sample.features)
    }))

    // Sort by distance (ascending)
    distances.sort((a, b) => a.distance - b.distance)

    // Take k nearest neighbors
    const neighbors = distances.slice(0, this.k)

    // Check if average distance exceeds threshold
    const avgDistance = neighbors.reduce((sum, n) => sum + n.distance, 0) / neighbors.length
    if (avgDistance > this.maxDistance) {
      return null
    }

    // Count votes per gesture type
    const votes = new Map<GestureType, { count: number; totalDistance: number }>()
    for (const neighbor of neighbors) {
      const existing = votes.get(neighbor.type)
      if (existing) {
        existing.count++
        existing.totalDistance += neighbor.distance
      } else {
        votes.set(neighbor.type, { count: 1, totalDistance: neighbor.distance })
      }
    }

    // Find the winner: most votes, then closest average distance for tie-breaking
    let bestType: GestureType | null = null
    let bestCount = 0
    let bestAvgDist = Infinity

    for (const [type, { count, totalDistance }] of votes) {
      const typeAvgDist = totalDistance / count
      if (count > bestCount || (count === bestCount && typeAvgDist < bestAvgDist)) {
        bestType = type
        bestCount = count
        bestAvgDist = typeAvgDist
      }
    }

    if (bestType === null) {
      return null
    }

    return {
      type: bestType,
      confidence: bestCount / this.k,
      distance: avgDistance
    }
  }

  /** Classify landmarks by extracting features first */
  classifyLandmarks(landmarks: Landmark[]): KnnResult | null {
    const features = extractSimpleFeatures(landmarks)
    return this.classify(features)
  }
}
