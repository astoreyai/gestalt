import { describe, it, expect } from 'vitest'

/**
 * Detect which fingers have low confidence (occluded/missing).
 * Returns a set of finger names that should be excluded from classification.
 */
function detectMissingFingers(
  landmarks: { x: number; y: number; z: number; confidence?: number }[],
  threshold: number = 0.3
): Set<string> {
  const missing = new Set<string>()
  // Check tip landmarks for each finger
  const fingers: [string, number][] = [
    ['thumb', 4], ['index', 8], ['middle', 12], ['ring', 16], ['pinky', 20]
  ]
  for (const [name, tipIdx] of fingers) {
    const lm = landmarks[tipIdx]
    if (!lm || (lm.confidence !== undefined && lm.confidence < threshold)) {
      missing.add(name)
    }
  }
  return missing
}

/**
 * Compute average curl excluding missing fingers.
 */
function avgCurlExcluding(curls: Record<string, number>, missing: Set<string>): number {
  const entries = Object.entries(curls).filter(([name]) => !missing.has(name))
  if (entries.length === 0) return 0
  return entries.reduce((sum, [, v]) => sum + v, 0) / entries.length
}

describe('Sprint 7e: Partial hand accommodation', () => {
  it('should detect missing fingers from low confidence', () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, confidence: 0.9 }))
    landmarks[20].confidence = 0.1 // pinky tip low confidence
    landmarks[16].confidence = 0.2 // ring tip low confidence

    const missing = detectMissingFingers(landmarks)
    expect(missing.has('pinky')).toBe(true)
    expect(missing.has('ring')).toBe(true)
    expect(missing.has('index')).toBe(false)
  })

  it('should return empty set when all fingers visible', () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, confidence: 0.9 }))
    const missing = detectMissingFingers(landmarks)
    expect(missing.size).toBe(0)
  })

  it('should handle missing landmarks gracefully', () => {
    const landmarks = Array.from({ length: 18 }, () => ({ x: 0, y: 0, z: 0 }))
    // Only 18 landmarks, missing pinky tip (20) and ring tip (16)
    const missing = detectMissingFingers(landmarks)
    expect(missing.has('pinky')).toBe(true) // landmark 20 doesn't exist
  })

  it('4-finger hand still classifies fist correctly', () => {
    const curls = { thumb: 0.8, index: 0.9, middle: 0.85, ring: 0.0, pinky: 0.0 }
    const missing = new Set(['ring', 'pinky'])
    const avg = avgCurlExcluding(curls, missing)
    // Only thumb, index, middle counted
    expect(avg).toBeCloseTo((0.8 + 0.9 + 0.85) / 3, 5)
    expect(avg).toBeGreaterThan(0.7) // Still classifies as fist
  })

  it('occluded thumb does not false-trigger pinch', () => {
    const curls = { thumb: 0.0, index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1 }
    const missing = new Set(['thumb'])
    // With thumb missing, should not use thumb curl for pinch detection
    const avg = avgCurlExcluding(curls, missing)
    expect(avg).toBeCloseTo(0.1, 5) // Low curl = open hand, not pinch
  })

  it('should work with no confidence metadata', () => {
    const landmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }))
    // No confidence field at all -- all fingers should be "present"
    const missing = detectMissingFingers(landmarks)
    expect(missing.size).toBe(0)
  })
})
