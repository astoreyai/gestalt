/**
 * Cluster boundary visualization component.
 * Renders transparent spheres and labels at cluster centroids.
 */

import React, { useRef, useEffect } from 'react'
import { Text } from '@react-three/drei'
import { DoubleSide, Mesh } from 'three'
import type { ClusterInfo } from './types'
import { CLUSTER_COLORS } from './types'

export interface ClustersProps {
  /** Array of cluster information objects */
  clusters: ClusterInfo[]
  /** Currently selected cluster id */
  selectedCluster?: number
  /** Called when a cluster sphere is clicked */
  onClusterClick?: (clusterId: number) => void
}

/** Get the display color for a cluster */
function getColor(cluster: ClusterInfo): string {
  if (cluster.color) return cluster.color
  const idx = cluster.id >= 0 ? cluster.id % CLUSTER_COLORS.length : 0
  return CLUSTER_COLORS[idx]
}

/** Individual cluster group with disposal cleanup (P0-5) */
function ClusterItem({
  cluster,
  isSelected,
  onClusterClick
}: {
  cluster: ClusterInfo
  isSelected: boolean
  onClusterClick?: (clusterId: number) => void
}): React.ReactElement {
  const meshRef = useRef<Mesh>(null)
  const wireframeMeshRef = useRef<Mesh>(null)

  // Dispose geometry and material on unmount (P0-5)
  useEffect(() => {
    return () => {
      const mesh = meshRef.current
      if (mesh) {
        mesh.geometry.dispose()
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => m.dispose())
        } else {
          mesh.material.dispose()
        }
      }
      const wfMesh = wireframeMeshRef.current
      if (wfMesh) {
        wfMesh.geometry.dispose()
        if (Array.isArray(wfMesh.material)) {
          wfMesh.material.forEach((m) => m.dispose())
        } else {
          wfMesh.material.dispose()
        }
      }
    }
  }, [])

  const color = getColor(cluster)
  const radius = Math.max(cluster.boundingSphereRadius, 0.5)

  return (
    <group position={[cluster.centroid.x, cluster.centroid.y, cluster.centroid.z]}>
      {/* Transparent bounding sphere */}
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation()
          onClusterClick?.(cluster.id)
        }}
      >
        <sphereGeometry args={[radius, 24, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={isSelected ? 0.15 : 0.05}
          side={DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Wireframe outline for selected cluster */}
      {isSelected && (
        <mesh ref={wireframeMeshRef}>
          <sphereGeometry args={[radius, 24, 16]} />
          <meshBasicMaterial
            color={color}
            wireframe
            transparent
            opacity={0.3}
          />
        </mesh>
      )}

      {/* Cluster label at centroid, offset slightly above */}
      <Text
        position={[0, radius + 0.5, 0]}
        fontSize={0.8}
        color={color}
        anchorX="center"
        anchorY="bottom"
        outlineWidth={0.05}
        outlineColor="#000000"
      >
        {cluster.label ?? `Cluster ${cluster.id}`}
        {cluster.pointCount > 0 ? ` (${cluster.pointCount})` : ''}
      </Text>
    </group>
  )
}

export function Clusters({
  clusters,
  selectedCluster,
  onClusterClick
}: ClustersProps): React.ReactElement {
  return (
    <group>
      {clusters.map((cluster) => (
        <ClusterItem
          key={cluster.id}
          cluster={cluster}
          isSelected={cluster.id === selectedCluster}
          onClusterClick={onClusterClick}
        />
      ))}
    </group>
  )
}
