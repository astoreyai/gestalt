/**
 * GraphML XML format parser.
 * Converts GraphML XML into the internal GraphData structure.
 */
import type { GraphData, GraphNode, GraphEdge } from '@shared/protocol'

/**
 * Parse a GraphML XML string into GraphData.
 *
 * Handles:
 * - Node and edge elements with id attributes
 * - <data> elements for node/edge attributes (label, color, weight, size, etc.)
 * - <key> declarations for attribute type mapping
 *
 * NOTE: DOMParser.parseFromString is inherently synchronous. For very
 * large GraphML files a SAX/streaming parser (e.g. sax-js) running in a
 * Web Worker would avoid blocking the main thread entirely.
 *
 * @param xml - The GraphML XML string
 * @returns Parsed GraphData
 * @throws Error if XML is malformed or missing required elements
 */
export async function parseGraphML(xml: string): Promise<GraphData> {
  // Yield to the event loop before the synchronous DOMParser call
  await new Promise(resolve => setTimeout(resolve, 0))
  const parser = new DOMParser()
  const doc = parser.parseFromString(xml, 'application/xml')

  // Check for XML parse errors
  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error(`Invalid XML: ${parseError.textContent}`)
  }

  // Find the <graph> element
  const graphEl = doc.querySelector('graph')
  if (!graphEl) {
    throw new Error('No <graph> element found in GraphML document')
  }

  // Parse <key> declarations to map key IDs to attribute names and types
  const keyMap = new Map<
    string,
    { name: string; type: string; for: string; default?: string }
  >()
  const keyEls = doc.querySelectorAll('key')
  keyEls.forEach((keyEl) => {
    const id = keyEl.getAttribute('id')
    const attrName = keyEl.getAttribute('attr.name')
    const attrType = keyEl.getAttribute('attr.type') || 'string'
    const forAttr = keyEl.getAttribute('for') || 'all'
    const defaultEl = keyEl.querySelector('default')
    if (id && attrName) {
      keyMap.set(id, {
        name: attrName,
        type: attrType,
        for: forAttr,
        default: defaultEl?.textContent ?? undefined
      })
    }
  })

  // Parse nodes — use getElementsByTagName and filter by direct parent
  // because :scope selector is not reliably supported in all DOM implementations
  const allNodeEls = graphEl.getElementsByTagName('node')
  const nodeEls = Array.from(allNodeEls).filter(
    (el) => el.parentNode === graphEl
  )
  if (nodeEls.length === 0) {
    throw new Error('Graph must contain at least one node')
  }

  const nodes: GraphNode[] = []
  const nodeIds = new Set<string>()

  nodeEls.forEach((nodeEl) => {
    const id = nodeEl.getAttribute('id')
    if (!id) {
      throw new Error('Node element missing required "id" attribute')
    }
    nodeIds.add(id)

    const attrs = extractDataAttributes(nodeEl, keyMap)
    const node: GraphNode = { id }

    if (attrs.label !== undefined) {
      node.label = String(attrs.label)
    }
    if (attrs.color !== undefined) {
      node.color = String(attrs.color)
    }
    if (attrs.size !== undefined) {
      const size = Number(attrs.size)
      if (!isNaN(size) && size > 0) {
        node.size = size
      }
    }
    if (
      attrs.x !== undefined &&
      attrs.y !== undefined
    ) {
      node.position = {
        x: Number(attrs.x) || 0,
        y: Number(attrs.y) || 0,
        z: Number(attrs.z) || 0
      }
    }

    // Collect remaining attributes as metadata
    const knownKeys = new Set(['label', 'color', 'size', 'x', 'y', 'z'])
    const metadata: Record<string, unknown> = {}
    let hasMetadata = false
    for (const [key, value] of Object.entries(attrs)) {
      if (!knownKeys.has(key)) {
        metadata[key] = value
        hasMetadata = true
      }
    }
    if (hasMetadata) {
      node.metadata = metadata
    }

    nodes.push(node)
  })

  // Parse edges — filter for direct children of graph element
  const allEdgeEls = graphEl.getElementsByTagName('edge')
  const edgeEls = Array.from(allEdgeEls).filter(
    (el) => el.parentNode === graphEl
  )
  const edges: GraphEdge[] = []

  edgeEls.forEach((edgeEl) => {
    const source = edgeEl.getAttribute('source')
    const target = edgeEl.getAttribute('target')

    if (!source || !target) {
      throw new Error('Edge element missing required "source" or "target" attribute')
    }
    if (!nodeIds.has(source)) {
      throw new Error(`Edge references non-existent source node: "${source}"`)
    }
    if (!nodeIds.has(target)) {
      throw new Error(`Edge references non-existent target node: "${target}"`)
    }

    const attrs = extractDataAttributes(edgeEl, keyMap)
    const edge: GraphEdge = { source, target }

    if (attrs.weight !== undefined) {
      const weight = Number(attrs.weight)
      if (!isNaN(weight)) {
        edge.weight = weight
      }
    }
    if (attrs.label !== undefined) {
      edge.label = String(attrs.label)
    }

    // Collect remaining attributes as metadata
    const knownKeys = new Set(['weight', 'label'])
    const metadata: Record<string, unknown> = {}
    let hasMetadata = false
    for (const [key, value] of Object.entries(attrs)) {
      if (!knownKeys.has(key)) {
        metadata[key] = value
        hasMetadata = true
      }
    }
    if (hasMetadata) {
      edge.metadata = metadata
    }

    edges.push(edge)
  })

  // Extract graph-level metadata
  const graphAttrs = extractDataAttributes(graphEl, keyMap)
  const metadata =
    Object.keys(graphAttrs).length > 0 ? graphAttrs : undefined

  return { nodes, edges, metadata }
}

/**
 * Extract <data> element values from a GraphML element,
 * mapping key IDs to attribute names using the key declarations.
 */
function extractDataAttributes(
  el: Element,
  keyMap: Map<
    string,
    { name: string; type: string; for: string; default?: string }
  >
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  const allDataEls = el.getElementsByTagName('data')
  const dataEls = Array.from(allDataEls).filter(
    (d) => d.parentNode === el
  )

  dataEls.forEach((dataEl) => {
    const keyId = dataEl.getAttribute('key')
    if (!keyId) return

    const keyDef = keyMap.get(keyId)
    const name = keyDef?.name ?? keyId
    const rawValue = dataEl.textContent ?? ''

    result[name] = coerceValue(rawValue, keyDef?.type ?? 'string')
  })

  return result
}

/**
 * Coerce a string value to the appropriate type based on GraphML type declaration.
 */
function coerceValue(value: string, type: string): unknown {
  switch (type) {
    case 'int':
    case 'long':
      return parseInt(value, 10)
    case 'float':
    case 'double':
      return parseFloat(value)
    case 'boolean':
      return value.toLowerCase() === 'true'
    default:
      return value
  }
}
