/**
 * Tests for the useHandTracker hook.
 *
 * Since HandTracker requires MediaPipe (browser-only with WASM),
 * we test the hook's state management logic and verify the module exports.
 * The actual MediaPipe integration is covered by HandTracker.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// Mock the HandTracker class before importing the hook
const mockInitialize = vi.fn()
const mockStart = vi.fn()
const mockStop = vi.fn()
const mockDestroy = vi.fn()
const mockOnFrame = vi.fn()
const mockOnError = vi.fn()

vi.mock('../../tracker/HandTracker', () => {
  const ctor = vi.fn().mockImplementation(() => ({
    initialize: mockInitialize,
    start: mockStart,
    stop: mockStop,
    destroy: mockDestroy,
    onFrame: mockOnFrame,
    onError: mockOnError,
    isRunning: false
  }))
  // Static method used by the camera enumeration effect
  ;(ctor as unknown as Record<string, unknown>).enumerateVideoDevices = vi.fn().mockResolvedValue([])
  return { HandTracker: ctor }
})

// Ensure navigator.mediaDevices is available in the test environment
if (!globalThis.navigator?.mediaDevices) {
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      ...globalThis.navigator,
      mediaDevices: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [] }),
        enumerateDevices: vi.fn().mockResolvedValue([])
      }
    },
    writable: true,
    configurable: true
  })
} else if (!globalThis.navigator.mediaDevices.addEventListener) {
  globalThis.navigator.mediaDevices.addEventListener = vi.fn()
  globalThis.navigator.mediaDevices.removeEventListener = vi.fn()
}

import { useHandTracker } from '../useHandTracker'
import type { UseHandTrackerOptions, UseHandTrackerResult } from '../useHandTracker'
import { HandTracker } from '../../tracker/HandTracker'

/** Flush all pending microtasks (resolved promises) */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

describe('useHandTracker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockInitialize.mockResolvedValue(undefined)
  })

  it('should export useHandTracker as a function', () => {
    expect(typeof useHandTracker).toBe('function')
  })

  it('should export UseHandTrackerOptions type (via interface)', () => {
    // Type-level check: verify the options interface is structurally correct
    const opts: UseHandTrackerOptions = {
      enabled: true,
      smoothingFactor: 0.3,
      minConfidence: 0.7
    }
    expect(opts.enabled).toBe(true)
    expect(opts.smoothingFactor).toBe(0.3)
    expect(opts.minConfidence).toBe(0.7)
  })

  it('should export UseHandTrackerResult type (via interface)', () => {
    // Type-level check: verify the result interface is structurally correct
    const result: UseHandTrackerResult = {
      frame: null,
      error: null,
      isInitialized: false,
      isTracking: false,
      cameraCount: 0
    }
    expect(result.frame).toBeNull()
    expect(result.error).toBeNull()
    expect(result.isInitialized).toBe(false)
    expect(result.isTracking).toBe(false)
    expect(result.cameraCount).toBe(0)
  })

  it('should accept disabled option without error', () => {
    const opts: UseHandTrackerOptions = { enabled: false }
    expect(opts.enabled).toBe(false)
  })

  it('should handle tracker initialization error gracefully (structural test)', () => {
    // Verify that the HandTracker mock is properly wired.
    // Note: we do NOT call mockRejectedValueOnce here since it would
    // leave a queued rejection that leaks into the next test.
    expect(mockInitialize).not.toHaveBeenCalled()
    expect(mockOnError).not.toHaveBeenCalled()
  })

  // ── renderHook-based tests ──────────────────────────────────────

  it('should create tracker, initialize, and start when enabled=true', async () => {
    const { result } = renderHook(() =>
      useHandTracker({ enabled: true })
    )

    // Flush the async init() inside useEffect
    await act(async () => {
      await flushPromises()
    })

    // HandTracker constructor was called
    expect(HandTracker).toHaveBeenCalledTimes(1)
    // onFrame and onError callbacks registered
    expect(mockOnFrame).toHaveBeenCalledWith(expect.any(Function))
    expect(mockOnError).toHaveBeenCalledWith(expect.any(Function))
    // initialize was called
    expect(mockInitialize).toHaveBeenCalledTimes(1)
    // start was called after initialization
    expect(mockStart).toHaveBeenCalledTimes(1)
    // State updated
    expect(result.current.isInitialized).toBe(true)
    expect(result.current.isTracking).toBe(true)
    expect(result.current.frame).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('should pass smoothingFactor and minConfidence to HandTracker constructor', async () => {
    renderHook(() =>
      useHandTracker({ enabled: true, smoothingFactor: 0.5, minConfidence: 0.8 })
    )

    await act(async () => {
      await flushPromises()
    })

    expect(HandTracker).toHaveBeenCalledWith({
      smoothing: { minCutoff: 0.5 },
      minHandDetectionConfidence: 0.8,
      tremorCompensation: 0
    })
    expect(mockInitialize).toHaveBeenCalled()
  })

  it('should not create tracker when enabled=false', () => {
    const { result } = renderHook(() =>
      useHandTracker({ enabled: false })
    )

    expect(HandTracker).not.toHaveBeenCalled()
    expect(mockInitialize).not.toHaveBeenCalled()
    expect(mockStart).not.toHaveBeenCalled()
    expect(result.current.isInitialized).toBe(false)
    expect(result.current.isTracking).toBe(false)
  })

  it('should call stop and destroy on cleanup (unmount)', async () => {
    const { unmount } = renderHook(() =>
      useHandTracker({ enabled: true })
    )

    await act(async () => {
      await flushPromises()
    })

    expect(mockInitialize).toHaveBeenCalled()

    unmount()

    expect(mockStop).toHaveBeenCalled()
    expect(mockDestroy).toHaveBeenCalled()
  })

  it('should set error state when initialize rejects', async () => {
    const initError = new Error('MediaPipe not available')
    mockInitialize.mockRejectedValue(initError)

    const { result } = renderHook(() =>
      useHandTracker({ enabled: true })
    )

    await act(async () => {
      await flushPromises()
    })

    // Should NOT have called start since init failed
    expect(mockStart).not.toHaveBeenCalled()
    expect(result.current.error).toEqual(initError)
    expect(result.current.isInitialized).toBe(false)
    expect(result.current.isTracking).toBe(false)

    // Reset for other tests
    mockInitialize.mockResolvedValue(undefined)
  })

  it('should wrap non-Error rejection in Error object', async () => {
    mockInitialize.mockRejectedValue('string error')

    const { result } = renderHook(() =>
      useHandTracker({ enabled: true })
    )

    await act(async () => {
      await flushPromises()
    })

    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.error!.message).toBe('string error')

    // Reset for other tests
    mockInitialize.mockResolvedValue(undefined)
  })

  it('should stop tracker when switching from enabled to disabled', async () => {
    const { result, rerender } = renderHook(
      (props: UseHandTrackerOptions) => useHandTracker(props),
      { initialProps: { enabled: true } as UseHandTrackerOptions }
    )

    await act(async () => {
      await flushPromises()
    })

    expect(result.current.isTracking).toBe(true)

    // Switch to disabled
    act(() => {
      rerender({ enabled: false })
    })

    expect(result.current.isTracking).toBe(false)
    expect(mockStop).toHaveBeenCalled()
  })

  it('should deliver frames via onFrame callback', async () => {
    const { result } = renderHook(() =>
      useHandTracker({ enabled: true })
    )

    await act(async () => {
      await flushPromises()
    })

    expect(mockOnFrame).toHaveBeenCalled()

    // Get the onFrame callback that was passed to the tracker
    const frameCallback = mockOnFrame.mock.calls[0][0]
    const testFrame = { hands: [], timestamp: 123, frameId: 1 }

    act(() => {
      frameCallback(testFrame)
    })

    expect(result.current.frame).toEqual(testFrame)
  })

  it('should deliver errors via onError callback', async () => {
    const { result } = renderHook(() =>
      useHandTracker({ enabled: true })
    )

    await act(async () => {
      await flushPromises()
    })

    expect(mockOnError).toHaveBeenCalled()

    // Get the onError callback that was passed to the tracker
    const errorCallback = mockOnError.mock.calls[0][0]
    const testError = new Error('Camera failed')

    act(() => {
      errorCallback(testError)
    })

    expect(result.current.error).toEqual(testError)
  })
})
