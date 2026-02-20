/**
 * Tests for the OffscreenCanvas tracking worker integration.
 *
 * Covers:
 *   - Message protocol (init, frame, config, stop, landmarks, error)
 *   - HandTracker worker mode initialization and fallback
 *   - Graceful fallback when OffscreenCanvas is unavailable
 *   - Worker lifecycle (start, stop, destroy)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { LandmarkFrame } from '@shared/protocol'
import type { TrackingWorkerInMessage, TrackingWorkerOutMessage } from '../../../../workers/tracking.worker'

// ─── Mocks ──────────────────────────────────────────────────────

// Mock @mediapipe/tasks-vision so the direct-mode fallback path works
const mockDetectForVideo = vi.fn()
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

import { HandTracker, supportsOffscreenCanvas } from '../HandTracker'

// ─── Mock Worker Class ──────────────────────────────────────────

/**
 * A mock Worker that stores sent messages and lets tests simulate
 * worker responses via `simulateMessage()`.
 */
class MockWorker {
  onmessage: ((event: MessageEvent<TrackingWorkerOutMessage>) => void) | null = null
  onerror: ((event: ErrorEvent) => void) | null = null
  sentMessages: Array<{ data: TrackingWorkerInMessage; transfer?: Transferable[] }> = []
  terminated = false

  postMessage(data: TrackingWorkerInMessage, transfer?: Transferable[]): void {
    this.sentMessages.push({ data, transfer })
  }

  terminate(): void {
    this.terminated = true
  }

  /** Simulate the worker posting a message back to the main thread. */
  simulateMessage(data: TrackingWorkerOutMessage): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data }))
    }
  }

  /** Simulate a worker error event. */
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new ErrorEvent('error', { message: 'Worker error' }))
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

let mockWorkerInstance: MockWorker | null = null
let originalWorker: typeof globalThis.Worker
let originalOffscreenCanvas: typeof globalThis.OffscreenCanvas
let mockVideoElement: Record<string, unknown>
let mockStream: { getTracks: () => { stop: ReturnType<typeof vi.fn> }[] }

function setupBrowserMocks(): void {
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

  mockStream = {
    getTracks: () => [{ stop: vi.fn() }]
  }

  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    if (tag === 'video') {
      return mockVideoElement as unknown as HTMLVideoElement
    }
    return document.createElement(tag)
  }) as typeof document.createElement)

  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: {
      getUserMedia: vi.fn().mockResolvedValue(mockStream)
    },
    writable: true,
    configurable: true
  })

  // Mock requestAnimationFrame
  let rafId = 0
  globalThis.requestAnimationFrame = vi.fn((_cb: FrameRequestCallback) => {
    return ++rafId
  })
  globalThis.cancelAnimationFrame = vi.fn()

  let perfCounter = 0
  vi.spyOn(performance, 'now').mockImplementation(() => {
    perfCounter += 33.33
    return perfCounter
  })

  // MediaPipe direct-mode mocks (for fallback path)
  mockForVisionTasks.mockResolvedValue({ wasmLoaderPath: '', wasmBinaryPath: '' })
  mockCreateFromOptions.mockResolvedValue({
    detectForVideo: mockDetectForVideo,
    close: mockClose
  })
  mockDetectForVideo.mockReturnValue({
    landmarks: [],
    worldLandmarks: [],
    handedness: [],
    handednesses: []
  })
}

// =================================================================
//  Message Protocol Types
// =================================================================

describe('TrackingWorker message protocol types', () => {
  it('should define valid init message shape', () => {
    // OffscreenCanvas may not be available in happy-dom; use a plain object
    // that satisfies the OffscreenCanvas structural type for protocol testing.
    const fakeCanvas = { width: 640, height: 480 } as unknown as OffscreenCanvas
    const msg: TrackingWorkerInMessage = {
      type: 'init',
      canvas: fakeCanvas,
      config: {
        numHands: 2,
        minHandDetectionConfidence: 0.7,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5
      }
    }
    expect(msg.type).toBe('init')
    expect(msg.config?.numHands).toBe(2)
  })

  it('should define valid frame message shape with ImageBitmap placeholder', () => {
    // ImageBitmap cannot be easily constructed in test; verify the type shape
    const msg: TrackingWorkerInMessage = {
      type: 'frame',
      imageBitmap: {} as ImageBitmap
    }
    expect(msg.type).toBe('frame')
  })

  it('should define valid config message shape', () => {
    const msg: TrackingWorkerInMessage = {
      type: 'config',
      numHands: 1,
      minHandDetectionConfidence: 0.9
    }
    expect(msg.type).toBe('config')
  })

  it('should define valid stop message shape', () => {
    const msg: TrackingWorkerInMessage = { type: 'stop' }
    expect(msg.type).toBe('stop')
  })

  it('should define valid ready response shape', () => {
    const msg: TrackingWorkerOutMessage = { type: 'ready' }
    expect(msg.type).toBe('ready')
  })

  it('should define valid landmarks response shape', () => {
    const frame: LandmarkFrame = {
      hands: [],
      timestamp: 123.45,
      frameId: 0
    }
    const msg: TrackingWorkerOutMessage = { type: 'landmarks', frame }
    expect(msg.type).toBe('landmarks')
    expect(msg.frame.frameId).toBe(0)
  })

  it('should define valid error response shape', () => {
    const msg: TrackingWorkerOutMessage = {
      type: 'error',
      message: 'WebGL not available'
    }
    expect(msg.type).toBe('error')
    expect(msg.message).toBe('WebGL not available')
  })
})

// =================================================================
//  supportsOffscreenCanvas
// =================================================================

describe('supportsOffscreenCanvas', () => {
  it('should return true when OffscreenCanvas exists', () => {
    // happy-dom / modern environments provide OffscreenCanvas
    if (typeof OffscreenCanvas !== 'undefined') {
      expect(supportsOffscreenCanvas()).toBe(true)
    }
  })

  it('should return false when OffscreenCanvas is removed', () => {
    const original = globalThis.OffscreenCanvas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).OffscreenCanvas

    expect(supportsOffscreenCanvas()).toBe(false)

    globalThis.OffscreenCanvas = original
  })
})

// =================================================================
//  HandTracker — Worker Mode
// =================================================================

describe('HandTracker worker mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockWorkerInstance = null

    // Save originals
    originalWorker = globalThis.Worker
    originalOffscreenCanvas = globalThis.OffscreenCanvas

    // Mock Worker constructor to return our MockWorker
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.Worker = vi.fn((() => {
      mockWorkerInstance = new MockWorker()
      return mockWorkerInstance as unknown as Worker
    }) as any)

    // Ensure OffscreenCanvas exists
    if (typeof globalThis.OffscreenCanvas === 'undefined') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      globalThis.OffscreenCanvas = class OffscreenCanvas {
        width: number
        height: number
        constructor(w: number, h: number) {
          this.width = w
          this.height = h
        }
        getContext() { return null }
      } as any
    }

    setupBrowserMocks()
  })

  afterEach(() => {
    globalThis.Worker = originalWorker
    globalThis.OffscreenCanvas = originalOffscreenCanvas
    vi.restoreAllMocks()
  })

  it('should attempt worker initialization when useWorker is true', async () => {
    const tracker = new HandTracker({ useWorker: true })

    // Start initialization (will hang waiting for worker ready)
    const initPromise = tracker.initialize()

    // Worker should have been created
    expect(globalThis.Worker).toHaveBeenCalledOnce()
    expect(mockWorkerInstance).not.toBeNull()

    // Verify init message was sent to worker
    const initMsg = mockWorkerInstance!.sentMessages[0]
    expect(initMsg.data.type).toBe('init')

    // Simulate worker ready
    mockWorkerInstance!.simulateMessage({ type: 'ready' })

    await initPromise

    expect(tracker.isWorkerMode).toBe(true)

    tracker.destroy()
  })

  it('should fall back to direct mode when worker sends error', async () => {
    const tracker = new HandTracker({ useWorker: true })

    const initPromise = tracker.initialize()

    // Simulate worker error (e.g., WebGL not available in worker)
    mockWorkerInstance!.simulateMessage({
      type: 'error',
      message: 'WebGL not available in worker context'
    })

    await initPromise

    // Should have fallen back to direct mode
    expect(tracker.isWorkerMode).toBe(false)

    tracker.destroy()
  })

  it('should fall back to direct mode when OffscreenCanvas is not supported', async () => {
    // Remove OffscreenCanvas
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).OffscreenCanvas

    const tracker = new HandTracker({ useWorker: true })

    await tracker.initialize()

    // Should have fallen back to direct mode
    expect(tracker.isWorkerMode).toBe(false)

    // Restore for cleanup
    globalThis.OffscreenCanvas = originalOffscreenCanvas

    tracker.destroy()
  })

  it('should fall back to direct mode when Worker constructor throws', async () => {
    globalThis.Worker = vi.fn(() => {
      throw new Error('Workers not supported')
    }) as unknown as typeof Worker

    const tracker = new HandTracker({ useWorker: true })

    await tracker.initialize()

    // Should have fallen back to direct mode
    expect(tracker.isWorkerMode).toBe(false)

    tracker.destroy()
  })

  it('should receive landmark frames from worker via onFrame callback', async () => {
    const tracker = new HandTracker({ useWorker: true, smoothing: false })
    const frames: LandmarkFrame[] = []
    tracker.onFrame((f) => frames.push(f))

    const initPromise = tracker.initialize()
    mockWorkerInstance!.simulateMessage({ type: 'ready' })
    await initPromise

    // Now simulate the worker posting a landmarks message
    // We need to call the onWorkerMessage handler that's been set
    const workerFrame: LandmarkFrame = {
      hands: [{
        handedness: 'right',
        landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 })),
        worldLandmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
        score: 0.95
      }],
      timestamp: 100,
      frameId: 0
    }

    // The onmessage handler was re-assigned after 'ready'
    mockWorkerInstance!.simulateMessage({ type: 'landmarks', frame: workerFrame })

    expect(frames).toHaveLength(1)
    expect(frames[0].hands).toHaveLength(1)
    expect(frames[0].hands[0].handedness).toBe('right')

    tracker.destroy()
  })

  it('should forward worker errors to onError callback', async () => {
    const tracker = new HandTracker({ useWorker: true })
    const errors: Error[] = []
    tracker.onError((e) => errors.push(e))

    const initPromise = tracker.initialize()
    mockWorkerInstance!.simulateMessage({ type: 'ready' })
    await initPromise

    // Simulate worker detection error during operation
    mockWorkerInstance!.simulateMessage({
      type: 'error',
      message: 'Detection error (frame 5): WASM crashed'
    })

    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('[Worker]')
    expect(errors[0].message).toContain('Detection error')

    tracker.destroy()
  })

  it('should send stop message and terminate worker on destroy', async () => {
    const tracker = new HandTracker({ useWorker: true })

    const initPromise = tracker.initialize()
    mockWorkerInstance!.simulateMessage({ type: 'ready' })
    await initPromise

    const worker = mockWorkerInstance!

    tracker.destroy()

    // Should have sent 'stop' to worker
    const stopMsg = worker.sentMessages.find(m => m.data.type === 'stop')
    expect(stopMsg).toBeDefined()

    // Worker should be terminated
    expect(worker.terminated).toBe(true)
  })

  it('should not be in worker mode when useWorker is false (default)', () => {
    const tracker = new HandTracker()
    expect(tracker.isWorkerMode).toBe(false)
    // Worker constructor should not have been called
    expect(globalThis.Worker).not.toHaveBeenCalled()
  })

  it('should start and stop in worker mode', async () => {
    const tracker = new HandTracker({ useWorker: true })

    const initPromise = tracker.initialize()
    mockWorkerInstance!.simulateMessage({ type: 'ready' })
    await initPromise

    tracker.start()
    expect(tracker.isRunning).toBe(true)
    expect(requestAnimationFrame).toHaveBeenCalled()

    tracker.stop()
    expect(tracker.isRunning).toBe(false)
    expect(cancelAnimationFrame).toHaveBeenCalled()

    tracker.destroy()
  })

  it('should throw if start() called before initialize() in worker mode', () => {
    const tracker = new HandTracker({ useWorker: true })
    // Worker mode but no video yet
    expect(() => tracker.start()).toThrow('initialize()')
  })

  it('should pass config to worker init message', async () => {
    const tracker = new HandTracker({
      useWorker: true,
      numHands: 1,
      minHandDetectionConfidence: 0.9,
      minHandPresenceConfidence: 0.8,
      minTrackingConfidence: 0.6
    })

    const initPromise = tracker.initialize()

    const initMsg = mockWorkerInstance!.sentMessages[0].data
    expect(initMsg.type).toBe('init')
    if (initMsg.type === 'init') {
      expect(initMsg.config?.numHands).toBe(1)
      expect(initMsg.config?.minHandDetectionConfidence).toBe(0.9)
      expect(initMsg.config?.minHandPresenceConfidence).toBe(0.8)
      expect(initMsg.config?.minTrackingConfidence).toBe(0.6)
    }

    mockWorkerInstance!.simulateMessage({ type: 'ready' })
    await initPromise

    tracker.destroy()
  })

  it('should transfer the OffscreenCanvas via transferable', async () => {
    const tracker = new HandTracker({ useWorker: true })

    const initPromise = tracker.initialize()

    // Check that the init message used transferables
    const initCall = mockWorkerInstance!.sentMessages[0]
    expect(initCall.transfer).toBeDefined()
    expect(initCall.transfer!.length).toBeGreaterThan(0)

    mockWorkerInstance!.simulateMessage({ type: 'ready' })
    await initPromise

    tracker.destroy()
  })
})

// =================================================================
//  HandTracker — Direct Mode Backward Compatibility
// =================================================================

describe('HandTracker direct mode (backward compatibility)', () => {
  let rafCallbacks: ((ts: number) => void)[]

  beforeEach(() => {
    vi.clearAllMocks()
    rafCallbacks = []

    originalWorker = globalThis.Worker
    originalOffscreenCanvas = globalThis.OffscreenCanvas

    // Provide standard browser mocks
    let rafId = 0
    globalThis.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      rafCallbacks.push(cb as (ts: number) => void)
      return ++rafId
    })
    globalThis.cancelAnimationFrame = vi.fn()

    let perfCounter = 0
    vi.spyOn(performance, 'now').mockImplementation(() => {
      perfCounter += 33.33
      return perfCounter
    })

    mockVideoElement = {
      srcObject: null,
      muted: false,
      currentTime: 0,
      videoWidth: 640,
      videoHeight: 480,
      play: vi.fn().mockResolvedValue(undefined),
      setAttribute: vi.fn()
    }

    mockStream = {
      getTracks: () => [{ stop: vi.fn() }]
    }

    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      if (tag === 'video') {
        return mockVideoElement as unknown as HTMLVideoElement
      }
      return document.createElement(tag)
    }) as typeof document.createElement)

    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(mockStream)
      },
      writable: true,
      configurable: true
    })

    mockForVisionTasks.mockResolvedValue({ wasmLoaderPath: '', wasmBinaryPath: '' })
    mockCreateFromOptions.mockResolvedValue({
      detectForVideo: mockDetectForVideo,
      close: mockClose
    })
    mockDetectForVideo.mockReturnValue({
      landmarks: [],
      worldLandmarks: [],
      handedness: [],
      handednesses: []
    })
  })

  afterEach(() => {
    globalThis.Worker = originalWorker
    globalThis.OffscreenCanvas = originalOffscreenCanvas
    vi.restoreAllMocks()
  })

  it('should work in direct mode without useWorker flag', async () => {
    const tracker = new HandTracker({ smoothing: false })
    const frames: LandmarkFrame[] = []
    tracker.onFrame((f) => frames.push(f))

    await tracker.initialize()

    mockDetectForVideo.mockReturnValue({
      landmarks: [Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))],
      worldLandmarks: [Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))],
      handedness: [[{ score: 0.9, index: 0, categoryName: 'Right', displayName: '' }]],
      handednesses: [[{ score: 0.9, index: 0, categoryName: 'Right', displayName: '' }]]
    })

    tracker.start()
    expect(tracker.isRunning).toBe(true)
    expect(tracker.isWorkerMode).toBe(false)

    mockVideoElement.currentTime = 0.033
    rafCallbacks[0]?.(33.33)

    expect(frames).toHaveLength(1)
    expect(frames[0].hands).toHaveLength(1)

    tracker.destroy()
  })

  it('should use direct mode when useWorker is true but initialize() fails worker', async () => {
    // Remove OffscreenCanvas to force fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).OffscreenCanvas

    const tracker = new HandTracker({ useWorker: true, smoothing: false })
    const frames: LandmarkFrame[] = []
    tracker.onFrame((f) => frames.push(f))

    await tracker.initialize()

    expect(tracker.isWorkerMode).toBe(false)

    // Direct mode should still work
    mockDetectForVideo.mockReturnValue({
      landmarks: [Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }))],
      worldLandmarks: [Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0, visibility: 1 }))],
      handedness: [[{ score: 0.9, index: 0, categoryName: 'Right', displayName: '' }]],
      handednesses: [[{ score: 0.9, index: 0, categoryName: 'Right', displayName: '' }]]
    })

    tracker.start()

    mockVideoElement.currentTime = 0.033
    rafCallbacks[0]?.(33.33)

    expect(frames).toHaveLength(1)

    // Restore for cleanup
    globalThis.OffscreenCanvas = originalOffscreenCanvas

    tracker.destroy()
  })
})
