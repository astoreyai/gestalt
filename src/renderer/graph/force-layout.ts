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

function extractPositions(nodes: SimNode[]): Map<string, { x: number; y: number; z: number }> {
  const map = new Map<string, { x: number; y: number; z: number }>()
  for (const n of nodes) {
    map.set(n.id, { x: n.x ?? 0, y: n.y ?? 0, z: n.z ?? 0 })
  }
  return map
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

  const sim = forceSimulation(simNodes, 3)
    .force('charge', forceManyBody().strength(-40).distanceMax(200))
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
