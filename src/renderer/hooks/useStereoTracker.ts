/**
 * useStereoTracker — React hook that manages dual-camera stereo hand tracking.
 *
 * Automatically detects connected webcams and creates:
 *   - A primary HandTracker on the first/default camera.
 *   - A secondary HandTracker on the second camera (if available).
 *
 * When both cameras are active, frames are fused via the StereoFuser to
 * produce a combined frame with improved z-depth estimates.
 *
 * Supports hot-plug: listens for `devicechange` events to detect cameras
 * being connected or disconnected at runtime, and gracefully degrades
 * to single-camera mode when the secondary camera is lost.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { HandTracker } from '../tracker/HandTracker'
import { fuseFrames } from '../tracker/stereo-fuser'
import type { StereoConfig } from '../tracker/stereo-fuser'
import type { LandmarkFrame } from '@shared/protocol'

// ─── Public Interface ────────────────────────────────────────────

export interface StereoTrackerOptions {
  /** Whether stereo tracking should be active */
  enabled: boolean
  /** Smoothing factor (0-1). Higher = more smoothing. Maps to OneEuroFilter minCutoff. */
  smoothingFactor?: number
  /** Minimum detection confidence (0-1). */
  minConfidence?: number
  /** Stereo fusion configuration overrides */
  stereoConfig?: Partial<StereoConfig>
}

export interface StereoTrackerResult {
  /** The most recent frame from the primary camera */
  frame: LandmarkFrame | null
  /** The most recent frame from the secondary camera (null if no second camera) */
  secondaryFrame: LandmarkFrame | null
  /** The fused stereo frame (null if only one camera is active) */
  stereoFrame: LandmarkFrame | null
  /** Number of detected video input devices */
  cameraCount: number
  /** The most recent error (if any) */
  error: Error | null
  /** Whether the primary tracker has been initialized successfully */
  isInitialized: boolean
  /** Whether the primary tracker is actively processing frames */
  isTracking: boolean
}

// ─── Hook Implementation ─────────────────────────────────────────

export function useStereoTracker(options: StereoTrackerOptions): StereoTrackerResult {
  const [primaryFrame, setPrimaryFrame] = useState<LandmarkFrame | null>(null)
  const [secondaryFrame, setSecondaryFrame] = useState<LandmarkFrame | null>(null)
  const [stereoFrame, setStereoFrame] = useState<LandmarkFrame | null>(null)
  const [cameraCount, setCameraCount] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isTracking, setIsTracking] = useState(false)

  const primaryRef = useRef<HandTracker | null>(null)
  const secondaryRef = useRef<HandTracker | null>(null)
  const stereoConfigRef = useRef<Partial<StereoConfig>>(options.stereoConfig ?? {})
  const latestPrimaryRef = useRef<LandmarkFrame | null>(null)
  const latestSecondaryRef = useRef<LandmarkFrame | null>(null)

  // Keep stereoConfig ref in sync
  stereoConfigRef.current = options.stereoConfig ?? {}

  // Fuse frames whenever either camera produces a new frame
  const attemptFusion = useCallback(() => {
    const p = latestPrimaryRef.current
    const s = latestSecondaryRef.current
    if (p && s) {
      // Only fuse if the frames are reasonably close in time (within 50ms)
      const timeDelta = Math.abs(p.timestamp - s.timestamp)
      if (timeDelta < 50) {
        const fused = fuseFrames(p, s, stereoConfigRef.current)
        setStereoFrame(fused)
      } else {
        setStereoFrame(null)
      }
    } else {
      setStereoFrame(null)
    }
  }, [])

  // ── Main effect: initialize trackers based on available cameras ──
  useEffect(() => {
    if (!options.enabled) {
      if (primaryRef.current) {
        primaryRef.current.stop()
        setIsTracking(false)
      }
      if (secondaryRef.current) {
        secondaryRef.current.stop()
      }
      return
    }

    let cancelled = false
    let secondaryTracker: HandTracker | null = null

    const smoothingOpt = options.smoothingFactor !== undefined
      ? { minCutoff: options.smoothingFactor }
      : undefined

    const initTrackers = async (): Promise<void> => {
      try {
        const cameras = await HandTracker.enumerateVideoDevices()
        if (cancelled) return

        setCameraCount(cameras.length)

        if (cameras.length === 0) {
          setError(new Error('No video input devices found'))
          return
        }

        // ── Primary tracker (first/default camera) ──
        const primaryDeviceId = cameras[0]?.deviceId
        const primary = new HandTracker({
          smoothing: smoothingOpt,
          minHandDetectionConfidence: options.minConfidence,
          deviceId: primaryDeviceId || undefined
        })
        primaryRef.current = primary

        primary.onFrame((f) => {
          const tagged: LandmarkFrame = { ...f, cameraId: 'primary' }
          latestPrimaryRef.current = tagged
          setPrimaryFrame(tagged)
          attemptFusion()
        })
        primary.onError((e) => setError(e))

        await primary.initialize()
        if (cancelled) return

        setIsInitialized(true)
        primary.start()
        setIsTracking(true)

        // ── Secondary tracker (second camera, if available) ──
        if (cameras.length >= 2) {
          const secondaryDeviceId = cameras[1].deviceId
          secondaryTracker = new HandTracker({
            smoothing: smoothingOpt,
            minHandDetectionConfidence: options.minConfidence,
            deviceId: secondaryDeviceId
          })
          secondaryRef.current = secondaryTracker

          secondaryTracker.onFrame((f) => {
            const tagged: LandmarkFrame = { ...f, cameraId: 'secondary' }
            latestSecondaryRef.current = tagged
            setSecondaryFrame(tagged)
            attemptFusion()
          })
          secondaryTracker.onError((e) => {
            console.warn('[StereoTracker] Secondary camera error:', e.message)
            if (secondaryRef.current) {
              secondaryRef.current.stop()
              secondaryRef.current.destroy()
              secondaryRef.current = null
              secondaryTracker = null
              latestSecondaryRef.current = null
              setSecondaryFrame(null)
              setStereoFrame(null)
            }
          })

          try {
            await secondaryTracker.initialize()
            if (cancelled) return
            secondaryTracker.start()
          } catch (secErr) {
            console.warn(
              '[StereoTracker] Secondary camera failed to initialize:',
              secErr instanceof Error ? secErr.message : String(secErr)
            )
            secondaryTracker.destroy()
            secondaryTracker = null
            secondaryRef.current = null
          }
        }
      } catch (e) {
        if (cancelled) return
        setError(e instanceof Error ? e : new Error(String(e)))
      }
    }

    initTrackers()

    // ── Hot-plug detection ──
    const handleDeviceChange = async (): Promise<void> => {
      if (cancelled) return
      try {
        const cameras = await HandTracker.enumerateVideoDevices()
        if (cancelled) return
        setCameraCount(cameras.length)

        const hasSecondary = secondaryRef.current !== null

        if (cameras.length >= 2 && !hasSecondary) {
          const secondaryDeviceId = cameras[1].deviceId
          const newSecondary = new HandTracker({
            smoothing: smoothingOpt,
            minHandDetectionConfidence: options.minConfidence,
            deviceId: secondaryDeviceId
          })
          secondaryRef.current = newSecondary

          newSecondary.onFrame((f) => {
            const tagged: LandmarkFrame = { ...f, cameraId: 'secondary' }
            latestSecondaryRef.current = tagged
            setSecondaryFrame(tagged)
            attemptFusion()
          })
          newSecondary.onError((e) => {
            console.warn('[StereoTracker] Hot-plugged secondary camera error:', e.message)
            if (secondaryRef.current) {
              secondaryRef.current.stop()
              secondaryRef.current.destroy()
              secondaryRef.current = null
              latestSecondaryRef.current = null
              setSecondaryFrame(null)
              setStereoFrame(null)
            }
          })

          try {
            await newSecondary.initialize()
            if (cancelled) return
            newSecondary.start()
          } catch {
            newSecondary.destroy()
            secondaryRef.current = null
          }
        } else if (cameras.length < 2 && hasSecondary) {
          secondaryRef.current?.stop()
          secondaryRef.current?.destroy()
          secondaryRef.current = null
          latestSecondaryRef.current = null
          setSecondaryFrame(null)
          setStereoFrame(null)
        }
      } catch {
        // Enumeration failed — ignore
      }
    }

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange)

    // ── Cleanup ──
    return () => {
      cancelled = true
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange)

      if (primaryRef.current) {
        primaryRef.current.stop()
        primaryRef.current.destroy()
        primaryRef.current = null
      }
      if (secondaryRef.current) {
        secondaryRef.current.stop()
        secondaryRef.current.destroy()
        secondaryRef.current = null
      }

      latestPrimaryRef.current = null
      latestSecondaryRef.current = null
      setIsTracking(false)
      setIsInitialized(false)
    }
  }, [options.enabled, options.smoothingFactor, options.minConfidence, attemptFusion])

  return {
    frame: primaryFrame,
    secondaryFrame,
    stereoFrame,
    cameraCount,
    error,
    isInitialized,
    isTracking
  }
}
