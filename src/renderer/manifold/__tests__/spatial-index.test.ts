/**
 * Tests for the SpatialGrid spatial index.
 */
import { describe, it, expect } from 'vitest'
import { SpatialGrid, type SpatialPoint } from '../spatial-index'

describe('SpatialGrid', () => {
  it('should index all points', () => {
    const points: SpatialPoint[] = [
      { index: 0, x: 0, y: 0, z: 0 },
      { index: 1, x: 5, y: 5, z: 5 },
      { index: 2, x: -3, y: 2, z: 1 }
    ]
    const grid = new SpatialGrid(points)
    expect(grid.pointCount).toBe(3)
  })

  it('should find nearest point', () => {
    const points: SpatialPoint[] = [
      { index: 0, x: 0, y: 0, z: 0 },
      { index: 1, x: 10, y: 10, z: 10 },
      { index: 2, x: 1, y: 1, z: 1 }
    ]
    const grid = new SpatialGrid(points)
    const nearest = grid.findNearest(0.5, 0.5, 0.5, 50)
    expect(nearest).not.toBeNull()
    expect(nearest!.index).toBe(0) // (0,0,0) is closest to (0.5,0.5,0.5)
  })

  it('should return null when no point within maxDistance', () => {
    const points: SpatialPoint[] = [
      { index: 0, x: 100, y: 100, z: 100 }
    ]
    const grid = new SpatialGrid(points)
    const nearest = grid.findNearest(0, 0, 0, 5)
    expect(nearest).toBeNull()
  })

  it('should handle single point', () => {
    const points: SpatialPoint[] = [
      { index: 0, x: 3, y: 4, z: 5 }
    ]
    const grid = new SpatialGrid(points)
    expect(grid.pointCount).toBe(1)
    expect(grid.cellCount).toBe(1)

    const nearest = grid.findNearest(3, 4, 5, 1)
    expect(nearest).not.toBeNull()
    expect(nearest!.index).toBe(0)
  })

  it('should handle 10K points efficiently', () => {
    const points: SpatialPoint[] = Array.from({ length: 10000 }, (_, i) => ({
      index: i,
      x: (Math.random() - 0.5) * 200,
      y: (Math.random() - 0.5) * 200,
      z: (Math.random() - 0.5) * 200
    }))
    const grid = new SpatialGrid(points)
    expect(grid.pointCount).toBe(10000)

    // Time a batch of lookups to confirm it is not pathologically slow
    const start = performance.now()
    for (let i = 0; i < 1000; i++) {
      grid.findNearest(
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        (Math.random() - 0.5) * 200,
        20
      )
    }
    const elapsed = performance.now() - start
    // 1000 lookups over 10K indexed points should complete in well under 1 second
    expect(elapsed).toBeLessThan(1000)
  })

  it('should auto-compute cell size from point spread', () => {
    const points: SpatialPoint[] = [
      { index: 0, x: 0, y: 0, z: 0 },
      { index: 1, x: 100, y: 0, z: 0 },
      { index: 2, x: 0, y: 100, z: 0 },
      { index: 3, x: 0, y: 0, z: 100 },
      { index: 4, x: 50, y: 50, z: 50 },
      { index: 5, x: 25, y: 25, z: 25 },
      { index: 6, x: 75, y: 75, z: 75 },
      { index: 7, x: 10, y: 90, z: 50 }
    ]
    const grid = new SpatialGrid(points)
    // All 8 points should be indexed
    expect(grid.pointCount).toBe(8)
    // With a spread of 100 and 8 points, cell size = 100/cbrt(8) = 100/2 = 50
    // So we'd expect a small number of cells (not 1 and not 8)
    expect(grid.cellCount).toBeGreaterThan(1)
    expect(grid.cellCount).toBeLessThan(points.length + 1)
  })

  it('should correctly find nearest among clustered points', () => {
    // Two clusters: one near origin, one far away
    const points: SpatialPoint[] = [
      { index: 0, x: 0, y: 0, z: 0 },
      { index: 1, x: 0.1, y: 0.1, z: 0.1 },
      { index: 2, x: 0.2, y: 0, z: 0 },
      { index: 3, x: 50, y: 50, z: 50 },
      { index: 4, x: 50.1, y: 50.1, z: 50.1 }
    ]
    const grid = new SpatialGrid(points)

    // Query near origin
    const nearOrigin = grid.findNearest(0.05, 0.05, 0.05, 10)
    expect(nearOrigin).not.toBeNull()
    expect(nearOrigin!.index).toBe(0) // (0,0,0) is closest to (0.05,0.05,0.05)

    // Query near far cluster
    const nearFar = grid.findNearest(50, 50, 50, 10)
    expect(nearFar).not.toBeNull()
    expect(nearFar!.index).toBe(3)
  })

  it('should support explicit cell size', () => {
    const points: SpatialPoint[] = [
      { index: 0, x: 0, y: 0, z: 0 },
      { index: 1, x: 1, y: 1, z: 1 }
    ]
    const grid = new SpatialGrid(points, 0.5)
    // With cell size 0.5 and points at (0,0,0) and (1,1,1), they should
    // be in different cells
    expect(grid.cellCount).toBe(2)
    expect(grid.pointCount).toBe(2)
  })
})
