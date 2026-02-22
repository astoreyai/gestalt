/**
 * PointCloud component for rendering embedding points in 3D.
 * Uses THREE.Points with BufferGeometry for high-performance rendering
 * of 5K+ points at 60 FPS.
 *
 * Performance optimisations:
 * - O(1) per-frame hover highlight (only updates prev + current point)
 */

import React, { useRef, useMemo, useCallback, useEffect } from 'react'
import { useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import {
  Points,
  Raycaster,
  BufferAttribute,
  BufferGeometry
} from 'three'
import type { EmbeddingData, EmbeddingPoint } from '@shared/protocol'
import { CLUSTER_COLORS } from './types'

export interface PointCloudProps {
  /** Embedding data containing all points */
  data: EmbeddingData
  /** Currently selected cluster (highlighted) */
  selectedCluster?: number
  /** ID of the currently hovered point */
  hoveredPointId?: string
  /** Called when a point is hovered (null when nothing hovered) */
  onPointHover?: (point: EmbeddingPoint | null) => void
  /** Called when a point is clicked */
  onPointClick?: (point: EmbeddingPoint) => void
  /** Base point size in pixels */
  pointSize?: number
}

/** Parse hex color string to RGB components in [0, 1] */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return { r: 1, g: 1, b: 1 }
  return {
    r: parseInt(result[1], 16) / 255,
    g: parseInt(result[2], 16) / 255,
    b: parseInt(result[3], 16) / 255
  }
}

/** Get the color for a given cluster ID */
function getClusterColor(clusterId: number | undefined, data: EmbeddingData): string {
  if (clusterId === undefined) return '#ffffff'
  // Check if the cluster has a custom color in the data
  const cluster = data.clusters?.find((c) => c.id === clusterId)
  if (cluster?.color) return cluster.color
  // Fall back to categorical palette
  const idx = clusterId >= 0 ? clusterId % CLUSTER_COLORS.length : 0
  return CLUSTER_COLORS[idx]
}

export function PointCloud({
  data,
  selectedCluster,
  hoveredPointId,
  onPointHover,
  onPointClick,
  pointSize = 4.0
}: PointCloudProps): React.ReactElement | null {
  const pointsRef = useRef<Points>(null)
  const raycasterRef = useRef<Raycaster | null>(null)
  // Lazy-init raycaster with pre-configured params to avoid per-callback re-setting
  if (raycasterRef.current === null) {
    const rc = new Raycaster()
    rc.params.Points = { threshold: 0.5 }
    raycasterRef.current = rc
  }
  const { camera, pointer } = useThree()

  // Track which buffer indices are currently / previously hovered so the
  // per-frame update only touches O(1) points instead of O(n).
  const prevHoveredIndexRef = useRef<number | null>(null)
  const currentHoveredIndexRef = useRef<number | null>(null)

  // Index map for fast lookups from buffer index to EmbeddingPoint
  const pointIndex = useMemo(() => {
    const map = new Map<number, EmbeddingPoint>()
    data.points.forEach((p, i) => map.set(i, p))
    return map
  }, [data.points])

  // Reverse map: point id -> buffer index
  const idToIndex = useMemo(() => {
    const map = new Map<string, number>()
    data.points.forEach((p, i) => map.set(p.id, i))
    return map
  }, [data.points])

  // Build buffer attributes
  const { positions, colors, sizes } = useMemo(() => {
    const count = data.points.length
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)
    const sz = new Float32Array(count)

    for (let i = 0; i < count; i++) {
      const point = data.points[i]
      const i3 = i * 3

      // Position
      pos[i3] = point.position.x
      pos[i3 + 1] = point.position.y
      pos[i3 + 2] = point.position.z

      // Color by cluster
      const hex = getClusterColor(point.clusterId, data)
      const rgb = hexToRgb(hex)

      // Dim non-selected clusters when a cluster is selected
      const dimFactor =
        selectedCluster !== undefined && point.clusterId !== selectedCluster ? 0.25 : 1.0

      col[i3] = rgb.r * dimFactor
      col[i3 + 1] = rgb.g * dimFactor
      col[i3 + 2] = rgb.b * dimFactor

      // Size
      sz[i] = pointSize
    }

    return { positions: pos, colors: col, sizes: sz }
  }, [data, selectedCluster, pointSize])

  // Dispose geometry and material on unmount (P0-5)
  useEffect(() => {
    return () => {
      const pts = pointsRef.current
      if (pts) {
        pts.geometry.dispose()
        if (Array.isArray(pts.material)) {
          pts.material.forEach((m) => m.dispose())
        } else {
          pts.material.dispose()
        }
      }
    }
  }, [])

  // O(1) per-frame hover highlight: only update the previously-hovered and
  // currently-hovered buffer indices instead of scanning all N points.
  useFrame(() => {
    if (!pointsRef.current) return
    const geom = pointsRef.current.geometry
    const colorAttr = geom.getAttribute('color') as BufferAttribute
    const sizeAttr = geom.getAttribute('size') as BufferAttribute

    if (!colorAttr || !sizeAttr) return

    // Resolve the current hovered buffer index from the prop
    const newHoveredIndex =
      hoveredPointId != null ? (idToIndex.get(hoveredPointId) ?? null) : null
    const prevIndex = currentHoveredIndexRef.current

    // If hovered point hasn't changed, nothing to do
    if (newHoveredIndex === prevIndex) return

    let needsColorUpdate = false
    let needsSizeUpdate = false

    // Restore previous hovered point to its base colour / size
    if (prevIndex !== null && prevIndex < data.points.length) {
      const point = data.points[prevIndex]
      const hex = getClusterColor(point.clusterId, data)
      const rgb = hexToRgb(hex)
      const dimFactor =
        selectedCluster !== undefined && point.clusterId !== selectedCluster ? 0.25 : 1.0
      const i3 = prevIndex * 3

      colorAttr.array[i3] = rgb.r * dimFactor
      colorAttr.array[i3 + 1] = rgb.g * dimFactor
      colorAttr.array[i3 + 2] = rgb.b * dimFactor
      sizeAttr.array[prevIndex] = pointSize
      needsColorUpdate = true
      needsSizeUpdate = true
    }

    // Highlight the newly hovered point
    if (newHoveredIndex !== null && newHoveredIndex < data.points.length) {
      const i3 = newHoveredIndex * 3
      colorAttr.array[i3] = 1.0
      colorAttr.array[i3 + 1] = 1.0
      colorAttr.array[i3 + 2] = 1.0
      sizeAttr.array[newHoveredIndex] = pointSize * 2.0
      needsColorUpdate = true
      needsSizeUpdate = true
    }

    // Bookkeeping
    prevHoveredIndexRef.current = prevIndex
    currentHoveredIndexRef.current = newHoveredIndex

    if (needsColorUpdate) colorAttr.needsUpdate = true
    if (needsSizeUpdate) sizeAttr.needsUpdate = true
  })

  // Raycasting for hover and click
  const handlePointerMove = useCallback(
    (_event: ThreeEvent<PointerEvent>) => {
      if (!pointsRef.current || !onPointHover || !raycasterRef.current) return

      raycasterRef.current.setFromCamera(pointer, camera)

      const intersects = raycasterRef.current.intersectObject(pointsRef.current)
      if (intersects.length > 0 && intersects[0].index !== undefined) {
        const point = pointIndex.get(intersects[0].index)
        if (point) {
          onPointHover(point)
          return
        }
      }
      onPointHover(null)
    },
    [camera, pointer, onPointHover, pointIndex]
  )

  const handleClick = useCallback(
    (_event: ThreeEvent<MouseEvent>) => {
      if (!pointsRef.current || !onPointClick || !raycasterRef.current) return

      raycasterRef.current.setFromCamera(pointer, camera)

      const intersects = raycasterRef.current.intersectObject(pointsRef.current)
      if (intersects.length > 0 && intersects[0].index !== undefined) {
        const point = pointIndex.get(intersects[0].index)
        if (point) {
          onPointClick(point)
        }
      }
    },
    [camera, pointer, onPointClick, pointIndex]
  )

  // Build geometry imperatively so buffer attributes are always valid
  const geometry = useMemo(() => {
    const geom = new BufferGeometry()
    geom.setAttribute('position', new BufferAttribute(positions, 3))
    geom.setAttribute('color', new BufferAttribute(colors, 3))
    geom.setAttribute('size', new BufferAttribute(sizes, 1))
    return geom
  }, [positions, colors, sizes])

  if (data.points.length === 0) return null

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      onPointerMove={handlePointerMove}
      onClick={handleClick}
    >
      <pointsMaterial
        vertexColors
        size={pointSize}
        sizeAttenuation={false}
        transparent
        opacity={0.9}
        depthWrite={false}
      />
    </points>
  )
}
