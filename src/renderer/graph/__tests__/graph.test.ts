/**
 * Tests for the Knowledge Graph Visualizer module.
 * Covers: JSON parser, GraphML parser, LOD calculations, frustum culling.
 */
import { describe, it, expect } from 'vitest'
import { Vector3, PerspectiveCamera } from 'three'
import { parseJsonGraph, GraphDataSchema } from '../parsers/json-parser'
import { parseGraphML } from '../parsers/graphml-parser'
import { parseGraph } from '../parsers'
import {
  calculateLOD,
  isInFrustum,
  getGeometryDetail,
  LOD_THRESHOLDS
} from '../lod'
import type { LODThresholds } from '../lod'
import { CLUSTER_COLORS as MANIFOLD_CLUSTER_COLORS } from '@renderer/manifold/types'
import { CLUSTER_COLORS as GRAPH_CLUSTER_COLORS } from '../colors'

// ──────────────────────────────────────────────────────────────────────
// JSON Parser Tests
// ──────────────────────────────────────────────────────────────────────

describe('parseJsonGraph', () => {
  it('should parse valid minimal graph data', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a' }],
      edges: []
    })
    const result = await parseJsonGraph(json)
    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].id).toBe('a')
    expect(result.edges).toHaveLength(0)
  })

  it('should parse valid graph with all optional fields', async () => {
    const json = JSON.stringify({
      nodes: [
        {
          id: 'n1',
          label: 'Node 1',
          position: { x: 1, y: 2, z: 3 },
          color: '#ff0000',
          size: 2.5,
          metadata: { category: 'test' }
        },
        {
          id: 'n2',
          label: 'Node 2',
          size: 1.0
        }
      ],
      edges: [
        {
          source: 'n1',
          target: 'n2',
          weight: 0.8,
          label: 'connects',
          metadata: { type: 'directed' }
        }
      ],
      metadata: { title: 'Test Graph' }
    })
    const result = await parseJsonGraph(json)
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[0].label).toBe('Node 1')
    expect(result.nodes[0].position).toEqual({ x: 1, y: 2, z: 3 })
    expect(result.nodes[0].color).toBe('#ff0000')
    expect(result.nodes[0].size).toBe(2.5)
    expect(result.nodes[0].metadata).toEqual({ category: 'test' })
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].weight).toBe(0.8)
    expect(result.edges[0].label).toBe('connects')
    expect(result.metadata).toEqual({ title: 'Test Graph' })
  })

  it('should throw on invalid JSON string', async () => {
    await expect(parseJsonGraph('{invalid}')).rejects.toThrow('Invalid JSON')
  })

  it('should throw on empty nodes array', async () => {
    const json = JSON.stringify({ nodes: [], edges: [] })
    await expect(parseJsonGraph(json)).rejects.toThrow('at least one node')
  })

  it('should throw on missing nodes field', async () => {
    const json = JSON.stringify({ edges: [] })
    await expect(parseJsonGraph(json)).rejects.toThrow('Invalid graph data')
  })

  it('should throw on node with empty id', async () => {
    const json = JSON.stringify({
      nodes: [{ id: '' }],
      edges: []
    })
    await expect(parseJsonGraph(json)).rejects.toThrow('non-empty string')
  })

  it('should throw on node with negative size', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a', size: -1 }],
      edges: []
    })
    await expect(parseJsonGraph(json)).rejects.toThrow('positive')
  })

  it('should throw on edge with empty source', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a' }],
      edges: [{ source: '', target: 'a' }]
    })
    await expect(parseJsonGraph(json)).rejects.toThrow('non-empty string')
  })

  it('should throw on edge referencing non-existent source node', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a' }],
      edges: [{ source: 'missing', target: 'a' }]
    })
    await expect(parseJsonGraph(json)).rejects.toThrow('non-existent source node')
  })

  it('should throw on edge referencing non-existent target node', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a' }],
      edges: [{ source: 'a', target: 'missing' }]
    })
    await expect(parseJsonGraph(json)).rejects.toThrow('non-existent target node')
  })

  it('should throw on negative edge weight', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', weight: -0.5 }]
    })
    await expect(parseJsonGraph(json)).rejects.toThrow('non-negative')
  })

  it('should accept edges with weight of 0', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', weight: 0 }]
    })
    const result = await parseJsonGraph(json)
    expect(result.edges[0].weight).toBe(0)
  })

  it('should accept nodes without optional fields', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b' }]
    })
    const result = await parseJsonGraph(json)
    expect(result.nodes[0].label).toBeUndefined()
    expect(result.nodes[0].position).toBeUndefined()
    expect(result.nodes[0].color).toBeUndefined()
    expect(result.nodes[0].size).toBeUndefined()
    expect(result.edges[0].weight).toBeUndefined()
  })

  it('should handle graph with many nodes (stress test)', async () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      id: `n${i}`,
      label: `Node ${i}`
    }))
    const edges = Array.from({ length: 50 }, (_, i) => ({
      source: `n${i}`,
      target: `n${i + 1}`
    }))
    const json = JSON.stringify({ nodes, edges })
    const result = await parseJsonGraph(json)
    expect(result.nodes).toHaveLength(100)
    expect(result.edges).toHaveLength(50)
  })

  it('should throw on completely wrong type', async () => {
    await expect(parseJsonGraph('"just a string"')).rejects.toThrow('Invalid graph data')
  })

  it('should throw on array input', async () => {
    await expect(parseJsonGraph('[]')).rejects.toThrow('Invalid graph data')
  })

  it('should throw on null input', async () => {
    await expect(parseJsonGraph('null')).rejects.toThrow('Invalid graph data')
  })
})

describe('GraphDataSchema', () => {
  it('should validate correct data', () => {
    const result = GraphDataSchema.safeParse({
      nodes: [{ id: 'a' }],
      edges: []
    })
    expect(result.success).toBe(true)
  })

  it('should reject data missing nodes', () => {
    const result = GraphDataSchema.safeParse({ edges: [] })
    expect(result.success).toBe(false)
  })
})

// ──────────────────────────────────────────────────────────────────────
// GraphML Parser Tests
// ──────────────────────────────────────────────────────────────────────

describe('parseGraphML', () => {
  const validGraphML = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphstruct.org/xmlns">
  <key id="d0" for="node" attr.name="label" attr.type="string"/>
  <key id="d1" for="node" attr.name="color" attr.type="string"/>
  <key id="d2" for="node" attr.name="size" attr.type="double"/>
  <key id="d3" for="edge" attr.name="weight" attr.type="double"/>
  <key id="d4" for="edge" attr.name="label" attr.type="string"/>
  <graph id="G" edgedefault="undirected">
    <node id="n1">
      <data key="d0">Machine Learning</data>
      <data key="d1">#4a9eff</data>
      <data key="d2">3.0</data>
    </node>
    <node id="n2">
      <data key="d0">Deep Learning</data>
      <data key="d1">#ff6b6b</data>
      <data key="d2">2.5</data>
    </node>
    <edge source="n1" target="n2">
      <data key="d3">1.0</data>
      <data key="d4">is-parent-of</data>
    </edge>
  </graph>
</graphml>`

  it('should parse valid GraphML with nodes and edges', async () => {
    const result = await parseGraphML(validGraphML)
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes[0].id).toBe('n1')
    expect(result.nodes[0].label).toBe('Machine Learning')
    expect(result.nodes[0].color).toBe('#4a9eff')
    expect(result.nodes[0].size).toBe(3.0)
    expect(result.nodes[1].id).toBe('n2')
    expect(result.nodes[1].label).toBe('Deep Learning')
    expect(result.edges).toHaveLength(1)
    expect(result.edges[0].source).toBe('n1')
    expect(result.edges[0].target).toBe('n2')
    expect(result.edges[0].weight).toBe(1.0)
    expect(result.edges[0].label).toBe('is-parent-of')
  })

  it('should parse minimal GraphML with only nodes', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <graph id="G" edgedefault="undirected">
    <node id="a"></node>
    <node id="b"></node>
  </graph>
</graphml>`
    const result = await parseGraphML(xml)
    expect(result.nodes).toHaveLength(2)
    expect(result.edges).toHaveLength(0)
  })

  it('should handle node position attributes', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <key id="x" for="node" attr.name="x" attr.type="double"/>
  <key id="y" for="node" attr.name="y" attr.type="double"/>
  <key id="z" for="node" attr.name="z" attr.type="double"/>
  <graph id="G" edgedefault="undirected">
    <node id="n1">
      <data key="x">10.5</data>
      <data key="y">20.3</data>
      <data key="z">-5.0</data>
    </node>
  </graph>
</graphml>`
    const result = await parseGraphML(xml)
    expect(result.nodes[0].position).toEqual({ x: 10.5, y: 20.3, z: -5 })
  })

  it('should handle custom metadata attributes', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <key id="d0" for="node" attr.name="category" attr.type="string"/>
  <key id="d1" for="node" attr.name="importance" attr.type="int"/>
  <graph id="G" edgedefault="undirected">
    <node id="n1">
      <data key="d0">research</data>
      <data key="d1">5</data>
    </node>
  </graph>
</graphml>`
    const result = await parseGraphML(xml)
    expect(result.nodes[0].metadata).toEqual({ category: 'research', importance: 5 })
  })

  it('should throw on invalid XML', async () => {
    await expect(parseGraphML('<invalid><xml>')).rejects.toThrow()
  })

  it('should throw on XML without graph element', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
</graphml>`
    await expect(parseGraphML(xml)).rejects.toThrow('No <graph> element')
  })

  it('should throw on graph without any nodes', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <graph id="G" edgedefault="undirected">
  </graph>
</graphml>`
    await expect(parseGraphML(xml)).rejects.toThrow('at least one node')
  })

  it('should throw on edge referencing non-existent source', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <graph id="G" edgedefault="undirected">
    <node id="n1"></node>
    <edge source="missing" target="n1"></edge>
  </graph>
</graphml>`
    await expect(parseGraphML(xml)).rejects.toThrow('non-existent source node')
  })

  it('should throw on edge referencing non-existent target', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <graph id="G" edgedefault="undirected">
    <node id="n1"></node>
    <edge source="n1" target="missing"></edge>
  </graph>
</graphml>`
    await expect(parseGraphML(xml)).rejects.toThrow('non-existent target node')
  })

  it('should throw on edge missing source attribute', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <graph id="G" edgedefault="undirected">
    <node id="n1"></node>
    <edge target="n1"></edge>
  </graph>
</graphml>`
    await expect(parseGraphML(xml)).rejects.toThrow('missing required')
  })

  it('should handle boolean type coercion in key definitions', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <key id="d0" for="node" attr.name="active" attr.type="boolean"/>
  <graph id="G" edgedefault="undirected">
    <node id="n1">
      <data key="d0">true</data>
    </node>
  </graph>
</graphml>`
    const result = await parseGraphML(xml)
    expect(result.nodes[0].metadata?.active).toBe(true)
  })

  it('should handle integer type coercion', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <key id="d0" for="node" attr.name="count" attr.type="int"/>
  <graph id="G" edgedefault="undirected">
    <node id="n1">
      <data key="d0">42</data>
    </node>
  </graph>
</graphml>`
    const result = await parseGraphML(xml)
    expect(result.nodes[0].metadata?.count).toBe(42)
  })

  it('should handle edge metadata attributes', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <key id="d0" for="edge" attr.name="type" attr.type="string"></key>
  <graph id="G" edgedefault="undirected">
    <node id="n1"></node>
    <node id="n2"></node>
    <edge source="n1" target="n2">
      <data key="d0">directed</data>
    </edge>
  </graph>
</graphml>`
    const result = await parseGraphML(xml)
    expect(result.edges[0].metadata).toEqual({ type: 'directed' })
  })

  it('should use key id as fallback name when attr.name is missing', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <graph id="G" edgedefault="undirected">
    <node id="n1">
      <data key="unknownKey">some value</data>
    </node>
  </graph>
</graphml>`
    const result = await parseGraphML(xml)
    // Falls back to key ID "unknownKey" as the attribute name
    expect(result.nodes[0].metadata?.unknownKey).toBe('some value')
  })
})

// ──────────────────────────────────────────────────────────────────────
// parseGraph (unified parser) Tests
// ──────────────────────────────────────────────────────────────────────

describe('parseGraph', () => {
  it('should delegate to JSON parser for json format', async () => {
    const json = JSON.stringify({
      nodes: [{ id: 'a' }],
      edges: []
    })
    const result = await parseGraph(json, 'json')
    expect(result.nodes[0].id).toBe('a')
  })

  it('should delegate to GraphML parser for graphml format', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml>
  <graph id="G" edgedefault="undirected">
    <node id="n1"></node>
  </graph>
</graphml>`
    const result = await parseGraph(xml, 'graphml')
    expect(result.nodes[0].id).toBe('n1')
  })

  it('should throw for unsupported format', async () => {
    await expect(parseGraph('data', 'csv' as 'json')).rejects.toThrow(
      'Unsupported graph format'
    )
  })
})

// ──────────────────────────────────────────────────────────────────────
// LOD Tests
// ──────────────────────────────────────────────────────────────────────

describe('calculateLOD', () => {
  it('should return "full" for close camera distance with few nodes', () => {
    expect(calculateLOD(100, 10)).toBe('full')
  })

  it('should return "full" at exactly the full distance threshold', () => {
    expect(calculateLOD(100, LOD_THRESHOLDS.fullDistance)).toBe('full')
  })

  it('should return "medium" for moderate camera distance', () => {
    expect(calculateLOD(100, 80)).toBe('medium')
  })

  it('should return "medium" at exactly the medium distance threshold', () => {
    expect(calculateLOD(100, LOD_THRESHOLDS.mediumDistance)).toBe('medium')
  })

  it('should return "low" for far camera distance', () => {
    expect(calculateLOD(100, 200)).toBe('low')
  })

  it('should return "low" at exactly the low distance threshold', () => {
    expect(calculateLOD(100, LOD_THRESHOLDS.lowDistance)).toBe('low')
  })

  it('should return "culled" for very far camera distance', () => {
    expect(calculateLOD(100, 500)).toBe('culled')
  })

  it('should scale thresholds down for large node counts', () => {
    // With 2000 nodes (2x threshold of 1000), thresholds should be scaled down
    // At distance 40 with 100 nodes it would be full, but with 2000 nodes it may not be
    const lodSmall = calculateLOD(100, 40)
    const lodLarge = calculateLOD(4000, 40)
    // The large node count should produce a less detailed LOD at the same distance
    expect(lodSmall).toBe('full')
    // With 4000 nodes, scaled thresholds are much smaller
    expect(['medium', 'low', 'culled']).toContain(lodLarge)
  })

  it('should not scale thresholds when node count is below threshold', () => {
    const lod500 = calculateLOD(500, 40)
    const lod999 = calculateLOD(999, 40)
    expect(lod500).toBe(lod999)
  })

  it('should accept custom thresholds', () => {
    const custom: LODThresholds = {
      fullDistance: 10,
      mediumDistance: 20,
      lowDistance: 30,
      nodeCountScaleThreshold: 100,
      nodeCountScaleFactor: 0.5
    }
    expect(calculateLOD(50, 5, custom)).toBe('full')
    expect(calculateLOD(50, 15, custom)).toBe('medium')
    expect(calculateLOD(50, 25, custom)).toBe('low')
    expect(calculateLOD(50, 35, custom)).toBe('culled')
  })

  it('should return "full" at distance 0', () => {
    expect(calculateLOD(100, 0)).toBe('full')
  })

  it('should handle very large distances', () => {
    expect(calculateLOD(100, 100000)).toBe('culled')
  })
})

// ──────────────────────────────────────────────────────────────────────
// Frustum Culling Tests
// ──────────────────────────────────────────────────────────────────────

describe('isInFrustum', () => {
  function createCamera(
    position: [number, number, number] = [0, 0, 50]
  ): PerspectiveCamera {
    const camera = new PerspectiveCamera(60, 1, 0.1, 10000)
    camera.position.set(...position)
    camera.lookAt(0, 0, 0)
    camera.updateMatrixWorld(true)
    camera.updateProjectionMatrix()
    return camera
  }

  it('should return true for point at origin when camera looks at origin', () => {
    const camera = createCamera()
    const point = new Vector3(0, 0, 0)
    expect(isInFrustum(point, camera)).toBe(true)
  })

  it('should return true for point near origin', () => {
    const camera = createCamera()
    const point = new Vector3(5, 5, 0)
    expect(isInFrustum(point, camera)).toBe(true)
  })

  it('should return false for point far behind the camera', () => {
    const camera = createCamera([0, 0, 50])
    const point = new Vector3(0, 0, 200) // Behind camera (camera at z=50 looking at origin)
    expect(isInFrustum(point, camera)).toBe(false)
  })

  it('should return false for point way off to the side', () => {
    const camera = createCamera()
    const point = new Vector3(1000, 0, 0)
    expect(isInFrustum(point, camera)).toBe(false)
  })

  it('should handle margin parameter', () => {
    const camera = createCamera()
    // A point that is just barely outside the frustum might pass with margin
    const point = new Vector3(0, 0, 0)
    expect(isInFrustum(point, camera, 10)).toBe(true)
  })

  it('should work with zero margin (default)', () => {
    const camera = createCamera()
    const point = new Vector3(0, 0, 0)
    expect(isInFrustum(point, camera, 0)).toBe(true)
  })
})

// ──────────────────────────────────────────────────────────────────────
// getGeometryDetail Tests
// ──────────────────────────────────────────────────────────────────────

describe('getGeometryDetail', () => {
  it('should return highest detail for "full" level', () => {
    const [w, h] = getGeometryDetail('full')
    expect(w).toBe(16)
    expect(h).toBe(12)
  })

  it('should return medium detail for "medium" level', () => {
    const [w, h] = getGeometryDetail('medium')
    expect(w).toBe(8)
    expect(h).toBe(6)
  })

  it('should return low detail for "low" level', () => {
    const [w, h] = getGeometryDetail('low')
    expect(w).toBe(4)
    expect(h).toBe(3)
  })

  it('should return zero detail for "culled" level', () => {
    const [w, h] = getGeometryDetail('culled')
    expect(w).toBe(0)
    expect(h).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Cluster Color Consistency Tests
// ──────────────────────────────────────────────────────────────────────

describe('CLUSTER_COLORS consistency', () => {
  it('should use the same cluster colors in graph and manifold modules', () => {
    expect(GRAPH_CLUSTER_COLORS).toEqual(MANIFOLD_CLUSTER_COLORS)
  })

  it('should reference the exact same array instance', () => {
    expect(GRAPH_CLUSTER_COLORS).toBe(MANIFOLD_CLUSTER_COLORS)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Node Size Safety Tests
// ──────────────────────────────────────────────────────────────────────

describe('Node size safety', () => {
  // The Nodes component (React Three Fiber InstancedMesh) applies size clamping
  // inline: Math.max(0.1, node.size ?? DEFAULT_SIZE). Since the component
  // cannot easily be unit tested without a full R3F canvas, we verify the
  // clamping logic directly here.
  const DEFAULT_SIZE = 1.0

  function clampNodeSize(size: number | undefined): number {
    return Math.max(0.1, size ?? DEFAULT_SIZE)
  }

  it('should clamp negative node sizes to minimum', () => {
    expect(clampNodeSize(-5)).toBe(0.1)
    expect(clampNodeSize(-0.5)).toBe(0.1)
    expect(clampNodeSize(-100)).toBe(0.1)
  })

  it('should clamp zero node size to minimum', () => {
    expect(clampNodeSize(0)).toBe(0.1)
  })

  it('should clamp very small positive sizes to minimum', () => {
    expect(clampNodeSize(0.01)).toBe(0.1)
    expect(clampNodeSize(0.09)).toBe(0.1)
  })

  it('should pass through valid positive sizes', () => {
    expect(clampNodeSize(0.1)).toBe(0.1)
    expect(clampNodeSize(1.0)).toBe(1.0)
    expect(clampNodeSize(5.0)).toBe(5.0)
  })

  it('should use DEFAULT_SIZE when size is undefined', () => {
    expect(clampNodeSize(undefined)).toBe(DEFAULT_SIZE)
  })
})

// ──────────────────────────────────────────────────────────────────────
// Force Layout Tests
// ──────────────────────────────────────────────────────────────────────

import { createForceSimulation, type SimulationConfig } from '../force-layout'

describe('Force Layout', () => {
  function makeConfig(nodeCount: number, edgeCount: number): SimulationConfig {
    const nodes = Array.from({ length: nodeCount }, (_, i) => ({
      id: `n${i}`,
      x: (Math.random() - 0.5) * 50,
      y: (Math.random() - 0.5) * 50,
      z: (Math.random() - 0.5) * 50
    }))
    const edges: SimulationConfig['edges'] = []
    for (let i = 0; i < edgeCount && i + 1 < nodeCount; i++) {
      edges.push({
        source: `n${i}`,
        target: `n${i + 1}`,
        weight: 0.5 + Math.random() * 0.5
      })
    }
    return { nodes, edges }
  }

  it('should create simulation with correct node count', () => {
    const config = makeConfig(10, 5)
    const sim = createForceSimulation(config)
    const result = sim.tick()
    expect(result.positions.size).toBe(10)
    sim.stop()
  })

  it('should converge positions over multiple ticks', () => {
    const config: SimulationConfig = {
      nodes: [
        { id: 'a', x: -100, y: 0, z: 0 },
        { id: 'b', x: 100, y: 0, z: 0 }
      ],
      edges: [{ source: 'a', target: 'b', weight: 1.0 }]
    }
    const sim = createForceSimulation(config)

    // Run initial tick
    const first = sim.tick()
    expect(first.alpha).toBeGreaterThan(0)

    // Run many ticks to converge
    let result = first
    for (let i = 0; i < 300; i++) {
      result = sim.tick()
      if (result.done) break
    }

    // Alpha should have decreased significantly
    expect(result.alpha).toBeLessThan(first.alpha)

    // Connected nodes should have moved closer together
    const posA = result.positions.get('a')!
    const posB = result.positions.get('b')!
    const finalDist = Math.sqrt(
      (posA.x - posB.x) ** 2 + (posA.y - posB.y) ** 2 + (posA.z - posB.z) ** 2
    )
    // Initial distance was 200, should be significantly closer
    expect(finalDist).toBeLessThan(200)

    sim.stop()
  })

  it('should respect edge weights in layout', () => {
    // Three nodes in a line: A--B--C
    // A-B has high weight (strong attraction), B-C has low weight (weak attraction)
    const config: SimulationConfig = {
      nodes: [
        { id: 'a', x: -50, y: 0, z: 0 },
        { id: 'b', x: 0, y: 0, z: 0 },
        { id: 'c', x: 50, y: 0, z: 0 }
      ],
      edges: [
        { source: 'a', target: 'b', weight: 1.0 },
        { source: 'b', target: 'c', weight: 0.1 }
      ]
    }
    const sim = createForceSimulation(config)

    let result
    for (let i = 0; i < 300; i++) {
      result = sim.tick()
      if (result.done) break
    }
    result = result!

    const posA = result.positions.get('a')!
    const posB = result.positions.get('b')!
    const posC = result.positions.get('c')!

    const distAB = Math.sqrt(
      (posA.x - posB.x) ** 2 + (posA.y - posB.y) ** 2 + (posA.z - posB.z) ** 2
    )
    const distBC = Math.sqrt(
      (posB.x - posC.x) ** 2 + (posB.y - posC.y) ** 2 + (posB.z - posC.z) ** 2
    )

    // Strong weight edge (A-B) should result in shorter distance than weak weight edge (B-C)
    // The link strength formula is 0.3 + w * 0.7, so weight 1.0 => 1.0, weight 0.1 => 0.37
    expect(distAB).toBeLessThan(distBC)

    sim.stop()
  })

  it('should stop simulation cleanly', () => {
    const config = makeConfig(5, 3)
    const sim = createForceSimulation(config)

    // Tick once to verify it works
    const before = sim.tick()
    expect(before.positions.size).toBe(5)

    // Stop
    sim.stop()

    // After stop, tick should return done=true with alpha 0
    const after = sim.tick()
    expect(after.done).toBe(true)
    expect(after.alpha).toBe(0)
  })
})
