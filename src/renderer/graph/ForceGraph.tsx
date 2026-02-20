/**
 * ForceGraph — 3D force-directed graph layout and visualization.
 * Uses d3-force-3d for physics simulation and composes Nodes + Edges components.
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
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter
} from 'd3-force-3d'
import type { GraphData } from '@shared/protocol'
import { Nodes, type NodePosition } from './Nodes'
import { Edges } from './Edges'

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

/** Internal node type for d3-force simulation (mutable positions) */
interface SimNode {
  id: string
  x: number
  y: number
  z: number
  index?: number
}

/** Internal link type for d3-force simulation */
interface SimLink {
  source: string | SimNode
  target: string | SimNode
  weight?: number
}

/**
 * ForceGraph component.
 * Runs a d3-force-3d simulation and renders nodes/edges via instanced rendering.
 */
export const ForceGraph = forwardRef<ForceGraphHandle, ForceGraphProps>(
  function ForceGraph({ data, onNodeClick, onNodeHover }, ref) {
    const { camera } = useThree()
    const [positions, setPositions] = useState<Map<string, NodePosition>>(
      () => new Map()
    )
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [hoveredId, setHoveredId] = useState<string | null>(null)
    const simulationRef = useRef<ReturnType<typeof forceSimulation> | null>(null)
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

      // Create simulation nodes with initial positions
      const simNodes: SimNode[] = data.nodes.map((node) => ({
        id: node.id,
        x: node.position?.x ?? (Math.random() - 0.5) * 50,
        y: node.position?.y ?? (Math.random() - 0.5) * 50,
        z: node.position?.z ?? (Math.random() - 0.5) * 50
      }))

      // Create links
      const simLinks: SimLink[] = data.edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        weight: edge.weight
      }))

      // Configure simulation
      const sim = forceSimulation(simNodes, 3)
        .force(
          'charge',
          forceManyBody().strength(-40).distanceMax(200)
        )
        .force(
          'link',
          forceLink(simLinks)
            .id((d: SimNode) => d.id)
            .distance(15)
            .strength((link: SimLink) => {
              const w = typeof link.weight === 'number' ? link.weight : 0.5
              return 0.3 + w * 0.7
            })
        )
        .force('center', forceCenter(0, 0, 0).strength(0.05))
        .alphaDecay(0.02)
        .velocityDecay(0.3)

      simulationRef.current = sim

      // Tick handler: extract positions from simulation nodes
      const tick = (): void => {
        const newPositions = new Map<string, NodePosition>()
        for (const node of simNodes) {
          newPositions.set(node.id, {
            x: node.x ?? 0,
            y: node.y ?? 0,
            z: node.z ?? 0
          })
        }
        positionsRef.current = newPositions
        setPositions(newPositions)

        if (sim.alpha() > sim.alphaMin()) {
          animFrameRef.current = requestAnimationFrame(tick)
        }
      }

      // Start simulation loop
      sim.stop() // We drive it manually via requestAnimationFrame
      const manualTick = (): void => {
        sim.tick()
        tick()
      }
      animFrameRef.current = requestAnimationFrame(function loop() {
        manualTick()
        if (sim.alpha() > sim.alphaMin()) {
          animFrameRef.current = requestAnimationFrame(loop)
        }
      })

      return () => {
        if (animFrameRef.current !== 0) {
          cancelAnimationFrame(animFrameRef.current)
          animFrameRef.current = 0
        }
        if (simulationRef.current) {
          simulationRef.current.stop()
          simulationRef.current = null
        }
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
