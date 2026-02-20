import { describe, it, expect } from 'vitest'
import {
  validateGraphData,
  validateEmbeddingData,
  validateData,
  GraphDataSchema,
  EmbeddingDataSchema
} from '../validators'

describe('GraphData Validation', () => {
  const validGraph = {
    nodes: [
      { id: 'a', label: 'Node A', size: 2 },
      { id: 'b', label: 'Node B' }
    ],
    edges: [
      { source: 'a', target: 'b', weight: 0.8 }
    ]
  }

  it('should validate a correct graph', () => {
    const result = validateGraphData(validGraph)
    expect(result.success).toBe(true)
    expect(result.data?.nodes.length).toBe(2)
    expect(result.data?.edges.length).toBe(1)
  })

  it('should reject graph with no nodes', () => {
    const result = validateGraphData({ nodes: [], edges: [] })
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors![0]).toContain('at least one node')
  })

  it('should reject graph with invalid node (missing id)', () => {
    const result = validateGraphData({
      nodes: [{ label: 'No ID' }],
      edges: []
    })
    expect(result.success).toBe(false)
  })

  it('should reject graph with empty node id', () => {
    const result = validateGraphData({
      nodes: [{ id: '' }],
      edges: []
    })
    expect(result.success).toBe(false)
  })

  it('should reject edge referencing non-existent source node', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }],
      edges: [{ source: 'nonexistent', target: 'a' }]
    })
    expect(result.success).toBe(false)
    expect(result.errors![0]).toContain('non-existent node')
  })

  it('should reject edge referencing non-existent target node', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }],
      edges: [{ source: 'a', target: 'nonexistent' }]
    })
    expect(result.success).toBe(false)
  })

  it('should allow graph with no edges', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: []
    })
    expect(result.success).toBe(true)
  })

  it('should validate node position', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', position: { x: 1, y: 2, z: 3 } }],
      edges: []
    })
    expect(result.success).toBe(true)
  })

  it('should reject invalid position (missing z)', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', position: { x: 1, y: 2 } }],
      edges: []
    })
    expect(result.success).toBe(false)
  })

  it('should reject negative edge weight', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', weight: -0.5 }]
    })
    expect(result.success).toBe(false)
  })

  it('should reject edge weight > 1', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', weight: 1.5 }]
    })
    expect(result.success).toBe(false)
  })

  it('should accept node with metadata', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', metadata: { key: 'value', nested: { a: 1 } } }],
      edges: []
    })
    expect(result.success).toBe(true)
  })

  it('should reject negative node size', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', size: -1 }],
      edges: []
    })
    expect(result.success).toBe(false)
  })

  it('should accept graph with metadata', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }],
      edges: [],
      metadata: { title: 'Test Graph' }
    })
    expect(result.success).toBe(true)
    expect(result.data?.metadata?.title).toBe('Test Graph')
  })

  it('should reject non-object input', () => {
    expect(validateGraphData(null).success).toBe(false)
    expect(validateGraphData(42).success).toBe(false)
    expect(validateGraphData('string').success).toBe(false)
  })
})

describe('EmbeddingData Validation', () => {
  const validEmbedding = {
    points: [
      { id: 'p1', position: { x: 1, y: 2, z: 3 }, clusterId: 0, label: 'Point 1' }
    ],
    clusters: [
      { id: 0, label: 'Cluster 0', color: '#ff0000' }
    ]
  }

  it('should validate correct embedding data', () => {
    const result = validateEmbeddingData(validEmbedding)
    expect(result.success).toBe(true)
    expect(result.data?.points.length).toBe(1)
  })

  it('should reject embedding with no points', () => {
    const result = validateEmbeddingData({ points: [] })
    expect(result.success).toBe(false)
    expect(result.errors![0]).toContain('at least one point')
  })

  it('should reject point with missing position', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1' }]
    })
    expect(result.success).toBe(false)
  })

  it('should allow points without cluster assignment', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }]
    })
    expect(result.success).toBe(true)
  })

  it('should reject negative cluster ID', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 }, clusterId: -1 }]
    })
    expect(result.success).toBe(false)
  })

  it('should reject non-integer cluster ID', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 }, clusterId: 1.5 }]
    })
    expect(result.success).toBe(false)
  })

  it('should accept embedding without clusters array', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }]
    })
    expect(result.success).toBe(true)
    expect(result.data?.clusters).toBeUndefined()
  })

  it('should validate cluster centroid', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }],
      clusters: [{ id: 0, centroid: { x: 1, y: 2, z: 3 } }]
    })
    expect(result.success).toBe(true)
  })

  it('should accept embedding with metadata', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }],
      metadata: { title: 'Test Embeddings' }
    })
    expect(result.success).toBe(true)
  })
})

describe('Auto-detect Validation', () => {
  it('should detect and validate graph data', () => {
    const result = validateData({
      nodes: [{ id: 'a' }],
      edges: []
    })
    expect(result.success).toBe(true)
  })

  it('should detect and validate embedding data', () => {
    const result = validateData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }]
    })
    expect(result.success).toBe(true)
  })

  it('should reject unknown data format', () => {
    const result = validateData({ foo: 'bar' })
    expect(result.success).toBe(false)
    expect(result.errors![0]).toContain('nodes')
  })

  it('should reject null', () => {
    const result = validateData(null)
    expect(result.success).toBe(false)
  })

  it('should reject primitive values', () => {
    expect(validateData(42).success).toBe(false)
    expect(validateData('string').success).toBe(false)
    expect(validateData(true).success).toBe(false)
  })
})

describe('Zod Schema Direct Usage', () => {
  it('should parse valid graph with GraphDataSchema', () => {
    const result = GraphDataSchema.safeParse({
      nodes: [{ id: 'test' }],
      edges: []
    })
    expect(result.success).toBe(true)
  })

  it('should parse valid embedding with EmbeddingDataSchema', () => {
    const result = EmbeddingDataSchema.safeParse({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }]
    })
    expect(result.success).toBe(true)
  })
})
