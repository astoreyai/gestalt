/**
 * Nodes component — renders graph nodes using THREE.InstancedMesh for performance.
 * Handles 10K+ nodes at 60 FPS by batching all nodes into a single draw call.
 */
import React, { useRef, useMemo, useEffect, useCallback, useState } from 'react'
import { useFrame, ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import {
  Object3D,
  Color,
  SphereGeometry,
  MeshStandardMaterial,
  InstancedMesh as InstancedMeshType
} from 'three'
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

/** Pre-allocated reusable objects to avoid per-frame allocations (P1-22) */
const _dummy = new Object3D()
const _color = new Color()
const _selectedColor = new Color('#ff6600')
const _hoverColor = new Color('#ffffff')
const _tempColor = new Color()

/** Minimum pre-allocated InstancedMesh capacity to avoid frequent recreations (P2-45) */
const MIN_CAPACITY = 1000

export const Nodes = React.memo(function Nodes({
  nodes,
  positions,
  selectedId,
  hoveredId,
  onNodeClick,
  onNodeHover
}: NodesProps): React.ReactElement | null {
  const meshRef = useRef<InstancedMeshType>(null)
  const prevLodRef = useRef<LODLevel>('full')
  /** Track last positions map reference to skip redundant GPU uploads */
  const prevPositionsRef = useRef<Map<string, NodePosition> | null>(null)
  const prevSelectedRef = useRef<string | null | undefined>(null)
  const prevHoveredRef = useRef<string | null | undefined>(null)

  // Build an index map: instance index -> node id
  const nodeIndexMap = useMemo(() => {
    const map = new Map<number, string>()
    nodes.forEach((node, i) => {
      map.set(i, node.id)
    })
    return map
  }, [nodes])

  // Pre-compute base colors for each node
  const baseColors = useMemo(() => {
    return nodes.map((node, i) => {
      if (node.color) {
        return new Color(node.color)
      }
      // Default: cycle through cluster colors based on index
      return new Color(CLUSTER_COLORS[i % CLUSTER_COLORS.length])
    })
  }, [nodes])

  // Create 3 LOD geometry levels and store refs for disposal (P1-19, P0-5)
  const geometryFullRef = useRef<SphereGeometry | null>(null)
  const geometryMediumRef = useRef<SphereGeometry | null>(null)
  const geometryLowRef = useRef<SphereGeometry | null>(null)
  const materialRef = useRef<MeshStandardMaterial | null>(null)

  const { geometryFull, geometryMedium, geometryLow } = useMemo(() => {
    const [fw, fh] = getGeometryDetail('full')
    const [mw, mh] = getGeometryDetail('medium')
    const [lw, lh] = getGeometryDetail('low')
    const gFull = new SphereGeometry(1, fw, fh)
    const gMedium = new SphereGeometry(1, mw, mh)
    const gLow = new SphereGeometry(1, lw, lh)
    geometryFullRef.current = gFull
    geometryMediumRef.current = gMedium
    geometryLowRef.current = gLow
    return { geometryFull: gFull, geometryMedium: gMedium, geometryLow: gLow }
  }, [])

  // Material with emissive support for highlighting
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({
      roughness: 0.6,
      metalness: 0.1,
      toneMapped: false
    })
    materialRef.current = m
    return m
  }, [])

  // Dispose all geometries and material on unmount (P0-5)
  useEffect(() => {
    return () => {
      geometryFullRef.current?.dispose()
      geometryMediumRef.current?.dispose()
      geometryLowRef.current?.dispose()
      materialRef.current?.dispose()
    }
  }, [])

  // Pre-allocate capacity for InstancedMesh to avoid recreation on count change (P2-45)
  const capacity = useMemo(() => {
    return Math.max(nodes.length, MIN_CAPACITY)
  }, [nodes.length])

  // Update instance matrices and colors each frame
  useFrame(({ camera }) => {
    const mesh = meshRef.current
    if (!mesh || nodes.length === 0) return

    // Control actual rendered count without recreating mesh (P2-45)
    mesh.count = nodes.length

    // Calculate LOD based on camera distance
    const cameraDistance = camera.position.length()
    const lod = calculateLOD(nodes.length, cameraDistance)

    // Track what changed for dirty-flag skip
    const positionsChanged = positions !== prevPositionsRef.current
    const selectionChanged = selectedId !== prevSelectedRef.current || hoveredId !== prevHoveredRef.current
    const lodChanged = lod !== prevLodRef.current
    prevPositionsRef.current = positions
    prevSelectedRef.current = selectedId
    prevHoveredRef.current = hoveredId

    // Swap geometry when LOD level changes (P1-19)
    if (lodChanged) {
      prevLodRef.current = lod
      if (lod === 'culled') {
        mesh.visible = false
        return
      }
      switch (lod) {
        case 'full':
          mesh.geometry = geometryFull
          break
        case 'medium':
          mesh.geometry = geometryMedium
          break
        case 'low':
          mesh.geometry = geometryLow
          break
      }
    }

    if (lod === 'culled') {
      mesh.visible = false
      return
    }
    mesh.visible = true

    // Skip matrix/color updates if nothing changed (LOD swap still handled above)
    if (!positionsChanged && !selectionChanged && !lodChanged) return

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i]
      const pos = positions.get(node.id)
      if (!pos) continue

      const baseSize = Math.max(0.1, node.size ?? DEFAULT_SIZE)
      const isSelected = node.id === selectedId
      const isHovered = node.id === hoveredId
      const size = baseSize

      _dummy.position.set(pos.x, pos.y, pos.z)
      _dummy.scale.setScalar(size)
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)

      // Color: bright orange for selected, white tint for hovered (P1-22)
      if (isSelected) {
        _color.copy(_selectedColor)
      } else if (isHovered) {
        _tempColor.copy(baseColors[i])
        _color.copy(_tempColor.lerp(_hoverColor, 0.4))
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
    <group>
      <instancedMesh
        ref={meshRef}
        args={[geometryFull, material, capacity]}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        frustumCulled={false}
      />
      {/* Node labels — only render for manageable counts */}
      {nodes.length <= 200 && nodes.map((node) => {
        const pos = positions.get(node.id)
        if (!pos) return null
        const size = node.size ?? DEFAULT_SIZE
        return (
          <Html
            key={node.id}
            position={[pos.x, pos.y + size + 1.2, pos.z]}
            center
            style={{
              pointerEvents: 'none',
              userSelect: 'none',
              whiteSpace: 'nowrap',
              fontSize: 11,
              color: node.id === selectedId ? '#fff' : 'rgba(220,220,220,0.85)',
              fontWeight: node.id === selectedId ? 'bold' : 'normal',
              textShadow: '0 0 4px rgba(0,0,0,0.8)'
            }}
          >
            {node.label ?? node.id}
          </Html>
        )
      })}
    </group>
  )
})
