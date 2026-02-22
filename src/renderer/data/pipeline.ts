/**
 * Data pipeline — converters from everyday data sources to GraphData/EmbeddingData.
 * Enables "everyday computing" by transforming files, bookmarks, documents,
 * images, and clipboard entries into navigable 3D structures.
 */

import type { GraphData, GraphNode, GraphEdge, EmbeddingData, EmbeddingPoint } from '@shared/protocol'

// ─── Input Types ──────────────────────────────────────────────

export interface DirectoryEntry {
  name: string
  path: string
  isDirectory: boolean
  size: number
  children?: DirectoryEntry[]
}

export interface BookmarkEntry {
  url: string
  title: string
  tags?: string[]
}

export interface DocumentChunk {
  id: string
  text: string
  position: { x: number; y: number; z: number }
  source: string
  clusterId?: number
}

export interface ImageEntry {
  id: string
  name: string
  thumbnail: string // base64 data URL
  position?: { x: number; y: number; z: number }
}

export interface ClipboardEntry {
  id: string
  content: string
  timestamp: number
  type: 'text' | 'image' | 'url'
}

// ─── Converters ───────────────────────────────────────────────

/**
 * Convert a directory tree to a graph.
 * Folders and files become nodes, parent-child relationships become edges.
 */
export function directoryToGraph(root: DirectoryEntry): GraphData {
  const nodes: GraphNode[] = []
  const edges: GraphEdge[] = []

  function walk(entry: DirectoryEntry, parentId?: string): void {
    const nodeId = entry.path
    nodes.push({
      id: nodeId,
      label: entry.name,
      color: entry.isDirectory ? '#4a9eff' : '#6bcb77',
      size: entry.isDirectory ? 1.5 : 1.0,
      metadata: {
        path: entry.path,
        size: entry.size,
        isDirectory: entry.isDirectory
      }
    })

    if (parentId) {
      edges.push({ source: parentId, target: nodeId, label: 'contains' })
    }

    if (entry.children) {
      for (const child of entry.children) {
        walk(child, nodeId)
      }
    }
  }

  walk(root)
  return { nodes, edges }
}

/**
 * Convert bookmarks to a graph.
 * Each bookmark is a node; shared tags create edges.
 */
export function bookmarksToGraph(bookmarks: BookmarkEntry[]): GraphData {
  const nodes: GraphNode[] = bookmarks.map(b => ({
    id: b.url,
    label: b.title,
    metadata: { url: b.url, tags: b.tags ?? [] }
  }))

  const edges: GraphEdge[] = []

  // Build tag → bookmarks index
  const tagIndex = new Map<string, string[]>()
  for (const b of bookmarks) {
    for (const tag of b.tags ?? []) {
      let list = tagIndex.get(tag)
      if (!list) {
        list = []
        tagIndex.set(tag, list)
      }
      list.push(b.url)
    }
  }

  // Create edges for shared tags (deduplicated)
  const edgeSet = new Set<string>()
  for (const [tag, urls] of tagIndex) {
    for (let i = 0; i < urls.length; i++) {
      for (let j = i + 1; j < urls.length; j++) {
        const key = urls[i] < urls[j] ? `${urls[i]}|${urls[j]}` : `${urls[j]}|${urls[i]}`
        if (!edgeSet.has(key)) {
          edgeSet.add(key)
          edges.push({ source: urls[i], target: urls[j], label: tag })
        }
      }
    }
  }

  return { nodes, edges }
}

/**
 * Convert pre-embedded document chunks to EmbeddingData.
 */
export function documentsToEmbedding(chunks: DocumentChunk[]): EmbeddingData {
  const points: EmbeddingPoint[] = chunks.map(c => ({
    id: c.id,
    position: { x: c.position.x, y: c.position.y, z: c.position.z },
    clusterId: c.clusterId,
    metadata: { text: c.text, source: c.source }
  }))

  return { points }
}

/**
 * Convert images to graph nodes (for adding to an existing graph or standalone).
 */
export function imagesToGraphNodes(images: ImageEntry[]): GraphNode[] {
  return images.map(img => ({
    id: img.id,
    label: img.name,
    position: img.position,
    metadata: { thumbnail: img.thumbnail }
  }))
}

/**
 * Convert clipboard history to a temporal graph.
 * Sequential entries are connected with directed edges.
 */
export function clipboardToGraph(entries: ClipboardEntry[]): GraphData {
  const nodes: GraphNode[] = entries.map(e => ({
    id: e.id,
    label: e.content.length > 50 ? e.content.slice(0, 50) + '...' : e.content,
    metadata: { content: e.content, type: e.type, timestamp: e.timestamp }
  }))

  const edges: GraphEdge[] = []
  for (let i = 0; i < entries.length - 1; i++) {
    edges.push({
      source: entries[i].id,
      target: entries[i + 1].id,
      label: 'next'
    })
  }

  return { nodes, edges }
}
