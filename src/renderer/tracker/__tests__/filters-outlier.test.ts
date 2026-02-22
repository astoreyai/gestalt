import { describe, it, expect, beforeEach } from 'vitest'
import { LandmarkSmoother } from '../filters'
import type { Landmark } from '@shared/protocol'

/**
 * Tests for X/Y outlier rejection via MedianFilter3 pre-filtering.
 * Previously only the Z-axis had median pre-filtering; X and Y were raw.
 */

/** Create a uniform set of 21 landmarks at a given position */
function makeLandmarks(x: number, y: number, z: number): Landmark[] {
  return Array.from({ length: 21 }, () => ({ x, y, z }))
}

describe('LandmarkSmoother — X/Y outlier rejection', () => {
  let smoother: LandmarkSmoother

  beforeEach(() => {
    // Use uniform config (perJoint=false) to isolate median filter behavior
    smoother = new LandmarkSmoother({ minCutoff: 10, beta: 0 }, 21, false)
  })

  it('rejects X-axis spike via median filter', () => {
    // Feed 3 clean frames then a spike on the 4th, then clean again
    const clean = makeLandmarks(0.5, 0.5, 0.5)
    smoother.smooth(clean, 0.000)
    smoother.smooth(clean, 0.016)
    smoother.smooth(clean, 0.033)

    // Spike frame: x jumps to 0.9
    const spike = makeLandmarks(0.9, 0.5, 0.5)
    const afterSpike = smoother.smooth(spike, 0.050)

    // After spike, the median of [0.5, 0.5, 0.9] = 0.5, so output should stay near 0.5
    expect(afterSpike[0].x).toBeLessThan(0.6)

    // Next clean frame: median of [0.5, 0.9, 0.5] = 0.5
    const recovered = smoother.smooth(clean, 0.066)
    expect(recovered[0].x).toBeLessThan(0.55)
  })

  it('rejects Y-axis spike via median filter', () => {
    const clean = makeLandmarks(0.5, 0.5, 0.5)
    smoother.smooth(clean, 0.000)
    smoother.smooth(clean, 0.016)
    smoother.smooth(clean, 0.033)

    // Spike frame: y jumps to 0.9
    const spike = makeLandmarks(0.5, 0.9, 0.5)
    const afterSpike = smoother.smooth(spike, 0.050)

    expect(afterSpike[0].y).toBeLessThan(0.6)

    const recovered = smoother.smooth(clean, 0.066)
    expect(recovered[0].y).toBeLessThan(0.55)
  })

  it('rejects Z-axis spike (existing behavior preserved)', () => {
    const clean = makeLandmarks(0.5, 0.5, 0.5)
    smoother.smooth(clean, 0.000)
    smoother.smooth(clean, 0.016)
    smoother.smooth(clean, 0.033)

    const spike = makeLandmarks(0.5, 0.5, 0.9)
    const afterSpike = smoother.smooth(spike, 0.050)

    expect(afterSpike[0].z).toBeLessThan(0.6)
  })

  it('passes clean signal through with minimal distortion', () => {
    // Slowly increasing signal — median should not distort a smooth ramp significantly
    const results: number[] = []
    for (let i = 0; i < 10; i++) {
      const val = 0.3 + i * 0.01
      const lm = makeLandmarks(val, val, val)
      const out = smoother.smooth(lm, i * 0.016)
      results.push(out[0].x)
    }
    // After warmup, output should be within 0.02 of input
    for (let i = 4; i < 10; i++) {
      const expected = 0.3 + i * 0.01
      expect(Math.abs(results[i] - expected)).toBeLessThan(0.02)
    }
  })

  it('handles multiple consecutive spikes (fills median window)', () => {
    const clean = makeLandmarks(0.5, 0.5, 0.5)
    smoother.smooth(clean, 0.000)
    smoother.smooth(clean, 0.016)
    smoother.smooth(clean, 0.033)

    // Two consecutive spikes — median of [0.5, 0.9, 0.9] = 0.9
    // With two spikes the median can't reject — this is expected behavior
    const spike = makeLandmarks(0.9, 0.5, 0.5)
    smoother.smooth(spike, 0.050)
    const afterSecondSpike = smoother.smooth(spike, 0.066)

    // With 2 spikes in median window, median is 0.9 — output will move toward spike
    expect(afterSecondSpike[0].x).toBeGreaterThan(0.5)
  })

  it('reset clears all median filters (x, y, and z)', () => {
    const clean = makeLandmarks(0.5, 0.5, 0.5)
    smoother.smooth(clean, 0.000)
    smoother.smooth(clean, 0.016)
    smoother.smooth(clean, 0.033)

    smoother.reset()

    // After reset, first 2 frames pass through raw (median needs 3 samples)
    const newVal = makeLandmarks(0.8, 0.8, 0.8)
    const out = smoother.smooth(newVal, 0.100)
    // First frame after reset: raw pass-through from median, then One-Euro first sample = raw
    expect(out[0].x).toBeCloseTo(0.8, 1)
    expect(out[0].y).toBeCloseTo(0.8, 1)
    expect(out[0].z).toBeCloseTo(0.8, 1)
  })

  it('first 2 frames pass through raw (median needs 3 samples)', () => {
    const lm1 = makeLandmarks(0.3, 0.4, 0.5)
    const out1 = smoother.smooth(lm1, 0.000)
    // First frame: median passes raw, One-Euro passes raw on first sample
    expect(out1[0].x).toBeCloseTo(0.3, 2)
    expect(out1[0].y).toBeCloseTo(0.4, 2)

    const lm2 = makeLandmarks(0.6, 0.7, 0.8)
    const out2 = smoother.smooth(lm2, 0.016)
    // Second frame: median still passes raw (only 2 samples)
    // One-Euro will smooth somewhat, but should trend toward 0.6
    expect(out2[0].x).toBeGreaterThan(0.25)
    expect(out2[0].x).toBeLessThanOrEqual(0.6)
  })

  it('rejects combined x+y+z spikes all at once', () => {
    const clean = makeLandmarks(0.5, 0.5, 0.5)
    smoother.smooth(clean, 0.000)
    smoother.smooth(clean, 0.016)
    smoother.smooth(clean, 0.033)

    // All axes spike simultaneously
    const spike = makeLandmarks(0.9, 0.9, 0.9)
    const afterSpike = smoother.smooth(spike, 0.050)

    // All axes should be rejected (median of [0.5, 0.5, 0.9] = 0.5)
    expect(afterSpike[0].x).toBeLessThan(0.6)
    expect(afterSpike[0].y).toBeLessThan(0.6)
    expect(afterSpike[0].z).toBeLessThan(0.6)
  })
})
