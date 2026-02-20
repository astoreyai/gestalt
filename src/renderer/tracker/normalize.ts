/**
 * Landmark normalization utilities.
 *
 * Converts raw MediaPipe NormalizedLandmark data into the app's Landmark type,
 * mirroring the x-axis (webcam feed is horizontally flipped) and normalizing
 * z-depth relative to the wrist landmark.
 */

import type { Landmark } from '@shared/protocol'
import type { NormalizedLandmark } from '@mediapipe/tasks-vision'

/**
 * Convert raw MediaPipe landmarks to normalized [0,1] screen coordinates.
 *
 * - Mirrors x-axis so the output matches the user's perspective (webcam is mirrored).
 * - Clamps x and y to [0, 1].
 * - Normalizes z relative to the wrist (index 0) depth so wrist z = 0,
 *   and values closer to the camera are negative.
 *
 * @param rawLandmarks  The 21 NormalizedLandmark values from MediaPipe (already in [0,1] for x,y).
 * @param _imageWidth   Image width in pixels (reserved for future use).
 * @param _imageHeight  Image height in pixels (reserved for future use).
 * @returns Array of 21 Landmark objects in the app's coordinate system.
 */
export function normalizeLandmarks(
  rawLandmarks: NormalizedLandmark[],
  _imageWidth: number,
  _imageHeight: number
): Landmark[] {
  if (rawLandmarks.length === 0) {
    return []
  }

  const wristZ = rawLandmarks[0]?.z ?? 0

  // Pad to 21 landmarks if fewer received
  return Array.from({ length: 21 }, (_, i) => {
    const raw = rawLandmarks[i]
    if (!raw) return { x: 0.5, y: 0.5, z: 0 } // Center default
    return {
      x: clamp(1.0 - raw.x, 0, 1), // mirror x-axis
      y: clamp(raw.y, 0, 1),
      z: raw.z - wristZ // depth relative to wrist
    }
  })
}

/**
 * Clamp a number to the range [min, max].
 */
export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}
