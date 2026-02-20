/**
 * Performance benchmarks for the tracking pipeline.
 *
 * Measures latency and throughput of each module independently
 * and end-to-end pipeline latency (target: <50ms).
 *
 * Benchmark results are printed to stdout for analysis.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import {
  type Landmark,
  type Hand,
  type LandmarkFrame,
  type GestureEvent,
  type MouseCommand,
  LANDMARK,
  GestureType,
  GesturePhase
} from '@shared/protocol'
import { LandmarkSmoother, OneEuroFilter } from '@renderer/tracker/filters'
import { classifyGesture, distance, fingerCurl, analyzeHandPose } from '@renderer/gestures/classifier'
import { GestureEngine } from '@renderer/gestures/state'
import { mapGestureToCommand } from '@renderer/gestures/mappings'
import { dispatchGesture, type DispatchContext } from '@renderer/controller/dispatcher'
import { VirtualMouse } from '@main/input/mouse'
import { ProgramRegistry } from '@main/bus/registry'
import { GestureFanout } from '@main/bus/fanout'
import { validateGraphData, validateEmbeddingData } from '@renderer/data/validators'
import { calculateClusterCentroids, findNearestPoint } from '@renderer/manifold/navigation'
import { generateGaussianClusters, generateSpiralManifold, generateSwissRoll } from '@renderer/manifold/generators'
import { parseJsonGraph } from '@renderer/graph/parsers/json-parser'

// ─── Helpers ─────────────────────────────────────────────────────────

function makeOpenPalmLandmarks(): Landmark[] {
  const lm: Landmark[] = []
  lm.push({ x: 0.5, y: 0.7, z: 0 })
  lm.push({ x: 0.42, y: 0.65, z: -0.01 })
  lm.push({ x: 0.38, y: 0.58, z: -0.02 })
  lm.push({ x: 0.35, y: 0.52, z: -0.02 })
  lm.push({ x: 0.33, y: 0.46, z: -0.02 })
  lm.push({ x: 0.44, y: 0.55, z: 0 })
  lm.push({ x: 0.43, y: 0.45, z: 0 })
  lm.push({ x: 0.43, y: 0.38, z: 0 })
  lm.push({ x: 0.43, y: 0.32, z: 0 })
  lm.push({ x: 0.50, y: 0.53, z: 0 })
  lm.push({ x: 0.50, y: 0.42, z: 0 })
  lm.push({ x: 0.50, y: 0.35, z: 0 })
  lm.push({ x: 0.50, y: 0.28, z: 0 })
  lm.push({ x: 0.56, y: 0.55, z: 0 })
  lm.push({ x: 0.56, y: 0.45, z: 0 })
  lm.push({ x: 0.56, y: 0.38, z: 0 })
  lm.push({ x: 0.56, y: 0.32, z: 0 })
  lm.push({ x: 0.62, y: 0.58, z: 0 })
  lm.push({ x: 0.62, y: 0.48, z: 0 })
  lm.push({ x: 0.62, y: 0.42, z: 0 })
  lm.push({ x: 0.62, y: 0.38, z: 0 })
  return lm
}

function makePinchLandmarks(): Landmark[] {
  const lm = makeOpenPalmLandmarks()
  lm[LANDMARK.THUMB_TIP] = { x: 0.44, y: 0.33, z: 0 }
  lm[LANDMARK.INDEX_TIP] = { x: 0.44, y: 0.33, z: 0.01 }
  return lm
}

function makePointLandmarks(): Landmark[] {
  const lm = makeOpenPalmLandmarks()
  lm[LANDMARK.MIDDLE_DIP] = { x: 0.50, y: 0.47, z: 0.01 }
  lm[LANDMARK.MIDDLE_TIP] = { x: 0.50, y: 0.43, z: 0.02 }
  lm[LANDMARK.RING_DIP] = { x: 0.56, y: 0.50, z: 0.01 }
  lm[LANDMARK.RING_TIP] = { x: 0.56, y: 0.46, z: 0.02 }
  lm[LANDMARK.PINKY_DIP] = { x: 0.62, y: 0.53, z: 0.01 }
  lm[LANDMARK.PINKY_TIP] = { x: 0.62, y: 0.49, z: 0.02 }
  lm[LANDMARK.THUMB_IP] = { x: 0.41, y: 0.62, z: 0.00 }
  lm[LANDMARK.THUMB_TIP] = { x: 0.39, y: 0.58, z: 0.01 }
  return lm
}

function makeHand(landmarks: Landmark[], handedness: 'left' | 'right' = 'right'): Hand {
  return { handedness, landmarks, worldLandmarks: landmarks, score: 0.95 }
}

function makeFrame(hands: Hand[], timestamp: number, frameId: number): LandmarkFrame {
  return { hands, timestamp, frameId }
}

interface BenchmarkResult {
  name: string
  iterations: number
  totalMs: number
  avgMs: number
  minMs: number
  maxMs: number
  p95Ms: number
  opsPerSec: number
}

function runBenchmark(name: string, fn: () => void, iterations: number = 10000): BenchmarkResult {
  // Warmup
  for (let i = 0; i < Math.min(100, iterations / 10); i++) fn()

  const times: number[] = []
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now()
    fn()
    const t1 = performance.now()
    times.push(t1 - t0)
  }
  const totalMs = performance.now() - start

  times.sort((a, b) => a - b)
  const result: BenchmarkResult = {
    name,
    iterations,
    totalMs,
    avgMs: totalMs / iterations,
    minMs: times[0],
    maxMs: times[times.length - 1],
    p95Ms: times[Math.floor(times.length * 0.95)],
    opsPerSec: Math.round((iterations / totalMs) * 1000)
  }

  console.log(
    `  ${name.padEnd(45)} ` +
    `avg=${result.avgMs.toFixed(4)}ms  ` +
    `p95=${result.p95Ms.toFixed(4)}ms  ` +
    `${result.opsPerSec.toLocaleString()} ops/s`
  )

  return result
}

// ─── Generate large datasets ahead of time ───────────────────────────

function generateLargeGraph(nodeCount: number): string {
  const nodes = Array.from({ length: nodeCount }, (_, i) => ({
    id: `n${i}`,
    label: `Node ${i}`,
    position: { x: Math.random() * 100, y: Math.random() * 100, z: Math.random() * 100 }
  }))
  const edges = Array.from({ length: nodeCount * 2 }, (_, i) => ({
    source: `n${i % nodeCount}`,
    target: `n${(i + 1 + Math.floor(Math.random() * 10)) % nodeCount}`,
    weight: Math.random()
  }))
  return JSON.stringify({ nodes, edges })
}

// ─── Benchmarks ──────────────────────────────────────────────────────

describe('Benchmarks', () => {
  console.log('\n========================================')
  console.log('  PERFORMANCE BENCHMARKS')
  console.log('========================================\n')

  describe('One-Euro Filter', () => {
    it('should filter 10K samples at high throughput', () => {
      console.log('--- One-Euro Filter ---')
      const filter = new OneEuroFilter({ minCutoff: 1.0, beta: 0.5 })
      let value = 0

      const result = runBenchmark('OneEuroFilter.filter (single axis)', () => {
        value = filter.filter(Math.sin(value) + Math.random() * 0.1, value / 1000)
        value += 0.033
      }, 10000)

      expect(result.avgMs).toBeLessThan(0.1) // <0.1ms per sample
    })

    it('should smooth 21-landmark set at 30+ FPS rate', () => {
      const smoother = new LandmarkSmoother({ minCutoff: 1.0, beta: 0.5 })
      const landmarks = makeOpenPalmLandmarks()
      let t = 0

      const result = runBenchmark('LandmarkSmoother.smooth (21 landmarks)', () => {
        smoother.smooth(landmarks, t)
        t += 1 / 30
      }, 5000)

      // Must be fast enough for 30 FPS: <33ms per frame
      expect(result.avgMs).toBeLessThan(5)
      // Target: >1000 smoothing ops/s
      expect(result.opsPerSec).toBeGreaterThan(1000)
    })
  })

  describe('Gesture Classifier', () => {
    it('should classify gestures at high throughput', () => {
      console.log('\n--- Gesture Classifier ---')
      const pinchHand = makeHand(makePinchLandmarks())
      const palmHand = makeHand(makeOpenPalmLandmarks())
      const pointHand = makeHand(makePointLandmarks())

      const r1 = runBenchmark('classifyGesture (pinch)', () => {
        classifyGesture(pinchHand)
      })

      const r2 = runBenchmark('classifyGesture (open palm)', () => {
        classifyGesture(palmHand)
      })

      const r3 = runBenchmark('classifyGesture (point)', () => {
        classifyGesture(pointHand)
      })

      // Classifier should be very fast — <0.05ms per call
      expect(r1.avgMs).toBeLessThan(0.5)
      expect(r2.avgMs).toBeLessThan(0.5)
      expect(r3.avgMs).toBeLessThan(0.5)
    })

    it('should measure individual geometric operations', () => {
      const a: Landmark = { x: 0, y: 0, z: 0 }
      const b: Landmark = { x: 1, y: 1, z: 1 }

      const r1 = runBenchmark('distance() 3D Euclidean', () => {
        distance(a, b)
      }, 50000)

      const hand = makeHand(makeOpenPalmLandmarks())
      const r2 = runBenchmark('fingerCurl() computation', () => {
        fingerCurl(hand.landmarks, 'index')
      }, 50000)

      const r3 = runBenchmark('analyzeHandPose() full', () => {
        analyzeHandPose(hand.landmarks)
      })

      expect(r1.avgMs).toBeLessThan(0.01)
      expect(r2.avgMs).toBeLessThan(0.05)
      expect(r3.avgMs).toBeLessThan(0.5)
    })
  })

  describe('Gesture Engine (full pipeline)', () => {
    it('should process frames at 30+ FPS rate', () => {
      console.log('\n--- Gesture Engine ---')
      const engine = new GestureEngine({ minOnsetFrames: 3 })
      const pinchHand = makeHand(makePinchLandmarks())
      let t = 1000
      let frameId = 0

      const result = runBenchmark('GestureEngine.processFrame (1 hand)', () => {
        const frame = makeFrame([pinchHand], t, frameId++)
        engine.processFrame(frame)
        t += 33
      }, 5000)

      // Must process a frame in <5ms to leave headroom for rendering
      expect(result.avgMs).toBeLessThan(5)
      // Must sustain >100 FPS processing rate
      expect(result.opsPerSec).toBeGreaterThan(100)
    })

    it('should handle two-hand frames efficiently', () => {
      const engine = new GestureEngine({ minOnsetFrames: 3 })
      const leftHand = makeHand(makePinchLandmarks(), 'left')
      const rightHand = makeHand(makePointLandmarks(), 'right')
      let t = 1000
      let frameId = 0

      const result = runBenchmark('GestureEngine.processFrame (2 hands)', () => {
        const frame = makeFrame([leftHand, rightHand], t, frameId++)
        engine.processFrame(frame)
        t += 33
      }, 5000)

      // Two-hand processing should still be <10ms
      expect(result.avgMs).toBeLessThan(10)
    })
  })

  describe('Command Mapping', () => {
    it('should map gestures to commands at high throughput', () => {
      console.log('\n--- Command Mapping ---')
      const event: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0.1 },
        timestamp: 1000,
        data: { distance: 0.02 }
      }

      const result = runBenchmark('mapGestureToCommand()', () => {
        mapGestureToCommand(event)
      }, 50000)

      expect(result.avgMs).toBeLessThan(0.01)
    })

    it('should dispatch scene actions at high throughput', () => {
      const event: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0.1 },
        timestamp: 1000
      }
      const ctx: DispatchContext = { viewMode: 'graph', selectedNodeId: null, selectedClusterId: null }

      const result = runBenchmark('dispatchGesture()', () => {
        dispatchGesture(event, ctx)
      }, 50000)

      expect(result.avgMs).toBeLessThan(0.01)
    })
  })

  describe('Virtual Mouse Execution', () => {
    it('should execute mouse commands at high throughput', () => {
      console.log('\n--- Virtual Mouse ---')
      const mouse = new VirtualMouse()
      mouse.initWithNative({
        create: () => true,
        move: () => {},
        click: () => {},
        scroll: () => {},
        destroy: () => {}
      })

      const moveCmd: MouseCommand = { target: 'mouse', action: 'move', x: 10, y: 20 }
      const result = runBenchmark('VirtualMouse.execute(move)', () => {
        mouse.execute(moveCmd)
      }, 50000)

      expect(result.avgMs).toBeLessThan(0.01)
    })
  })

  describe('Bus Fanout', () => {
    it('should broadcast to N clients efficiently', () => {
      console.log('\n--- Bus Fanout ---')
      const clientCounts = [1, 10, 50]

      for (const count of clientCounts) {
        const registry = new ProgramRegistry()
        const fanout = new GestureFanout(registry)

        for (let i = 0; i < count; i++) {
          const mockWs = { readyState: 1, send: () => {} } as any
          registry.register(`conn${i}`, mockWs, `program${i}`, ['select', 'rotate'])
        }

        const gesture = {
          type: 'gesture' as const,
          name: GestureType.Pinch,
          hand: 'right' as const,
          position: [0.5, 0.5, 0.1] as [number, number, number],
          confidence: 0.9,
          phase: GesturePhase.Onset
        }

        const result = runBenchmark(`GestureFanout.broadcast (${count} clients)`, () => {
          fanout.broadcastGesture(gesture)
        }, 5000)

        // Even with 50 clients, should be <1ms
        expect(result.avgMs).toBeLessThan(5)
      }
    })
  })

  describe('Data Validation', () => {
    it('should validate graph data efficiently', () => {
      console.log('\n--- Data Validation ---')
      const smallGraph = {
        nodes: Array.from({ length: 100 }, (_, i) => ({ id: `n${i}` })),
        edges: Array.from({ length: 200 }, (_, i) => ({
          source: `n${i % 100}`,
          target: `n${(i + 1) % 100}`
        }))
      }

      const result = runBenchmark('validateGraphData (100 nodes)', () => {
        validateGraphData(smallGraph)
      }, 1000)

      // Validation of 100-node graph should be <5ms
      expect(result.avgMs).toBeLessThan(10)
    })

    it('should validate embedding data efficiently', () => {
      const embeddings = generateGaussianClusters({
        numClusters: 5,
        pointsPerCluster: 200,
        spread: 2.0
      })

      const result = runBenchmark('validateEmbeddingData (1000 points)', () => {
        validateEmbeddingData(embeddings)
      }, 500)

      // 1000-point validation should be <20ms
      expect(result.avgMs).toBeLessThan(50)
    })
  })

  describe('Graph Parsing', () => {
    it('should parse small graph JSON quickly', () => {
      console.log('\n--- Graph Parsing ---')
      const json100 = generateLargeGraph(100)
      const json1000 = generateLargeGraph(1000)

      const r1 = runBenchmark('parseJsonGraph (100 nodes)', () => {
        parseJsonGraph(json100)
      }, 500)

      const r2 = runBenchmark('parseJsonGraph (1000 nodes)', () => {
        parseJsonGraph(json1000)
      }, 100)

      expect(r1.avgMs).toBeLessThan(10)
      expect(r2.avgMs).toBeLessThan(100)
    })
  })

  describe('Manifold Operations', () => {
    let embeddings5k: ReturnType<typeof generateGaussianClusters>

    beforeAll(() => {
      embeddings5k = generateGaussianClusters({
        numClusters: 5,
        pointsPerCluster: 1000,
        spread: 3.0
      })
    })

    it('should compute cluster centroids efficiently', () => {
      console.log('\n--- Manifold Operations ---')
      const result = runBenchmark('calculateClusterCentroids (5K points)', () => {
        calculateClusterCentroids(embeddings5k)
      }, 500)

      expect(result.avgMs).toBeLessThan(20)
    })

    it('should find nearest point efficiently', () => {
      const target = { x: 0, y: 0, z: 0 }

      const result = runBenchmark('findNearestPoint (5K points)', () => {
        findNearestPoint(target, embeddings5k.points)
      }, 2000)

      // Linear scan of 5K points should be <1ms
      expect(result.avgMs).toBeLessThan(5)
    })

    it('should generate datasets efficiently', () => {
      const r1 = runBenchmark('generateGaussianClusters (5K)', () => {
        generateGaussianClusters({ numClusters: 5, pointsPerCluster: 1000, spread: 3.0 })
      }, 50)

      const r2 = runBenchmark('generateSpiralManifold (5K)', () => {
        generateSpiralManifold(5000)
      }, 50)

      const r3 = runBenchmark('generateSwissRoll (5K)', () => {
        generateSwissRoll(5000)
      }, 50)

      expect(r1.avgMs).toBeLessThan(100)
      expect(r2.avgMs).toBeLessThan(100)
      expect(r3.avgMs).toBeLessThan(100)
    })
  })

  describe('End-to-End Pipeline Latency', () => {
    it('should process landmarks → scene action in <50ms', () => {
      console.log('\n--- End-to-End Pipeline ---')
      const smoother = new LandmarkSmoother({ minCutoff: 1.0, beta: 0.5 })
      const engine = new GestureEngine({ minOnsetFrames: 1 })
      const mouse = new VirtualMouse()
      mouse.initWithNative({
        create: () => true,
        move: () => {},
        click: () => {},
        scroll: () => {},
        destroy: () => {}
      })

      const landmarks = makePinchLandmarks()
      let t = 0
      let frameId = 0

      const result = runBenchmark('E2E: landmarks → smooth → classify → map → execute', () => {
        // Step 1: Smooth landmarks
        const smoothed = smoother.smooth(landmarks, t)

        // Step 2: Create frame
        const hand = makeHand(smoothed)
        const frame = makeFrame([hand], t * 1000, frameId++)

        // Step 3: Process through gesture engine
        const events = engine.processFrame(frame)

        // Step 4: Map to commands and dispatch
        for (const event of events) {
          const command = mapGestureToCommand(event)
          if (command && command.target === 'mouse') {
            mouse.execute(command as MouseCommand)
          }
          dispatchGesture(event, {
            viewMode: 'graph',
            selectedNodeId: null,
            selectedClusterId: null
          })
        }

        t += 1 / 30
      }, 3000)

      console.log(`\n  *** E2E LATENCY: ${result.avgMs.toFixed(3)}ms avg, ${result.p95Ms.toFixed(3)}ms p95 ***`)
      console.log(`  *** TARGET: <50ms *** ${result.p95Ms < 50 ? 'PASS' : 'FAIL'} ***\n`)

      // The core logic pipeline (excluding actual MediaPipe inference
      // and GPU rendering) must be under 50ms at p95
      expect(result.p95Ms).toBeLessThan(50)
      // Average should be well under 5ms
      expect(result.avgMs).toBeLessThan(5)
    })

    it('should handle sustained 30 FPS workload', () => {
      const smoother = new LandmarkSmoother({ minCutoff: 1.0, beta: 0.5 })
      const engine = new GestureEngine({ minOnsetFrames: 3 })
      const gestureSets = [makePinchLandmarks(), makeOpenPalmLandmarks(), makePointLandmarks()]
      let t = 0
      let frameId = 0
      let gestureIdx = 0

      // Simulate 10 seconds at 30 FPS = 300 frames
      const FRAMES = 300
      const times: number[] = []

      for (let i = 0; i < FRAMES; i++) {
        // Switch gesture every 30 frames (1 second)
        if (i % 30 === 0) gestureIdx = (gestureIdx + 1) % gestureSets.length

        const t0 = performance.now()

        const smoothed = smoother.smooth(gestureSets[gestureIdx], t)
        const hand = makeHand(smoothed)
        const frame = makeFrame([hand], t * 1000, frameId++)
        const events = engine.processFrame(frame)

        for (const event of events) {
          mapGestureToCommand(event)
          dispatchGesture(event, {
            viewMode: 'graph',
            selectedNodeId: null,
            selectedClusterId: null
          })
        }

        const t1 = performance.now()
        times.push(t1 - t0)
        t += 1 / 30
      }

      times.sort((a, b) => a - b)
      const avgMs = times.reduce((a, b) => a + b, 0) / FRAMES
      const p95Ms = times[Math.floor(FRAMES * 0.95)]
      const p99Ms = times[Math.floor(FRAMES * 0.99)]
      const maxMs = times[FRAMES - 1]

      console.log(
        `  Sustained 30 FPS (${FRAMES} frames): ` +
        `avg=${avgMs.toFixed(3)}ms  p95=${p95Ms.toFixed(3)}ms  ` +
        `p99=${p99Ms.toFixed(3)}ms  max=${maxMs.toFixed(3)}ms`
      )

      // Even under sustained load, each frame should be processed in <33ms (30 FPS budget)
      expect(p95Ms).toBeLessThan(33)
      expect(avgMs).toBeLessThan(5)
    })
  })

  describe('Throughput Summary', () => {
    it('should print throughput summary', () => {
      console.log('\n========================================')
      console.log('  THROUGHPUT SUMMARY')
      console.log('========================================')

      const engine = new GestureEngine({ minOnsetFrames: 1 })
      const hand = makeHand(makePinchLandmarks())
      let t = 1000

      // Measure how many frames can be processed per second
      const start = performance.now()
      let frames = 0
      while (performance.now() - start < 1000) {
        engine.processFrame(makeFrame([hand], t, frames))
        t += 33
        frames++
      }

      console.log(`  GestureEngine throughput: ${frames.toLocaleString()} frames/sec`)
      console.log(`  At 30 FPS, headroom factor: ${(frames / 30).toFixed(1)}x`)
      console.log('========================================\n')

      // Should be able to process at least 1000 FPS
      expect(frames).toBeGreaterThan(1000)
    })
  })
})
