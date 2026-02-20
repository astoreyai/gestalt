/**
 * JSON graph data parser with Zod schema validation.
 */
import { z } from 'zod'
import type { GraphData } from '@shared/protocol'

/** Zod schema for a single graph node */
const GraphNodeSchema = z.object({
  id: z.string().min(1, 'Node id must be a non-empty string'),
  label: z.string().optional(),
  position: z
    .object({
      x: z.number(),
      y: z.number(),
      z: z.number()
    })
    .optional(),
  color: z.string().optional(),
  size: z.number().positive('Node size must be positive').optional(),
  metadata: z.record(z.unknown()).optional()
})

/** Zod schema for a single graph edge */
const GraphEdgeSchema = z.object({
  source: z.string().min(1, 'Edge source must be a non-empty string'),
  target: z.string().min(1, 'Edge target must be a non-empty string'),
  weight: z.number().min(0, 'Edge weight must be non-negative').optional(),
  label: z.string().optional(),
  metadata: z.record(z.unknown()).optional()
})

/** Zod schema for the complete graph data structure */
export const GraphDataSchema = z.object({
  nodes: z
    .array(GraphNodeSchema)
    .min(1, 'Graph must have at least one node'),
  edges: z.array(GraphEdgeSchema),
  metadata: z.record(z.unknown()).optional()
})

/**
 * Parse a JSON string into validated GraphData.
 *
 * @param json - The JSON string to parse
 * @returns Validated GraphData object
 * @throws Error with descriptive message if JSON is invalid or doesn't match schema
 */
export function parseJsonGraph(json: string): GraphData {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    throw new Error(`Invalid JSON: ${message}`)
  }

  const result = GraphDataSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid graph data: ${issues}`)
  }

  // Validate that all edge source/target IDs reference existing nodes
  const nodeIds = new Set(result.data.nodes.map((n) => n.id))
  for (const edge of result.data.edges) {
    if (!nodeIds.has(edge.source)) {
      throw new Error(
        `Edge references non-existent source node: "${edge.source}"`
      )
    }
    if (!nodeIds.has(edge.target)) {
      throw new Error(
        `Edge references non-existent target node: "${edge.target}"`
      )
    }
  }

  return result.data as GraphData
}
