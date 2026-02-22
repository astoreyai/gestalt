/**
 * One-Euro Filter implementation for smoothing landmark positions.
 *
 * The One-Euro filter is a simple low-pass filter with adaptive cutoff
 * frequency. When the signal is stable the cutoff is low (heavy smoothing);
 * when the signal changes quickly the cutoff rises (less smoothing), keeping
 * responsiveness.
 *
 * Reference: Casiez, Roussel, Vogel – "1 Euro Filter" (CHI 2012)
 */

import type { Landmark } from '@shared/protocol'

// ─── Low-Pass Filter (exponential smoothing) ─────────────────────

class LowPassFilter {
  private _y: number | null = null
  private _s: number | null = null

  /**
   * Apply one step of the low-pass filter.
   * @param value  Raw input value.
   * @param alpha  Smoothing factor in [0, 1]. 1 = no smoothing, 0 = never updates.
   */
  filter(value: number, alpha: number): number {
    if (this._s === null) {
      this._s = value
    } else {
      this._s = alpha * value + (1 - alpha) * this._s
    }
    this._y = value
    return this._s
  }

  hasLastRawValue(): boolean {
    return this._y !== null
  }

  lastRawValue(): number {
    return this._y!
  }

  reset(): void {
    this._y = null
    this._s = null
  }
}

// ─── One-Euro Filter ─────────────────────────────────────────────

export interface OneEuroFilterConfig {
  /** Minimum cutoff frequency (Hz). Lower = more smoothing at rest. Default: 1.0 */
  minCutoff?: number
  /** Speed coefficient. Higher = less lag during fast movement. Default: 0.0 */
  beta?: number
  /** Derivative cutoff frequency (Hz). Default: 1.0 */
  dCutoff?: number
}

const DEFAULT_MIN_CUTOFF = 1.0
const DEFAULT_BETA = 0.03
const DEFAULT_D_CUTOFF = 1.0

export class OneEuroFilter {
  private _minCutoff: number
  private _beta: number
  private _dCutoff: number
  private _xFilter: LowPassFilter
  private _dxFilter: LowPassFilter
  private _lastTimestamp: number | null = null

  constructor(config: OneEuroFilterConfig = {}) {
    this._minCutoff = config.minCutoff ?? DEFAULT_MIN_CUTOFF
    this._beta = config.beta ?? DEFAULT_BETA
    this._dCutoff = config.dCutoff ?? DEFAULT_D_CUTOFF
    this._xFilter = new LowPassFilter()
    this._dxFilter = new LowPassFilter()
  }

  /**
   * Compute the smoothing factor alpha from a cutoff frequency and time period.
   */
  private static alpha(cutoff: number, te: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff)
    return 1.0 / (1.0 + tau / te)
  }

  /**
   * Filter a single scalar value.
   * @param value     The raw input value.
   * @param timestamp Timestamp in seconds (must be monotonically increasing).
   * @returns The smoothed value.
   */
  filter(value: number, timestamp: number): number {
    if (this._lastTimestamp === null) {
      // First sample: initialize both filters, derivative is 0
      this._lastTimestamp = timestamp
      this._dxFilter.filter(0, OneEuroFilter.alpha(this._dCutoff, 1 / 30))
      return this._xFilter.filter(value, 1.0) // alpha=1 means no smoothing on first sample
    }

    const te = timestamp - this._lastTimestamp
    if (te <= 0) {
      // Duplicate or out-of-order timestamp; return last filtered value
      return this._xFilter.filter(value, 1.0)
    }
    this._lastTimestamp = timestamp

    // Estimate derivative
    const dx =
      this._xFilter.hasLastRawValue()
        ? (value - this._xFilter.lastRawValue()) / te
        : 0

    // Filter the derivative
    const alphaD = OneEuroFilter.alpha(this._dCutoff, te)
    const dxSmoothed = this._dxFilter.filter(dx, alphaD)

    // Adaptive cutoff
    const cutoff = this._minCutoff + this._beta * Math.abs(dxSmoothed)
    const alphaX = OneEuroFilter.alpha(cutoff, te)

    return this._xFilter.filter(value, alphaX)
  }

  /** Reset the filter state so the next call behaves like the first sample. */
  reset(): void {
    this._xFilter.reset()
    this._dxFilter.reset()
    this._lastTimestamp = null
  }
}

// ─── Landmark Smoother ───────────────────────────────────────────

/**
 * Applies a One-Euro filter independently to every coordinate (x, y, z) of
 * every landmark in a 21-landmark hand. Each hand should have its own instance.
 */
export class LandmarkSmoother {
  private _filters: { x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter }[]
  /** Pre-allocated output array to avoid per-frame allocations (P2-46) */
  private _outputBuffer: Landmark[]

  constructor(
    private _config: OneEuroFilterConfig = {},
    private _numLandmarks: number = 21
  ) {
    this._filters = Array.from({ length: _numLandmarks }, () => ({
      x: new OneEuroFilter(_config),
      y: new OneEuroFilter(_config),
      z: new OneEuroFilter(_config)
    }))
    this._outputBuffer = Array.from({ length: _numLandmarks }, () => ({ x: 0, y: 0, z: 0 }))
  }

  /**
   * Smooth an array of landmarks.
   * @param landmarks Array of landmarks (must have length === _numLandmarks).
   * @param timestamp Timestamp in seconds.
   * @param output    Optional pre-allocated output array to reuse (P2-46).
   *                  If not provided, the internal buffer is used.
   * @returns Array of smoothed landmarks (may be the internal buffer -- do not hold references across frames).
   */
  smooth(landmarks: Landmark[], timestamp: number, output?: Landmark[]): Landmark[] {
    if (landmarks.length !== this._numLandmarks) {
      throw new Error(
        `Expected ${this._numLandmarks} landmarks but received ${landmarks.length}`
      )
    }

    const out = output ?? this._outputBuffer
    for (let i = 0; i < this._numLandmarks; i++) {
      const lm = landmarks[i]
      const f = this._filters[i]
      // Reuse existing object in the output array if available
      if (out[i]) {
        out[i].x = f.x.filter(lm.x, timestamp)
        out[i].y = f.y.filter(lm.y, timestamp)
        out[i].z = f.z.filter(lm.z, timestamp)
      } else {
        out[i] = {
          x: f.x.filter(lm.x, timestamp),
          y: f.y.filter(lm.y, timestamp),
          z: f.z.filter(lm.z, timestamp)
        }
      }
    }

    return out
  }

  /** Reset all filters so next call behaves as first frame. */
  reset(): void {
    for (const f of this._filters) {
      f.x.reset()
      f.y.reset()
      f.z.reset()
    }
  }
}
