/**
 * Zod schemas for validating graph and embedding data on import.
 */

import { z } from 'zod'
import type { GraphData, EmbeddingData } from '@shared/protocol'

// ─── Graph Schemas ──────────────────────────────────────────────

export const GraphNodeSchema = z.object({
  id: z.string().min(1),
  label: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number()
  }).optional(),
  color: z.string().optional(),
  size: z.number().positive().optional(),
  metadata: z.record(z.unknown()).optional()
})

export const GraphEdgeSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  weight: z.number().min(0).max(1).optional(),
  label: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
})

export const GraphDataSchema = z.object({
  nodes: z.array(GraphNodeSchema)
    .min(1, 'Graph must have at least one node')
    .max(10_000_000, 'Node count exceeds 10 million limit'),
  edges: z.array(GraphEdgeSchema)
    .max(50_000_000, 'Edge count exceeds 50 million limit'),
  metadata: z.record(z.unknown()).optional()
})

// ─── Embedding Schemas ──────────────────────────────────────────

export const EmbeddingPointSchema = z.object({
  id: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number()
  }),
  clusterId: z.number().int().min(0).optional(),
  label: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
})

export const ClusterSchema = z.object({
  id: z.number().int().min(0),
  label: z.string().optional(),
  color: z.string().optional(),
  centroid: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number()
  }).optional()
})

export const EmbeddingDataSchema = z.object({
  points: z.array(EmbeddingPointSchema)
    .min(1, 'Embedding must have at least one point')
    .max(10_000_000, 'Point count exceeds 10 million limit'),
  clusters: z.array(ClusterSchema).optional(),
  metadata: z.record(z.unknown()).optional()
})

// ─── Validation Functions ───────────────────────────────────────

export interface ValidationResult<T> {
  success: boolean
  data?: T
  errors?: string[]
}

export function validateGraphData(input: unknown): ValidationResult<GraphData> {
  const result = GraphDataSchema.safeParse(input)
  if (result.success) {
    // Additional validation: check edge references
    const nodeIds = new Set(result.data.nodes.map(n => n.id))
    const badEdges = result.data.edges.filter(
      e => !nodeIds.has(e.source) || !nodeIds.has(e.target)
    )
    if (badEdges.length > 0) {
      return {
        success: false,
        errors: badEdges.map(e =>
          `Edge ${e.source} → ${e.target}: references non-existent node`
        )
      }
    }
    return { success: true, data: result.data as GraphData }
  }
  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
  }
}

export function validateEmbeddingData(input: unknown): ValidationResult<EmbeddingData> {
  const result = EmbeddingDataSchema.safeParse(input)
  if (result.success) {
    return { success: true, data: result.data as EmbeddingData }
  }
  return {
    success: false,
    errors: result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
  }
}

/** Auto-detect data type and validate */
export function validateData(input: unknown): ValidationResult<GraphData | EmbeddingData> {
  // Check if it looks like graph data (has nodes+edges)
  if (input && typeof input === 'object' && 'nodes' in input && 'edges' in input) {
    return validateGraphData(input)
  }
  // Check if it looks like embedding data (has points)
  if (input && typeof input === 'object' && 'points' in input) {
    return validateEmbeddingData(input)
  }
  return {
    success: false,
    errors: ['Data must have either "nodes"+"edges" (graph) or "points" (embedding)']
  }
}
