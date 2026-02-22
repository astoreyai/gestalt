import { describe, it, expect } from 'vitest'
import { proximityTint, blendWithProximityTint } from '../proximity'

describe('proximityTint', () => {
  it('returns green at distance 0', () => {
    const c = proximityTint(0, 10)
    expect(c.g).toBeGreaterThan(c.r)
    expect(c.g).toBeGreaterThan(0.5)
  })

  it('returns yellow at mid distance', () => {
    const c = proximityTint(5, 10)
    expect(c.r).toBeGreaterThan(0.5)
    expect(c.g).toBeGreaterThan(0.5)
    expect(c.b).toBeLessThan(0.3)
  })

  it('returns red at max distance', () => {
    const c = proximityTint(10, 10)
    expect(c.r).toBeGreaterThan(0.8)
    expect(c.g).toBeLessThan(0.2)
  })

  it('clamps distance to [0, maxDistance]', () => {
    const over = proximityTint(20, 10)
    const atMax = proximityTint(10, 10)
    expect(over.r).toBeCloseTo(atMax.r, 5)
    expect(over.g).toBeCloseTo(atMax.g, 5)
  })

  it('handles zero maxDistance gracefully', () => {
    const c = proximityTint(5, 0)
    // Should not produce NaN
    expect(Number.isFinite(c.r)).toBe(true)
    expect(Number.isFinite(c.g)).toBe(true)
    expect(Number.isFinite(c.b)).toBe(true)
  })

  it('handles negative distance', () => {
    const neg = proximityTint(-5, 10)
    const zero = proximityTint(0, 10)
    expect(neg.r).toBeCloseTo(zero.r, 5)
    expect(neg.g).toBeCloseTo(zero.g, 5)
  })

  it('blue channel is always 0', () => {
    for (let i = 0; i <= 10; i++) {
      expect(proximityTint(i, 10).b).toBe(0)
    }
  })
})

describe('blendWithProximityTint', () => {
  it('returns base color when strength is 0', () => {
    const base = { r: 0.2, g: 0.4, b: 0.8 }
    const tint = { r: 1, g: 0, b: 0 }
    const result = blendWithProximityTint(base, tint, 0)
    expect(result.r).toBeCloseTo(0.2, 5)
    expect(result.g).toBeCloseTo(0.4, 5)
    expect(result.b).toBeCloseTo(0.8, 5)
  })

  it('returns tint color when strength is 1', () => {
    const base = { r: 0.2, g: 0.4, b: 0.8 }
    const tint = { r: 1, g: 0, b: 0 }
    const result = blendWithProximityTint(base, tint, 1)
    expect(result.r).toBeCloseTo(1, 5)
    expect(result.g).toBeCloseTo(0, 5)
    expect(result.b).toBeCloseTo(0, 5)
  })

  it('blends at 0.3 strength (default plan)', () => {
    const base = { r: 1, g: 1, b: 1 }
    const tint = { r: 0, g: 1, b: 0 }
    const result = blendWithProximityTint(base, tint, 0.3)
    expect(result.r).toBeCloseTo(0.7, 1)
    expect(result.g).toBeCloseTo(1, 1)
    expect(result.b).toBeCloseTo(0.7, 1)
  })

  it('clamps strength to [0, 1]', () => {
    const base = { r: 0.5, g: 0.5, b: 0.5 }
    const tint = { r: 1, g: 0, b: 0 }
    const over = blendWithProximityTint(base, tint, 2)
    const at1 = blendWithProximityTint(base, tint, 1)
    expect(over.r).toBeCloseTo(at1.r, 5)
  })
})

describe('proximity performance', () => {
  it('computes 10K tints in under 5ms', () => {
    const start = performance.now()
    for (let i = 0; i < 10000; i++) {
      proximityTint(i % 100, 100)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(5)
  })

  it('blends 10K colors in under 5ms', () => {
    const base = { r: 0.5, g: 0.5, b: 0.5 }
    const tint = { r: 1, g: 0, b: 0 }
    const start = performance.now()
    for (let i = 0; i < 10000; i++) {
      blendWithProximityTint(base, tint, 0.3)
    }
    const elapsed = performance.now() - start
    expect(elapsed).toBeLessThan(5)
  })
})
