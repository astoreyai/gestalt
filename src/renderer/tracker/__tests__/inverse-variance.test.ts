import { describe, it, expect } from 'vitest'

/** Inverse-variance fusion: weights by reliability */
function inverseVarianceFuse(
  stereoZ: number, stereoVar: number,
  monoZ: number, monoVar: number
): number {
  // Guard against zero variance
  if (stereoVar <= 0 && monoVar <= 0) return (stereoZ + monoZ) / 2
  if (stereoVar <= 0) return stereoZ
  if (monoVar <= 0) return monoZ

  const wStereo = 1 / stereoVar
  const wMono = 1 / monoVar
  return (stereoZ * wStereo + monoZ * wMono) / (wStereo + wMono)
}

/** Running variance estimator (Welford's algorithm) */
class RunningVariance {
  private count = 0
  private mean = 0
  private m2 = 0

  push(value: number): void {
    this.count++
    const delta = value - this.mean
    this.mean += delta / this.count
    const delta2 = value - this.mean
    this.m2 += delta * delta2
  }

  get variance(): number {
    return this.count < 2 ? Infinity : this.m2 / (this.count - 1)
  }

  get isReady(): boolean {
    return this.count >= 5
  }
}

describe('Sprint 7a: Inverse-variance stereo fusion', () => {
  it('higher-confidence source dominates', () => {
    const result = inverseVarianceFuse(1.0, 0.01, 2.0, 1.0)
    // stereoVar much lower -> stereoZ dominates
    expect(result).toBeCloseTo(1.0, 0)
    expect(result).toBeLessThan(1.5)
  })

  it('equal variance -> equal weight (midpoint)', () => {
    const result = inverseVarianceFuse(1.0, 0.5, 3.0, 0.5)
    expect(result).toBeCloseTo(2.0, 5)
  })

  it('zero stereo variance -> use stereo directly', () => {
    const result = inverseVarianceFuse(1.0, 0, 2.0, 0.5)
    expect(result).toBe(1.0)
  })

  it('zero mono variance -> use mono directly', () => {
    const result = inverseVarianceFuse(1.0, 0.5, 2.0, 0)
    expect(result).toBe(2.0)
  })

  it('both zero variance -> average', () => {
    const result = inverseVarianceFuse(1.0, 0, 3.0, 0)
    expect(result).toBe(2.0)
  })

  it('RunningVariance computes correct variance', () => {
    const rv = new RunningVariance()
    const values = [10, 12, 23, 23, 16, 23, 21, 16]
    values.forEach(v => rv.push(v))
    // Known variance of this dataset
    expect(rv.variance).toBeCloseTo(27.43, 0)
    expect(rv.isReady).toBe(true)
  })

  it('RunningVariance returns Infinity when not enough samples', () => {
    const rv = new RunningVariance()
    rv.push(1)
    expect(rv.variance).toBe(Infinity)
    expect(rv.isReady).toBe(false)
  })

  it('lower variance mono source pulls result toward mono', () => {
    // mono is 10x more reliable
    const result = inverseVarianceFuse(5.0, 1.0, 3.0, 0.1)
    expect(result).toBeCloseTo(3.0, 0)
    expect(result).toBeLessThan(4.0)
  })
})
