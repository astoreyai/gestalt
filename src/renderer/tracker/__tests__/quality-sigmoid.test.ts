import { describe, it, expect } from 'vitest'
import { qualityToConfidence } from '../quality'

/**
 * Tests for sigmoid quality-to-confidence mapping.
 * Maps tracking quality [0, 100] to confidence [0, 1] via sigmoid
 * for better calibration than linear mapping.
 */

describe('qualityToConfidence — sigmoid mapping', () => {
  it('quality=0 maps to approximately 0 (< 0.01)', () => {
    const c = qualityToConfidence(0)
    expect(c).toBeLessThan(0.01)
    expect(c).toBeGreaterThanOrEqual(0)
  })

  it('quality=50 maps to exactly 0.5', () => {
    const c = qualityToConfidence(50)
    expect(c).toBeCloseTo(0.5, 10)
  })

  it('quality=100 maps to approximately 1 (> 0.99)', () => {
    const c = qualityToConfidence(100)
    expect(c).toBeGreaterThan(0.99)
    expect(c).toBeLessThanOrEqual(1)
  })

  it('is monotonically increasing', () => {
    let prev = -1
    for (let q = 0; q <= 100; q += 1) {
      const c = qualityToConfidence(q)
      expect(c).toBeGreaterThanOrEqual(prev)
      prev = c
    }
  })

  it('quality=25 maps to less than 0.5', () => {
    const c = qualityToConfidence(25)
    expect(c).toBeLessThan(0.5)
  })

  it('quality=75 maps to greater than 0.5', () => {
    const c = qualityToConfidence(75)
    expect(c).toBeGreaterThan(0.5)
  })
})
