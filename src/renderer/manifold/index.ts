/**
 * Manifold module — Latent Space Renderer
 *
 * Provides 3D embedding visualization with point clouds,
 * cluster boundaries, hover cards, and camera navigation.
 */

// Types
export type {
  ClusterInfo
} from './types'
export { CLUSTER_COLORS } from './types'
export type { EmbeddingPoint, EmbeddingData } from './types'

// Components
export { PointCloud } from './PointCloud'
export type { PointCloudProps } from './PointCloud'
export { Clusters } from './Clusters'
export type { ClustersProps } from './Clusters'
export { HoverCard } from './HoverCard'
export type { HoverCardProps } from './HoverCard'

// Navigation utilities
export {
  lerpCameraToCluster,
  updateAnimation,
  calculateClusterCentroids,
  findNearestPoint,
  easeInOutCubic,
  easeOutQuad,
  lerpPosition,
  distanceSquared
} from './navigation'
export type { CameraAnimation } from './navigation'

// Generators
export {
  generateGaussianClusters,
  generateSpiralManifold,
  generateSwissRoll,
  SeededRandom
} from './generators'
export type { GaussianClusterConfig } from './generators'
