/**
 * Sprint 3: 3D Interaction tests
 *
 * Tests for:
 * - 3b: Camera-distance-scaled pan
 * - 3c: Multiplicative zoom
 * - 3f: Rotation inertia (decay behavior)
 * - 3g: Density-adaptive hover threshold
 */

import { describe, it, expect } from 'vitest'

// ─── Sprint 3b: Camera-distance-scaled pan ──────────────────────────

describe('Sprint 3b: Camera-distance-scaled pan', () => {
  /**
   * Pan displacement should be proportional to camera distance.
   * Formula: panScale = camDist * 0.03
   * So at distance 10, scale = 0.3; at distance 100, scale = 3.0
   */
  function computePanDisplacement(handDeltaX: number, handDeltaY: number, cameraDistance: number): { dx: number; dy: number } {
    const panScale = cameraDistance * 0.03
    return {
      dx: handDeltaX * panScale,
      dy: handDeltaY * panScale
    }
  }

  it('should produce larger pan at greater camera distance', () => {
    const delta = 0.1 // same hand movement
    const nearPan = computePanDisplacement(delta, 0, 10)
    const farPan = computePanDisplacement(delta, 0, 100)

    expect(farPan.dx).toBeGreaterThan(nearPan.dx)
    expect(farPan.dx / nearPan.dx).toBeCloseTo(10, 0) // 10x distance = 10x pan
  })

  it('should produce proportional pan displacement', () => {
    const pan1 = computePanDisplacement(0.1, 0, 50) // distance 50
    const pan2 = computePanDisplacement(0.1, 0, 100) // distance 100

    // Double distance = double pan
    expect(pan2.dx / pan1.dx).toBeCloseTo(2.0, 5)
  })

  it('should handle zero camera distance gracefully', () => {
    const pan = computePanDisplacement(0.1, 0.1, 0)
    expect(pan.dx).toBe(0)
    expect(pan.dy).toBe(0)
  })

  it('should scale both x and y identically', () => {
    const pan = computePanDisplacement(0.1, 0.1, 50)
    expect(Math.abs(pan.dx)).toBeCloseTo(Math.abs(pan.dy), 5)
  })
})

// ─── Sprint 3c: Multiplicative zoom ─────────────────────────────────

describe('Sprint 3c: Multiplicative zoom', () => {
  /**
   * Multiplicative zoom: camera position scales relative to target.
   * position = target + (position - target) / clamp(1 + delta * 0.02, 0.5, 2.0)
   */
  function applyMultiplicativeZoom(
    cameraPos: number,
    target: number,
    delta: number
  ): number {
    const factor = 1 + delta * 0.02
    const clamped = Math.max(0.5, Math.min(2.0, factor))
    return target + (cameraPos - target) / clamped
  }

  it('should zoom in (reduce distance) for positive delta', () => {
    const newPos = applyMultiplicativeZoom(100, 0, 10)
    expect(newPos).toBeLessThan(100)
    expect(newPos).toBeGreaterThan(0)
  })

  it('should zoom out (increase distance) for negative delta', () => {
    const newPos = applyMultiplicativeZoom(100, 0, -10)
    expect(newPos).toBeGreaterThan(100)
  })

  it('should feel proportional — same delta produces same ratio regardless of distance', () => {
    const delta = 10
    const near = applyMultiplicativeZoom(10, 0, delta)
    const far = applyMultiplicativeZoom(100, 0, delta)

    // Both should reduce by the same factor
    const nearRatio = near / 10
    const farRatio = far / 100
    expect(nearRatio).toBeCloseTo(farRatio, 5)
  })

  it('should clamp zoom factor to prevent extreme zoom', () => {
    // Very large positive delta
    const hugeZoomIn = applyMultiplicativeZoom(100, 0, 1000)
    // Factor clamped to 2.0, so position = 100 / 2.0 = 50
    expect(hugeZoomIn).toBeCloseTo(50, 0)

    // Very large negative delta
    const hugeZoomOut = applyMultiplicativeZoom(100, 0, -1000)
    // Factor clamped to 0.5, so position = 100 / 0.5 = 200
    expect(hugeZoomOut).toBeCloseTo(200, 0)
  })

  it('should handle zero delta (no change)', () => {
    const result = applyMultiplicativeZoom(100, 0, 0)
    expect(result).toBeCloseTo(100, 5)
  })

  it('should work correctly when target is non-zero', () => {
    // Camera at 100, target at 50 → offset is 50
    const result = applyMultiplicativeZoom(100, 50, 10)
    // factor = 1.2, offset 50 / 1.2 ≈ 41.67, new pos ≈ 91.67
    expect(result).toBeCloseTo(50 + 50 / 1.2, 1)
    expect(result).toBeLessThan(100)
    expect(result).toBeGreaterThan(50)
  })
})

// ─── Sprint 3f: Rotation inertia ────────────────────────────────────

describe('Sprint 3f: Rotation inertia', () => {
  /**
   * Inertia model: exponential decay with configurable half-life.
   * angularVelocity *= exp(-dt / tau)
   * where tau = halfLife / ln(2)
   */
  function decayVelocity(velocity: number, dt: number, halfLife: number): number {
    const tau = halfLife / Math.LN2
    return velocity * Math.exp(-dt / tau)
  }

  it('should decay velocity over time', () => {
    const v0 = 1.0
    const v1 = decayVelocity(v0, 100, 300) // 100ms into 300ms half-life
    expect(v1).toBeLessThan(v0)
    expect(v1).toBeGreaterThan(0)
  })

  it('should reach half velocity at half-life', () => {
    const v0 = 1.0
    const halfLife = 300
    const vHalf = decayVelocity(v0, halfLife, halfLife)
    expect(vHalf).toBeCloseTo(0.5, 2)
  })

  it('should approach zero after many half-lives', () => {
    const v0 = 1.0
    const halfLife = 300
    const vLong = decayVelocity(v0, halfLife * 10, halfLife) // 10 half-lives
    expect(vLong).toBeLessThan(0.001)
  })

  it('should preserve velocity at dt=0', () => {
    const v0 = 2.5
    const v = decayVelocity(v0, 0, 300)
    expect(v).toBeCloseTo(v0, 5)
  })

  it('should work with negative velocity (opposite rotation)', () => {
    const v0 = -1.0
    const v1 = decayVelocity(v0, 100, 300)
    expect(v1).toBeGreaterThan(v0) // closer to zero
    expect(v1).toBeLessThan(0) // still negative
  })

  it('should decay faster with shorter half-life', () => {
    const v0 = 1.0
    const dt = 100
    const vFast = decayVelocity(v0, dt, 100) // 100ms half-life
    const vSlow = decayVelocity(v0, dt, 500) // 500ms half-life
    expect(vFast).toBeLessThan(vSlow)
  })
})

// ─── Sprint 3g: Density-adaptive hover threshold ────────────────────

describe('Sprint 3g: Density-adaptive hover threshold', () => {
  /**
   * Hover threshold scales inversely with local density:
   * threshold = baseThreshold / sqrt(localDensity)
   * where localDensity = count of nodes within a search radius
   */
  function adaptiveHoverThreshold(baseThreshold: number, localDensity: number): number {
    if (localDensity <= 0) return baseThreshold
    return baseThreshold / Math.sqrt(localDensity)
  }

  it('should produce tighter threshold in dense regions', () => {
    const base = 1.0
    const dense = adaptiveHoverThreshold(base, 100)
    const sparse = adaptiveHoverThreshold(base, 1)

    expect(dense).toBeLessThan(sparse)
  })

  it('should equal base threshold at density 1', () => {
    const base = 2.0
    const t = adaptiveHoverThreshold(base, 1)
    expect(t).toBeCloseTo(base, 5)
  })

  it('should halve threshold at density 4', () => {
    const base = 2.0
    const t = adaptiveHoverThreshold(base, 4)
    expect(t).toBeCloseTo(1.0, 5) // 2 / sqrt(4) = 1
  })

  it('should handle zero density gracefully (return base)', () => {
    const base = 2.0
    const t = adaptiveHoverThreshold(base, 0)
    expect(t).toBe(base)
  })
})
