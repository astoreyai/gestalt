/**
 * Web Worker for force-directed graph layout computation.
 * Delegates to the shared force-layout module so the same logic
 * can be tested without a Worker environment.
 */
import { createForceSimulation, type ForceSimulationHandle } from '../src/renderer/graph/force-layout'

export interface WorkerMessage {
  type: 'init' | 'tick' | 'stop'
  nodes?: Array<{ id: string; x: number; y: number; z: number }>
  edges?: Array<{ source: string; target: string; weight?: number }>
}

export interface WorkerResponse {
  type: 'positions' | 'done'
  positions: Array<{ id: string; x: number; y: number; z: number }>
  alpha: number
}

let sim: ForceSimulationHandle | null = null

function positionsMapToArray(
  map: Map<string, { x: number; y: number; z: number }>
): Array<{ id: string; x: number; y: number; z: number }> {
  const arr: Array<{ id: string; x: number; y: number; z: number }> = []
  for (const [id, pos] of map) {
    arr.push({ id, x: pos.x, y: pos.y, z: pos.z })
  }
  return arr
}

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

      // Run ticks asynchronously, yielding between each to allow
      // the main thread to send 'stop' messages.
      const tickLoop = () => {
        if (!sim) return
        const result = sim.tick()
        const positions = positionsMapToArray(result.positions)

        if (result.done) {
          self.postMessage({ type: 'done', positions, alpha: result.alpha } satisfies WorkerResponse)
          return
        }

        self.postMessage({ type: 'positions', positions, alpha: result.alpha } satisfies WorkerResponse)
        setTimeout(tickLoop, 0)
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
