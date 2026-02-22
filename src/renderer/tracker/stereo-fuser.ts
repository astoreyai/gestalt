/**
 * StereoFuser — Merges two LandmarkFrames from dual cameras into a single
 * frame with improved depth estimates.
 *
 * When two cameras are available, the disparity (difference in x-position)
 * between matched hand landmarks can be used to compute a more accurate
 * z-depth via triangulation. For a parallel stereo rig:
 *
 *   z = (baseline * focalLength) / disparity
 *
 * This module provides a simple fusion strategy:
 *   1. Match hands between frames by handedness.
 *   2. For matched hands, average x/y positions from both views.
 *   3. Use x-disparity to compute a refined z-depth.
 *   4. For unmatched hands, pass through from whichever frame detected them.
 */

import type { LandmarkFrame, Hand, Landmark } from '@shared/protocol'

// ─── Configuration ───────────────────────────────────────────────

export interface StereoConfig {
  /** Distance between cameras in meters (approximate). Default: 0.065 (~human IPD) */
  baselineDistance: number
  /** Angle of camera convergence in radians (0 = parallel). Default: 0 */
  convergenceAngle: number
  /**
   * Approximate focal length in normalized coordinates.
   * For a 640px-wide image with ~60deg FOV, focal length ~1.0 in normalized space.
   * Default: 1.0
   */
  focalLength: number
  /** Minimum disparity to avoid division by zero. Default: 0.005 */
  minDisparity: number
  /** Maximum plausible stereo depth in meters. Default: 5.0 */
  maxDepth: number
  /** Minimum plausible stereo depth in meters. Default: 0.1 */
  minDepth: number
}

export const DEFAULT_STEREO_CONFIG: StereoConfig = {
  baselineDistance: 0.065,
  convergenceAngle: 0,
  focalLength: 1.0,
  minDisparity: 0.005,
  maxDepth: 5.0,
  minDepth: 0.1
}

// ─── Fusion ──────────────────────────────────────────────────────

/**
 * Fuse two LandmarkFrames from a stereo camera pair into a single frame
 * with improved position and depth estimates.
 *
 * @param primary   Frame from the primary (left) camera
 * @param secondary Frame from the secondary (right) camera
 * @param config    Stereo configuration parameters
 * @returns A fused LandmarkFrame tagged with cameraId: 'stereo'
 */
export function fuseFrames(
  primary: LandmarkFrame,
  secondary: LandmarkFrame,
  config: Partial<StereoConfig> = {}
): LandmarkFrame {
  const cfg: StereoConfig = { ...DEFAULT_STEREO_CONFIG, ...config }

  const fusedHands: Hand[] = []
  const matchedSecondaryIndices = new Set<number>()

  // Match primary hands to secondary hands by handedness
  for (const primaryHand of primary.hands) {
    const secondaryIdx = secondary.hands.findIndex(
      (h, idx) => h.handedness === primaryHand.handedness && !matchedSecondaryIndices.has(idx)
    )

    if (secondaryIdx >= 0) {
      matchedSecondaryIndices.add(secondaryIdx)
      const secondaryHand = secondary.hands[secondaryIdx]
      fusedHands.push(fuseHands(primaryHand, secondaryHand, cfg))
    } else {
      // No match in secondary — pass through primary hand as-is
      fusedHands.push(primaryHand)
    }
  }

  // Include any secondary hands that were not matched
  for (let i = 0; i < secondary.hands.length; i++) {
    if (!matchedSecondaryIndices.has(i)) {
      fusedHands.push(secondary.hands[i])
    }
  }

  return {
    hands: fusedHands,
    timestamp: primary.timestamp,
    frameId: primary.frameId,
    cameraId: 'stereo'
  }
}

/**
 * Fuse two matched Hand objects from the stereo pair.
 * Averages x/y and computes stereo depth from disparity.
 */
// Pre-allocated pools for stereo fusion (avoids per-frame allocation)
const _fusedLandmarkPool: Landmark[][] = [[], []]
const _fusedWorldLandmarkPool: Landmark[][] = [[], []]
let _fusedPoolHandIdx = 0

function ensurePool(pool: Landmark[], count: number): void {
  while (pool.length < count) pool.push({ x: 0, y: 0, z: 0 })
}

function fuseHands(primary: Hand, secondary: Hand, cfg: StereoConfig): Hand {
  const landmarkCount = Math.min(primary.landmarks.length, secondary.landmarks.length)
  const worldCount = Math.min(primary.worldLandmarks.length, secondary.worldLandmarks.length)

  // Rotate between two pooled arrays (one per hand)
  const poolIdx = _fusedPoolHandIdx++ & 1
  const fusedLandmarks = _fusedLandmarkPool[poolIdx]
  const fusedWorldLandmarks = _fusedWorldLandmarkPool[poolIdx]
  ensurePool(fusedLandmarks, landmarkCount)
  ensurePool(fusedWorldLandmarks, worldCount)

  for (let i = 0; i < landmarkCount; i++) {
    const pLm = primary.landmarks[i]
    const sLm = secondary.landmarks[i]

    const avgX = (pLm.x + sLm.x) / 2
    const avgY = (pLm.y + sLm.y) / 2

    const disparity = Math.abs(pLm.x - sLm.x)
    const effectiveDisparity = Math.max(disparity, cfg.minDisparity)
    const stereoZ = (cfg.baselineDistance * cfg.focalLength) / effectiveDisparity

    const avgOriginalZ = (pLm.z + sLm.z) / 2

    // Outlier rejection: if stereo depth is outside plausible range, fall back to monocular z
    const stereoValid = stereoZ >= cfg.minDepth && stereoZ <= cfg.maxDepth
    const disparityConfidence = stereoValid ? Math.min(disparity / 0.05, 1.0) : 0
    const fusedZ = disparityConfidence * stereoZ + (1 - disparityConfidence) * avgOriginalZ

    const out = fusedLandmarks[i]
    out.x = avgX; out.y = avgY; out.z = fusedZ
  }

  for (let i = 0; i < worldCount; i++) {
    const pWl = primary.worldLandmarks[i]
    const sWl = secondary.worldLandmarks[i]
    const out = fusedWorldLandmarks[i]
    out.x = (pWl.x + sWl.x) / 2
    out.y = (pWl.y + sWl.y) / 2
    out.z = (pWl.z + sWl.z) / 2
  }

  return {
    handedness: primary.handedness,
    landmarks: fusedLandmarks.slice(0, landmarkCount),
    worldLandmarks: fusedWorldLandmarks.slice(0, worldCount),
    score: Math.max(primary.score, secondary.score)
  }
}
