/**
 * One-Euro Filter implementation for smoothing landmark positions.
 *
 * The One-Euro filter is a simple low-pass filter with adaptive cutoff
 * frequency. When the signal is stable the cutoff is low (heavy smoothing);
 * when the signal changes quickly the cutoff rises (less smoothing), keeping
 * responsiveness.
 *
 * Reference: Casiez, Roussel, Vogel – "1 Euro Filter" (CHI 2012)
 *
 * Enhancements over vanilla implementation:
 *   - Per-joint filter tuning (wrist/palm vs fingertips)
 *   - Separate z-axis parameters (MediaPipe z is noisiest)
 *   - X/Y/Z-axis median pre-filter (3-frame sliding window)
 */

import { LANDMARK } from '@shared/protocol'
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

// ─── Median Pre-Filter ───────────────────────────────────────────

/**
 * 3-frame sliding window median filter.
 * Rejects single-frame outlier spikes before the One-Euro filter sees them.
 * MediaPipe has frequent single-frame spikes that the One-Euro filter
 * cannot fully reject without adding unacceptable lag.
 */
class MedianFilter3 {
  private _buf: [number, number, number] = [0, 0, 0]
  private _count = 0

  filter(value: number): number {
    const idx = this._count % 3
    this._buf[idx] = value
    this._count++

    if (this._count < 3) return value

    // Median of 3 without sorting (branch-free median)
    const a = this._buf[0], b = this._buf[1], c = this._buf[2]
    if (a <= b) {
      if (b <= c) return b      // a <= b <= c
      if (a <= c) return c      // a <= c < b
      return a                  // c < a <= b
    }
    // b < a
    if (a <= c) return a        // b < a <= c
    if (b <= c) return c        // b <= c < a
    return b                    // c < b < a
  }

  reset(): void {
    this._buf[0] = this._buf[1] = this._buf[2] = 0
    this._count = 0
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
// dCutoff reduced from 1.0 to 0.3Hz: lower value applies more smoothing to
// the derivative estimate, reducing noise-amplification at 60fps tracking rate.
// Further reduced from 0.4 to 0.3 to prevent derivative over-sensitivity at high frame rates.
const DEFAULT_D_CUTOFF = 0.3

const TWO_PI = 2.0 * Math.PI

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
   * Simplified: alpha = r / (1 + r) where r = TWO_PI * cutoff * te
   */
  private static alpha(cutoff: number, te: number): number {
    const r = TWO_PI * cutoff * te
    return r / (1.0 + r)
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
      // Use 1/60 as initial dt estimate (camera targets 60fps, not 30fps)
      this._lastTimestamp = timestamp
      this._dxFilter.filter(0, OneEuroFilter.alpha(this._dCutoff, 1 / 60))
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

// ─── Per-Joint Filter Presets ────────────────────────────────────

/**
 * Per-joint One-Euro filter parameters tuned for hand tracking.
 *
 * Rationale:
 * - Wrist/palm: Anchor points. Heavy smoothing reduces jitter without
 *   losing meaningful signal (wrists don't move as fast as fingertips).
 * - MCP joints: Mid-chain. Moderate smoothing.
 * - PIP/DIP/TIP joints: High-frequency motion. Light smoothing to preserve
 *   responsiveness for pinch/point detection.
 * - Z-axis: Noisiest output from monocular MediaPipe. Uses lower beta
 *   (less velocity sensitivity) and lower minCutoff (more aggressive
 *   smoothing at rest).
 */
export interface PerAxisFilterConfig {
  xy: OneEuroFilterConfig
  z: OneEuroFilterConfig
}

/** Wrist + palm landmarks (indices 0, 1, 5, 9, 13, 17) */
const ANCHOR_CONFIG: PerAxisFilterConfig = {
  xy: { minCutoff: 0.8, beta: 0.01, dCutoff: 0.4 },
  z:  { minCutoff: 0.5, beta: 0.005, dCutoff: 0.3 }
}

/** MCP joints (indices 2, 6, 10, 14, 18) */
const MCP_CONFIG: PerAxisFilterConfig = {
  xy: { minCutoff: 1.5, beta: 0.04, dCutoff: 0.4 },
  z:  { minCutoff: 1.0, beta: 0.01, dCutoff: 0.3 }
}

/** PIP joints (indices 3, 7, 11, 15, 19) */
const PIP_CONFIG: PerAxisFilterConfig = {
  xy: { minCutoff: 2.0, beta: 0.06, dCutoff: 0.4 },
  z:  { minCutoff: 1.5, beta: 0.02, dCutoff: 0.3 }
}

/** DIP joints (indices 4, 8, 12, 16, 20 minus tips) — noisiest mid-finger landmark */
const DIP_CONFIG: PerAxisFilterConfig = {
  xy: { minCutoff: 2.5, beta: 0.08, dCutoff: 0.4 },
  z:  { minCutoff: 1.8, beta: 0.05, dCutoff: 0.3 }
}

/** TIP joints — least smoothing for responsive pinch/point detection */
const TIP_CONFIG: PerAxisFilterConfig = {
  xy: { minCutoff: 3.0, beta: 0.10, dCutoff: 0.4 },
  z:  { minCutoff: 2.0, beta: 0.08, dCutoff: 0.3 }
}

// Map landmark index → filter preset
const JOINT_TIER: PerAxisFilterConfig[] = new Array(21)

// Wrist
JOINT_TIER[LANDMARK.WRIST] = ANCHOR_CONFIG
// Thumb chain
JOINT_TIER[LANDMARK.THUMB_CMC] = ANCHOR_CONFIG
JOINT_TIER[LANDMARK.THUMB_MCP] = MCP_CONFIG
JOINT_TIER[LANDMARK.THUMB_IP]  = PIP_CONFIG
JOINT_TIER[LANDMARK.THUMB_TIP] = TIP_CONFIG
// Index chain
JOINT_TIER[LANDMARK.INDEX_MCP] = ANCHOR_CONFIG
JOINT_TIER[LANDMARK.INDEX_PIP] = PIP_CONFIG
JOINT_TIER[LANDMARK.INDEX_DIP] = DIP_CONFIG
JOINT_TIER[LANDMARK.INDEX_TIP] = TIP_CONFIG
// Middle chain
JOINT_TIER[LANDMARK.MIDDLE_MCP] = ANCHOR_CONFIG
JOINT_TIER[LANDMARK.MIDDLE_PIP] = PIP_CONFIG
JOINT_TIER[LANDMARK.MIDDLE_DIP] = DIP_CONFIG
JOINT_TIER[LANDMARK.MIDDLE_TIP] = TIP_CONFIG
// Ring chain
JOINT_TIER[LANDMARK.RING_MCP] = ANCHOR_CONFIG
JOINT_TIER[LANDMARK.RING_PIP] = PIP_CONFIG
JOINT_TIER[LANDMARK.RING_DIP] = DIP_CONFIG
JOINT_TIER[LANDMARK.RING_TIP] = TIP_CONFIG
// Pinky chain
JOINT_TIER[LANDMARK.PINKY_MCP] = ANCHOR_CONFIG
JOINT_TIER[LANDMARK.PINKY_PIP] = PIP_CONFIG
JOINT_TIER[LANDMARK.PINKY_DIP] = DIP_CONFIG
JOINT_TIER[LANDMARK.PINKY_TIP] = TIP_CONFIG

// ─── Z-Normalization ────────────────────────────────────────────

/**
 * Palm landmark indices used for centroid computation:
 * wrist (0), index_mcp (5), middle_mcp (9), ring_mcp (13), pinky_mcp (17)
 */
const PALM_INDICES = [
  LANDMARK.WRIST,
  LANDMARK.INDEX_MCP,
  LANDMARK.MIDDLE_MCP,
  LANDMARK.RING_MCP,
  LANDMARK.PINKY_MCP
]
const INV_PALM_COUNT = 1 / PALM_INDICES.length

/**
 * Subtract palm centroid z from all landmarks, reducing correlated depth noise.
 *
 * MediaPipe z-values have a large common-mode offset that shifts with hand distance.
 * By subtracting the palm centroid, each landmark's z becomes relative to the palm
 * plane, making finger curl detection more robust to depth variations.
 *
 * @param landmarks 21-landmark array (mutated in-place for zero-alloc operation)
 * @returns The subtracted centroid value (needed for denormalization)
 */
export function normalizeZ(landmarks: Landmark[]): number {
  let sum = 0
  for (const idx of PALM_INDICES) {
    if (idx < landmarks.length) sum += landmarks[idx].z
  }
  const centroid = sum * INV_PALM_COUNT

  for (let i = 0; i < landmarks.length; i++) {
    landmarks[i].z -= centroid
  }

  return centroid
}

/**
 * Restore original z-values by adding the centroid back.
 * Call after processing to return landmarks to their original coordinate space.
 *
 * @param landmarks 21-landmark array (mutated in-place)
 * @param centroid  The value returned by normalizeZ()
 */
export function denormalizeZ(landmarks: Landmark[], centroid: number): void {
  for (let i = 0; i < landmarks.length; i++) {
    landmarks[i].z += centroid
  }
}

// ─── Band-Reject (Notch) Filter for Tremor ──────────────────────

/**
 * 2nd-order Butterworth band-reject (notch) filter.
 *
 * Targets the 8-12Hz physiological tremor band. This frequency range
 * corresponds to essential tremor and action tremor that contaminates
 * hand-tracking signals. The filter preserves voluntary motion (< 5Hz)
 * and fast gesture transitions while suppressing involuntary oscillations.
 *
 * Design: Direct Form I biquad with precomputed coefficients.
 */
export class BandRejectFilter {
  private _x1 = 0; private _x2 = 0
  private _y1 = 0; private _y2 = 0
  private _b0: number; private _b1: number; private _b2: number
  private _a1: number; private _a2: number

  /**
   * @param centerFreq Center frequency of the rejection band in Hz. Default: 10
   * @param bandwidth  Width of the rejection band in Hz. Default: 4 (covers 8-12Hz)
   * @param sampleRate Sample rate in Hz (camera framerate). Default: 60
   */
  constructor(
    centerFreq: number = 10,
    bandwidth: number = 4,
    sampleRate: number = 60
  ) {
    const w0 = TWO_PI * centerFreq / sampleRate
    const bw = TWO_PI * bandwidth / sampleRate
    const Q = w0 / bw
    const alpha = Math.sin(w0) / (2 * Q)

    const a0 = 1 + alpha
    this._b0 = 1 / a0
    this._b1 = -2 * Math.cos(w0) / a0
    this._b2 = 1 / a0
    this._a1 = -2 * Math.cos(w0) / a0
    this._a2 = (1 - alpha) / a0
  }

  /** Process one sample through the filter. */
  filter(x: number): number {
    const y = this._b0 * x + this._b1 * this._x1 + this._b2 * this._x2
              - this._a1 * this._y1 - this._a2 * this._y2
    this._x2 = this._x1; this._x1 = x
    this._y2 = this._y1; this._y1 = y
    return y
  }

  /** Reset internal state (call on tracking loss). */
  reset(): void {
    this._x1 = this._x2 = this._y1 = this._y2 = 0
  }
}

// ─── Landmark Smoother ───────────────────────────────────────────

/**
 * Applies per-joint One-Euro filters with separate z-axis parameters
 * and median pre-filtering on all axes to every landmark in a 21-landmark hand.
 * Each hand should have its own instance.
 */
export class LandmarkSmoother {
  private _filters: { x: OneEuroFilter; y: OneEuroFilter; z: OneEuroFilter }[]
  /** X-axis median pre-filters — reject single-frame spikes before One-Euro */
  private _xMedian: MedianFilter3[]
  /** Y-axis median pre-filters — reject single-frame spikes before One-Euro */
  private _yMedian: MedianFilter3[]
  /** Z-axis median pre-filters — reject single-frame spikes before One-Euro */
  private _zMedian: MedianFilter3[]
  /** Pre-allocated output array to avoid per-frame allocations (P2-46) */
  private _outputBuffer: Landmark[]

  constructor(
    private _config: OneEuroFilterConfig = {},
    private _numLandmarks: number = 21,
    /** Enable per-joint tuning. When false, uses uniform config (backward compat). */
    private _perJoint: boolean = true
  ) {
    this._filters = Array.from({ length: _numLandmarks }, (_, i) => {
      if (_perJoint && i < JOINT_TIER.length && JOINT_TIER[i]) {
        const tier = JOINT_TIER[i]
        // Apply user's minCutoff as a scaling factor if provided
        const scale = _config.minCutoff !== undefined ? _config.minCutoff : 1.0
        return {
          x: new OneEuroFilter({
            minCutoff: (tier.xy.minCutoff ?? 1.0) * scale,
            beta: tier.xy.beta,
            dCutoff: tier.xy.dCutoff
          }),
          y: new OneEuroFilter({
            minCutoff: (tier.xy.minCutoff ?? 1.0) * scale,
            beta: tier.xy.beta,
            dCutoff: tier.xy.dCutoff
          }),
          z: new OneEuroFilter({
            minCutoff: (tier.z.minCutoff ?? 1.0) * scale,
            beta: tier.z.beta,
            dCutoff: tier.z.dCutoff
          })
        }
      }
      return {
        x: new OneEuroFilter(_config),
        y: new OneEuroFilter(_config),
        z: new OneEuroFilter(_config)
      }
    })
    this._xMedian = Array.from({ length: _numLandmarks }, () => new MedianFilter3())
    this._yMedian = Array.from({ length: _numLandmarks }, () => new MedianFilter3())
    this._zMedian = Array.from({ length: _numLandmarks }, () => new MedianFilter3())
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
      // Median pre-filter all axes then One-Euro
      const xMedian = this._xMedian[i].filter(lm.x)
      const yMedian = this._yMedian[i].filter(lm.y)
      const zMedian = this._zMedian[i].filter(lm.z)
      // Reuse existing object in the output array if available
      if (out[i]) {
        out[i].x = f.x.filter(xMedian, timestamp)
        out[i].y = f.y.filter(yMedian, timestamp)
        out[i].z = f.z.filter(zMedian, timestamp)
      } else {
        out[i] = {
          x: f.x.filter(xMedian, timestamp),
          y: f.y.filter(yMedian, timestamp),
          z: f.z.filter(zMedian, timestamp)
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
    for (const m of this._xMedian) {
      m.reset()
    }
    for (const m of this._yMedian) {
      m.reset()
    }
    for (const m of this._zMedian) {
      m.reset()
    }
  }
}
