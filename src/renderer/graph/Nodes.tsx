/**
 * Nodes component — renders graph nodes using THREE.InstancedMesh for performance.
 * Handles 10K+ nodes at 60 FPS by batching all nodes into a single draw call.
 */
import React, { useRef, useMemo, useEffect, useCallback } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import type { GraphNode } from '@shared/protocol'
import { calculateLOD, getGeometryDetail, type LODLevel } from './lod'
import { CLUSTER_COLORS } from './colors'

/** Position data maintained by the force layout */
export interface NodePosition {
  x: number
  y: number
  z: number
}

export interface NodesProps {
  /** Graph nodes with data */
  nodes: GraphNode[]
  /** Map of node id -> current position from force layout */
  positions: Map<string, NodePosition>
  /** Currently selected node id */
  selectedId?: string | null
  /** Currently hovered node id */
  hoveredId?: string | null
  /** Callback when a node is clicked */
  onNodeClick?: (id: string) => void
  /** Callback when a node is hovered/unhovered */
  onNodeHover?: (id: string | null) => void
}

/** Default node size when not specified */
const DEFAULT_SIZE = 1.0

/** Dummy object for matrix composition */
const _dummy = new THREE.Object3D()
const _color = new THREE.Color()

export const Nodes = React.memo(function Nodes({
  nodes,
  positions,
  selectedId,
  hoveredId,
  onNodeClick,
  onNodeHover
}: NodesProps): React.ReactElement | null {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const prevLodRef = useRef<LODLevel>('full')

  // Build an index map: instance index -> node id
  const nodeIndexMap = useMemo(() => {
    const map = new Map<number, string>()
    nodes.forEach((node, i) => {
      map.set(i, node.id)
    })
    return map
  }, [nodes])

  // Reverse map: node id -> instance index
  const idToIndex = useMemo(() => {
    const map = new Map<string, number>()
    nodes.forEach((node, i) => {
      map.set(node.id, i)
    })
    return map
  }, [nodes])

  // Pre-compute base colors for each node
  const baseColors = useMemo(() => {
    return nodes.map((node, i) => {
      if (node.color) {
        return new THREE.Color(node.color)
      }
      // Default: cycle through cluster colors based on index
      return new THREE.Color(CLUSTER_COLORS[i % CLUSTER_COLORS.length])
    })
  }, [nodes])

  // Create geometry based on LOD — default to full
  const geometry = useMemo(() => {
    const [w, h] = getGeometryDetail('full')
    return new THREE.SphereGeometry(1, w, h)
  }, [])

  // Material with emissive support for highlighting
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.1,
      toneMapped: false
    })
  }, [])

  // Update instance matrices and colors each frame
  useFrame(({ camera }) => {
    const mesh = meshRef.current
    if (!mesh || nodes.length === 0) return

    // Calculate LOD based on camera distance
    const cameraDistance = camera.position.length()
    const lod = calculateLOD(nodes.length, cameraDistance)
    prevLodRef.current = lod

    if (lod === 'culled') {
      mesh.visible = false
      return
    }
    mesh.visible = true

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const pos = positions.get(node.id)
      if (!pos) continue

      const size = Math.max(0.1, node.size ?? DEFAULT_SIZE)
      _dummy.position.set(pos.x, pos.y, pos.z)
      _dummy.scale.setScalar(size)
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)

      // Color: base color, with emissive highlight for selected/hovered
      const isSelected = node.id === selectedId
      const isHovered = node.id === hoveredId

      if (isSelected) {
        _color.set('#ffffff')
      } else if (isHovered) {
        _color.copy(baseColors[i]).lerp(new THREE.Color('#ffffff'), 0.4)
      } else {
        _color.copy(baseColors[i])
      }
      mesh.setColorAt(i, _color)
    }

    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
    }
  })

  // Handle click on instanced mesh
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!onNodeClick || event.instanceId === undefined) return
      event.stopPropagation()
      const nodeId = nodeIndexMap.get(event.instanceId)
      if (nodeId) {
        onNodeClick(nodeId)
      }
    },
    [onNodeClick, nodeIndexMap]
  )

  // Handle pointer move for hover
  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      if (!onNodeHover || event.instanceId === undefined) return
      const nodeId = nodeIndexMap.get(event.instanceId)
      if (nodeId) {
        onNodeHover(nodeId)
      }
    },
    [onNodeHover, nodeIndexMap]
  )

  const handlePointerOut = useCallback(() => {
    if (onNodeHover) {
      onNodeHover(null)
    }
  }, [onNodeHover])

  if (nodes.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, nodes.length]}
      onClick={handleClick}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      frustumCulled={false}
    />
  )
})
