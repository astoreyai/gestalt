/**
 * Pure force simulation logic, shared between the Web Worker and the
 * synchronous fallback path. Contains no Worker API or DOM references so
 * it can be unit-tested in vitest / happy-dom.
 */
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter
} from 'd3-force-3d'

// ─── Public Types ───────────────────────────────────────────────────

export interface SimulationConfig {
  nodes: Array<{ id: string; x: number; y: number; z: number }>
  edges: Array<{ source: string; target: string; weight?: number }>
}

export interface SimulationResult {
  positions: Map<string, { x: number; y: number; z: number }>
  alpha: number
  done: boolean
}

export interface ForceSimulationHandle {
  /** Advance the simulation by one tick and return current state */
  tick: () => SimulationResult
  /** Stop the simulation (releases internal references) */
  stop: () => void
}

// ─── Internal helpers ───────────────────────────────────────────────

interface SimNode {
  id: string
  x: number
  y: number
  z: number
  index?: number
}

interface SimLink {
  source: string | SimNode
  target: string | SimNode
  weight?: number
}

/**
 * Reusable position map — avoids allocating a new Map and new {x,y,z}
 * objects on every tick.  The same Map instance and value objects are
 * mutated in-place and returned each call.
 */
function createPositionExtractor() {
  const map = new Map<string, { x: number; y: number; z: number }>()
  let initialised = false

  return function extractPositions(nodes: SimNode[]): Map<string, { x: number; y: number; z: number }> {
    if (!initialised) {
      for (const n of nodes) {
        map.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 })
      }
      initialised = true
    } else {
      // Prune stale entries from previous graph data
      if (map.size !== nodes.length) {
        const currentIds = new Set<string>()
        for (const n of nodes) currentIds.add(n.id)
        for (const id of map.keys()) {
          if (!currentIds.has(id)) map.delete(id)
        }
      }
      for (const n of nodes) {
        const pos = map.get(n.id)
        if (pos) {
          pos.x = n.x ?? 0
          pos.y = n.y ?? 0
          pos.z = n.z ?? 0
        } else {
          // New node added mid-simulation
          map.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 })
        }
      }
    }
    return map
  }
}

// ─── Factory ────────────────────────────────────────────────────────

/**
 * Create a force simulation from the given config.
 * Call `tick()` repeatedly to advance; call `stop()` to clean up.
 */
export function createForceSimulation(config: SimulationConfig): ForceSimulationHandle {
  const simNodes: SimNode[] = config.nodes.map((n) => ({ ...n }))
  const simLinks: SimLink[] = config.edges.map((e) => ({
    source: e.source,
    target: e.target,
    weight: e.weight
  }))

  // Barnes-Hut approximation scaling:
  // - theta(0.9) enables the octree approximation, reducing many-body from
  //   O(n^2) to O(n log n).  Higher theta = faster but less accurate.
  // - For very large graphs (>100k nodes) we trade accuracy for speed by
  //   increasing theta further.  The visual difference is negligible at
  //   that scale because individual node positions matter less.
  const nodeCount = simNodes.length
  const theta = nodeCount > 100_000 ? 1.5 : 0.9

  const charge = forceManyBody().strength(-40).theta(theta)

  const sim = forceSimulation(simNodes, 3)
    .force('charge', charge)
    .force(
      'link',
      forceLink(simLinks)
        .id((d: SimNode) => d.id)
        .distance(15)
        .strength((link: SimLink) => {
          const w = typeof link.weight === 'number' ? link.weight : 0.5
          return 0.3 + w * 0.7
        })
    )
    .force('center', forceCenter(0, 0, 0).strength(0.05))
    .alphaDecay(0.02)
    .velocityDecay(0.3)
    .stop()

  const extractPositions = createPositionExtractor()
  let stopped = false

  return {
    tick(): SimulationResult {
      if (stopped) {
        return { positions: extractPositions(simNodes), alpha: 0, done: true }
      }
      sim.tick()
      const alpha = sim.alpha()
      const done = alpha <= sim.alphaMin()
      return { positions: extractPositions(simNodes), alpha, done }
    },
    stop(): void {
      if (!stopped) {
        sim.stop()
        stopped = true
      }
    }
  }
}
