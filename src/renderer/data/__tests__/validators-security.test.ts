/**
 * Security regression tests for data validators.
 * Verifies rejection of malicious/malformed input that could crash the app.
 */
import { describe, it, expect } from 'vitest'
import {
  validateGraphData,
  validateEmbeddingData,
  validateData,
  GraphDataSchema,
  EmbeddingDataSchema
} from '../validators'

describe('Position validation — NaN/Infinity rejection', () => {
  it('should reject NaN in node position x', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', position: { x: NaN, y: 0, z: 0 } }],
      edges: []
    })
    expect(result.success).toBe(false)
    expect(result.errors?.some(e => e.includes('position'))).toBe(true)
  })

  it('should reject Infinity in node position y', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', position: { x: 0, y: Infinity, z: 0 } }],
      edges: []
    })
    expect(result.success).toBe(false)
  })

  it('should reject -Infinity in node position z', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', position: { x: 0, y: 0, z: -Infinity } }],
      edges: []
    })
    expect(result.success).toBe(false)
  })

  it('should reject NaN in embedding point position', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: NaN, y: 0, z: 0 } }]
    })
    expect(result.success).toBe(false)
  })

  it('should reject Infinity in embedding point position', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: Infinity, z: 0 } }]
    })
    expect(result.success).toBe(false)
  })

  it('should accept valid finite positions', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', position: { x: 1.5, y: -3.2, z: 0.001 } }],
      edges: []
    })
    expect(result.success).toBe(true)
  })
})

describe('Duplicate node ID detection', () => {
  it('should reject graph with duplicate node IDs', () => {
    const result = validateGraphData({
      nodes: [
        { id: 'dup', label: 'First' },
        { id: 'dup', label: 'Second' },
        { id: 'unique' }
      ],
      edges: []
    })
    expect(result.success).toBe(false)
    expect(result.errors?.some(e => e.includes('Duplicate node IDs'))).toBe(true)
  })

  it('should reject graph with multiple duplicate groups', () => {
    const result = validateGraphData({
      nodes: [
        { id: 'a' },
        { id: 'b' },
        { id: 'a' },
        { id: 'b' },
        { id: 'c' }
      ],
      edges: []
    })
    expect(result.success).toBe(false)
    expect(result.errors?.some(e => e.includes('a'))).toBe(true)
    expect(result.errors?.some(e => e.includes('b'))).toBe(true)
  })

  it('should accept graph with unique IDs', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: []
    })
    expect(result.success).toBe(true)
  })
})

describe('Edge reference validation', () => {
  it('should reject edges referencing non-existent nodes', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'nonexistent' }]
    })
    expect(result.success).toBe(false)
    expect(result.errors?.some(e => e.includes('non-existent node'))).toBe(true)
  })

  it('should accept edges between existing nodes', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', weight: 0.5 }]
    })
    expect(result.success).toBe(true)
  })
})

describe('Auto-detection', () => {
  it('should detect graph data (nodes + edges)', () => {
    const result = validateData({
      nodes: [{ id: 'a' }],
      edges: []
    })
    expect(result.success).toBe(true)
    expect('nodes' in result.data!).toBe(true)
  })

  it('should detect embedding data (points)', () => {
    const result = validateData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }]
    })
    expect(result.success).toBe(true)
    expect('points' in result.data!).toBe(true)
  })

  it('should reject data without nodes/edges or points', () => {
    const result = validateData({ foo: 'bar' })
    expect(result.success).toBe(false)
  })
})

describe('Schema edge cases', () => {
  it('should reject empty nodes array', () => {
    const result = validateGraphData({ nodes: [], edges: [] })
    expect(result.success).toBe(false)
  })

  it('should reject empty points array', () => {
    const result = validateEmbeddingData({ points: [] })
    expect(result.success).toBe(false)
  })

  it('should reject node with empty string ID', () => {
    const result = validateGraphData({
      nodes: [{ id: '' }],
      edges: []
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

  it('should reject negative edge weight', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', weight: -0.1 }]
    })
    expect(result.success).toBe(false)
  })

  it('should reject negative node size', () => {
    const result = validateGraphData({
      nodes: [{ id: 'a', size: -1 }],
      edges: []
    })
    expect(result.success).toBe(false)
  })

  it('should reject negative cluster ID in embedding', () => {
    const result = validateEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 }, clusterId: -1 }]
    })
    expect(result.success).toBe(false)
  })
})
