import { describe, it, expect } from 'vitest'

/**
 * Sprint 5e: Onset feedback logic
 * Tests the onset ring animation and audio gate logic.
 */

interface OnsetRing {
  x: number
  y: number
  startTime: number
  duration: number // ms
}

function createOnsetRing(x: number, y: number, now: number): OnsetRing {
  return { x, y, startTime: now, duration: 200 }
}

function getRingProgress(ring: OnsetRing, now: number): { radius: number; alpha: number; expired: boolean } {
  const elapsed = now - ring.startTime
  if (elapsed >= ring.duration) {
    return { radius: 30, alpha: 0, expired: true }
  }
  const t = elapsed / ring.duration
  return {
    radius: t * 30,
    alpha: 0.8 * (1 - t),
    expired: false
  }
}

function shouldPlayOnsetSound(phase: string, soundEnabled: boolean): boolean {
  return phase === 'onset' && soundEnabled
}

describe('Sprint 5e: Onset ring animation', () => {
  it('should create ring at hand position', () => {
    const ring = createOnsetRing(100, 200, 1000)
    expect(ring.x).toBe(100)
    expect(ring.y).toBe(200)
    expect(ring.duration).toBe(200)
  })

  it('should expand radius from 0 to 30 over duration', () => {
    const ring = createOnsetRing(0, 0, 1000)
    const start = getRingProgress(ring, 1000)
    expect(start.radius).toBe(0)

    const mid = getRingProgress(ring, 1100) // 50%
    expect(mid.radius).toBeCloseTo(15, 0)

    const end = getRingProgress(ring, 1200) // 100%
    expect(end.expired).toBe(true)
  })

  it('should fade alpha from 0.8 to 0', () => {
    const ring = createOnsetRing(0, 0, 1000)
    const start = getRingProgress(ring, 1000)
    expect(start.alpha).toBeCloseTo(0.8, 1)

    const mid = getRingProgress(ring, 1100)
    expect(mid.alpha).toBeCloseTo(0.4, 1)
  })

  it('should mark ring as expired after duration', () => {
    const ring = createOnsetRing(0, 0, 1000)
    expect(getRingProgress(ring, 1199).expired).toBe(false)
    expect(getRingProgress(ring, 1200).expired).toBe(true)
  })
})

describe('Sprint 5e: Onset sound gating', () => {
  it('should play sound on onset when enabled', () => {
    expect(shouldPlayOnsetSound('onset', true)).toBe(true)
  })

  it('should not play sound when disabled', () => {
    expect(shouldPlayOnsetSound('onset', false)).toBe(false)
  })

  it('should not play sound on hold or release', () => {
    expect(shouldPlayOnsetSound('hold', true)).toBe(false)
    expect(shouldPlayOnsetSound('release', true)).toBe(false)
  })
})
