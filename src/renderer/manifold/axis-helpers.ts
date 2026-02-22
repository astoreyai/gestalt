/**
 * Axis label helpers — compute data bounds and generate tick values
 * for the AxisLabels R3F component.
 */

import type { EmbeddingPoint } from '@shared/protocol'

export interface Bounds {
  min: { x: number; y: number; z: number }
  max: { x: number; y: number; z: number }
}

/**
 * Compute axis-aligned bounding box from embedding points.
 */
export function computeDataBounds(points: EmbeddingPoint[]): Bounds {
  if (points.length === 0) {
    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 }
    }
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity

  for (const p of points) {
    const { x, y, z } = p.position
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }

  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ }
  }
}

/**
 * Generate evenly-spaced tick values between min and max.
 */
export function generateTickValues(min: number, max: number, count: number): number[] {
  if (count <= 0) return []
  if (min === max || count === 1) return [min]

  const step = (max - min) / (count - 1)
  const ticks: number[] = new Array(count)
  for (let i = 0; i < count; i++) {
    ticks[i] = min + step * i
  }
  // Ensure last tick is exactly max (avoid floating point drift)
  ticks[count - 1] = max
  return ticks
}
