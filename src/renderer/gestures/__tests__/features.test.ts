/**
 * Tests for feature extraction from hand landmarks.
 *
 * Uses synthetic landmark data to verify:
 *   - extractFeatures returns 14-element arrays
 *   - All values are in [0, 1]
 *   - Open palm produces high extension values
 *   - Fist produces high curl values
 *   - Feature vectors for different gestures are distinguishable
 */

import { describe, it, expect } from 'vitest'
import { type Landmark, LANDMARK } from '@shared/protocol'
import { extractFeatures } from '../features'

// ─── Synthetic Landmark Generators ─────────────────────────────────

/** Create a single landmark */
function lm(x: number, y: number, z: number = 0): Landmark {
  return { x, y, z }
}

/** Open palm: all fingers fully extended away from wrist */
function makeOpenPalmLandmarks(): Landmark[] {
  const landmarks: Landmark[] = []
  // Wrist
  landmarks.push(lm(0.5, 0.7, 0))
  // Thumb (CMC, MCP, IP, TIP) — extended
  landmarks.push(lm(0.42, 0.65, -0.01))
  landmarks.push(lm(0.38, 0.58, -0.02))
  landmarks.push(lm(0.35, 0.52, -0.02))
  landmarks.push(lm(0.33, 0.46, -0.02))
  // Index — extended
  landmarks.push(lm(0.44, 0.55, 0))
  landmarks.push(lm(0.43, 0.45, 0))
  landmarks.push(lm(0.43, 0.38, 0))
  landmarks.push(lm(0.43, 0.32, 0))
  // Middle — extended
  landmarks.push(lm(0.50, 0.53, 0))
  landmarks.push(lm(0.50, 0.42, 0))
  landmarks.push(lm(0.50, 0.35, 0))
  landmarks.push(lm(0.50, 0.28, 0))
  // Ring — extended
  landmarks.push(lm(0.56, 0.55, 0))
  landmarks.push(lm(0.56, 0.45, 0))
  landmarks.push(lm(0.56, 0.38, 0))
  landmarks.push(lm(0.56, 0.32, 0))
  // Pinky — extended
  landmarks.push(lm(0.62, 0.58, 0))
  landmarks.push(lm(0.62, 0.48, 0))
  landmarks.push(lm(0.62, 0.42, 0))
  landmarks.push(lm(0.62, 0.38, 0))
  return landmarks
}

/** Fist: all fingers curled back toward wrist */
function makeFistLandmarks(): Landmark[] {
  const lmk = makeOpenPalmLandmarks()
  // Curl all fingers by moving DIP and TIP back toward palm
  for (const [, indices] of [
    ['thumb', [LANDMARK.THUMB_IP, LANDMARK.THUMB_TIP]],
    ['index', [LANDMARK.INDEX_DIP, LANDMARK.INDEX_TIP]],
    ['middle', [LANDMARK.MIDDLE_DIP, LANDMARK.MIDDLE_TIP]],
    ['ring', [LANDMARK.RING_DIP, LANDMARK.RING_TIP]],
    ['pinky', [LANDMARK.PINKY_DIP, LANDMARK.PINKY_TIP]]
  ] as const) {
    const [dip, tip] = indices as unknown as number[]
    lmk[dip] = lm(lmk[dip].x, lmk[dip].y + 0.12, 0.08)
    lmk[tip] = lm(lmk[tip].x, lmk[tip].y + 0.20, 0.10)
  }
  return lmk
}

/** Pinch: thumb tip touching index tip */
function makePinchLandmarks(): Landmark[] {
  const lmk = makeOpenPalmLandmarks()
  lmk[LANDMARK.THUMB_TIP] = lm(0.44, 0.33, 0)
  lmk[LANDMARK.INDEX_TIP] = lm(0.44, 0.33, 0.01)
  return lmk
}

/** Point: only index extended, rest curled */
function makePointLandmarks(): Landmark[] {
  const lmk = makeOpenPalmLandmarks()
  // Index stays extended

  // Curl middle
  lmk[LANDMARK.MIDDLE_DIP] = lm(0.50, 0.47, 0.01)
  lmk[LANDMARK.MIDDLE_TIP] = lm(0.50, 0.43, 0.02)

  // Curl ring
  lmk[LANDMARK.RING_DIP] = lm(0.56, 0.50, 0.01)
  lmk[LANDMARK.RING_TIP] = lm(0.56, 0.46, 0.02)

  // Curl pinky
  lmk[LANDMARK.PINKY_DIP] = lm(0.62, 0.53, 0.01)
  lmk[LANDMARK.PINKY_TIP] = lm(0.62, 0.49, 0.02)

  // Curl thumb
  lmk[LANDMARK.THUMB_IP] = lm(0.41, 0.62, 0.00)
  lmk[LANDMARK.THUMB_TIP] = lm(0.39, 0.58, 0.01)

  return lmk
}

/** Cosine distance between two vectors (1 - cosine similarity) */
function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  magA = Math.sqrt(magA)
  magB = Math.sqrt(magB)
  if (magA === 0 || magB === 0) return 1
  return 1 - dot / (magA * magB)
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('extractFeatures', () => {
  it('should return an array of exactly 14 numbers', () => {
    const features = extractFeatures(makeOpenPalmLandmarks())
    expect(features).toHaveLength(14)
    for (const v of features) {
      expect(typeof v).toBe('number')
    }
  })

  it('should return values all in [0, 1] for open palm', () => {
    const features = extractFeatures(makeOpenPalmLandmarks())
    for (let i = 0; i < features.length; i++) {
      expect(features[i]).toBeGreaterThanOrEqual(0)
      expect(features[i]).toBeLessThanOrEqual(1)
    }
  })

  it('should return values all in [0, 1] for fist', () => {
    const features = extractFeatures(makeFistLandmarks())
    for (let i = 0; i < features.length; i++) {
      expect(features[i]).toBeGreaterThanOrEqual(0)
      expect(features[i]).toBeLessThanOrEqual(1)
    }
  })

  it('should return values all in [0, 1] for pinch', () => {
    const features = extractFeatures(makePinchLandmarks())
    for (let i = 0; i < features.length; i++) {
      expect(features[i]).toBeGreaterThanOrEqual(0)
      expect(features[i]).toBeLessThanOrEqual(1)
    }
  })

  it('should return values all in [0, 1] for point', () => {
    const features = extractFeatures(makePointLandmarks())
    for (let i = 0; i < features.length; i++) {
      expect(features[i]).toBeGreaterThanOrEqual(0)
      expect(features[i]).toBeLessThanOrEqual(1)
    }
  })

  it('should produce low curl values for open palm (indices 0-4)', () => {
    const features = extractFeatures(makeOpenPalmLandmarks())
    // Curl values are indices 0-4
    for (let i = 0; i < 5; i++) {
      expect(features[i]).toBeLessThan(0.4)
    }
  })

  it('should produce higher average curl values for fist than open palm (indices 0-4)', () => {
    const fistFeatures = extractFeatures(makeFistLandmarks())
    const palmFeatures = extractFeatures(makeOpenPalmLandmarks())
    // Average curl across 5 fingers should be higher for fist than palm
    const fistAvgCurl = fistFeatures.slice(0, 5).reduce((a, b) => a + b, 0) / 5
    const palmAvgCurl = palmFeatures.slice(0, 5).reduce((a, b) => a + b, 0) / 5
    expect(fistAvgCurl).toBeGreaterThan(palmAvgCurl)
  })

  it('should produce high extension values for open palm (indices 5-9)', () => {
    const features = extractFeatures(makeOpenPalmLandmarks())
    // Extension values are indices 5-9 — should be high for open palm
    for (let i = 5; i < 10; i++) {
      expect(features[i]).toBeGreaterThan(0.2)
    }
  })

  it('should produce lower extension values for fist than open palm (indices 5-9)', () => {
    const fistFeatures = extractFeatures(makeFistLandmarks())
    const palmFeatures = extractFeatures(makeOpenPalmLandmarks())
    // Average extension should be lower for fist
    const fistAvgExt = fistFeatures.slice(5, 10).reduce((a, b) => a + b, 0) / 5
    const palmAvgExt = palmFeatures.slice(5, 10).reduce((a, b) => a + b, 0) / 5
    expect(fistAvgExt).toBeLessThan(palmAvgExt)
  })

  it('should produce small thumb-index distance for pinch (index 10)', () => {
    const pinchFeatures = extractFeatures(makePinchLandmarks())
    const palmFeatures = extractFeatures(makeOpenPalmLandmarks())
    // Pinch should have a smaller thumb-index distance than open palm
    expect(pinchFeatures[10]).toBeLessThan(palmFeatures[10])
  })

  it('should produce higher palm openness for open palm than fist (index 12)', () => {
    const palmFeatures = extractFeatures(makeOpenPalmLandmarks())
    const fistFeatures = extractFeatures(makeFistLandmarks())
    expect(palmFeatures[12]).toBeGreaterThan(fistFeatures[12])
  })

  it('should produce higher hand spread for open palm than fist (index 13)', () => {
    const palmFeatures = extractFeatures(makeOpenPalmLandmarks())
    const fistFeatures = extractFeatures(makeFistLandmarks())
    expect(palmFeatures[13]).toBeGreaterThan(fistFeatures[13])
  })

  describe('gesture distinguishability', () => {
    it('should produce distinguishable vectors for open palm vs fist', () => {
      const palmVec = extractFeatures(makeOpenPalmLandmarks())
      const fistVec = extractFeatures(makeFistLandmarks())
      const dist = cosineDistance(palmVec, fistVec)
      expect(dist).toBeGreaterThan(0.05)
    })

    it('should produce distinguishable vectors for pinch vs open palm', () => {
      const pinchVec = extractFeatures(makePinchLandmarks())
      const palmVec = extractFeatures(makeOpenPalmLandmarks())
      const dist = cosineDistance(pinchVec, palmVec)
      expect(dist).toBeGreaterThan(0.01)
    })

    it('should produce distinguishable vectors for point vs fist', () => {
      const pointVec = extractFeatures(makePointLandmarks())
      const fistVec = extractFeatures(makeFistLandmarks())
      const dist = cosineDistance(pointVec, fistVec)
      expect(dist).toBeGreaterThan(0.01)
    })

    it('should produce distinguishable vectors for point vs open palm', () => {
      const pointVec = extractFeatures(makePointLandmarks())
      const palmVec = extractFeatures(makeOpenPalmLandmarks())
      const dist = cosineDistance(pointVec, palmVec)
      expect(dist).toBeGreaterThan(0.01)
    })

    it('all four gesture feature vectors should be mutually distinguishable', () => {
      const vectors = [
        extractFeatures(makePinchLandmarks()),
        extractFeatures(makePointLandmarks()),
        extractFeatures(makeOpenPalmLandmarks()),
        extractFeatures(makeFistLandmarks())
      ]
      // Check all pairs
      for (let i = 0; i < vectors.length; i++) {
        for (let j = i + 1; j < vectors.length; j++) {
          const dist = cosineDistance(vectors[i], vectors[j])
          expect(dist).toBeGreaterThan(0.005)
        }
      }
    })
  })

  it('should handle degenerate landmarks without NaN', () => {
    // All landmarks at origin
    const zeros: Landmark[] = Array.from({ length: 21 }, () => lm(0, 0, 0))
    const features = extractFeatures(zeros)
    expect(features).toHaveLength(14)
    for (const v of features) {
      expect(Number.isNaN(v)).toBe(false)
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
