/**
 * Manifold module types for the latent space renderer.
 * Re-exports shared protocol types and defines manifold-specific types.
 */

export type { EmbeddingPoint, EmbeddingData } from '@shared/protocol'

/** Information about a computed cluster in the embedding space */
export interface ClusterInfo {
  /** Cluster identifier matching EmbeddingPoint.clusterId */
  id: number
  /** 3D centroid position (mean of all member points) */
  centroid: { x: number; y: number; z: number }
  /** Radius of the bounding sphere encompassing all cluster members */
  boundingSphereRadius: number
  /** Number of points belonging to this cluster */
  pointCount: number
  /** Optional human-readable label */
  label?: string
  /** Display color for this cluster */
  color?: string
}

/** Camera and interaction state for the manifold view */
export interface ManifoldViewState {
  /** Camera world position */
  cameraPosition: { x: number; y: number; z: number }
  /** Camera look-at target */
  cameraTarget: { x: number; y: number; z: number }
  /** Currently selected cluster id, or null */
  selectedCluster: number | null
  /** ID of the currently hovered point, or null */
  hoveredPointId: string | null
}

/** Configuration for kernel density estimation visualization */
export interface DensityConfig {
  /** Gaussian kernel bandwidth (sigma) */
  kernelBandwidth: number
  /** Grid resolution for density field (per axis) */
  resolution: number
  /** Color map name for density-to-color mapping */
  colorMap: 'viridis' | 'inferno' | 'plasma' | 'magma'
}

/** Categorical color palette for cluster coloring */
export const CLUSTER_COLORS: readonly string[] = [
  '#4a9eff',
  '#ff6b6b',
  '#6bcb77',
  '#ffd93d',
  '#c084fc',
  '#ff9f43',
  '#54a0ff',
  '#ee5a24',
  '#01a3a4',
  '#f368e0'
] as const
