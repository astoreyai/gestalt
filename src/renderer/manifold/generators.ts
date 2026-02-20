/**
 * Synthetic embedding data generators for testing and demos.
 * Uses a seeded PRNG for reproducible output.
 */

import type { EmbeddingData, EmbeddingPoint } from '@shared/protocol'
import { CLUSTER_COLORS } from './types'

/**
 * Simple seeded pseudo-random number generator (xoshiro128**).
 * Produces values in [0, 1).
 */
export class SeededRandom {
  private s: Uint32Array

  constructor(seed: number) {
    // Initialize state from seed using splitmix32
    this.s = new Uint32Array(4)
    for (let i = 0; i < 4; i++) {
      seed += 0x9e3779b9
      let t = seed
      t = Math.imul(t ^ (t >>> 16), 0x85ebca6b)
      t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35)
      this.s[i] = (t ^ (t >>> 16)) >>> 0
    }
    // Ensure non-zero state
    if (this.s.every((v) => v === 0)) {
      this.s[0] = 1
    }
  }

  /** Return next random number in [0, 1) */
  next(): number {
    const s = this.s
    const result = Math.imul(rotl(Math.imul(s[1], 5), 7), 9)
    const t = s[1] << 9

    s[2] ^= s[0]
    s[3] ^= s[1]
    s[1] ^= s[2]
    s[0] ^= s[3]

    s[2] ^= t
    s[3] = rotl(s[3], 11)

    return (result >>> 0) / 0x100000000
  }

  /** Return a random number with approximate Gaussian distribution (Box-Muller) */
  nextGaussian(): number {
    let u1 = this.next()
    const u2 = this.next()
    // Avoid log(0)
    if (u1 < 1e-10) u1 = 1e-10
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  }
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0
}

export interface GaussianClusterConfig {
  numClusters: number
  pointsPerCluster: number
  /** Standard deviation of each cluster's Gaussian spread */
  spread: number
  /** Seed for reproducible generation */
  seed?: number
}

/**
 * Generate embedding data with Gaussian-distributed clusters.
 * Clusters are placed at random positions in 3D space, each with
 * `pointsPerCluster` points drawn from a Gaussian distribution.
 */
export function generateGaussianClusters(config: GaussianClusterConfig): EmbeddingData {
  const { numClusters, pointsPerCluster, spread, seed = 42 } = config
  const rng = new SeededRandom(seed)

  const points: EmbeddingPoint[] = []
  const clusters: EmbeddingData['clusters'] = []

  // Place cluster centers spread across the space
  const clusterSpacing = spread * 5

  for (let c = 0; c < numClusters; c++) {
    const centerX = (rng.next() - 0.5) * clusterSpacing * numClusters * 0.5
    const centerY = (rng.next() - 0.5) * clusterSpacing * numClusters * 0.5
    const centerZ = (rng.next() - 0.5) * clusterSpacing * numClusters * 0.5

    clusters.push({
      id: c,
      label: `Cluster ${c}`,
      color: CLUSTER_COLORS[c % CLUSTER_COLORS.length],
      centroid: { x: centerX, y: centerY, z: centerZ }
    })

    for (let i = 0; i < pointsPerCluster; i++) {
      const id = `c${c}_p${i}`
      points.push({
        id,
        position: {
          x: centerX + rng.nextGaussian() * spread,
          y: centerY + rng.nextGaussian() * spread,
          z: centerZ + rng.nextGaussian() * spread
        },
        clusterId: c,
        label: `Point ${id}`,
        metadata: { cluster: c, index: i }
      })
    }
  }

  return {
    points,
    clusters,
    metadata: {
      generator: 'gaussianClusters',
      numClusters,
      pointsPerCluster,
      spread,
      seed
    }
  }
}

/**
 * Generate a 3D spiral manifold.
 * Points are distributed along a helix with added noise.
 */
export function generateSpiralManifold(numPoints: number, seed: number = 42): EmbeddingData {
  const rng = new SeededRandom(seed)
  const points: EmbeddingPoint[] = []
  const numTurns = 3
  const noiseScale = 0.3

  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints
    const angle = t * Math.PI * 2 * numTurns
    const radius = 2 + t * 8
    const clusterId = Math.floor(t * 3) // 3 segments

    points.push({
      id: `spiral_${i}`,
      position: {
        x: Math.cos(angle) * radius + rng.nextGaussian() * noiseScale,
        y: t * 10 - 5 + rng.nextGaussian() * noiseScale,
        z: Math.sin(angle) * radius + rng.nextGaussian() * noiseScale
      },
      clusterId,
      label: `Spiral ${i}`,
      metadata: { t, angle, radius }
    })
  }

  const clusters = [0, 1, 2].map((id) => ({
    id,
    label: `Segment ${id}`,
    color: CLUSTER_COLORS[id % CLUSTER_COLORS.length]
  }))

  return {
    points,
    clusters,
    metadata: { generator: 'spiral', numPoints, seed }
  }
}

/**
 * Generate a Swiss Roll manifold (classic dimensionality reduction test surface).
 * Points are on a rolled-up 2D sheet in 3D space.
 */
export function generateSwissRoll(numPoints: number, seed: number = 42): EmbeddingData {
  const rng = new SeededRandom(seed)
  const points: EmbeddingPoint[] = []
  const noiseScale = 0.2

  for (let i = 0; i < numPoints; i++) {
    // t controls the unrolling angle, height is independent
    const t = 1.5 * Math.PI * (1 + 2 * rng.next())
    const height = 21 * rng.next() - 10.5
    const clusterId = t < 2 * Math.PI ? 0 : t < 3 * Math.PI ? 1 : 2

    points.push({
      id: `swiss_${i}`,
      position: {
        x: t * Math.cos(t) + rng.nextGaussian() * noiseScale,
        y: height + rng.nextGaussian() * noiseScale,
        z: t * Math.sin(t) + rng.nextGaussian() * noiseScale
      },
      clusterId,
      label: `Swiss ${i}`,
      metadata: { t, height }
    })
  }

  const clusters = [0, 1, 2].map((id) => ({
    id,
    label: `Region ${id}`,
    color: CLUSTER_COLORS[id % CLUSTER_COLORS.length]
  }))

  return {
    points,
    clusters,
    metadata: { generator: 'swissRoll', numPoints, seed }
  }
}
