import { describe, it, expect } from 'vitest'
import {
  computeAdaptivePinchThreshold,
  computeTremorParams
} from '../adaptive-threshold'

describe('computeAdaptivePinchThreshold', () => {
  const BASE = 0.15 // DEFAULT_GESTURE_CONFIG.pinchThreshold
  const REF = 0.25 // default reference palm size

  it('returns base threshold for reference palm size', () => {
    const result = computeAdaptivePinchThreshold(BASE, REF)
    expect(result).toBeCloseTo(BASE, 5)
  })

  it('returns larger threshold for larger palms', () => {
    const result = computeAdaptivePinchThreshold(BASE, 0.35)
    expect(result).toBeGreaterThan(BASE)
    // 0.15 * (0.35 / 0.25) = 0.21
    expect(result).toBeCloseTo(0.21, 2)
  })

  it('returns smaller threshold for smaller palms', () => {
    const result = computeAdaptivePinchThreshold(BASE, 0.15)
    expect(result).toBeLessThan(BASE)
    // 0.15 * (0.15 / 0.25) = 0.09
    expect(result).toBeCloseTo(0.09, 2)
  })

  it('clamps to min 0.08 (never too tight)', () => {
    // Very small palm: 0.15 * (0.03 / 0.25) = 0.018 -> clamped to 0.08
    const result = computeAdaptivePinchThreshold(BASE, 0.03)
    expect(result).toBe(0.08)
  })

  it('clamps to max 0.30 (never too loose)', () => {
    // Huge palm: 0.15 * (0.60 / 0.25) = 0.36 -> clamped to 0.30
    const result = computeAdaptivePinchThreshold(BASE, 0.60)
    expect(result).toBe(0.30)
  })

  it('handles zero palm size gracefully', () => {
    const result = computeAdaptivePinchThreshold(BASE, 0)
    expect(result).toBe(BASE)
  })

  it('handles zero reference palm size gracefully', () => {
    const result = computeAdaptivePinchThreshold(BASE, 0.20, 0)
    expect(result).toBe(BASE)
  })

  it('accepts custom reference palm size', () => {
    // With reference 0.30: 0.15 * (0.30 / 0.30) = 0.15 (identity)
    const result = computeAdaptivePinchThreshold(BASE, 0.30, 0.30)
    expect(result).toBeCloseTo(BASE, 5)
  })
})

describe('computeTremorParams', () => {
  const BASE_CONFIG = { minHoldDuration: 40, pinchThreshold: 0.15 }

  it('tremorLevel 0 returns base config values', () => {
    const result = computeTremorParams(BASE_CONFIG, 0)
    expect(result.minHoldDuration).toBe(40)
    expect(result.pinchThreshold).toBe(0.15)
    expect(result.deadzone).toBe(0)
  })

  it('tremorLevel 1 extends minHoldDuration to 200ms', () => {
    const result = computeTremorParams(BASE_CONFIG, 1)
    expect(result.minHoldDuration).toBe(200)
  })

  it('tremorLevel 1 widens pinchThreshold by 30%', () => {
    const result = computeTremorParams(BASE_CONFIG, 1)
    // 0.15 * 1.3 = 0.195
    expect(result.pinchThreshold).toBeCloseTo(0.195, 5)
  })

  it('tremorLevel 0.5 gives intermediate values', () => {
    const result = computeTremorParams(BASE_CONFIG, 0.5)
    // minHoldDuration: 40 + 0.5 * (200 - 40) = 40 + 80 = 120
    expect(result.minHoldDuration).toBe(120)
    // pinchThreshold: 0.15 * (1 + 0.5 * 0.3) = 0.15 * 1.15 = 0.1725
    expect(result.pinchThreshold).toBeCloseTo(0.1725, 5)
    // deadzone: 0.5 * 0.02 = 0.01
    expect(result.deadzone).toBeCloseTo(0.01, 5)
  })

  it('deadzone scales from 0 to 0.02 with tremor level', () => {
    expect(computeTremorParams(BASE_CONFIG, 0).deadzone).toBe(0)
    expect(computeTremorParams(BASE_CONFIG, 0.25).deadzone).toBeCloseTo(0.005, 5)
    expect(computeTremorParams(BASE_CONFIG, 0.5).deadzone).toBeCloseTo(0.01, 5)
    expect(computeTremorParams(BASE_CONFIG, 0.75).deadzone).toBeCloseTo(0.015, 5)
    expect(computeTremorParams(BASE_CONFIG, 1).deadzone).toBeCloseTo(0.02, 5)
  })

  it('clamps tremorLevel below 0 to 0', () => {
    const result = computeTremorParams(BASE_CONFIG, -0.5)
    expect(result.minHoldDuration).toBe(40)
    expect(result.pinchThreshold).toBe(0.15)
    expect(result.deadzone).toBe(0)
  })

  it('clamps tremorLevel above 1 to 1', () => {
    const result = computeTremorParams(BASE_CONFIG, 2.0)
    expect(result.minHoldDuration).toBe(200)
    expect(result.pinchThreshold).toBeCloseTo(0.195, 5)
    expect(result.deadzone).toBeCloseTo(0.02, 5)
  })
})
