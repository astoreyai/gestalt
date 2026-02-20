/**
 * JSON graph data parser with Zod schema validation.
 * Reuses schemas from the central validators module to avoid duplication.
 */
import type { GraphData } from '@shared/protocol'
import { GraphDataSchema } from '@renderer/data/validators'

/**
 * Parse a JSON string into validated GraphData.
 *
 * The function is async to yield the event loop between heavy operations
 * (JSON.parse, Zod validation, edge-reference check) so the renderer
 * thread stays responsive for large files.
 *
 * NOTE: JSON.parse itself is synchronous and blocks until complete.
 * For truly large files (>1M nodes) a Web Worker with a streaming JSON
 * parser (e.g. oboe.js / clarinet) would be ideal.
 *
 * @param json - The JSON string to parse
 * @returns Validated GraphData object
 * @throws Error with descriptive message if JSON is invalid or doesn't match schema
 */
export async function parseJsonGraph(json: string): Promise<GraphData> {
  // Yield before the synchronous JSON.parse
  await new Promise(resolve => setTimeout(resolve, 0))

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    throw new Error(`Invalid JSON: ${message}`)
  }

  // Yield before Zod schema validation
  await new Promise(resolve => setTimeout(resolve, 0))

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
