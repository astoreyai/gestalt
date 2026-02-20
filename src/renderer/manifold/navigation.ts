/**
 * Camera navigation utilities for the manifold view.
 * Provides smooth camera transitions, cluster centroid calculation,
 * and spatial query functions.
 */

import type { EmbeddingData, EmbeddingPoint } from '@shared/protocol'
import type { ClusterInfo } from './types'
import { CLUSTER_COLORS } from './types'

/** Represents an in-progress camera animation */
export interface CameraAnimation {
  /** Starting camera position */
  fromPosition: { x: number; y: number; z: number }
  /** Target camera position */
  toPosition: { x: number; y: number; z: number }
  /** Starting look-at target */
  fromTarget: { x: number; y: number; z: number }
  /** Ending look-at target */
  toTarget: { x: number; y: number; z: number }
  /** Total animation duration in milliseconds */
  duration: number
  /** Timestamp when animation started */
  startTime: number
  /** Whether the animation has completed */
  completed: boolean
}

/**
 * Smooth easing function (ease-in-out cubic).
 * Maps t in [0,1] to a smooth S-curve.
 */
export function easeInOutCubic(t: number): number {
  if (t < 0) return 0
  if (t > 1) return 1
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/**
 * Smooth easing function (ease-out quadratic).
 * Decelerating motion.
 */
export function easeOutQuad(t: number): number {
  if (t < 0) return 0
  if (t > 1) return 1
  return 1 - (1 - t) * (1 - t)
}

/**
 * Linear interpolation between two 3D positions.
 */
export function lerpPosition(
  from: { x: number; y: number; z: number },
  to: { x: number; y: number; z: number },
  t: number
): { x: number; y: number; z: number } {
  const et = easeInOutCubic(t)
  return {
    x: from.x + (to.x - from.x) * et,
    y: from.y + (to.y - from.y) * et,
    z: from.z + (to.z - from.z) * et
  }
}

/**
 * Create a camera animation that smoothly transitions to view a cluster.
 * The camera will be positioned at a distance proportional to the cluster's
 * bounding sphere, looking at the centroid.
 */
export function lerpCameraToCluster(
  currentPosition: { x: number; y: number; z: number },
  currentTarget: { x: number; y: number; z: number },
  cluster: ClusterInfo,
  duration: number
): CameraAnimation {
  // Position camera at 2.5x the bounding sphere radius away from centroid
  const viewDistance = Math.max(cluster.boundingSphereRadius * 2.5, 5)
  // Keep similar viewing angle but target the cluster centroid
  const dx = currentPosition.x - currentTarget.x
  const dy = currentPosition.y - currentTarget.y
  const dz = currentPosition.z - currentTarget.z
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)

  let dirX: number, dirY: number, dirZ: number
  if (dist > 0.001) {
    dirX = dx / dist
    dirY = dy / dist
    dirZ = dz / dist
  } else {
    dirX = 0
    dirY = 0
    dirZ = 1
  }

  return {
    fromPosition: { ...currentPosition },
    toPosition: {
      x: cluster.centroid.x + dirX * viewDistance,
      y: cluster.centroid.y + dirY * viewDistance,
      z: cluster.centroid.z + dirZ * viewDistance
    },
    fromTarget: { ...currentTarget },
    toTarget: { ...cluster.centroid },
    duration,
    startTime: performance.now(),
    completed: false
  }
}

/**
 * Update a camera animation, returning the interpolated position and target.
 * Returns null if the animation is complete.
 */
export function updateAnimation(
  animation: CameraAnimation,
  currentTime: number
): { position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } } | null {
  const elapsed = currentTime - animation.startTime
  const t = Math.min(elapsed / animation.duration, 1)

  if (t >= 1) {
    animation.completed = true
    return {
      position: { ...animation.toPosition },
      target: { ...animation.toTarget }
    }
  }

  return {
    position: lerpPosition(animation.fromPosition, animation.toPosition, t),
    target: lerpPosition(animation.fromTarget, animation.toTarget, t)
  }
}

/**
 * Calculate cluster centroids and bounding spheres from embedding data.
 * Groups points by clusterId, computes mean position, and determines
 * the bounding sphere radius for each cluster.
 */
export function calculateClusterCentroids(data: EmbeddingData): ClusterInfo[] {
  if (!data.points || data.points.length === 0) return []

  // Group points by cluster ID
  const clusterMap = new Map<number, EmbeddingPoint[]>()
  for (const point of data.points) {
    const cid = point.clusterId ?? -1
    if (!clusterMap.has(cid)) {
      clusterMap.set(cid, [])
    }
    clusterMap.get(cid)!.push(point)
  }

  const clusters: ClusterInfo[] = []

  for (const [clusterId, points] of clusterMap) {
    // Compute centroid
    let cx = 0,
      cy = 0,
      cz = 0
    for (const p of points) {
      cx += p.position.x
      cy += p.position.y
      cz += p.position.z
    }
    cx /= points.length
    cy /= points.length
    cz /= points.length

    // Compute bounding sphere radius
    let maxDist = 0
    for (const p of points) {
      const dx = p.position.x - cx
      const dy = p.position.y - cy
      const dz = p.position.z - cz
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (dist > maxDist) maxDist = dist
    }

    // Look up label/color from embedding data cluster metadata
    const clusterMeta = data.clusters?.find((c) => c.id === clusterId)
    const colorIndex = clusterId >= 0 ? clusterId % CLUSTER_COLORS.length : 0

    clusters.push({
      id: clusterId,
      centroid: { x: cx, y: cy, z: cz },
      boundingSphereRadius: maxDist,
      pointCount: points.length,
      label: clusterMeta?.label ?? `Cluster ${clusterId}`,
      color: clusterMeta?.color ?? CLUSTER_COLORS[colorIndex]
    })
  }

  // Sort by cluster ID for deterministic ordering
  clusters.sort((a, b) => a.id - b.id)

  return clusters
}

/**
 * Find the nearest embedding point to a given 3D position.
 * Uses Euclidean distance. Returns null if points array is empty.
 */
export function findNearestPoint(
  position: { x: number; y: number; z: number },
  points: EmbeddingPoint[]
): EmbeddingPoint | null {
  if (!points || points.length === 0) return null

  let nearest = points[0]
  let minDist = distanceSquared(position, nearest.position)

  for (let i = 1; i < points.length; i++) {
    const d = distanceSquared(position, points[i].position)
    if (d < minDist) {
      minDist = d
      nearest = points[i]
    }
  }

  return nearest
}

/**
 * Squared Euclidean distance between two 3D points.
 * Avoids the sqrt for comparison purposes.
 */
export function distanceSquared(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number }
): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return dx * dx + dy * dy + dz * dz
}
