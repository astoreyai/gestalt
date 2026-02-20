/**
 * Generate sample datasets for testing and demos.
 * Run with: npx tsx demos/generate-samples.ts
 */

import { writeFileSync } from 'fs'
import { join } from 'path'

// Simple seeded PRNG
class PRNG {
  private state: number
  constructor(seed: number) { this.state = seed }
  next(): number {
    this.state = (this.state * 1664525 + 1013904223) & 0xFFFFFFFF
    return (this.state >>> 0) / 0xFFFFFFFF
  }
  gaussian(): number {
    const u1 = this.next()
    const u2 = this.next()
    return Math.sqrt(-2 * Math.log(u1 || 0.001)) * Math.cos(2 * Math.PI * u2)
  }
}

function generateEmbeddings5k() {
  const rng = new PRNG(42)
  const clusters = [
    { id: 0, label: 'Language Models', color: '#4a9eff', center: [10, 5, 3] },
    { id: 1, label: 'Vision Models', color: '#ff6b6b', center: [-8, 7, -5] },
    { id: 2, label: 'Audio Models', color: '#6bcb77', center: [3, -10, 8] },
    { id: 3, label: 'Multimodal', color: '#ffd93d', center: [-5, -3, -10] },
    { id: 4, label: 'Reinforcement Learning', color: '#c084fc', center: [12, -8, -3] }
  ]

  const points: Array<{
    id: string
    position: { x: number; y: number; z: number }
    clusterId: number
    label: string
    metadata: Record<string, unknown>
  }> = []

  for (let i = 0; i < 5000; i++) {
    const cluster = clusters[i % clusters.length]
    const spread = 3.0
    points.push({
      id: `p${i}`,
      position: {
        x: cluster.center[0] + rng.gaussian() * spread,
        y: cluster.center[1] + rng.gaussian() * spread,
        z: cluster.center[2] + rng.gaussian() * spread
      },
      clusterId: cluster.id,
      label: `${cluster.label} #${Math.floor(i / clusters.length)}`,
      metadata: {
        score: Math.round(rng.next() * 100) / 100,
        category: cluster.label
      }
    })
  }

  return {
    metadata: {
      title: 'AI Model Embeddings (5K)',
      description: '5000 synthetic embedding points in 5 clusters',
      generator: 'demos/generate-samples.ts'
    },
    clusters: clusters.map(c => ({
      id: c.id,
      label: c.label,
      color: c.color
    })),
    points
  }
}

// Generate and save
const outDir = join(__dirname, '..', 'assets', 'samples')
const embeddings = generateEmbeddings5k()
writeFileSync(join(outDir, 'embeddings-5k.json'), JSON.stringify(embeddings, null, 2))
console.log(`Generated embeddings-5k.json: ${embeddings.points.length} points, ${embeddings.clusters.length} clusters`)
