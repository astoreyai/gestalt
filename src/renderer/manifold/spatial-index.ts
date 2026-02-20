/**
 * Grid-based spatial index for O(log n) nearest-neighbour lookups in 3D.
 * Used by PointCloud to accelerate hover/raycast hit testing.
 */

export interface SpatialPoint {
  index: number
  x: number
  y: number
  z: number
}

export class SpatialGrid {
  private cells: Map<string, SpatialPoint[]> = new Map()
  private cellSize: number

  constructor(points: SpatialPoint[], cellSize?: number) {
    this.cellSize = cellSize ?? this.computeCellSize(points)
    this.build(points)
  }

  // ── Private helpers ─────────────────────────────────────────────

  private computeCellSize(points: SpatialPoint[]): number {
    if (points.length < 2) return 1
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    let minZ = Infinity
    let maxZ = -Infinity
    for (const p of points) {
      if (p.x < minX) minX = p.x
      if (p.x > maxX) maxX = p.x
      if (p.y < minY) minY = p.y
      if (p.y > maxY) maxY = p.y
      if (p.z < minZ) minZ = p.z
      if (p.z > maxZ) maxZ = p.z
    }
    const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
    return Math.max(0.1, extent / Math.cbrt(points.length))
  }

  private cellKey(x: number, y: number, z: number): string {
    return `${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)},${Math.floor(z / this.cellSize)}`
  }

  private build(points: SpatialPoint[]): void {
    for (const p of points) {
      const key = this.cellKey(p.x, p.y, p.z)
      let cell = this.cells.get(key)
      if (!cell) {
        cell = []
        this.cells.set(key, cell)
      }
      cell.push(p)
    }
  }

  // ── Public API ──────────────────────────────────────────────────

  /** Find the nearest point to a query position within maxDistance */
  findNearest(
    x: number,
    y: number,
    z: number,
    maxDistance: number
  ): SpatialPoint | null {
    const r = Math.ceil(maxDistance / this.cellSize)
    const cx = Math.floor(x / this.cellSize)
    const cy = Math.floor(y / this.cellSize)
    const cz = Math.floor(z / this.cellSize)

    let best: SpatialPoint | null = null
    let bestDist = maxDistance * maxDistance

    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`
          const cell = this.cells.get(key)
          if (!cell) continue
          for (const p of cell) {
            const d = (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2
            if (d < bestDist) {
              bestDist = d
              best = p
            }
          }
        }
      }
    }

    return best
  }

  /** Get the number of cells */
  get cellCount(): number {
    return this.cells.size
  }

  /** Get total indexed points */
  get pointCount(): number {
    let count = 0
    for (const cell of this.cells.values()) count += cell.length
    return count
  }
}
