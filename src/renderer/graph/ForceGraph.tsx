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
import { Vector2, Vector3, Raycaster } from 'three'
import type { GraphData } from '@shared/protocol'
import { Nodes, type NodePosition } from './Nodes'
import { Edges } from './Edges'
import { createForceSimulation } from './force-layout'

/** Public imperative API exposed via ref */
export interface ForceGraphHandle {
  /** Center the camera on a specific node */
  centerOnNode: (id: string) => void
}

export interface ForceGraphProps {
  /** The graph data to visualize */
  data: GraphData
  /** Currently selected node id (from store — left hand / primary) */
  selectedNodeId?: string | null
  /** Secondary selected node id (right hand) */
  secondarySelectedNodeId?: string | null
  /** Normalized hand positions for gesture-based hover (0..1 screen coords), one per hand */
  gesturePositions?: Array<{ x: number; y: number }>
  /** Drag nodes: project hand positions to 3D and override node positions */
  dragPositions?: Array<{ nodeId: string; x: number; y: number }>
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
  function ForceGraph({ data, selectedNodeId, secondarySelectedNodeId, gesturePositions, dragPositions, onNodeClick, onNodeHover }, ref) {
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
    /** Throttle setPositions to ~30fps to halve React re-renders during simulation */
    const lastSetTimeRef = useRef<number>(0)
    const SET_POSITIONS_INTERVAL = 33 // ms (~30fps)

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

        // Throttle React state updates to ~30fps; useFrame reads positionsRef directly
        const now = performance.now()
        if (result.done || now - lastSetTimeRef.current >= SET_POSITIONS_INTERVAL) {
          lastSetTimeRef.current = now
          setPositions(newPositions)
        }

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

    // Pre-allocated objects for gesture raycasting (avoid per-frame allocation)
    const hoverRaycasterRef = useRef(new Raycaster())
    const hoverVecRef = useRef(new Vector3())
    const hoverNdcRef = useRef(new Vector2())

    // Spatial hash for O(nearby) gesture raycasting instead of O(all nodes)
    const spatialHashRef = useRef<Map<string, string[]>>(new Map())
    const spatialCellSizeRef = useRef(10)
    const spatialHashVersionRef = useRef<Map<string, NodePosition> | null>(null)

    // Rebuild spatial hash when positions change
    useEffect(() => {
      const pos = positionsRef.current
      if (pos === spatialHashVersionRef.current) return
      spatialHashVersionRef.current = pos

      const hash = spatialHashRef.current
      hash.clear()
      if (pos.size === 0) return

      // Adaptive cell size based on bounding box
      let minX = Infinity, maxX = -Infinity
      let minY = Infinity, maxY = -Infinity
      let minZ = Infinity, maxZ = -Infinity
      for (const p of pos.values()) {
        if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
        if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z
      }
      const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ, 1)
      const cellSize = Math.max(1, extent / 20) // ~20 cells per axis
      spatialCellSizeRef.current = cellSize

      for (const [id, p] of pos) {
        const key = `${Math.floor(p.x / cellSize)},${Math.floor(p.y / cellSize)},${Math.floor(p.z / cellSize)}`
        const bucket = hash.get(key)
        if (bucket) bucket.push(id)
        else hash.set(key, [id])
      }
    })

    // Gesture-based hover: cast rays using spatial hash for O(nearby) lookup
    useEffect(() => {
      if (!gesturePositions || gesturePositions.length === 0) return
      const pos = positionsRef.current
      if (pos.size === 0) return

      const raycaster = hoverRaycasterRef.current
      const v = hoverVecRef.current
      const ndc = hoverNdcRef.current
      const hash = spatialHashRef.current
      const cellSize = spatialCellSizeRef.current
      let closestId: string | null = null
      let closestDist = Infinity

      const hoverThreshold = Math.max(2, camera.position.length() * 0.15)
      const searchRadius = Math.ceil(hoverThreshold / cellSize) + 1

      for (const gp of gesturePositions) {
        ndc.set(gp.x * 2 - 1, -(gp.y * 2 - 1))
        raycaster.setFromCamera(ndc, camera)
        const ray = raycaster.ray

        // Estimate world position along ray at mid-scene depth
        const approx = ray.at(camera.position.length() * 0.5, v)
        const cx = Math.floor(approx.x / cellSize)
        const cy = Math.floor(approx.y / cellSize)
        const cz = Math.floor(approx.z / cellSize)

        // Search only nearby cells
        for (let dx = -searchRadius; dx <= searchRadius; dx++) {
          for (let dy = -searchRadius; dy <= searchRadius; dy++) {
            for (let dz = -searchRadius; dz <= searchRadius; dz++) {
              const bucket = hash.get(`${cx + dx},${cy + dy},${cz + dz}`)
              if (!bucket) continue
              for (const id of bucket) {
                const nodePos = pos.get(id)
                if (!nodePos) continue
                v.set(nodePos.x, nodePos.y, nodePos.z)
                const dist = ray.distanceToPoint(v)
                if (dist < closestDist) {
                  closestDist = dist
                  closestId = id
                }
              }
            }
          }
        }
      }

      if (closestId && closestDist < hoverThreshold) {
        handleNodeHover(closestId)
      } else {
        handleNodeHover(null)
      }
    }, [gesturePositions, camera, handleNodeHover])

    // Multi-drag: hand must reach the node (ray proximity) before dragging begins.
    // Once grabbed, node follows hand movement as a delta (no snapping).
    const dragOffsetsRef = useRef<Map<string, Vector3>>(new Map())
    const dragActiveRef = useRef<Set<string>>(new Set())
    const dragRaycasterRef = useRef(new Raycaster())
    const dragNodeVecRef = useRef(new Vector3())
    const dragHandVecRef = useRef(new Vector3())
    const dragNdcRef = useRef(new Vector2())
    const dragFallbackOffset = useRef(new Vector3())

    useEffect(() => {
      if (!dragPositions || dragPositions.length === 0) {
        dragOffsetsRef.current.clear()
        dragActiveRef.current.clear()
        return
      }

      const raycaster = dragRaycasterRef.current
      const nodeVec = dragNodeVecRef.current
      const handVec = dragHandVecRef.current
      const ndc = dragNdcRef.current
      let updated: Map<string, NodePosition> | null = null
      // Scale grab threshold by camera distance — easier to grab when zoomed out
      const cameraDist = camera.position.length()
      const GRAB_THRESHOLD = Math.max(2, cameraDist * 0.15)

      for (const dp of dragPositions) {
        const pos = updated ?? positionsRef.current
        const nodePos = pos.get(dp.nodeId)
        if (!nodePos) continue

        ndc.set(dp.x * 2 - 1, -(dp.y * 2 - 1))
        raycaster.setFromCamera(ndc, camera)

        nodeVec.set(nodePos.x, nodePos.y, nodePos.z)
        const distToCamera = nodeVec.distanceTo(camera.position)
        const handWorldPos = raycaster.ray.at(distToCamera, handVec)

        if (!dragActiveRef.current.has(dp.nodeId)) {
          const rayDist = raycaster.ray.distanceToPoint(nodeVec)
          if (rayDist > GRAB_THRESHOLD) continue

          dragActiveRef.current.add(dp.nodeId)
          dragOffsetsRef.current.set(dp.nodeId, nodeVec.clone().sub(handWorldPos))
        }

        const offset = dragOffsetsRef.current.get(dp.nodeId) ?? dragFallbackOffset.current.set(0, 0, 0)
        const newPos = handWorldPos.add(offset)

        if (!updated) updated = new Map(positionsRef.current)
        updated.set(dp.nodeId, { x: newPos.x, y: newPos.y, z: newPos.z })
      }

      const activeNodeIds = new Set(dragPositions.map(dp => dp.nodeId))
      for (const id of dragActiveRef.current) {
        if (!activeNodeIds.has(id)) {
          dragActiveRef.current.delete(id)
          dragOffsetsRef.current.delete(id)
        }
      }

      if (updated) {
        positionsRef.current = updated
        setPositions(updated)
      }
    }, [dragPositions, camera])

    return (
      <group>
        <Edges
          edges={data.edges}
          positions={positions}
          selectedId={selectedId}
          secondarySelectedId={secondarySelectedNodeId}
        />
        <Nodes
          nodes={data.nodes}
          positions={positions}
          selectedId={selectedId}
          secondarySelectedId={secondarySelectedNodeId}
          hoveredId={hoveredId}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
        />
      </group>
    )
  }
)
