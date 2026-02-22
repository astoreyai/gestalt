import { describe, it, expect } from 'vitest'

/**
 * Band-reject (notch) filter for 8-12Hz tremor band.
 * 2nd order Butterworth band-reject filter.
 */
class BandRejectFilter {
  private x1 = 0; private x2 = 0
  private y1 = 0; private y2 = 0
  private b0: number; private b1: number; private b2: number
  private a1: number; private a2: number

  constructor(
    private centerFreq: number = 10,
    private bandwidth: number = 4,
    private sampleRate: number = 60
  ) {
    const w0 = 2 * Math.PI * centerFreq / sampleRate
    const bw = 2 * Math.PI * bandwidth / sampleRate
    const Q = w0 / bw
    const alpha = Math.sin(w0) / (2 * Q)

    const a0 = 1 + alpha
    this.b0 = 1 / a0
    this.b1 = -2 * Math.cos(w0) / a0
    this.b2 = 1 / a0
    this.a1 = -2 * Math.cos(w0) / a0
    this.a2 = (1 - alpha) / a0
  }

  filter(x: number): number {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2
              - this.a1 * this.y1 - this.a2 * this.y2
    this.x2 = this.x1; this.x1 = x
    this.y2 = this.y1; this.y1 = y
    return y
  }

  reset(): void {
    this.x1 = this.x2 = this.y1 = this.y2 = 0
  }
}

function generateSine(freq: number, sampleRate: number, duration: number): number[] {
  const n = Math.floor(sampleRate * duration)
  return Array.from({ length: n }, (_, i) => Math.sin(2 * Math.PI * freq * i / sampleRate))
}

function rms(signal: number[]): number {
  const sum = signal.reduce((s, v) => s + v * v, 0)
  return Math.sqrt(sum / signal.length)
}

describe('Sprint 7d: Tremor band-reject filter', () => {
  const filter = new BandRejectFilter(10, 4, 60)

  it('should attenuate 10Hz signal (tremor frequency)', () => {
    filter.reset()
    const input = generateSine(10, 60, 2)
    const output = input.map(v => filter.filter(v))
    // Skip transient (first 0.5s)
    const steadyOutput = output.slice(30)
    const steadyInput = input.slice(30)
    expect(rms(steadyOutput)).toBeLessThan(rms(steadyInput) * 0.5)
  })

  it('should preserve 2Hz signal (voluntary motion)', () => {
    filter.reset()
    const input = generateSine(2, 60, 2)
    const output = input.map(v => filter.filter(v))
    const steadyOutput = output.slice(30)
    const steadyInput = input.slice(30)
    expect(rms(steadyOutput)).toBeGreaterThan(rms(steadyInput) * 0.8)
  })

  it('should preserve 25Hz signal (above tremor band)', () => {
    filter.reset()
    // Note: at 60fps Nyquist is 30Hz, 25Hz is close to limit
    const input = generateSine(25, 60, 2)
    const output = input.map(v => filter.filter(v))
    const steadyOutput = output.slice(30)
    const steadyInput = input.slice(30)
    // At 25Hz (close to Nyquist), some attenuation is expected
    expect(rms(steadyOutput)).toBeGreaterThan(rms(steadyInput) * 0.3)
  })

  it('should attenuate 8Hz signal (lower tremor band)', () => {
    filter.reset()
    const input = generateSine(8, 60, 2)
    const output = input.map(v => filter.filter(v))
    const steadyOutput = output.slice(30)
    const steadyInput = input.slice(30)
    // Band edge: 2nd-order notch attenuates less at the edges than at center
    expect(rms(steadyOutput)).toBeLessThan(rms(steadyInput) * 0.85)
  })

  it('should attenuate 12Hz signal (upper tremor band)', () => {
    filter.reset()
    const input = generateSine(12, 60, 2)
    const output = input.map(v => filter.filter(v))
    const steadyOutput = output.slice(30)
    const steadyInput = input.slice(30)
    // Band edge: 2nd-order notch attenuates less at the edges than at center
    expect(rms(steadyOutput)).toBeLessThan(rms(steadyInput) * 0.85)
  })

  it('should preserve DC component (constant offset)', () => {
    filter.reset()
    const input = Array.from({ length: 120 }, () => 5.0)
    const output = input.map(v => filter.filter(v))
    const last = output[output.length - 1]
    expect(last).toBeCloseTo(5.0, 0)
  })

  it('should handle mixed signal (2Hz + 10Hz)', () => {
    filter.reset()
    const sampleRate = 60
    const duration = 2
    const n = Math.floor(sampleRate * duration)
    const input = Array.from({ length: n }, (_, i) => {
      const t = i / sampleRate
      return Math.sin(2 * Math.PI * 2 * t) + 0.5 * Math.sin(2 * Math.PI * 10 * t)
    })
    const output = input.map(v => filter.filter(v))
    // After filtering, the 10Hz component should be reduced
    const steadyOutput = output.slice(30)
    const steadyInput = input.slice(30)
    expect(rms(steadyOutput)).toBeLessThan(rms(steadyInput))
  })

  it('should be resettable', () => {
    const f = new BandRejectFilter(10, 4, 60)
    generateSine(10, 60, 1).forEach(v => f.filter(v))
    f.reset()
    // After reset, first output should be 0 for 0 input
    expect(f.filter(0)).toBe(0)
  })
})
