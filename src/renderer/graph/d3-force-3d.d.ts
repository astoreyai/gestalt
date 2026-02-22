/**
 * Type declarations for d3-force-3d.
 * Only the subset of the API used by this project is typed.
 */
declare module 'd3-force-3d' {
   
  interface SimulationNode {
    index?: number
    x?: number
    y?: number
    z?: number
    vx?: number
    vy?: number
    vz?: number
    fx?: number | null
    fy?: number | null
    fz?: number | null
  }

  interface SimulationLink<N = SimulationNode> {
    source: N | string | number
    target: N | string | number
    index?: number
  }

  interface ForceSimulation<N extends SimulationNode = SimulationNode> {
    force(name: string, force?: Force<N> | null): this
    nodes(): N[]
    nodes(nodes: N[]): this
    alpha(): number
    alpha(alpha: number): this
    alphaDecay(): number
    alphaDecay(decay: number): this
    alphaMin(): number
    alphaMin(min: number): this
    alphaTarget(): number
    alphaTarget(target: number): this
    velocityDecay(): number
    velocityDecay(decay: number): this
    tick(iterations?: number): this
    stop(): this
    restart(): this
    on(typenames: string, listener: ((...args: unknown[]) => void) | null): this
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- N is consumed by extending interfaces
  interface Force<N extends SimulationNode = SimulationNode> {
    (alpha: number): void
  }

  interface ForceManyBody<N extends SimulationNode = SimulationNode> extends Force<N> {
    strength(): number
    strength(strength: number | ((d: N, i: number, data: N[]) => number)): this
    theta(): number
    theta(theta: number): this
    distanceMin(): number
    distanceMin(distance: number): this
    distanceMax(): number
    distanceMax(distance: number): this
  }

  interface ForceLink<N extends SimulationNode = SimulationNode, L extends SimulationLink<N> = SimulationLink<N>> extends Force<N> {
    links(): L[]
    links(links: L[]): this
    id(): (node: N) => string | number
    id(id: (node: N) => string | number): this
    distance(): number | ((link: L, i: number, links: L[]) => number)
    distance(distance: number | ((link: L, i: number, links: L[]) => number)): this
    strength(): number | ((link: L, i: number, links: L[]) => number)
    strength(strength: number | ((link: L, i: number, links: L[]) => number)): this
  }

  interface ForceCenter<N extends SimulationNode = SimulationNode> extends Force<N> {
    x(): number
    x(x: number): this
    y(): number
    y(y: number): this
    z(): number
    z(z: number): this
    strength(): number
    strength(strength: number): this
  }

   
  export function forceSimulation(nodes?: any[], numDimensions?: number): ForceSimulation<any>

   
  export function forceLink(links?: any[]): ForceLink<any, any>

   
  export function forceManyBody(): ForceManyBody<any>

   
  export function forceCenter(x?: number, y?: number, z?: number): ForceCenter<any>
}
