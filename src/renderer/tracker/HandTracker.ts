/**
 * HandTracker — MediaPipe HandLandmarker wrapper for the Electron renderer.
 *
 * Responsibilities:
 *   1. Initialize HandLandmarker from the CDN WASM bundle.
 *   2. Open a webcam stream via getUserMedia.
 *   3. Run detection on every video frame using requestAnimationFrame.
 *   4. Convert results to `LandmarkFrame` and deliver them via a callback.
 *   5. Provide a clean start / stop / destroy lifecycle.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision'
import type { HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { Hand, Handedness, LandmarkFrame, Landmark } from '@shared/protocol'
import { normalizeLandmarks } from './normalize'
import { LandmarkSmoother, type OneEuroFilterConfig } from './filters'

// ─── Configuration ───────────────────────────────────────────────

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

export interface HandTrackerConfig {
  /** Maximum number of hands to detect (1 or 2). Default: 2 */
  numHands?: number
  /** Minimum confidence for initial hand detection. Default: 0.7 */
  minHandDetectionConfidence?: number
  /** Minimum confidence for hand presence (tracking). Default: 0.5 */
  minHandPresenceConfidence?: number
  /** Minimum confidence for landmark tracking. Default: 0.5 */
  minTrackingConfidence?: number
  /** One-Euro filter config for smoothing. Pass `false` to disable smoothing. */
  smoothing?: OneEuroFilterConfig | false
  /** getUserMedia video constraints override. */
  videoConstraints?: MediaStreamConstraints['video']
}

const DEFAULT_CONFIG: Required<
  Omit<HandTrackerConfig, 'smoothing' | 'videoConstraints'>
> = {
  numHands: 2,
  minHandDetectionConfidence: 0.7,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5
}

export type FrameCallback = (frame: LandmarkFrame) => void
export type ErrorCallback = (error: Error) => void

// ─── HandTracker Class ───────────────────────────────────────────

export class HandTracker {
  private _handLandmarker: HandLandmarker | null = null
  private _stream: MediaStream | null = null
  private _video: HTMLVideoElement | null = null
  private _animFrameId: number | null = null
  private _frameId = 0
  private _running = false
  private _destroyed = false
  private _lastVideoTime = -1

  private _smoothers: Map<number, LandmarkSmoother> = new Map()
  private _smoothingConfig: OneEuroFilterConfig | false

  private _errorCount = 0

  private _onFrame: FrameCallback | null = null
  private _onError: ErrorCallback | null = null

  private _config: Required<Omit<HandTrackerConfig, 'smoothing' | 'videoConstraints'>>
  private _videoConstraints: MediaStreamConstraints['video']

  constructor(config: HandTrackerConfig = {}) {
    this._config = {
      numHands: config.numHands ?? DEFAULT_CONFIG.numHands,
      minHandDetectionConfidence:
        config.minHandDetectionConfidence ?? DEFAULT_CONFIG.minHandDetectionConfidence,
      minHandPresenceConfidence:
        config.minHandPresenceConfidence ?? DEFAULT_CONFIG.minHandPresenceConfidence,
      minTrackingConfidence:
        config.minTrackingConfidence ?? DEFAULT_CONFIG.minTrackingConfidence
    }
    this._smoothingConfig = config.smoothing !== undefined ? config.smoothing : {}
    this._videoConstraints = config.videoConstraints ?? { width: 640, height: 480 }
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Register a callback to receive LandmarkFrame data for each processed frame. */
  onFrame(cb: FrameCallback): void {
    this._onFrame = cb
  }

  /** Register a callback for errors (camera permissions, model loading, etc.). */
  onError(cb: ErrorCallback): void {
    this._onError = cb
  }

  /** Whether the tracker loop is currently running. */
  get isRunning(): boolean {
    return this._running
  }

  /**
   * Initialize the MediaPipe model and open the webcam.
   * Must be called before `start()`.
   */
  async initialize(): Promise<void> {
    this._assertNotDestroyed()

    try {
      const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

      this._handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_ASSET_PATH,
          delegate: 'GPU'
        },
        runningMode: 'VIDEO',
        numHands: this._config.numHands,
        minHandDetectionConfidence: this._config.minHandDetectionConfidence,
        minHandPresenceConfidence: this._config.minHandPresenceConfidence,
        minTrackingConfidence: this._config.minTrackingConfidence
      })
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this._emitError(new Error(`Failed to load HandLandmarker model: ${error.message}`))
      throw error
    }

    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: this._videoConstraints,
        audio: false
      })

      this._video = document.createElement('video')
      this._video.srcObject = this._stream
      this._video.setAttribute('playsinline', 'true')
      this._video.muted = true

      await this._video.play()
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      this._emitError(new Error(`Camera access failed: ${error.message}`))
      throw error
    }
  }

  /**
   * Start the detection loop. Frames will be delivered via the `onFrame` callback.
   * `initialize()` must have been called first.
   */
  start(): void {
    this._assertNotDestroyed()

    if (!this._handLandmarker || !this._video) {
      throw new Error('HandTracker.initialize() must be called before start()')
    }

    if (this._running) return

    this._running = true
    this._lastVideoTime = -1
    this._animFrameId = requestAnimationFrame(this._loop)
  }

  /** Pause the detection loop. Can be resumed with `start()`. */
  stop(): void {
    this._running = false
    if (this._animFrameId !== null) {
      cancelAnimationFrame(this._animFrameId)
      this._animFrameId = null
    }
  }

  /** Release all resources. The tracker cannot be reused after this call. */
  destroy(): void {
    this.stop()

    if (this._stream) {
      for (const track of this._stream.getTracks()) {
        track.stop()
      }
      this._stream = null
    }

    if (this._video) {
      this._video.srcObject = null
      this._video = null
    }

    if (this._handLandmarker) {
      this._handLandmarker.close()
      this._handLandmarker = null
    }

    this._smoothers.clear()
    this._onFrame = null
    this._onError = null
    this._destroyed = true
  }

  // ── Private Helpers ─────────────────────────────────────────────

  private _assertNotDestroyed(): void {
    if (this._destroyed) {
      throw new Error('HandTracker has been destroyed and cannot be reused')
    }
  }

  private _emitError(err: Error): void {
    if (this._onError) {
      this._onError(err)
    }
  }

  private _loop = (): void => {
    if (!this._running) return

    this._animFrameId = requestAnimationFrame(this._loop)

    if (!this._video || !this._handLandmarker) return

    const videoTime = this._video.currentTime
    if (videoTime === this._lastVideoTime) return
    this._lastVideoTime = videoTime

    const timestampMs = performance.now()
    let result: HandLandmarkerResult

    try {
      result = this._handLandmarker.detectForVideo(this._video, timestampMs)
    } catch (err) {
      this._errorCount++
      if (this._errorCount <= 3 || this._errorCount % 100 === 0) {
        console.warn(
          `[HandTracker] Detection error (frame ${this._frameId}, total errors: ${this._errorCount}):`,
          err instanceof Error ? err.message : String(err)
        )
      }
      return
    }

    const frame = this._buildFrame(result, timestampMs)
    this._frameId++

    if (this._onFrame) {
      this._onFrame(frame)
    }
  }

  private _buildFrame(result: HandLandmarkerResult, timestampMs: number): LandmarkFrame {
    const hands: Hand[] = []
    const numDetected = result.landmarks.length
    const videoWidth = this._video?.videoWidth ?? 640
    const videoHeight = this._video?.videoHeight ?? 480
    const timestampSec = timestampMs / 1000

    for (let i = 0; i < numDetected; i++) {
      const rawLandmarks: NormalizedLandmark[] = result.landmarks[i]
      const rawWorldLandmarks = result.worldLandmarks[i]
      const handedness = this._parseHandedness(result.handedness[i])
      const score = result.handedness[i]?.[0]?.score ?? 0

      let landmarks: Landmark[] = normalizeLandmarks(rawLandmarks, videoWidth, videoHeight)

      // Apply smoothing if enabled
      if (this._smoothingConfig !== false) {
        const smoother = this._getOrCreateSmoother(i)
        landmarks = smoother.smooth(landmarks, timestampSec)
      }

      const worldLandmarks: Landmark[] = rawWorldLandmarks.map((wl) => ({
        x: wl.x,
        y: wl.y,
        z: wl.z
      }))

      hands.push({
        handedness,
        landmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
        worldLandmarks: worldLandmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
        score
      })
    }

    // Evict smoothers for hands that have disappeared
    for (const key of this._smoothers.keys()) {
      if (key >= numDetected) {
        this._smoothers.get(key)?.reset()
        this._smoothers.delete(key)
      }
    }

    return {
      hands,
      timestamp: timestampMs,
      frameId: this._frameId
    }
  }

  private _parseHandedness(categories: { categoryName: string }[]): Handedness {
    const name = categories?.[0]?.categoryName?.toLowerCase() ?? 'right'
    // MediaPipe reports the hand label from the camera's perspective, but
    // since we mirror x, the label already matches the user's perspective.
    return name === 'left' ? 'left' : 'right'
  }

  private _getOrCreateSmoother(index: number): LandmarkSmoother {
    let smoother = this._smoothers.get(index)
    if (!smoother) {
      smoother = new LandmarkSmoother(
        this._smoothingConfig as OneEuroFilterConfig
      )
      this._smoothers.set(index, smoother)
    }
    return smoother
  }
}
