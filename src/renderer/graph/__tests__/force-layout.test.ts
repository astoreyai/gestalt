/**
 * Force layout convergence tests.
 * Verifies MAX_ITERATIONS cap, stall detection, and normal convergence.
 */
import { describe, it, expect } from 'vitest'
import { createForceSimulation } from '../force-layout'

/** Create a simple linear graph: a—b—c—d */
function linearGraph(n: number) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `n${i}`,
    x: (Math.random() - 0.5) * 10,
    y: (Math.random() - 0.5) * 10,
    z: (Math.random() - 0.5) * 10
  }))
  const edges = []
  for (let i = 0; i < n - 1; i++) {
    edges.push({ source: `n${i}`, target: `n${i + 1}`, weight: 0.5 })
  }
  return { nodes, edges }
}

/** Create a cyclic graph: ring topology */
function cyclicGraph(n: number) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `c${i}`,
    x: Math.cos((2 * Math.PI * i) / n) * 5,
    y: Math.sin((2 * Math.PI * i) / n) * 5,
    z: 0
  }))
  const edges = []
  for (let i = 0; i < n; i++) {
    edges.push({ source: `c${i}`, target: `c${(i + 1) % n}`, weight: 0.5 })
  }
  return { nodes, edges }
}

/** Create a fully connected graph (degenerate topology) */
function fullyConnected(n: number) {
  const nodes = Array.from({ length: n }, (_, i) => ({
    id: `f${i}`, x: 0, y: 0, z: 0 // all at origin — worst case
  }))
  const edges = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      edges.push({ source: `f${i}`, target: `f${j}`, weight: 1.0 })
    }
  }
  return { nodes, edges }
}

describe('Force Layout Convergence', () => {
  it('should converge for a linear graph', () => {
    const sim = createForceSimulation(linearGraph(10))
    let iterations = 0
    let result = sim.tick()
    while (!result.done) {
      result = sim.tick()
      iterations++
    }
    expect(result.done).toBe(true)
    expect(iterations).toBeLessThan(300) // Should converge before MAX_ITERATIONS
    expect(result.positions.size).toBe(10)
  })

  it('should converge for a cyclic graph', () => {
    const sim = createForceSimulation(cyclicGraph(8))
    let iterations = 0
    let result = sim.tick()
    while (!result.done) {
      result = sim.tick()
      iterations++
    }
    expect(result.done).toBe(true)
    expect(iterations).toBeLessThan(300) // Should converge naturally
  })

  it('should terminate within MAX_ITERATIONS (300) for degenerate topology', () => {
    const sim = createForceSimulation(fullyConnected(20))
    let iterations = 0
    let result = sim.tick()
    while (!result.done) {
      result = sim.tick()
      iterations++
      // Safety net: never exceed 300 + some margin
      if (iterations > 350) break
    }
    expect(result.done).toBe(true)
    expect(iterations).toBeLessThanOrEqual(300)
  })

  it('should produce spread-out positions (not a blob)', () => {
    const sim = createForceSimulation(linearGraph(5))
    let result = sim.tick()
    while (!result.done) result = sim.tick()

    const positions = Array.from(result.positions.values())
    // Check that nodes aren't all at the same point
    let maxDist = 0
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[i].x - positions[j].x
        const dy = positions[i].y - positions[j].y
        const dz = positions[i].z - positions[j].z
        maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dy * dy + dz * dz))
      }
    }
    expect(maxDist).toBeGreaterThan(5) // Nodes should be spread apart
  })

  it('should stop when explicitly stopped', () => {
    const sim = createForceSimulation(linearGraph(5))
    sim.tick()
    sim.stop()
    const result = sim.tick()
    expect(result.done).toBe(true)
  })

  it('should return all node positions', () => {
    const graph = linearGraph(7)
    const sim = createForceSimulation(graph)
    const result = sim.tick()
    expect(result.positions.size).toBe(7)
    for (const node of graph.nodes) {
      expect(result.positions.has(node.id)).toBe(true)
      const pos = result.positions.get(node.id)!
      expect(Number.isFinite(pos.x)).toBe(true)
      expect(Number.isFinite(pos.y)).toBe(true)
      expect(Number.isFinite(pos.z)).toBe(true)
    }
  })

  it('should handle single-node graph', () => {
    const sim = createForceSimulation({
      nodes: [{ id: 'solo', x: 0, y: 0, z: 0 }],
      edges: []
    })
    let result = sim.tick()
    let iterations = 0
    while (!result.done && iterations < 400) {
      result = sim.tick()
      iterations++
    }
    expect(result.done).toBe(true)
    expect(result.positions.has('solo')).toBe(true)
  })

  it('should have decreasing alpha over time', () => {
    const sim = createForceSimulation(linearGraph(10))
    const alphas: number[] = []
    let result = sim.tick()
    alphas.push(result.alpha)
    for (let i = 0; i < 10; i++) {
      result = sim.tick()
      alphas.push(result.alpha)
    }
    // Alpha should generally decrease (d3 decay)
    expect(alphas[alphas.length - 1]).toBeLessThan(alphas[0])
  })

  it('should detect stall and terminate early', () => {
    // Create a trivial graph that stabilizes quickly
    const sim = createForceSimulation({
      nodes: [
        { id: 'a', x: -10, y: 0, z: 0 },
        { id: 'b', x: 10, y: 0, z: 0 }
      ],
      edges: [{ source: 'a', target: 'b', weight: 1.0 }]
    })
    let iterations = 0
    let result = sim.tick()
    while (!result.done) {
      result = sim.tick()
      iterations++
    }
    expect(result.done).toBe(true)
    // Should converge (via alpha decay or stall) in reasonable iterations
    expect(iterations).toBeLessThan(300)
  })
})
