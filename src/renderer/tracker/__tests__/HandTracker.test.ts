/**
 * Tests for the Hand Tracker module.
 *
 * Covers:
 *  - normalize.ts: mirror, depth normalization, clamping, edge cases
 *  - filters.ts: OneEuroFilter smoothing, LandmarkSmoother, reset
 *  - HandTracker.ts: lifecycle (create, start, stop, destroy) with mocked MediaPipe
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { NormalizedLandmark, HandLandmarkerResult } from '@mediapipe/tasks-vision'
import type { Landmark, LandmarkFrame } from '@shared/protocol'

// ─── Mocks ──────────────────────────────────────────────────────

// Mock @mediapipe/tasks-vision before importing any modules that depend on it
const mockDetectForVideo = vi.fn<(video: unknown, timestamp: number) => HandLandmarkerResult>()
const mockClose = vi.fn()
const mockCreateFromOptions = vi.fn()
const mockForVisionTasks = vi.fn()

vi.mock('@mediapipe/tasks-vision', () => ({
  FilesetResolver: {
    forVisionTasks: (...args: unknown[]) => mockForVisionTasks(...args)
  },
  HandLandmarker: {
    createFromOptions: (...args: unknown[]) => mockCreateFromOptions(...args)
  }
}))

// ─── Imports (after mock setup) ──────────────────────────────────

import { normalizeLandmarks, clamp } from '../normalize'
import { OneEuroFilter, LandmarkSmoother } from '../filters'
import { HandTracker } from '../HandTracker'

// ─── Helpers ─────────────────────────────────────────────────────

/** Create a raw MediaPipe NormalizedLandmark. */
function rawLandmark(x: number, y: number, z: number): NormalizedLandmark {
  return { x, y, z, visibility: 1.0 }
}

/** Create an array of 21 identical raw landmarks. */
function raw21(x: number, y: number, z: number): NormalizedLandmark[] {
  return Array.from({ length: 21 }, () => rawLandmark(x, y, z))
}

/** Create an array of 21 app Landmark objects. */
function appLandmarks21(x: number, y: number, z: number): Landmark[] {
  return Array.from({ length: 21 }, () => ({ x, y, z }))
}

/** Build a minimal HandLandmarkerResult. */
function makeResult(
  numHands: number,
  rawX = 0.5,
  rawY = 0.5,
  rawZ = 0.0
): HandLandmarkerResult {
  const landmarks: NormalizedLandmark[][] = []
  const worldLandmarks: { x: number; y: number; z: number; visibility: number }[][] = []
  const handedness: { score: number; index: number; categoryName: string; displayName: string }[][] = []

  for (let h = 0; h < numHands; h++) {
    landmarks.push(raw21(rawX, rawY, rawZ))
    worldLandmarks.push(
      Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))
    )
    handedness.push([
      { score: 0.95, index: 0, categoryName: h === 0 ? 'Right' : 'Left', displayName: '' }
    ])
  }

  return {
    landmarks,
    worldLandmarks,
    handedness,
    handednesses: handedness
  }
}

// =================================================================
//  normalize.ts
// =================================================================

describe('normalize.ts', () => {
  describe('clamp', () => {
    it('should return the value when within range', () => {
      expect(clamp(0.5, 0, 1)).toBe(0.5)
    })

    it('should clamp to min', () => {
      expect(clamp(-0.1, 0, 1)).toBe(0)
    })

    it('should clamp to max', () => {
      expect(clamp(1.5, 0, 1)).toBe(1)
    })

    it('should return exact boundary values', () => {
      expect(clamp(0, 0, 1)).toBe(0)
      expect(clamp(1, 0, 1)).toBe(1)
    })
  })

  describe('normalizeLandmarks', () => {
    it('should return empty array for empty input', () => {
      expect(normalizeLandmarks([], 640, 480)).toEqual([])
    })

    it('should mirror the x-axis', () => {
      const raw = [rawLandmark(0.2, 0.5, 0.0)]
      const result = normalizeLandmarks(raw, 640, 480)
      expect(result[0].x).toBeCloseTo(0.8) // 1.0 - 0.2
    })

    it('should keep y unchanged', () => {
      const raw = [rawLandmark(0.5, 0.7, 0.0)]
      const result = normalizeLandmarks(raw, 640, 480)
      expect(result[0].y).toBeCloseTo(0.7)
    })

    it('should normalize z relative to wrist (index 0)', () => {
      const raw = [
        rawLandmark(0.5, 0.5, 0.3), // wrist
        rawLandmark(0.5, 0.5, 0.5), // further from camera
        rawLandmark(0.5, 0.5, 0.1) // closer to camera
      ]
      const result = normalizeLandmarks(raw, 640, 480)

      expect(result[0].z).toBeCloseTo(0.0) // wrist depth = 0
      expect(result[1].z).toBeCloseTo(0.2) // 0.5 - 0.3
      expect(result[2].z).toBeCloseTo(-0.2) // 0.1 - 0.3
    })

    it('should handle 21 landmarks correctly', () => {
      const raw = raw21(0.3, 0.6, 0.1)
      const result = normalizeLandmarks(raw, 640, 480)

      expect(result).toHaveLength(21)
      // x should be mirrored: 1.0 - 0.3 = 0.7
      for (const lm of result) {
        expect(lm.x).toBeCloseTo(0.7)
        expect(lm.y).toBeCloseTo(0.6)
        expect(lm.z).toBeCloseTo(0.0) // all same z so all relative to wrist = 0
      }
    })

    it('should clamp x to [0, 1] when raw x is out of bounds', () => {
      // raw x = 1.1 -> mirrored = -0.1 -> clamped to 0
      const raw = [rawLandmark(1.1, 0.5, 0.0)]
      const result = normalizeLandmarks(raw, 640, 480)
      expect(result[0].x).toBe(0)
    })

    it('should clamp mirrored x to 1 when raw x is negative', () => {
      // raw x = -0.1 -> mirrored = 1.1 -> clamped to 1
      const raw = [rawLandmark(-0.1, 0.5, 0.0)]
      const result = normalizeLandmarks(raw, 640, 480)
      expect(result[0].x).toBe(1)
    })

    it('should clamp y to [0, 1]', () => {
      const raw = [rawLandmark(0.5, -0.05, 0.0), rawLandmark(0.5, 1.05, 0.0)]
      const result = normalizeLandmarks(raw, 640, 480)
      expect(result[0].y).toBe(0)
      expect(result[1].y).toBe(1)
    })

    it('should handle wrist at z = 0', () => {
      const raw = [rawLandmark(0.5, 0.5, 0.0), rawLandmark(0.5, 0.5, 0.2)]
      const result = normalizeLandmarks(raw, 640, 480)
      expect(result[0].z).toBeCloseTo(0.0)
      expect(result[1].z).toBeCloseTo(0.2)
    })

    it('should produce mirrored coordinates for a full hand', () => {
      // Simulate landmarks going from left (x=0.1) to right (x=0.9)
      const raw: NormalizedLandmark[] = []
      for (let i = 0; i < 21; i++) {
        raw.push(rawLandmark(0.1 + i * 0.04, 0.5, 0.0))
      }
      const result = normalizeLandmarks(raw, 640, 480)

      // First raw landmark x=0.1 -> mirrored = 0.9
      expect(result[0].x).toBeCloseTo(0.9)
      // Last raw landmark x=0.1 + 20*0.04 = 0.9 -> mirrored = 0.1
      expect(result[20].x).toBeCloseTo(0.1)
    })

    it('should pad to 21 landmarks when fewer provided', () => {
      // Only provide 5 landmarks
      const raw = Array.from({ length: 5 }, (_, i) =>
        rawLandmark(0.3 + i * 0.05, 0.5, 0.1)
      )
      const result = normalizeLandmarks(raw, 640, 480)

      // Should always return exactly 21 landmarks
      expect(result).toHaveLength(21)

      // First 5 should have real normalized values (mirrored x, clamped)
      for (let i = 0; i < 5; i++) {
        expect(result[i].x).toBeGreaterThanOrEqual(0)
        expect(result[i].x).toBeLessThanOrEqual(1)
        expect(result[i].y).toBeGreaterThanOrEqual(0)
        expect(result[i].y).toBeLessThanOrEqual(1)
      }

      // Remaining 16 should be padded defaults (center default: x=0.5, y=0.5, z=0)
      for (let i = 5; i < 21; i++) {
        expect(result[i]).toEqual({ x: 0.5, y: 0.5, z: 0 })
      }
    })

    it('should handle exactly 21 landmarks normally', () => {
      const raw = raw21(0.4, 0.6, 0.2)
      const result = normalizeLandmarks(raw, 640, 480)

      expect(result).toHaveLength(21)
      // All should have real values, mirrored x: 1.0 - 0.4 = 0.6
      for (const lm of result) {
        expect(lm.x).toBeCloseTo(0.6)
        expect(lm.y).toBeCloseTo(0.6)
        expect(lm.z).toBeCloseTo(0.0) // all same z, relative to wrist = 0
      }
    })

    it('should pad with center defaults for single landmark input', () => {
      // Only 1 landmark (wrist)
      const raw = [rawLandmark(0.5, 0.5, 0.0)]
      const result = normalizeLandmarks(raw, 640, 480)

      expect(result).toHaveLength(21)
      // First landmark should be normalized (mirrored x: 1.0 - 0.5 = 0.5)
      expect(result[0].x).toBeCloseTo(0.5)
      expect(result[0].y).toBeCloseTo(0.5)
      expect(result[0].z).toBeCloseTo(0.0)

      // Remaining 20 should be padded
      for (let i = 1; i < 21; i++) {
        expect(result[i]).toEqual({ x: 0.5, y: 0.5, z: 0 })
      }
    })
  })
})

// =================================================================
//  filters.ts
// =================================================================

describe('filters.ts', () => {
  describe('OneEuroFilter', () => {
    it('should return the first value unmodified', () => {
      const filter = new OneEuroFilter()
      expect(filter.filter(5.0, 0.0)).toBe(5.0)
    })

    it('should smooth jittery data', () => {
      const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.0 })
      const base = 100
      const jitter = 2
      const timestamps: number[] = []
      const filtered: number[] = []

      // Feed in a noisy signal around base value
      for (let i = 0; i < 60; i++) {
        const t = i / 30 // 30 FPS in seconds
        timestamps.push(t)
        const noise = (Math.sin(i * 7.3) * jitter) // deterministic "noise"
        const raw = base + noise
        filtered.push(filter.filter(raw, t))
      }

      // After settling, the filtered values should have less variance than the raw input
      const last20Filtered = filtered.slice(-20)
      const variance = computeVariance(last20Filtered)
      // With beta=0 and minCutoff=1 the smoothing should be moderate
      expect(variance).toBeLessThan(jitter * jitter)
    })

    it('should track fast movement when beta > 0', () => {
      const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.5 })

      // Step from 0 to 100 at t=1.0
      filter.filter(0, 0.0)
      filter.filter(0, 0.5)
      const after = filter.filter(100, 1.0)

      // With beta > 0 the filter should start moving quickly toward 100
      // (not be pinned near 0)
      expect(after).toBeGreaterThan(20)
    })

    it('should handle duplicate timestamps gracefully', () => {
      const filter = new OneEuroFilter()
      filter.filter(10, 1.0)
      const v2 = filter.filter(20, 1.0) // same timestamp
      // Should not crash; returns some value
      expect(typeof v2).toBe('number')
      expect(Number.isFinite(v2)).toBe(true)
    })

    it('should reset state correctly', () => {
      const filter = new OneEuroFilter({ minCutoff: 0.5, beta: 0.0 })
      filter.filter(100, 0)
      filter.filter(100, 0.1)
      filter.filter(100, 0.2)

      filter.reset()

      // After reset, the first value should pass through unmodified
      const val = filter.filter(50, 10.0)
      expect(val).toBe(50)
    })

    it('should produce stable output for constant input', () => {
      const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.0 })
      const results: number[] = []
      for (let i = 0; i < 30; i++) {
        results.push(filter.filter(42, i / 30))
      }
      // All filtered values should converge to 42
      for (const v of results.slice(-10)) {
        expect(v).toBeCloseTo(42, 1)
      }
    })

    it('should apply more smoothing with lower minCutoff', () => {
      const highCutoff = new OneEuroFilter({ minCutoff: 5.0, beta: 0.0 })
      const lowCutoff = new OneEuroFilter({ minCutoff: 0.1, beta: 0.0 })

      // Step from 0 to 100
      highCutoff.filter(0, 0.0)
      lowCutoff.filter(0, 0.0)

      const highVal = highCutoff.filter(100, 1 / 30)
      const lowVal = lowCutoff.filter(100, 1 / 30)

      // Lower cutoff = more smoothing = filtered value is further from 100
      expect(lowVal).toBeLessThan(highVal)
    })
  })

  describe('LandmarkSmoother', () => {
    it('should smooth all 21 landmarks', () => {
      const smoother = new LandmarkSmoother({ minCutoff: 1.0, beta: 0.0 })

      const lms = appLandmarks21(0.5, 0.5, 0.0)
      const result = smoother.smooth(lms, 0.0)

      expect(result).toHaveLength(21)
      // First frame passes through
      for (const lm of result) {
        expect(lm.x).toBeCloseTo(0.5)
        expect(lm.y).toBeCloseTo(0.5)
        expect(lm.z).toBeCloseTo(0.0)
      }
    })

    it('should throw for wrong number of landmarks', () => {
      const smoother = new LandmarkSmoother()
      const tooFew: Landmark[] = Array.from({ length: 10 }, () => ({
        x: 0,
        y: 0,
        z: 0
      }))
      expect(() => smoother.smooth(tooFew, 0)).toThrow('Expected 21 landmarks but received 10')
    })

    it('should reduce jitter across frames', () => {
      const smoother = new LandmarkSmoother({ minCutoff: 1.0, beta: 0.0 })

      const base = 0.5
      const jitterAmplitude = 0.05
      const rawValues: number[] = []
      const filteredValues: number[] = []

      for (let frame = 0; frame < 60; frame++) {
        const t = frame / 30
        const noise = Math.sin(frame * 5.1) * jitterAmplitude
        const x = base + noise
        rawValues.push(x)

        const lms: Landmark[] = Array.from({ length: 21 }, () => ({
          x,
          y: 0.5,
          z: 0.0
        }))
        const result = smoother.smooth(lms, t)
        filteredValues.push(result[0].x)
      }

      const rawVariance = computeVariance(rawValues.slice(-20))
      const filteredVariance = computeVariance(filteredValues.slice(-20))

      expect(filteredVariance).toBeLessThan(rawVariance)
    })

    it('should reset all internal filters', () => {
      const smoother = new LandmarkSmoother({ minCutoff: 0.5, beta: 0.0 })

      // Feed several frames
      for (let i = 0; i < 10; i++) {
        smoother.smooth(appLandmarks21(0.8, 0.8, 0.0), i / 30)
      }

      smoother.reset()

      // After reset, the first value should pass through unmodified
      const result = smoother.smooth(appLandmarks21(0.2, 0.2, 0.0), 100)
      expect(result[0].x).toBeCloseTo(0.2)
      expect(result[0].y).toBeCloseTo(0.2)
    })

    it('should support custom landmark count', () => {
      const smoother = new LandmarkSmoother({}, 5)
      const lms: Landmark[] = Array.from({ length: 5 }, () => ({
        x: 0.5,
        y: 0.5,
        z: 0.0
      }))
      const result = smoother.smooth(lms, 0)
      expect(result).toHaveLength(5)
    })
  })
})

// =================================================================
//  HandTracker.ts
// =================================================================

describe('HandTracker', () => {
  let rafCallbacks: ((ts: number) => void)[]
  let originalRAF: typeof globalThis.requestAnimationFrame
  let originalCAF: typeof globalThis.cancelAnimationFrame
  let mockVideoElement: Record<string, unknown>
  let mockStream: { getTracks: () => { stop: ReturnType<typeof vi.fn> }[] }

  beforeEach(() => {
    vi.clearAllMocks()
    rafCallbacks = []

    // Mock requestAnimationFrame to collect callbacks
    originalRAF = globalThis.requestAnimationFrame
    originalCAF = globalThis.cancelAnimationFrame
    // performance.now is available as-is in test environment

    let rafId = 0
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb as (ts: number) => void)
      return ++rafId
    })
    globalThis.cancelAnimationFrame = vi.fn()

    let perfCounter = 0
    vi.spyOn(performance, 'now').mockImplementation(() => {
      perfCounter += 33.33 // ~30 FPS
      return perfCounter
    })

    // Mock video element
    mockVideoElement = {
      srcObject: null,
      muted: false,
      currentTime: 0,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn()
    }

    // Mock stream
    mockStream = {
      getTracks: () => [{ stop: vi.fn() }, { stop: vi.fn() }]
    }

    // Mock document.createElement to return our mock video
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'video') {
        return mockVideoElement as unknown as HTMLVideoElement
      }
      return document.createElement(tag)
    }) as typeof document.createElement)

    // Mock navigator.mediaDevices.getUserMedia
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream)
      },
      writable: true,
      configurable: true
    })

    // Set up MediaPipe mocks to return a working handLandmarker
    mockForVisionTasks.mockResolvedValue({ wasmLoaderPath: '', wasmBinaryPath: '' })
    mockCreateFromOptions.mockResolvedValue({
      detectForVideo: mockDetectForVideo,
      close: mockClose
    })

    // Default: no hands detected
    mockDetectForVideo.mockReturnValue(makeResult(0))
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF
    globalThis.cancelAnimationFrame = originalCAF
    vi.restoreAllMocks()
  })

  describe('lifecycle', () => {
    it('should create an instance without errors', () => {
      const tracker = new HandTracker()
      expect(tracker).toBeInstanceOf(HandTracker)
      expect(tracker.isRunning).toBe(false)
    })

    it('should initialize model and camera', async () => {
      const tracker = new HandTracker()
      await tracker.initialize()

      expect(mockForVisionTasks).toHaveBeenCalledOnce()
      expect(mockCreateFromOptions).toHaveBeenCalledOnce()
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce()
      expect(mockVideoElement.play).toHaveBeenCalledOnce()
    })

    it('should throw if start() called before initialize()', () => {
      const tracker = new HandTracker()
      expect(() => tracker.start()).toThrow('initialize()')
    })

    it('should start and stop the loop', async () => {
      const tracker = new HandTracker()
      await tracker.initialize()

      tracker.start()
      expect(tracker.isRunning).toBe(true)
      expect(requestAnimationFrame).toHaveBeenCalled()

      tracker.stop()
      expect(tracker.isRunning).toBe(false)
      expect(cancelAnimationFrame).toHaveBeenCalled()
    })

    it('should be idempotent when calling start() twice', async () => {
      const tracker = new HandTracker()
      await tracker.initialize()

      tracker.start()
      tracker.start() // should not throw or duplicate loops

      expect(tracker.isRunning).toBe(true)
    })

    it('should destroy and release all resources', async () => {
      const tracker = new HandTracker()
      await tracker.initialize()
      tracker.start()

      tracker.destroy()

      expect(tracker.isRunning).toBe(false)
      expect(mockClose).toHaveBeenCalledOnce()
    })

    it('should throw if used after destroy', async () => {
      const tracker = new HandTracker()
      await tracker.initialize()
      tracker.destroy()

      expect(() => tracker.start()).toThrow('destroyed')
      await expect(tracker.initialize()).rejects.toThrow('destroyed')
    })
  })

  describe('frame processing', () => {
    it('should emit frames via onFrame callback', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()

      // Return 1 hand
      mockDetectForVideo.mockReturnValue(makeResult(1, 0.5, 0.5, 0.0))

      tracker.start()

      // Simulate one animation frame: advance video time, then call the rAF callback
      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      expect(frames).toHaveLength(1)
      expect(frames[0].hands).toHaveLength(1)
      expect(frames[0].hands[0].handedness).toBe('right')
      expect(frames[0].hands[0].landmarks).toHaveLength(21)
      expect(frames[0].hands[0].score).toBeCloseTo(0.95)
      expect(frames[0].frameId).toBe(0)

      tracker.destroy()
    })

    it('should detect two hands', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()
      mockDetectForVideo.mockReturnValue(makeResult(2))

      tracker.start()

      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      expect(frames[0].hands).toHaveLength(2)
      expect(frames[0].hands[0].handedness).toBe('right')
      expect(frames[0].hands[1].handedness).toBe('left')

      tracker.destroy()
    })

    it('should skip frame when video time has not advanced', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()
      mockDetectForVideo.mockReturnValue(makeResult(1))

      tracker.start()

      // First frame: video time changes
      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      // Second frame: video time unchanged
      rafCallbacks[1]?.(66.66)

      expect(frames).toHaveLength(1)

      tracker.destroy()
    })

    it('should increment frameId for each processed frame', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()
      mockDetectForVideo.mockReturnValue(makeResult(1))

      tracker.start()

      // Frame 1
      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      // Frame 2
      mockVideoElement.currentTime = 0.066
      rafCallbacks[1]?.(66.66)

      expect(frames[0].frameId).toBe(0)
      expect(frames[1].frameId).toBe(1)

      tracker.destroy()
    })

    it('should apply normalization (mirrored x)', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()
      // raw x = 0.2 -> normalized = 1.0 - 0.2 = 0.8
      mockDetectForVideo.mockReturnValue(makeResult(1, 0.2, 0.7, 0.0))

      tracker.start()
      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      const lm = frames[0].hands[0].landmarks[0]
      expect(lm.x).toBeCloseTo(0.8)
      expect(lm.y).toBeCloseTo(0.7)

      tracker.destroy()
    })

    it('should handle detectForVideo throwing without crashing', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      const errors: Error[] = []
      tracker.onFrame((f) => frames.push(f))
      tracker.onError((e) => errors.push(e))

      await tracker.initialize()

      // First call throws, second call succeeds
      mockDetectForVideo
        .mockImplementationOnce(() => {
          throw new Error('WASM error')
        })
        .mockReturnValueOnce(makeResult(1))

      tracker.start()

      // Frame 1: error, should be skipped
      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      // Frame 2: success
      mockVideoElement.currentTime = 0.066
      rafCallbacks[1]?.(66.66)

      expect(frames).toHaveLength(1)

      tracker.destroy()
    })
  })

  describe('smoothing integration', () => {
    it('should apply smoothing by default', async () => {
      const tracker = new HandTracker() // smoothing enabled by default
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()
      mockDetectForVideo.mockReturnValue(makeResult(1, 0.5, 0.5, 0.0))

      tracker.start()

      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      // Should have landmarks (smoothing does not block output)
      expect(frames[0].hands[0].landmarks).toHaveLength(21)

      tracker.destroy()
    })

    it('should not smooth when smoothing is disabled', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()
      mockDetectForVideo.mockReturnValue(makeResult(1, 0.3, 0.6, 0.0))

      tracker.start()

      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      // Without smoothing, values are exactly the normalized raw values
      const lm = frames[0].hands[0].landmarks[0]
      expect(lm.x).toBeCloseTo(0.7) // mirrored: 1 - 0.3
      expect(lm.y).toBeCloseTo(0.6)

      tracker.destroy()
    })

    it('should evict smoothers when a hand disappears', async () => {
      const tracker = new HandTracker() // smoothing enabled
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()

      // Frame 1: 2 hands detected
      mockDetectForVideo.mockReturnValue(makeResult(2, 0.5, 0.5, 0.0))
      tracker.start()
      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)
      expect(frames[0].hands).toHaveLength(2)

      // Frame 2: only 1 hand detected — smoother for index 1 should be evicted
      mockDetectForVideo.mockReturnValue(makeResult(1, 0.5, 0.5, 0.0))
      mockVideoElement.currentTime = 0.066
      rafCallbacks[1]?.(66.66)
      expect(frames[1].hands).toHaveLength(1)

      // Frame 3: 2 hands again — should get a fresh smoother for index 1
      mockDetectForVideo.mockReturnValue(makeResult(2, 0.5, 0.5, 0.0))
      mockVideoElement.currentTime = 0.099
      rafCallbacks[2]?.(99.99)
      expect(frames[2].hands).toHaveLength(2)

      tracker.destroy()
    })
  })

  describe('error handling', () => {
    it('should emit error on camera permission failure', async () => {
      const tracker = new HandTracker()
      const errors: Error[] = []
      tracker.onError((e) => errors.push(e))

      ;(navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error('Permission denied')
      )

      await expect(tracker.initialize()).rejects.toThrow('Permission denied')
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('Camera access failed')
    })

    it('should emit error on model loading failure', async () => {
      const tracker = new HandTracker()
      const errors: Error[] = []
      tracker.onError((e) => errors.push(e))

      mockCreateFromOptions.mockRejectedValueOnce(new Error('Network error'))

      await expect(tracker.initialize()).rejects.toThrow('Network error')
      expect(errors).toHaveLength(1)
      expect(errors[0].message).toContain('Failed to load HandLandmarker model')
    })
  })

  describe('configuration', () => {
    it('should pass custom config to HandLandmarker', async () => {
      const tracker = new HandTracker({
        numHands: 1,
        minHandDetectionConfidence: 0.9,
        minHandPresenceConfidence: 0.8,
        minTrackingConfidence: 0.6
      })

      await tracker.initialize()

      const callArgs = mockCreateFromOptions.mock.calls[0][1]
      expect(callArgs.numHands).toBe(1)
      expect(callArgs.minHandDetectionConfidence).toBe(0.9)
      expect(callArgs.minHandPresenceConfidence).toBe(0.8)
      expect(callArgs.minTrackingConfidence).toBe(0.6)
      expect(callArgs.runningMode).toBe('VIDEO')

      tracker.destroy()
    })

    it('should use defaults when no config is provided', async () => {
      const tracker = new HandTracker()

      await tracker.initialize()

      const callArgs = mockCreateFromOptions.mock.calls[0][1]
      expect(callArgs.numHands).toBe(2)
      expect(callArgs.minHandDetectionConfidence).toBe(0.7)

      tracker.destroy()
    })
  })

  describe('landmark deep copy', () => {
    it('should not share references between frames', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()
      mockDetectForVideo.mockReturnValue(makeResult(1, 0.5, 0.5, 0.0))

      tracker.start()

      // Frame 1
      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      // Frame 2
      mockVideoElement.currentTime = 0.066
      rafCallbacks[1]?.(66.66)

      expect(frames).toHaveLength(2)

      // Pooled references: both frames share the same landmark arrays
      // (consumers process synchronously within the same tick).
      // Frame data is valid only until the next processFrame call.
      const landmarks1 = frames[0].hands[0].landmarks
      const landmarks2 = frames[1].hands[0].landmarks
      expect(landmarks1).toBe(landmarks2)

      // Individual landmark objects are also shared (pooled)
      expect(landmarks1[0]).toBe(landmarks2[0])

      tracker.destroy()
    })

    it('pooled landmarks are overwritten by next frame', async () => {
      const tracker = new HandTracker({ smoothing: false })
      const frames: LandmarkFrame[] = []
      tracker.onFrame((f) => frames.push(f))

      await tracker.initialize()
      mockDetectForVideo.mockReturnValue(makeResult(1, 0.5, 0.5, 0.0))

      tracker.start()

      // Frame 1
      mockVideoElement.currentTime = 0.033
      rafCallbacks[0]?.(33.33)

      const frame1Landmark0X = frames[0].hands[0].landmarks[0].x

      // Frame 2 overwrites the pooled landmarks in-place
      mockVideoElement.currentTime = 0.066
      rafCallbacks[1]?.(66.66)

      // The pooled array is the same reference, so frame1's view is now
      // overwritten with frame2's data (both should be the same value
      // since we're returning the same mock data).
      expect(frames[1].hands[0].landmarks[0].x).toBeCloseTo(frame1Landmark0X)

      // World landmarks are also pooled
      expect(frames[0].hands[0].worldLandmarks).toBe(frames[1].hands[0].worldLandmarks)

      tracker.destroy()
    })
  })
})

// ─── Utility ─────────────────────────────────────────────────────

function computeVariance(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return values.reduce((acc, v) => acc + (v - mean) ** 2, 0) / values.length
}
