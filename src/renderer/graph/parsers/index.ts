/**
 * Graph data parsers — unified entry point.
 */
export { parseJsonGraph } from './json-parser'
export { GraphDataSchema } from '@renderer/data/validators'
export { parseGraphML } from './graphml-parser'

import type { GraphData } from '@shared/protocol'
import { parseJsonGraph } from './json-parser'
import { parseGraphML } from './graphml-parser'

/** Supported graph data formats */
export type GraphFormat = 'json' | 'graphml'

/**
 * Parse graph data from a string in the specified format.
 *
 * @param content - The raw content string (JSON or GraphML XML)
 * @param format - The format identifier
 * @returns Parsed and validated GraphData
 * @throws Error if content is invalid for the given format
 */
export async function parseGraph(
  content: string,
  format: GraphFormat
): Promise<GraphData> {
  switch (format) {
    case 'json':
      return parseJsonGraph(content)
    case 'graphml':
      return parseGraphML(content)
    default:
      throw new Error(`Unsupported graph format: ${format as string}`)
  }
}
