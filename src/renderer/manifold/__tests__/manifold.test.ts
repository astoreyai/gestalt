/**
 * Tests for the manifold module: generators, navigation utilities, and types.
 * Tests pure logic only (no R3F rendering).
 */

import { describe, it, expect } from 'vitest'
import {
  generateGaussianClusters,
  generateSpiralManifold,
  generateSwissRoll,
  SeededRandom
} from '../generators'
import {
  calculateClusterCentroids,
  findNearestPoint,
  lerpCameraToCluster,
  updateAnimation,
  easeInOutCubic,
  easeOutQuad,
  lerpPosition,
  distanceSquared
} from '../navigation'
import { CLUSTER_COLORS } from '../types'
import type { EmbeddingData, EmbeddingPoint } from '@shared/protocol'
import type { ClusterInfo } from '../types'

// ─── SeededRandom ─────────────────────────────────────────────────

describe('SeededRandom', () => {
  it('produces deterministic output for the same seed', () => {
    const rng1 = new SeededRandom(42)
    const rng2 = new SeededRandom(42)
    const vals1 = Array.from({ length: 100 }, () => rng1.next())
    const vals2 = Array.from({ length: 100 }, () => rng2.next())
    expect(vals1).toEqual(vals2)
  })

  it('produces values in [0, 1)', () => {
    const rng = new SeededRandom(123)
    for (let i = 0; i < 1000; i++) {
      const v = rng.next()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })

  it('produces different sequences for different seeds', () => {
    const rng1 = new SeededRandom(1)
    const rng2 = new SeededRandom(2)
    const vals1 = Array.from({ length: 10 }, () => rng1.next())
    const vals2 = Array.from({ length: 10 }, () => rng2.next())
    expect(vals1).not.toEqual(vals2)
  })

  it('nextGaussian produces values centered near zero', () => {
    const rng = new SeededRandom(42)
    const values = Array.from({ length: 5000 }, () => rng.nextGaussian())
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    expect(Math.abs(mean)).toBeLessThan(0.1) // Mean should be ~0
  })
})

// ─── Generators ───────────────────────────────────────────────────

describe('generateGaussianClusters', () => {
  it('produces the correct number of points', () => {
    const data = generateGaussianClusters({
      numClusters: 3,
      pointsPerCluster: 100,
      spread: 2.0
    })
    expect(data.points).toHaveLength(300)
  })

  it('assigns correct cluster IDs', () => {
    const data = generateGaussianClusters({
      numClusters: 4,
      pointsPerCluster: 50,
      spread: 1.0
    })
    const clusterIds = new Set(data.points.map((p) => p.clusterId))
    expect(clusterIds).toEqual(new Set([0, 1, 2, 3]))
  })

  it('creates cluster metadata', () => {
    const data = generateGaussianClusters({
      numClusters: 3,
      pointsPerCluster: 10,
      spread: 1.0
    })
    expect(data.clusters).toHaveLength(3)
    expect(data.clusters![0]).toHaveProperty('id', 0)
    expect(data.clusters![0]).toHaveProperty('label')
    expect(data.clusters![0]).toHaveProperty('color')
  })

  it('produces valid EmbeddingPoint structure', () => {
    const data = generateGaussianClusters({
      numClusters: 2,
      pointsPerCluster: 5,
      spread: 1.0
    })
    for (const point of data.points) {
      expect(point).toHaveProperty('id')
      expect(point).toHaveProperty('position')
      expect(point.position).toHaveProperty('x')
      expect(point.position).toHaveProperty('y')
      expect(point.position).toHaveProperty('z')
      expect(typeof point.position.x).toBe('number')
      expect(typeof point.position.y).toBe('number')
      expect(typeof point.position.z).toBe('number')
      expect(point).toHaveProperty('clusterId')
      expect(typeof point.clusterId).toBe('number')
    }
  })

  it('is reproducible with same seed', () => {
    const a = generateGaussianClusters({
      numClusters: 3,
      pointsPerCluster: 20,
      spread: 1.0,
      seed: 99
    })
    const b = generateGaussianClusters({
      numClusters: 3,
      pointsPerCluster: 20,
      spread: 1.0,
      seed: 99
    })
    expect(a.points).toEqual(b.points)
  })

  it('unique IDs for all points', () => {
    const data = generateGaussianClusters({
      numClusters: 5,
      pointsPerCluster: 50,
      spread: 1.0
    })
    const ids = data.points.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('includes metadata on the dataset', () => {
    const data = generateGaussianClusters({
      numClusters: 2,
      pointsPerCluster: 10,
      spread: 1.0
    })
    expect(data.metadata).toBeDefined()
    expect(data.metadata!.generator).toBe('gaussianClusters')
  })
})

describe('generateSpiralManifold', () => {
  it('produces the correct number of points', () => {
    const data = generateSpiralManifold(200)
    expect(data.points).toHaveLength(200)
  })

  it('assigns cluster IDs to three segments', () => {
    const data = generateSpiralManifold(300)
    const clusterIds = new Set(data.points.map((p) => p.clusterId))
    expect(clusterIds).toEqual(new Set([0, 1, 2]))
  })

  it('has valid positions', () => {
    const data = generateSpiralManifold(50)
    for (const point of data.points) {
      expect(Number.isFinite(point.position.x)).toBe(true)
      expect(Number.isFinite(point.position.y)).toBe(true)
      expect(Number.isFinite(point.position.z)).toBe(true)
    }
  })

  it('is reproducible', () => {
    const a = generateSpiralManifold(100, 77)
    const b = generateSpiralManifold(100, 77)
    expect(a.points).toEqual(b.points)
  })

  it('produces different data with different seeds', () => {
    const a = generateSpiralManifold(100, 1)
    const b = generateSpiralManifold(100, 2)
    expect(a.points).not.toEqual(b.points)
  })
})

describe('generateSwissRoll', () => {
  it('produces the correct number of points', () => {
    const data = generateSwissRoll(500)
    expect(data.points).toHaveLength(500)
  })

  it('assigns cluster IDs', () => {
    const data = generateSwissRoll(1000)
    const clusterIds = new Set(data.points.map((p) => p.clusterId))
    // Should have up to 3 clusters (some seeds may not produce all 3)
    expect(clusterIds.size).toBeGreaterThanOrEqual(1)
    expect(clusterIds.size).toBeLessThanOrEqual(3)
  })

  it('has valid positions', () => {
    const data = generateSwissRoll(100)
    for (const point of data.points) {
      expect(Number.isFinite(point.position.x)).toBe(true)
      expect(Number.isFinite(point.position.y)).toBe(true)
      expect(Number.isFinite(point.position.z)).toBe(true)
    }
  })

  it('has unique IDs', () => {
    const data = generateSwissRoll(200)
    const ids = data.points.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('is reproducible', () => {
    const a = generateSwissRoll(100, 55)
    const b = generateSwissRoll(100, 55)
    expect(a.points).toEqual(b.points)
  })

  it('includes cluster metadata', () => {
    const data = generateSwissRoll(100)
    expect(data.clusters).toBeDefined()
    expect(data.clusters!.length).toBeGreaterThan(0)
  })
})

// ─── CLUSTER_COLORS ───────────────────────────────────────────────

describe('CLUSTER_COLORS', () => {
  it('has 10 colors', () => {
    expect(CLUSTER_COLORS).toHaveLength(10)
  })

  it('all are valid hex colors', () => {
    for (const color of CLUSTER_COLORS) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })
})

// ─── Navigation: calculateClusterCentroids ────────────────────────

describe('calculateClusterCentroids', () => {
  it('returns empty array for empty data', () => {
    const data: EmbeddingData = { points: [] }
    const clusters = calculateClusterCentroids(data)
    expect(clusters).toEqual([])
  })

  it('calculates centroid for a single cluster', () => {
    const data: EmbeddingData = {
      points: [
        { id: 'a', position: { x: 0, y: 0, z: 0 }, clusterId: 0 },
        { id: 'b', position: { x: 2, y: 0, z: 0 }, clusterId: 0 },
        { id: 'c', position: { x: 0, y: 2, z: 0 }, clusterId: 0 }
      ]
    }
    const clusters = calculateClusterCentroids(data)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].centroid.x).toBeCloseTo(2 / 3, 5)
    expect(clusters[0].centroid.y).toBeCloseTo(2 / 3, 5)
    expect(clusters[0].centroid.z).toBeCloseTo(0, 5)
    expect(clusters[0].pointCount).toBe(3)
  })

  it('separates multiple clusters', () => {
    const data: EmbeddingData = {
      points: [
        { id: 'a', position: { x: 0, y: 0, z: 0 }, clusterId: 0 },
        { id: 'b', position: { x: 10, y: 10, z: 10 }, clusterId: 1 }
      ]
    }
    const clusters = calculateClusterCentroids(data)
    expect(clusters).toHaveLength(2)
    expect(clusters[0].id).toBe(0)
    expect(clusters[1].id).toBe(1)
    expect(clusters[0].centroid).toEqual({ x: 0, y: 0, z: 0 })
    expect(clusters[1].centroid).toEqual({ x: 10, y: 10, z: 10 })
  })

  it('calculates bounding sphere radius', () => {
    const data: EmbeddingData = {
      points: [
        { id: 'a', position: { x: 0, y: 0, z: 0 }, clusterId: 0 },
        { id: 'b', position: { x: 4, y: 0, z: 0 }, clusterId: 0 },
        { id: 'c', position: { x: 0, y: 4, z: 0 }, clusterId: 0 }
      ]
    }
    const clusters = calculateClusterCentroids(data)
    // Centroid is at (4/3, 4/3, 0)
    // Max distance from centroid to any point
    expect(clusters[0].boundingSphereRadius).toBeGreaterThan(0)
  })

  it('handles single point cluster', () => {
    const data: EmbeddingData = {
      points: [{ id: 'solo', position: { x: 5, y: 5, z: 5 }, clusterId: 0 }]
    }
    const clusters = calculateClusterCentroids(data)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].centroid).toEqual({ x: 5, y: 5, z: 5 })
    expect(clusters[0].boundingSphereRadius).toBe(0)
    expect(clusters[0].pointCount).toBe(1)
  })

  it('handles points without clusterId', () => {
    const data: EmbeddingData = {
      points: [
        { id: 'a', position: { x: 0, y: 0, z: 0 } },
        { id: 'b', position: { x: 2, y: 2, z: 2 } }
      ]
    }
    const clusters = calculateClusterCentroids(data)
    // Points without clusterId are grouped under -1
    expect(clusters).toHaveLength(1)
    expect(clusters[0].id).toBe(-1)
    expect(clusters[0].pointCount).toBe(2)
  })

  it('picks up labels and colors from EmbeddingData clusters', () => {
    const data: EmbeddingData = {
      points: [
        { id: 'a', position: { x: 0, y: 0, z: 0 }, clusterId: 0 }
      ],
      clusters: [
        { id: 0, label: 'Cats', color: '#ff0000' }
      ]
    }
    const clusters = calculateClusterCentroids(data)
    expect(clusters[0].label).toBe('Cats')
    expect(clusters[0].color).toBe('#ff0000')
  })

  it('sorts clusters by ID', () => {
    const data: EmbeddingData = {
      points: [
        { id: 'a', position: { x: 0, y: 0, z: 0 }, clusterId: 5 },
        { id: 'b', position: { x: 1, y: 1, z: 1 }, clusterId: 2 },
        { id: 'c', position: { x: 2, y: 2, z: 2 }, clusterId: 0 }
      ]
    }
    const clusters = calculateClusterCentroids(data)
    expect(clusters.map((c) => c.id)).toEqual([0, 2, 5])
  })

  it('works with generated data', () => {
    const data = generateGaussianClusters({
      numClusters: 4,
      pointsPerCluster: 50,
      spread: 2.0
    })
    const clusters = calculateClusterCentroids(data)
    expect(clusters).toHaveLength(4)
    const totalPoints = clusters.reduce((sum, c) => sum + c.pointCount, 0)
    expect(totalPoints).toBe(200)
  })
})

// ─── Navigation: findNearestPoint ─────────────────────────────────

describe('findNearestPoint', () => {
  it('returns null for empty array', () => {
    const result = findNearestPoint({ x: 0, y: 0, z: 0 }, [])
    expect(result).toBeNull()
  })

  it('returns the single point if only one exists', () => {
    const point: EmbeddingPoint = { id: 'only', position: { x: 5, y: 5, z: 5 } }
    const result = findNearestPoint({ x: 0, y: 0, z: 0 }, [point])
    expect(result).toBe(point)
  })

  it('finds the nearest point', () => {
    const points: EmbeddingPoint[] = [
      { id: 'far', position: { x: 10, y: 10, z: 10 } },
      { id: 'near', position: { x: 1, y: 1, z: 1 } },
      { id: 'mid', position: { x: 5, y: 5, z: 5 } }
    ]
    const result = findNearestPoint({ x: 0, y: 0, z: 0 }, points)
    expect(result!.id).toBe('near')
  })

  it('handles exact position match', () => {
    const points: EmbeddingPoint[] = [
      { id: 'exact', position: { x: 3, y: 4, z: 5 } },
      { id: 'other', position: { x: 6, y: 7, z: 8 } }
    ]
    const result = findNearestPoint({ x: 3, y: 4, z: 5 }, points)
    expect(result!.id).toBe('exact')
  })

  it('handles negative coordinates', () => {
    const points: EmbeddingPoint[] = [
      { id: 'neg', position: { x: -1, y: -1, z: -1 } },
      { id: 'pos', position: { x: 5, y: 5, z: 5 } }
    ]
    const result = findNearestPoint({ x: -2, y: -2, z: -2 }, points)
    expect(result!.id).toBe('neg')
  })
})

// ─── Navigation: distanceSquared ──────────────────────────────────

describe('distanceSquared', () => {
  it('returns 0 for same point', () => {
    expect(distanceSquared({ x: 1, y: 2, z: 3 }, { x: 1, y: 2, z: 3 })).toBe(0)
  })

  it('returns correct squared distance', () => {
    expect(distanceSquared({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(25)
  })

  it('is symmetric', () => {
    const a = { x: 1, y: 2, z: 3 }
    const b = { x: 4, y: 5, z: 6 }
    expect(distanceSquared(a, b)).toBe(distanceSquared(b, a))
  })
})

// ─── Navigation: easing functions ─────────────────────────────────

describe('easeInOutCubic', () => {
  it('returns 0 at t=0', () => {
    expect(easeInOutCubic(0)).toBe(0)
  })

  it('returns 1 at t=1', () => {
    expect(easeInOutCubic(1)).toBe(1)
  })

  it('returns 0.5 at t=0.5', () => {
    expect(easeInOutCubic(0.5)).toBe(0.5)
  })

  it('clamps values below 0', () => {
    expect(easeInOutCubic(-0.5)).toBe(0)
  })

  it('clamps values above 1', () => {
    expect(easeInOutCubic(1.5)).toBe(1)
  })

  it('is monotonically increasing', () => {
    let prev = 0
    for (let t = 0; t <= 1; t += 0.01) {
      const v = easeInOutCubic(t)
      expect(v).toBeGreaterThanOrEqual(prev - 1e-10)
      prev = v
    }
  })
})

describe('easeOutQuad', () => {
  it('returns 0 at t=0', () => {
    expect(easeOutQuad(0)).toBe(0)
  })

  it('returns 1 at t=1', () => {
    expect(easeOutQuad(1)).toBe(1)
  })

  it('clamps below 0', () => {
    expect(easeOutQuad(-1)).toBe(0)
  })

  it('clamps above 1', () => {
    expect(easeOutQuad(2)).toBe(1)
  })
})

// ─── Navigation: lerpPosition ─────────────────────────────────────

describe('lerpPosition', () => {
  const from = { x: 0, y: 0, z: 0 }
  const to = { x: 10, y: 20, z: 30 }

  it('returns from at t=0', () => {
    const result = lerpPosition(from, to, 0)
    expect(result).toEqual(from)
  })

  it('returns to at t=1', () => {
    const result = lerpPosition(from, to, 1)
    expect(result).toEqual(to)
  })

  it('returns midpoint-ish at t=0.5', () => {
    const result = lerpPosition(from, to, 0.5)
    // easeInOutCubic(0.5) = 0.5 so the midpoint is exact
    expect(result.x).toBeCloseTo(5, 5)
    expect(result.y).toBeCloseTo(10, 5)
    expect(result.z).toBeCloseTo(15, 5)
  })
})

// ─── Navigation: lerpCameraToCluster ──────────────────────────────

describe('lerpCameraToCluster', () => {
  const cluster: ClusterInfo = {
    id: 0,
    centroid: { x: 10, y: 0, z: 0 },
    boundingSphereRadius: 5,
    pointCount: 100
  }

  it('creates an animation targeting cluster centroid', () => {
    const anim = lerpCameraToCluster(
      { x: 0, y: 0, z: 50 },
      { x: 0, y: 0, z: 0 },
      cluster,
      1000
    )
    expect(anim.toTarget).toEqual(cluster.centroid)
    expect(anim.duration).toBe(1000)
    expect(anim.completed).toBe(false)
  })

  it('positions camera at appropriate distance from cluster', () => {
    const anim = lerpCameraToCluster(
      { x: 0, y: 0, z: 50 },
      { x: 0, y: 0, z: 0 },
      cluster,
      1000
    )
    // Distance from camera to centroid should be >= bounding sphere * 2.5
    const dx = anim.toPosition.x - cluster.centroid.x
    const dy = anim.toPosition.y - cluster.centroid.y
    const dz = anim.toPosition.z - cluster.centroid.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    expect(dist).toBeGreaterThanOrEqual(cluster.boundingSphereRadius * 2.5 - 0.01)
  })

  it('handles zero-size cluster', () => {
    const smallCluster: ClusterInfo = {
      id: 0,
      centroid: { x: 0, y: 0, z: 0 },
      boundingSphereRadius: 0,
      pointCount: 1
    }
    const anim = lerpCameraToCluster(
      { x: 0, y: 0, z: 10 },
      { x: 0, y: 0, z: 0 },
      smallCluster,
      500
    )
    // Should still work with a minimum distance
    const dx = anim.toPosition.x - smallCluster.centroid.x
    const dy = anim.toPosition.y - smallCluster.centroid.y
    const dz = anim.toPosition.z - smallCluster.centroid.z
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
    expect(dist).toBeGreaterThanOrEqual(5) // minimum view distance
  })
})

// ─── Navigation: updateAnimation ──────────────────────────────────

describe('updateAnimation', () => {
  it('returns interpolated position during animation', () => {
    const anim = lerpCameraToCluster(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { id: 0, centroid: { x: 10, y: 0, z: 0 }, boundingSphereRadius: 5, pointCount: 10 },
      1000
    )
    const startTime = anim.startTime
    const result = updateAnimation(anim, startTime + 500)
    expect(result).not.toBeNull()
    expect(anim.completed).toBe(false)
  })

  it('marks animation as completed when past duration', () => {
    const anim = lerpCameraToCluster(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { id: 0, centroid: { x: 10, y: 0, z: 0 }, boundingSphereRadius: 5, pointCount: 10 },
      1000
    )
    const startTime = anim.startTime
    const result = updateAnimation(anim, startTime + 1500)
    expect(result).not.toBeNull()
    expect(anim.completed).toBe(true)
    expect(result!.position).toEqual(anim.toPosition)
    expect(result!.target).toEqual(anim.toTarget)
  })

  it('returns final position at exactly duration', () => {
    const anim = lerpCameraToCluster(
      { x: 0, y: 0, z: 50 },
      { x: 0, y: 0, z: 0 },
      { id: 0, centroid: { x: 10, y: 0, z: 0 }, boundingSphereRadius: 5, pointCount: 10 },
      1000
    )
    // Use a fixed startTime to avoid floating point precision issues
    anim.startTime = 1000
    const result = updateAnimation(anim, 2000)
    expect(result).not.toBeNull()
    expect(anim.completed).toBe(true)
  })
})

// ─── Integration: generators + navigation ─────────────────────────

describe('Integration: generators + navigation', () => {
  it('gaussian clusters -> centroid calculation', () => {
    const data = generateGaussianClusters({
      numClusters: 3,
      pointsPerCluster: 100,
      spread: 1.0,
      seed: 42
    })
    const clusters = calculateClusterCentroids(data)
    expect(clusters).toHaveLength(3)

    // Each cluster should have 100 points
    for (const c of clusters) {
      expect(c.pointCount).toBe(100)
      expect(c.boundingSphereRadius).toBeGreaterThan(0)
    }
  })

  it('spiral -> findNearestPoint works', () => {
    const data = generateSpiralManifold(500, 42)
    const target = data.points[0].position
    const nearest = findNearestPoint(target, data.points)
    expect(nearest).not.toBeNull()
    expect(nearest!.id).toBe(data.points[0].id)
  })

  it('swiss roll -> centroid calculation', () => {
    const data = generateSwissRoll(300, 42)
    const clusters = calculateClusterCentroids(data)
    expect(clusters.length).toBeGreaterThan(0)
    const totalPoints = clusters.reduce((sum, c) => sum + c.pointCount, 0)
    expect(totalPoints).toBe(300)
  })

  it('camera animation to cluster from generated data', () => {
    const data = generateGaussianClusters({
      numClusters: 3,
      pointsPerCluster: 50,
      spread: 2.0
    })
    const clusters = calculateClusterCentroids(data)
    const anim = lerpCameraToCluster(
      { x: 0, y: 0, z: 50 },
      { x: 0, y: 0, z: 0 },
      clusters[0],
      500
    )
    expect(anim.toTarget).toEqual(clusters[0].centroid)
  })
})

// ─── Edge cases ───────────────────────────────────────────────────

describe('Edge cases', () => {
  it('generators handle zero points per cluster', () => {
    const data = generateGaussianClusters({
      numClusters: 3,
      pointsPerCluster: 0,
      spread: 1.0
    })
    expect(data.points).toHaveLength(0)
    expect(data.clusters).toHaveLength(3)
  })

  it('generators handle single cluster', () => {
    const data = generateGaussianClusters({
      numClusters: 1,
      pointsPerCluster: 10,
      spread: 1.0
    })
    expect(data.points).toHaveLength(10)
    const clusterIds = new Set(data.points.map((p) => p.clusterId))
    expect(clusterIds.size).toBe(1)
    expect(clusterIds.has(0)).toBe(true)
  })

  it('spiral with 1 point', () => {
    const data = generateSpiralManifold(1)
    expect(data.points).toHaveLength(1)
    expect(data.points[0].clusterId).toBe(0)
  })

  it('swiss roll with 1 point', () => {
    const data = generateSwissRoll(1)
    expect(data.points).toHaveLength(1)
  })

  it('findNearestPoint with null/undefined-safe points', () => {
    const result = findNearestPoint({ x: 0, y: 0, z: 0 }, [])
    expect(result).toBeNull()
  })

  it('calculateClusterCentroids with mixed assigned/unassigned clusters', () => {
    const data: EmbeddingData = {
      points: [
        { id: 'a', position: { x: 0, y: 0, z: 0 }, clusterId: 0 },
        { id: 'b', position: { x: 1, y: 1, z: 1 } }, // no clusterId
        { id: 'c', position: { x: 10, y: 10, z: 10 }, clusterId: 1 }
      ]
    }
    const clusters = calculateClusterCentroids(data)
    // Should have 3 clusters: -1 (unassigned), 0, and 1
    expect(clusters).toHaveLength(3)
    expect(clusters.map((c) => c.id)).toContain(-1)
    expect(clusters.map((c) => c.id)).toContain(0)
    expect(clusters.map((c) => c.id)).toContain(1)
  })

  it('lerpCameraToCluster handles camera at same position as target', () => {
    const cluster: ClusterInfo = {
      id: 0,
      centroid: { x: 0, y: 0, z: 0 },
      boundingSphereRadius: 5,
      pointCount: 10
    }
    // Camera position equals target - should not produce NaN
    const anim = lerpCameraToCluster(
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      cluster,
      500
    )
    expect(Number.isFinite(anim.toPosition.x)).toBe(true)
    expect(Number.isFinite(anim.toPosition.y)).toBe(true)
    expect(Number.isFinite(anim.toPosition.z)).toBe(true)
  })
})
