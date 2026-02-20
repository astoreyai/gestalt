/**
 * Web Worker for force-directed graph layout computation.
 * Offloads heavy N-body simulation from the main thread.
 */

import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter
} from 'd3-force-3d'

export interface LayoutWorkerMessage {
  type: 'init' | 'tick' | 'stop' | 'update_config'
  nodes?: Array<{ id: string; x?: number; y?: number; z?: number }>
  links?: Array<{ source: string; target: string; weight?: number }>
  config?: LayoutConfig
}

export interface LayoutConfig {
  chargeStrength: number
  linkDistance: number
  centerStrength: number
  alphaDecay: number
  velocityDecay: number
  dimensions: 2 | 3
}

export interface LayoutResult {
  type: 'positions' | 'done' | 'error'
  positions?: Array<{ id: string; x: number; y: number; z: number }>
  alpha?: number
  error?: string
}

const DEFAULT_CONFIG: LayoutConfig = {
  chargeStrength: -30,
  linkDistance: 30,
  centerStrength: 0.05,
  alphaDecay: 0.0228,
  velocityDecay: 0.4,
  dimensions: 3
}

let simulation: ReturnType<typeof forceSimulation> | null = null
let nodes: Array<{ id: string; x: number; y: number; z: number; [key: string]: unknown }> = []
let running = false

function initSimulation(
  nodeData: Array<{ id: string; x?: number; y?: number; z?: number }>,
  linkData: Array<{ source: string; target: string; weight?: number }>,
  config: LayoutConfig = DEFAULT_CONFIG
): void {
  // Initialize node positions randomly if not provided
  nodes = nodeData.map((n, i) => ({
    ...n,
    x: n.x ?? (Math.random() - 0.5) * 100,
    y: n.y ?? (Math.random() - 0.5) * 100,
    z: config.dimensions === 3 ? (n.z ?? (Math.random() - 0.5) * 100) : 0
  }))

  const links = linkData.map(l => ({
    source: l.source,
    target: l.target,
    weight: l.weight ?? 1
  }))

  simulation = forceSimulation(nodes, config.dimensions)
    .force('charge', forceManyBody().strength(config.chargeStrength))
    .force('link', forceLink(links)
      .id((d: any) => d.id)
      .distance(config.linkDistance)
      .strength((l: any) => l.weight ?? 1)
    )
    .force('center', forceCenter(0, 0, 0).strength(config.centerStrength))
    .alphaDecay(config.alphaDecay)
    .velocityDecay(config.velocityDecay)
    .stop() // Manual stepping

  running = true
}

function tickSimulation(ticks: number = 1): void {
  if (!simulation || !running) return

  for (let i = 0; i < ticks; i++) {
    simulation.tick()
  }

  const positions = nodes.map(n => ({
    id: n.id,
    x: n.x,
    y: n.y,
    z: n.z
  }))

  const alpha = simulation.alpha()

  self.postMessage({
    type: alpha < 0.001 ? 'done' : 'positions',
    positions,
    alpha
  } satisfies LayoutResult)

  if (alpha < 0.001) {
    running = false
  }
}

// Message handler
self.onmessage = (event: MessageEvent<LayoutWorkerMessage>) => {
  const { type, nodes: nodeData, links, config } = event.data

  switch (type) {
    case 'init':
      if (nodeData && links) {
        initSimulation(nodeData, links, config ?? DEFAULT_CONFIG)
        // Run initial settling (50 ticks)
        tickSimulation(50)
      }
      break

    case 'tick':
      tickSimulation()
      break

    case 'stop':
      running = false
      break

    case 'update_config':
      if (config && simulation) {
        const charge = simulation.force('charge') as ReturnType<typeof forceManyBody> | undefined
        if (charge) charge.strength(config.chargeStrength)
        const link = simulation.force('link') as ReturnType<typeof forceLink> | undefined
        if (link) link.distance(config.linkDistance)
        simulation.alpha(1).restart().stop()
      }
      break
  }
}
