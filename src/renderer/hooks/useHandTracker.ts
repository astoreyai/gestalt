/**
 * useHandTracker — React hook that manages HandTracker lifecycle.
 *
 * Wraps the HandTracker class (MediaPipe HandLandmarker) in a React-friendly
 * interface with automatic initialization, cleanup, and graceful error handling.
 * When tracking is disabled or fails, the app continues without tracking.
 */

import { useState, useEffect, useRef } from 'react'
import { HandTracker } from '../tracker/HandTracker'
import type { LandmarkFrame } from '@shared/protocol'

export interface UseHandTrackerOptions {
  /** Whether hand tracking should be active */
  enabled: boolean
  /** Smoothing factor (0-1). Higher = more smoothing. Maps to OneEuroFilter minCutoff. */
  smoothingFactor?: number
  /** Minimum detection confidence (0-1). */
  minConfidence?: number
}

export interface UseHandTrackerResult {
  /** The most recent landmark frame from the tracker */
  frame: LandmarkFrame | null
  /** The most recent error (if any) */
  error: Error | null
  /** Whether the tracker has been initialized successfully */
  isInitialized: boolean
  /** Whether the tracker is actively processing frames */
  isTracking: boolean
}

export function useHandTracker(options: UseHandTrackerOptions): UseHandTrackerResult {
  const [frame, setFrame] = useState<LandmarkFrame | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isTracking, setIsTracking] = useState(false)
  const trackerRef = useRef<HandTracker | null>(null)

  useEffect(() => {
    if (!options.enabled) {
      // Stop tracking if disabled
      if (trackerRef.current) {
        trackerRef.current.stop()
        setIsTracking(false)
      }
      return
    }

    const tracker = new HandTracker({
      smoothing: options.smoothingFactor !== undefined
        ? { minCutoff: options.smoothingFactor }
        : undefined,
      minHandDetectionConfidence: options.minConfidence
    })
    trackerRef.current = tracker

    tracker.onFrame((f) => setFrame(f))
    tracker.onError((e) => setError(e))

    let cancelled = false

    const init = async (): Promise<void> => {
      try {
        await tracker.initialize()
        // Guard against cleanup having run while we were awaiting
        if (cancelled) return
        setIsInitialized(true)
        tracker.start()
        setIsTracking(true)
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e : new Error(String(e)))
        // App continues without tracking -- graceful degradation
      }
    }

    init()

    return () => {
      cancelled = true
      tracker.stop()
      tracker.destroy()
      trackerRef.current = null
      setIsTracking(false)
      setIsInitialized(false)
    }
  }, [options.enabled, options.smoothingFactor, options.minConfidence])

  return { frame, error, isInitialized, isTracking }
}
