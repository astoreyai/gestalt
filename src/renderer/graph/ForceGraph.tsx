/**
 * ForceGraph — 3D force-directed graph layout and visualization.
 * Uses a Web Worker for physics simulation (d3-force-3d) to keep the
 * main / render thread free. Falls back to synchronous simulation when
 * Worker is unavailable (e.g. vitest/happy-dom).
 */
import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef
} from 'react'
import { useThree } from '@react-three/fiber'
import type { GraphData } from '@shared/protocol'
import { Nodes, type NodePosition } from './Nodes'
import { Edges } from './Edges'
import { createForceSimulation } from './force-layout'
import type { WorkerResponse } from '../../../workers/force-layout.worker'

/** Public imperative API exposed via ref */
export interface ForceGraphHandle {
  /** Center the camera on a specific node */
  centerOnNode: (id: string) => void
}

export interface ForceGraphProps {
  /** The graph data to visualize */
  data: GraphData
  /** Currently selected node id (from store) */
  selectedNodeId?: string | null
  /** Callback when a node is clicked */
  onNodeClick?: (id: string) => void
  /** Callback when a node is hovered */
  onNodeHover?: (id: string | null) => void
}

/**
 * ForceGraph component.
 * Runs a d3-force-3d simulation (in a Web Worker when available) and
 * renders nodes/edges via instanced rendering.
 */
export const ForceGraph = forwardRef<ForceGraphHandle, ForceGraphProps>(
  function ForceGraph({ data, selectedNodeId, onNodeClick, onNodeHover }, ref) {
    const { camera } = useThree()
    const [positions, setPositions] = useState<Map<string, NodePosition>>(
      () => new Map()
    )
    // Use prop if provided (from store), otherwise manage locally
    const [localSelectedId, setLocalSelectedId] = useState<string | null>(null)
    const selectedId = selectedNodeId !== undefined ? selectedNodeId : localSelectedId
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const positionsRef = useRef<Map<string, NodePosition>>(new Map())
    const animFrameRef = useRef<number>(0)

    // Expose imperative handle
    useImperativeHandle(
      ref,
      () => ({
        centerOnNode(id: string) {
          const pos = positionsRef.current.get(id)
          if (!pos) return
          // Animate camera to look at the target position
          const distance = 30
          camera.position.set(
            pos.x + distance * 0.5,
            pos.y + distance * 0.3,
            pos.z + distance
          )
          camera.lookAt(pos.x, pos.y, pos.z)
          camera.updateProjectionMatrix()
        }
      }),
      [camera]
    )

    // Run force simulation when data changes
    useEffect(() => {
      if (!data.nodes.length) return

      // Prepare node/edge arrays for the simulation
      const simNodes = data.nodes.map((node) => ({
        id: node.id,
        x: node.position?.x ?? (Math.random() - 0.5) * 50,
        y: node.position?.y ?? (Math.random() - 0.5) * 50,
        z: node.position?.z ?? (Math.random() - 0.5) * 50
      }))

      const simEdges = data.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        weight: edge.weight
      }))

      // Use synchronous simulation on the main thread via rAF.
      // The Web Worker path had reliability issues (silent failures,
      // Transferable buffer detachment). For graphs up to ~10K nodes,
      // synchronous d3-force-3d in rAF is fast enough.
      const sim = createForceSimulation({ nodes: simNodes, edges: simEdges })

      const loop = (): void => {
        const result = sim.tick()
        const newPositions = new Map<string, NodePosition>()
        for (const [id, pos] of result.positions) {
          newPositions.set(id, { x: pos.x, y: pos.y, z: pos.z })
        }
        positionsRef.current = newPositions
        setPositions(newPositions)

        if (!result.done) {
          animFrameRef.current = requestAnimationFrame(loop)
        }
      }
      animFrameRef.current = requestAnimationFrame(loop)

      return () => {
        if (animFrameRef.current !== 0) {
          cancelAnimationFrame(animFrameRef.current)
          animFrameRef.current = 0
        }
        sim.stop()
      }
    }, [data])

    const handleNodeClick = useCallback(
      (id: string) => {
        setLocalSelectedId((prev) => (prev === id ? null : id))
        onNodeClick?.(id)
      },
      [onNodeClick]
    )

    const handleNodeHover = useCallback(
      (id: string | null) => {
        setHoveredId(id)
        onNodeHover?.(id)
      },
      [onNodeHover]
    )

    return (
      <group>
        <Edges
          edges={data.edges}
          positions={positions}
          selectedId={selectedId}
        />
        <Nodes
          nodes={data.nodes}
          positions={positions}
          selectedId={selectedId}
          hoveredId={hoveredId}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
        />
      </group>
    )
  }
)
