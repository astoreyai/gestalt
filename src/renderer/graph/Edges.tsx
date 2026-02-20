/**
 * Edges component — renders graph edges using THREE.LineSegments for efficiency.
 * All edges are batched into a single draw call using BufferGeometry.
 */
import React, { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GraphEdge } from '@shared/protocol'
import type { NodePosition } from './Nodes'

export interface EdgesProps {
  /** Graph edges */
  edges: GraphEdge[]
  /** Map of node id -> current position from force layout */
  positions: Map<string, NodePosition>
  /** Currently selected node id — edges connected to it will be highlighted */
  selectedId?: string | null
}

/** Default edge color */
const DEFAULT_EDGE_COLOR = new THREE.Color('#444444')
/** Highlighted edge color (connected to selected node) */
const HIGHLIGHT_EDGE_COLOR = new THREE.Color('#88bbff')
/** Minimum opacity for edges */
const MIN_OPACITY = 0.15
/** Maximum opacity for edges */
const MAX_OPACITY = 0.8

export const Edges = React.memo(function Edges({
  edges,
  positions,
  selectedId
}: EdgesProps): React.ReactElement | null {
  const lineRef = useRef<THREE.LineSegments>(null)

  // Pre-compute the set of node IDs connected to selected node
  const selectedConnections = useMemo(() => {
    if (!selectedId) return new Set<number>()
    const connected = new Set<number>()
    edges.forEach((edge, i) => {
      if (edge.source === selectedId || edge.target === selectedId) {
        connected.add(i)
      }
    })
    return connected
  }, [edges, selectedId])

  // Create buffer geometry for line segments
  // Each edge requires 2 vertices (start + end), each vertex has 3 floats
  const { positionBuffer, colorBuffer } = useMemo(() => {
    const posArr = new Float32Array(edges.length * 6) // 2 vertices * 3 components
    const colArr = new Float32Array(edges.length * 6) // 2 vertices * 3 components (RGB)
    return {
      positionBuffer: posArr,
      colorBuffer: colArr
    }
  }, [edges.length])

  // Update positions and colors each frame
  useFrame(() => {
    const line = lineRef.current
    if (!line || edges.length === 0) return

    const geom = line.geometry
    let anyUpdate = false

    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i]
      const srcPos = positions.get(edge.source)
      const tgtPos = positions.get(edge.target)

      if (!srcPos || !tgtPos) continue

      const offset = i * 6

      // Positions: source vertex
      positionBuffer[offset] = srcPos.x
      positionBuffer[offset + 1] = srcPos.y
      positionBuffer[offset + 2] = srcPos.z
      // Positions: target vertex
      positionBuffer[offset + 3] = tgtPos.x
      positionBuffer[offset + 4] = tgtPos.y
      positionBuffer[offset + 5] = tgtPos.z

      // Colors: weight-based opacity encoded as brightness
      const weight = edge.weight ?? 0.5
      const isHighlighted = selectedConnections.has(i)
      const color = isHighlighted ? HIGHLIGHT_EDGE_COLOR : DEFAULT_EDGE_COLOR
      const opacity = MIN_OPACITY + (MAX_OPACITY - MIN_OPACITY) * weight
      const brightness = isHighlighted ? 1.0 : opacity

      // Source vertex color
      colorBuffer[offset] = color.r * brightness
      colorBuffer[offset + 1] = color.g * brightness
      colorBuffer[offset + 2] = color.b * brightness
      // Target vertex color
      colorBuffer[offset + 3] = color.r * brightness
      colorBuffer[offset + 4] = color.g * brightness
      colorBuffer[offset + 5] = color.b * brightness

      anyUpdate = true
    }

    if (anyUpdate) {
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute
      posAttr.set(positionBuffer)
      posAttr.needsUpdate = true

      const colAttr = geom.getAttribute('color') as THREE.BufferAttribute
      colAttr.set(colorBuffer)
      colAttr.needsUpdate = true

      geom.computeBoundingSphere()
    }
  })

  if (edges.length === 0) return null

  return (
    <lineSegments ref={lineRef} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positionBuffer, 3]}
          count={edges.length * 2}
          usage={THREE.DynamicDrawUsage}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colorBuffer, 3]}
          count={edges.length * 2}
          usage={THREE.DynamicDrawUsage}
        />
      </bufferGeometry>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={1.0}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </lineSegments>
  )
})
