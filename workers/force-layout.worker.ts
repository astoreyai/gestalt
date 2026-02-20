/**
 * Web Worker for force-directed graph layout computation.
 * Delegates to the shared force-layout module so the same logic
 * can be tested without a Worker environment.
 *
 * Performance notes:
 * - Ticks are batched (multiple simulation steps per message) to reduce
 *   the overhead of postMessage serialization.
 * - Positions are sent as a flat Float64Array (3 values per node: x, y, z)
 *   and transferred via the Transferable API to avoid structured-clone cost.
 * - The node ID ordering is sent once on the first tick so the consumer
 *   can map Float64Array indices back to node IDs.
 */
import { createForceSimulation, type ForceSimulationHandle } from '../src/renderer/graph/force-layout'

export interface WorkerMessage {
  type: 'init' | 'tick' | 'stop'
  nodes?: Array<{ id: string; x: number; y: number; z: number }>
  edges?: Array<{ source: string; target: string; weight?: number }>
}

/**
 * Worker response types:
 * - 'positions': periodic position update during simulation
 * - 'done': final position update when simulation converges
 *
 * `nodeIds` is sent only with the first message so the consumer can
 * establish the index→id mapping.  Subsequent messages omit it.
 *
 * `positions` is a flat Float64Array [x0, y0, z0, x1, y1, z1, ...]
 * with 3 entries per node in the same order as `nodeIds`.
 */
export interface WorkerResponse {
  type: 'positions' | 'done'
  positions: Float64Array
  alpha: number
  nodeIds?: string[]
}

let sim: ForceSimulationHandle | null = null

/** Number of simulation ticks to run between each postMessage. */
const BATCH_SIZE = 10

self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  const { type, nodes, edges } = event.data

  switch (type) {
    case 'init': {
      if (!nodes || !edges) return

      // Clean up previous simulation
      if (sim) {
        sim.stop()
        sim = null
      }

      sim = createForceSimulation({ nodes, edges })

      // Build the stable ID ordering once — indices match the config order.
      const nodeIds = nodes.map((n) => n.id)
      const nodeCount = nodeIds.length
      let sentIds = false

      // Batched tick loop: run multiple ticks per postMessage to reduce
      // serialization overhead.  Only post positions at most every ~16ms
      // (roughly 60 fps) worth of ticks.
      const tickLoop = () => {
        if (!sim) return

        let result
        for (let i = 0; i < BATCH_SIZE; i++) {
          result = sim.tick()
          if (result.done) break
        }
        if (!result) return

        // Pack positions into a flat Float64Array for zero-copy transfer
        const positions = new Float64Array(nodeCount * 3)
        const posMap = result.positions
        for (let i = 0; i < nodeCount; i++) {
          const pos = posMap.get(nodeIds[i])
          if (pos) {
            positions[i * 3] = pos.x
            positions[i * 3 + 1] = pos.y
            positions[i * 3 + 2] = pos.z
          }
        }

        const msg: WorkerResponse = {
          type: result.done ? 'done' : 'positions',
          positions,
          alpha: result.alpha
        }

        // Send nodeIds only on the first message so the consumer knows the ordering
        if (!sentIds) {
          msg.nodeIds = nodeIds
          sentIds = true
        }

        // Transfer the ArrayBuffer to avoid structured-clone copy
        ;(self.postMessage as (message: unknown, transfer: Transferable[]) => void)(msg, [positions.buffer])

        if (!result.done) {
          setTimeout(tickLoop, 0)
        }
      }
      tickLoop()
      break
    }

    case 'stop': {
      if (sim) {
        sim.stop()
        sim = null
      }
      break
    }
  }
}
