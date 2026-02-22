/**
 * Selection info helpers for enriched selection panels.
 * Extracts node/point metadata for display when a user clicks
 * on a graph node or manifold point.
 */

import type { GraphData, EmbeddingData, SelectableObject } from '@shared/protocol'

export interface SelectedNodeInfo {
  id: string
  label: string
  neighborCount: number
  edges: Array<{ targetId: string; targetLabel?: string; weight?: number }>
  metadata?: Record<string, unknown>
}

export interface SelectedPointInfo {
  id: string
  label: string
  position: { x: number; y: number; z: number }
  clusterId?: number
  clusterLabel?: string
  clusterColor?: string
  metadata?: Record<string, unknown>
}

/**
 * Given a node ID and graph data, returns enriched info about the selected
 * node including its neighbors and edge weights.
 * Returns null if the node is not found.
 */
export function getSelectedNodeInfo(nodeId: string, graph: GraphData): SelectedNodeInfo | null {
  const node = graph.nodes.find(n => n.id === nodeId)
  if (!node) return null

  // Find all edges involving this node (either as source or target)
  const connectedEdges = graph.edges.filter(
    e => e.source === nodeId || e.target === nodeId
  )

  const edges = connectedEdges.map(e => {
    const neighborId = e.source === nodeId ? e.target : e.source
    const neighborNode = graph.nodes.find(n => n.id === neighborId)
    return {
      targetId: neighborId,
      targetLabel: neighborNode?.label,
      weight: e.weight
    }
  })

  return {
    id: nodeId,
    label: node.label ?? nodeId,
    neighborCount: edges.length,
    edges,
    metadata: node.metadata
  }
}

/**
 * Given a point ID and embedding data, returns enriched info about the
 * selected point including its cluster assignment.
 * Returns null if the point is not found.
 */
export function getSelectedPointInfo(pointId: string, embeddings: EmbeddingData): SelectedPointInfo | null {
  const point = embeddings.points.find(p => p.id === pointId)
  if (!point) return null

  let clusterLabel: string | undefined
  let clusterColor: string | undefined

  if (point.clusterId !== undefined && embeddings.clusters) {
    const cluster = embeddings.clusters.find(c => c.id === point.clusterId)
    if (cluster) {
      clusterLabel = cluster.label
      clusterColor = cluster.color
    }
  }

  return {
    id: pointId,
    label: point.label ?? pointId,
    position: { ...point.position },
    clusterId: point.clusterId,
    clusterLabel,
    clusterColor,
    metadata: point.metadata
  }
}

/** Unified selection info — resolves any SelectableObject to its display info */
export type SelectionInfo =
  | { kind: 'node'; info: SelectedNodeInfo }
  | { kind: 'point'; info: SelectedPointInfo }
  | { kind: 'cluster'; info: { id: number; label?: string; color?: string } }
  | { kind: 'none' }

export function resolveSelectionInfo(
  obj: SelectableObject | null,
  graphData: GraphData | null,
  embeddingData: EmbeddingData | null
): SelectionInfo {
  if (!obj) return { kind: 'none' }

  switch (obj.kind) {
    case 'node': {
      if (graphData) {
        const info = getSelectedNodeInfo(obj.id, graphData)
        if (info) return { kind: 'node', info }
      }
      // Fall through: might be an embedding point stored as node kind
      if (embeddingData) {
        const info = getSelectedPointInfo(obj.id, embeddingData)
        if (info) return { kind: 'point', info }
      }
      return { kind: 'none' }
    }
    case 'point': {
      if (embeddingData) {
        const info = getSelectedPointInfo(obj.id, embeddingData)
        if (info) return { kind: 'point', info }
      }
      return { kind: 'none' }
    }
    case 'cluster': {
      if (embeddingData?.clusters) {
        const cluster = embeddingData.clusters.find(c => c.id === obj.id)
        if (cluster) return { kind: 'cluster', info: { id: cluster.id, label: cluster.label, color: cluster.color } }
      }
      return { kind: 'none' }
    }
    default:
      return { kind: 'none' }
  }
}
