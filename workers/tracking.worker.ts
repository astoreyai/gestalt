/**
 * Web Worker for MediaPipe hand tracking with OffscreenCanvas.
 *
 * Receives video frames as ImageBitmap from the main thread, runs
 * hand landmark detection via MediaPipe HandLandmarker, and posts
 * back LandmarkFrame results.
 *
 * Message protocol:
 *   Main -> Worker:
 *     - { type: 'init', canvas: OffscreenCanvas, config?: TrackingWorkerConfig }
 *     - { type: 'frame', imageBitmap: ImageBitmap }
 *     - { type: 'config', ...TrackingWorkerConfig }
 *     - { type: 'stop' }
 *
 *   Worker -> Main:
 *     - { type: 'ready' }
 *     - { type: 'landmarks', frame: LandmarkFrame }
 *     - { type: 'error', message: string }
 *
 * Important: MediaPipe tasks-vision uses WebGL internally, which may not
 * be available in all Worker contexts. If initialization fails, the worker
 * posts an error message so the main thread can fall back to direct mode.
 */

import type { Hand, Handedness, LandmarkFrame, Landmark } from '../src/shared/protocol'

// ─── Message Types ───────────────────────────────────────────────

export interface TrackingWorkerConfig {
  numHands?: number
  minHandDetectionConfidence?: number
  minHandPresenceConfidence?: number
  minTrackingConfidence?: number
}

export type TrackingWorkerInMessage =
  | { type: 'init'; canvas: OffscreenCanvas; config?: TrackingWorkerConfig }
  | { type: 'frame'; imageBitmap: ImageBitmap }
  | { type: 'config'; numHands?: number; minHandDetectionConfidence?: number; minHandPresenceConfidence?: number; minTrackingConfidence?: number }
  | { type: 'stop' }

export type TrackingWorkerOutMessage =
  | { type: 'ready' }
  | { type: 'landmarks'; frame: LandmarkFrame }
  | { type: 'error'; message: string }

// ─── Configuration ───────────────────────────────────────────────

const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
const MODEL_ASSET_PATH =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'

const DEFAULT_CONFIG: Required<TrackingWorkerConfig> = {
  numHands: 2,
  minHandDetectionConfidence: 0.7,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
}

// ─── State ───────────────────────────────────────────────────────

// The handLandmarker type is imported dynamically so we use a loose type here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handLandmarker: any = null
let canvas: OffscreenCanvas | null = null
let ctx: OffscreenCanvasRenderingContext2D | null = null
let frameId = 0
let config: Required<TrackingWorkerConfig> = { ...DEFAULT_CONFIG }

// ─── Helpers ─────────────────────────────────────────────────────

function postResult(msg: TrackingWorkerOutMessage): void {
  self.postMessage(msg)
}

function postError(message: string): void {
  postResult({ type: 'error', message })
}

/**
 * Mirror x-axis and normalize z relative to wrist.
 * Mirrors the normalizeLandmarks logic from normalize.ts but kept
 * self-contained so the worker does not depend on renderer modules.
 */
function normalizeLandmarks(
  rawLandmarks: Array<{ x: number; y: number; z: number }>,
  _imageWidth: number,
  _imageHeight: number,
): Landmark[] {
  if (rawLandmarks.length === 0) return []

  const wristZ = rawLandmarks[0]?.z ?? 0

  return Array.from({ length: 21 }, (_, i) => {
    const raw = rawLandmarks[i]
    if (!raw) return { x: 0.5, y: 0.5, z: 0 }
    return {
      x: clamp(1.0 - raw.x, 0, 1),
      y: clamp(raw.y, 0, 1),
      z: raw.z - wristZ,
    }
  })
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

function parseHandedness(categories: Array<{ categoryName: string }>): Handedness {
  const name = categories?.[0]?.categoryName?.toLowerCase() ?? 'right'
  return name === 'left' ? 'left' : 'right'
}

// ─── Core Processing ─────────────────────────────────────────────

async function initializeMediaPipe(
  offscreenCanvas: OffscreenCanvas,
  initConfig?: TrackingWorkerConfig,
): Promise<void> {
  canvas = offscreenCanvas
  ctx = canvas.getContext('2d')

  if (initConfig) {
    config = {
      numHands: initConfig.numHands ?? DEFAULT_CONFIG.numHands,
      minHandDetectionConfidence:
        initConfig.minHandDetectionConfidence ?? DEFAULT_CONFIG.minHandDetectionConfidence,
      minHandPresenceConfidence:
        initConfig.minHandPresenceConfidence ?? DEFAULT_CONFIG.minHandPresenceConfidence,
      minTrackingConfidence:
        initConfig.minTrackingConfidence ?? DEFAULT_CONFIG.minTrackingConfidence,
    }
  }

  try {
    // Dynamic import to keep the WASM bundle lazy-loaded
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision')

    const vision = await FilesetResolver.forVisionTasks(WASM_CDN)

    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: MODEL_ASSET_PATH,
        // Use GPU if available in worker context, otherwise fall back to CPU
        delegate: 'GPU',
      },
      runningMode: 'IMAGE',
      numHands: config.numHands,
      minHandDetectionConfidence: config.minHandDetectionConfidence,
      minHandPresenceConfidence: config.minHandPresenceConfidence,
      minTrackingConfidence: config.minTrackingConfidence,
    })

    postResult({ type: 'ready' })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    postError(`MediaPipe initialization failed in worker: ${message}`)
  }
}

function processFrame(imageBitmap: ImageBitmap): void {
  if (!handLandmarker || !canvas || !ctx) {
    postError('Worker not initialized — call init first')
    return
  }

  // Draw the ImageBitmap onto the OffscreenCanvas so MediaPipe can read it
  canvas.width = imageBitmap.width
  canvas.height = imageBitmap.height
  ctx.drawImage(imageBitmap, 0, 0)

  // Close the ImageBitmap to free memory (it was transferred)
  imageBitmap.close()

  const timestampMs = performance.now()

  try {
    // Use detect() in IMAGE mode since we are processing individual frames
    const result = handLandmarker.detect(canvas)
    const frame = buildFrame(result, timestampMs, canvas.width, canvas.height)
    frameId++
    postResult({ type: 'landmarks', frame })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    postError(`Detection error (frame ${frameId}): ${message}`)
  }
}

function buildFrame(
  result: {
    landmarks: Array<Array<{ x: number; y: number; z: number }>>
    worldLandmarks: Array<Array<{ x: number; y: number; z: number }>>
    handedness: Array<Array<{ categoryName: string; score: number }>>
  },
  timestampMs: number,
  imageWidth: number,
  imageHeight: number,
): LandmarkFrame {
  const hands: Hand[] = []
  const numDetected = result.landmarks.length

  for (let i = 0; i < numDetected; i++) {
    const rawLandmarks = result.landmarks[i]
    const rawWorldLandmarks = result.worldLandmarks[i]
    const handedness = parseHandedness(result.handedness[i])
    const score = result.handedness[i]?.[0]?.score ?? 0

    const landmarks = normalizeLandmarks(rawLandmarks, imageWidth, imageHeight)

    const worldLandmarks: Landmark[] = new Array(rawWorldLandmarks.length)
    for (let j = 0; j < rawWorldLandmarks.length; j++) {
      const wl = rawWorldLandmarks[j]
      worldLandmarks[j] = { x: wl.x, y: wl.y, z: wl.z }
    }

    hands.push({ handedness, landmarks, worldLandmarks, score })
  }

  return {
    hands,
    timestamp: timestampMs,
    frameId,
  }
}

function teardown(): void {
  if (handLandmarker) {
    try {
      handLandmarker.close()
    } catch {
      // Best-effort cleanup
    }
    handLandmarker = null
  }
  canvas = null
  ctx = null
  frameId = 0
}

// ─── Message Handler ─────────────────────────────────────────────

self.onmessage = (event: MessageEvent<TrackingWorkerInMessage>) => {
  const data = event.data

  switch (data.type) {
    case 'init': {
      void initializeMediaPipe(data.canvas, data.config)
      break
    }

    case 'frame': {
      processFrame(data.imageBitmap)
      break
    }

    case 'config': {
      config = {
        numHands: data.numHands ?? config.numHands,
        minHandDetectionConfidence:
          data.minHandDetectionConfidence ?? config.minHandDetectionConfidence,
        minHandPresenceConfidence:
          data.minHandPresenceConfidence ?? config.minHandPresenceConfidence,
        minTrackingConfidence:
          data.minTrackingConfidence ?? config.minTrackingConfidence,
      }
      // Note: MediaPipe HandLandmarker config changes require re-initialization.
      // For now we just store the config for the next init cycle.
      break
    }

    case 'stop': {
      teardown()
      break
    }
  }
}
