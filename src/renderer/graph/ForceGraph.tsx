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
  function ForceGraph({ data, onNodeClick, onNodeHover }, ref) {
    const { camera } = useThree()
    const [positions, setPositions] = useState<Map<string, NodePosition>>(
      () => new Map()
    )
    const [selectedId, setSelectedId] = useState<string | null>(null)
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

      // Helper: convert a positions array from the worker into a Map
      const arrayToMap = (
        arr: Array<{ id: string; x: number; y: number; z: number }>
      ): Map<string, NodePosition> => {
        const map = new Map<string, NodePosition>()
        for (const p of arr) {
          map.set(p.id, { x: p.x, y: p.y, z: p.z })
        }
        return map
      }

      // ── Try Web Worker path ───────────────────────────────────
      if (typeof Worker !== 'undefined') {
        let worker: Worker | null = null
        try {
          worker = new Worker(
            new URL('../../../workers/force-layout.worker.ts', import.meta.url)
          )
        } catch {
          // Worker construction can fail in some environments; fall through
          worker = null
        }

        if (worker) {
          const w = worker

          w.onmessage = (event: MessageEvent<WorkerResponse>) => {
            const { type, positions: posArr } = event.data
            if (type === 'positions' || type === 'done') {
              const newPositions = arrayToMap(posArr)
              positionsRef.current = newPositions
              setPositions(newPositions)
            }
          }

          w.postMessage({ type: 'init', nodes: simNodes, edges: simEdges })

          return () => {
            w.postMessage({ type: 'stop' })
            w.terminate()
          }
        }
      }

      // ── Synchronous fallback (no Worker available) ────────────
      const sim = createForceSimulation({ nodes: simNodes, edges: simEdges })

      const loop = (): void => {
        const result = sim.tick()
        const newPositions = new Map<string, NodePosition>()
        for (const [id, pos] of result.positions) {
          newPositions.set(id, pos)
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
        setSelectedId((prev) => (prev === id ? null : id))
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
