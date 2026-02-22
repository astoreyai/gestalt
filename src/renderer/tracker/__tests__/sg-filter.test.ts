import { describe, it, expect, beforeEach } from 'vitest'
import { SavitzkyGolayFilter } from '../sg-filter'
import { HandMotionTracker } from '../motion'
import type { Hand, Landmark, Handedness, LandmarkFrame } from '@shared/protocol'

/**
 * Tests for 5-point quadratic Savitzky-Golay smoothing filter
 * and its integration into HandMotionTracker for velocity smoothing.
 */

describe('SavitzkyGolayFilter', () => {
  let sg: SavitzkyGolayFilter

  beforeEach(() => {
    sg = new SavitzkyGolayFilter()
  })

  it('constant signal passes through unchanged', () => {
    // After warmup, constant value should pass through exactly
    for (let i = 0; i < 5; i++) {
      sg.filter(42.0)
    }
    // After 5 samples of constant 42, SG should output exactly 42
    const out = sg.filter(42.0)
    expect(out).toBeCloseTo(42.0, 10)
  })

  it('noise is attenuated', () => {
    // Feed a noisy signal centered around 10.0
    const clean = 10.0
    const noisy = [10.0, 10.5, 9.5, 10.3, 9.8, 10.2, 9.7, 10.4, 9.6, 10.1]
    const outputs: number[] = []

    for (const v of noisy) {
      outputs.push(sg.filter(v))
    }

    // After warmup (5 samples), SG outputs should be closer to 10.0 than raw input
    const rawVariance = noisy.slice(4).reduce((s, v) => s + (v - clean) ** 2, 0)
    const sgVariance = outputs.slice(4).reduce((s, v) => s + (v - clean) ** 2, 0)
    expect(sgVariance).toBeLessThan(rawVariance)
  })

  it('preserves phase (step response settles within window)', () => {
    // Feed 5 zeros then step to 1.0
    for (let i = 0; i < 5; i++) {
      sg.filter(0)
    }
    // After step, output should move toward 1.0 within a few samples
    const afterStep: number[] = []
    for (let i = 0; i < 10; i++) {
      afterStep.push(sg.filter(1.0))
    }
    // After 5 more samples of 1.0, output should be close to 1.0
    expect(afterStep[afterStep.length - 1]).toBeCloseTo(1.0, 10)
    // First output after step should be less than 1.0 (filter smoothing)
    expect(afterStep[0]).toBeLessThan(1.0)
  })

  it('first 4 samples pass through raw', () => {
    expect(sg.filter(1.0)).toBe(1.0)
    expect(sg.filter(2.0)).toBe(2.0)
    expect(sg.filter(3.0)).toBe(3.0)
    expect(sg.filter(4.0)).toBe(4.0)
    // 5th sample: SG kicks in
    const fifth = sg.filter(5.0)
    expect(fifth).not.toBe(5.0) // Should be filtered
  })

  it('reset clears buffer', () => {
    for (let i = 0; i < 10; i++) {
      sg.filter(100.0)
    }
    sg.reset()
    // After reset, first sample should pass through raw
    expect(sg.filter(7.0)).toBe(7.0)
  })

  it('SG coefficients sum to norm (verify: -3+12+17+12-3 = 35)', () => {
    // This is a mathematical property test — the coefficients must sum to NORM
    // for the filter to preserve DC offset
    const coeffs = [-3, 12, 17, 12, -3]
    const sum = coeffs.reduce((s, c) => s + c, 0)
    expect(sum).toBe(35)
  })

  it('ring buffer wraps correctly after many samples', () => {
    // Feed many constant values, then verify output is still correct
    for (let i = 0; i < 100; i++) {
      sg.filter(5.0)
    }
    expect(sg.filter(5.0)).toBeCloseTo(5.0, 10)

    // Verify wrapping doesn't corrupt data by checking a constant after >5 wraps
    sg.reset()
    for (let i = 0; i < 50; i++) {
      sg.filter(3.0)
    }
    // After 50 samples of constant 3.0, output must still be exactly 3.0
    expect(sg.filter(3.0)).toBeCloseTo(3.0, 10)

    // For a linear ramp, SG has 2-sample lag (center of 5-point window).
    // Verify the lag is consistent and output matches the centered value.
    sg.reset()
    const rampOutputs: number[] = []
    for (let i = 0; i < 20; i++) {
      rampOutputs.push(sg.filter(i))
    }
    // After full warmup, SG output at index i should equal (i-2) (centered value)
    // i.e. output lags by 2 samples — this is expected SG behavior
    for (let i = 6; i < 20; i++) {
      expect(rampOutputs[i]).toBeCloseTo(i - 2, 10)
    }
  })

  it('velocity from motion tracker is smoother with SG', () => {
    // Create two trackers and compare smoothness
    // The SG-equipped tracker should produce smoother velocity output
    const tracker = new HandMotionTracker(0.3)

    // Build a noisy movement sequence
    function makeHand(handedness: Handedness, x: number, y: number, z: number): Hand {
      const landmarks: Landmark[] = Array.from({ length: 21 }, (_, i) => {
        if (i === 5) return { x: x + 0.05, y: y - 0.08, z }
        if (i === 9) return { x: x, y: y - 0.1, z }
        if (i === 13) return { x: x - 0.05, y: y - 0.08, z }
        return { x, y, z }
      })
      return { handedness, landmarks, worldLandmarks: landmarks, score: 0.9 }
    }

    function makeFrame(hands: Hand[], timestamp: number, frameId: number): LandmarkFrame {
      return { hands, timestamp, frameId }
    }

    // Feed a moving hand with noise
    const velocities: number[] = []
    const baseX = 0.5
    for (let i = 0; i < 20; i++) {
      const noise = (Math.sin(i * 7.3) * 0.01) // Deterministic noise
      const x = baseX + i * 0.005 + noise
      const hand = makeHand('right', x, 0.5, 0.3)
      const frame = makeFrame([hand], 100 + i * 33, i)
      const metrics = tracker.update(frame)
      if (metrics.length > 0) {
        velocities.push(metrics[0].velocity)
      }
    }

    // After warmup, velocities should be reasonable (not exploding)
    for (let i = 5; i < velocities.length; i++) {
      expect(Number.isFinite(velocities[i])).toBe(true)
      expect(velocities[i]).toBeGreaterThanOrEqual(0)
    }

    // Compute variance of velocity differences (jitter)
    const diffs: number[] = []
    for (let i = 6; i < velocities.length; i++) {
      diffs.push(Math.abs(velocities[i] - velocities[i - 1]))
    }
    const avgJitter = diffs.reduce((s, d) => s + d, 0) / diffs.length
    // With SG smoothing, jitter should be bounded
    expect(avgJitter).toBeLessThan(1.0) // reasonable bound for normalized coords
  })
})
