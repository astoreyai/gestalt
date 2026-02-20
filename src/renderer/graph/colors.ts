/**
 * Re-export cluster colors from the canonical source (manifold/types.ts).
 * This is a unidirectional dependency (graph → manifold) with no circular risk.
 * Used by graph rendering components (Nodes.tsx) to ensure
 * consistent coloring with the manifold module.
 */
export { CLUSTER_COLORS } from '@renderer/manifold/types'
