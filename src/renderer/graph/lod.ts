/**
 * Level of Detail (LOD) system for the knowledge graph.
 * Determines rendering quality based on camera distance and node count.
 */
import { Vector3, Camera, Frustum, Matrix4 } from 'three'

/** LOD rendering levels, from highest to lowest quality */
export type LODLevel = 'full' | 'medium' | 'low' | 'culled'

/** Configuration for LOD distance thresholds */
export interface LODThresholds {
  /** Camera distance below which full quality is used */
  fullDistance: number
  /** Camera distance below which medium quality is used */
  mediumDistance: number
  /** Camera distance below which low quality (points) is used */
  lowDistance: number
  /** Node count above which thresholds are scaled down (more aggressive LOD) */
  nodeCountScaleThreshold: number
  /** Scale factor applied to distances when node count exceeds threshold */
  nodeCountScaleFactor: number
}

export const LOD_THRESHOLDS: LODThresholds = {
  fullDistance: 50,
  mediumDistance: 150,
  lowDistance: 400,
  nodeCountScaleThreshold: 1000,
  nodeCountScaleFactor: 0.5
}

/**
 * Calculate the appropriate LOD level based on node count and camera distance.
 *
 * When the graph has many nodes, thresholds are scaled down so that
 * lower quality rendering kicks in sooner, maintaining frame rate.
 *
 * @param nodeCount - Total number of nodes in the graph
 * @param cameraDistance - Distance from the camera to the graph center
 * @param thresholds - Optional custom threshold configuration
 * @returns The LOD level to use for rendering
 */
export function calculateLOD(
  nodeCount: number,
  cameraDistance: number,
  thresholds: LODThresholds = LOD_THRESHOLDS
): LODLevel {
  // Scale thresholds based on node count for large graphs
  let scale = 1.0
  if (nodeCount > thresholds.nodeCountScaleThreshold) {
    const factor = nodeCount / thresholds.nodeCountScaleThreshold
    scale = Math.pow(thresholds.nodeCountScaleFactor, Math.log2(factor))
  }

  const fullDist = thresholds.fullDistance * scale
  const mediumDist = thresholds.mediumDistance * scale
  const lowDist = thresholds.lowDistance * scale

  if (cameraDistance <= fullDist) {
    return 'full'
  } else if (cameraDistance <= mediumDist) {
    return 'medium'
  } else if (cameraDistance <= lowDist) {
    return 'low'
  } else {
    return 'culled'
  }
}

// Reusable objects for frustum extraction to avoid per-call allocations
const _projScreenMatrix = new Matrix4()
const _frustum = new Frustum()

/**
 * Check whether a 3D position is within the camera's view frustum.
 *
 * @param position - The world-space position to test
 * @param camera - The Three.js camera
 * @param margin - Optional margin (in world units) to expand the frustum slightly
 * @returns true if the position is visible in the camera frustum
 */
export function isInFrustum(
  position: Vector3,
  camera: Camera,
  margin: number = 0
): boolean {
  _projScreenMatrix.multiplyMatrices(
    camera.projectionMatrix,
    camera.matrixWorldInverse
  )
  _frustum.setFromProjectionMatrix(_projScreenMatrix)

  if (margin <= 0) {
    return _frustum.containsPoint(position)
  }

  // With margin, check each plane with an expanded distance
  for (let i = 0; i < 6; i++) {
    const plane = _frustum.planes[i]
    if (plane.distanceToPoint(position) < -margin) {
      return false
    }
  }
  return true
}

/**
 * Get the geometry detail level (segments) for sphere rendering at a given LOD.
 *
 * @param level - The LOD level
 * @returns [widthSegments, heightSegments] for SphereGeometry
 */
export function getGeometryDetail(level: LODLevel): [number, number] {
  switch (level) {
    case 'full':
      return [16, 12]
    case 'medium':
      return [8, 6]
    case 'low':
      return [4, 3]
    case 'culled':
      return [0, 0]
  }
}
