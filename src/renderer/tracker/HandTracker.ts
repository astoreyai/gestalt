/**
 * HandTracker — MediaPipe HandLandmarker wrapper for the Electron renderer.
 *
 * Responsibilities:
 *   1. Initialize HandLandmarker from the CDN WASM bundle.
 *   2. Open a webcam stream via getUserMedia.
 *   3. Run detection on every video frame using requestAnimationFrame.
 *   4. Convert results to `LandmarkFrame` and deliver them via a callback.
 *   5. Provide a clean start / stop / destroy lifecycle.
 *
 * Supports two modes:
 *   - **Direct mode** (default): MediaPipe runs on the main renderer thread.
 *   - **Worker mode** (`useWorker: true`): MediaPipe runs in a Web Worker with
 *     OffscreenCanvas. Falls back to direct mode if OffscreenCanvas is unavailable
 *     or if the worker fails to initialize (e.g. WebGL not available in worker).
 */

// P2-50: MediaPipe is now lazy-loaded inside initialize() to avoid
// bundling the large WASM assets at startup.
import type { HandLandmarker as HandLandmarkerType, HandLandmarkerResult, NormalizedLandmark } from '@mediapipe/tasks-vision'
import type { Hand, Handedness, LandmarkFrame, Landmark } from '@shared/protocol'
import type { TrackingWorkerOutMessage } from '../../../workers/tracking.worker'
import { normalizeLandmarks } from './normalize'
import { LandmarkSmoother, type OneEuroFilterConfig } from './filters'

// ─── Configuration ───────────────────────────────────────────────

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
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
  /**
   * Whether to run MediaPipe hand detection in a Web Worker with OffscreenCanvas.
   * Falls back to direct mode if OffscreenCanvas is not available or the worker
   * fails to initialize (e.g. WebGL not supported in workers).
   * Default: false
   */
  useWorker?: boolean
}

const DEFAULT_CONFIG: Required<
  Omit<HandTrackerConfig, 'smoothing' | 'videoConstraints' | 'useWorker'>
> = {
  numHands: 2,
  minHandDetectionConfidence: 0.7,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5
}

export type FrameCallback = (frame: LandmarkFrame) => void
export type ErrorCallback = (error: Error) => void

// ─── OffscreenCanvas Support Detection ──────────────────────────

/** Check whether OffscreenCanvas is supported in this environment. */
export function supportsOffscreenCanvas(): boolean {
  return typeof OffscreenCanvas !== 'undefined'
}

// ─── HandTracker Class ───────────────────────────────────────────

export class HandTracker {
  private _handLandmarker: HandLandmarkerType | null = null
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

  private _config: Required<Omit<HandTrackerConfig, 'smoothing' | 'videoConstraints' | 'useWorker'>>
  private _videoConstraints: MediaStreamConstraints['video']

  // ── Worker Mode State ─────────────────────────────────────────
  private _useWorker: boolean
  private _worker: Worker | null = null
  private _workerCanvas: OffscreenCanvas | null = null
  /** Tracks whether the worker has sent a 'ready' message. */
  private _workerReady = false
  /** Whether the worker failed to initialize and we fell back to direct mode. */
  private _workerFallback = false

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
    this._useWorker = config.useWorker ?? false
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

  /** Whether the tracker is operating in worker mode. */
  get isWorkerMode(): boolean {
    return this._useWorker && this._worker !== null && !this._workerFallback
  }

  /**
   * Initialize the MediaPipe model and open the webcam.
   * Must be called before `start()`.
   *
   * In worker mode, creates a Web Worker and sends the OffscreenCanvas
   * for MediaPipe initialization. Falls back to direct mode on failure.
   */
  async initialize(): Promise<void> {
    this._assertNotDestroyed()

    // ── Try Worker Mode ───────────────────────────────────────────
    if (this._useWorker && supportsOffscreenCanvas()) {
      const workerReady = await this._initializeWorker()
      if (workerReady) {
        // Worker is ready; still need camera access for frame capture
        await this._initializeCamera()
        return
      }
      // Worker failed to initialize — fall through to direct mode
      this._workerFallback = true
      console.warn('[HandTracker] Worker initialization failed, falling back to direct mode')
    } else if (this._useWorker) {
      this._workerFallback = true
      console.warn('[HandTracker] OffscreenCanvas not supported, falling back to direct mode')
    }

    // ── Direct Mode ───────────────────────────────────────────────
    await this._initializeDirectMode()
  }

  /**
   * Start the detection loop. Frames will be delivered via the `onFrame` callback.
   * `initialize()` must have been called first.
   */
  start(): void {
    this._assertNotDestroyed()

    if (this.isWorkerMode) {
      if (!this._video) {
        throw new Error('HandTracker.initialize() must be called before start()')
      }
      if (this._running) return
      this._running = true
      this._lastVideoTime = -1
      this._animFrameId = requestAnimationFrame(this._workerLoop)
      return
    }

    // Direct mode
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

    // Clean up worker
    if (this._worker) {
      this._worker.postMessage({ type: 'stop' })
      this._worker.terminate()
      this._worker = null
    }
    this._workerCanvas = null
    this._workerReady = false

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

  // ── Private: Worker Mode ──────────────────────────────────────

  /**
   * Attempt to create and initialize the tracking Web Worker.
   * Returns true if the worker sent 'ready', false on failure.
   */
  private async _initializeWorker(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      try {
        const worker = new Worker(
          new URL('../../../workers/tracking.worker.ts', import.meta.url)
        )

        const canvas = new OffscreenCanvas(
          typeof this._videoConstraints === 'object' && this._videoConstraints !== null && 'width' in this._videoConstraints
            ? (this._videoConstraints.width as number) || 640
            : 640,
          typeof this._videoConstraints === 'object' && this._videoConstraints !== null && 'height' in this._videoConstraints
            ? (this._videoConstraints.height as number) || 480
            : 480
        )

        // Set up a one-time listener for the ready/error response
        const timeout = setTimeout(() => {
          worker.terminate()
          resolve(false)
        }, 10_000) // 10s timeout for model loading

        worker.onmessage = (event: MessageEvent<TrackingWorkerOutMessage>) => {
          const data = event.data

          if (data.type === 'ready') {
            clearTimeout(timeout)
            this._worker = worker
            this._workerCanvas = canvas
            this._workerReady = true

            // Re-attach the persistent message handler
            worker.onmessage = this._onWorkerMessage

            resolve(true)
            return
          }

          if (data.type === 'error') {
            clearTimeout(timeout)
            worker.terminate()
            resolve(false)
            return
          }
        }

        worker.onerror = () => {
          clearTimeout(timeout)
          worker.terminate()
          resolve(false)
        }

        // Transfer the canvas to the worker
        worker.postMessage(
          {
            type: 'init',
            canvas,
            config: {
              numHands: this._config.numHands,
              minHandDetectionConfidence: this._config.minHandDetectionConfidence,
              minHandPresenceConfidence: this._config.minHandPresenceConfidence,
              minTrackingConfidence: this._config.minTrackingConfidence
            }
          },
          [canvas]
        )
      } catch {
        resolve(false)
      }
    })
  }

  /** Handle messages from the tracking worker during normal operation. */
  private _onWorkerMessage = (event: MessageEvent<TrackingWorkerOutMessage>): void => {
    const data = event.data

    switch (data.type) {
      case 'landmarks': {
        if (this._onFrame) {
          this._onFrame(data.frame)
        }
        break
      }
      case 'error': {
        this._emitError(new Error(`[Worker] ${data.message}`))
        break
      }
    }
  }

  /**
   * rAF loop for worker mode: captures frames from the video element
   * as ImageBitmap and sends them to the worker for processing.
   */
  private _workerLoop = (): void => {
    if (!this._running) return

    this._animFrameId = requestAnimationFrame(this._workerLoop)

    if (!this._video || !this._worker || !this._workerReady) return

    const videoTime = this._video.currentTime
    if (videoTime === this._lastVideoTime) return
    this._lastVideoTime = videoTime

    // Capture the current video frame as an ImageBitmap and transfer it
    createImageBitmap(this._video)
      .then((bitmap) => {
        if (!this._running || !this._worker) {
          bitmap.close()
          return
        }
        this._worker.postMessage(
          { type: 'frame', imageBitmap: bitmap },
          [bitmap]
        )
      })
      .catch((err) => {
        this._errorCount++
        if (this._errorCount <= 3 || this._errorCount % 100 === 0) {
          console.warn(
            `[HandTracker] ImageBitmap capture error (total: ${this._errorCount}):`,
            err instanceof Error ? err.message : String(err)
          )
        }
      })
  }

  // ── Private: Direct Mode ──────────────────────────────────────

  private async _initializeDirectMode(): Promise<void> {
    try {
      // P2-50: Dynamic import so MediaPipe WASM is not bundled eagerly
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')

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

    await this._initializeCamera()
  }

  private async _initializeCamera(): Promise<void> {
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

      // P2-47: Build worldLandmarks array directly without intermediate map.
      // rawWorldLandmarks already have {x, y, z} shape; just copy the values.
      const worldLandmarks: Landmark[] = new Array(rawWorldLandmarks.length)
      for (let j = 0; j < rawWorldLandmarks.length; j++) {
        const wl = rawWorldLandmarks[j]
        worldLandmarks[j] = { x: wl.x, y: wl.y, z: wl.z }
      }

      // P2-47: Use smoothed landmarks directly -- they are already in the right
      // {x, y, z} format from smooth(), so no need to re-map them.
      hands.push({
        handedness,
        landmarks,
        worldLandmarks,
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
