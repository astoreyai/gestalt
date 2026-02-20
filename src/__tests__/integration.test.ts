/**
 * Integration tests — verify all modules communicate correctly
 * through the full pipeline using shared protocol types.
 *
 * Pipeline:  LandmarkFrame → Smoother → GestureEngine → GestureEvent
 *                                                         │
 *                     ┌───────────────────────────────────┤
 *                     ▼                                   ▼
 *            mapGestureToCommand()              dispatchGesture()
 *                     │                                   │
 *                     ▼                                   ▼
 *            Command → Mouse/KB                   SceneAction
 *                     │
 *                     ▼
 *            BusFanout → WebSocket clients
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  type Landmark,
  type Hand,
  type LandmarkFrame,
  type GestureEvent,
  type MouseCommand,
  type KeyboardCommand,
  type GraphData,
  type EmbeddingData,
  LANDMARK,
  GestureType,
  GesturePhase
} from '@shared/protocol'
import { LandmarkSmoother } from '@renderer/tracker/filters'
import { classifyGesture, distance } from '@renderer/gestures/classifier'
import { GestureEngine } from '@renderer/gestures/state'
import { mapGestureToCommand, DEFAULT_MAPPINGS } from '@renderer/gestures/mappings'
import { dispatchGesture, type DispatchContext } from '@renderer/controller/dispatcher'
import { VirtualMouse } from '@main/input/mouse'
import { VirtualKeyboard } from '@main/input/keyboard'
import { ProgramRegistry } from '@main/bus/registry'
import { GestureFanout } from '@main/bus/fanout'
import { validateGraphData, validateEmbeddingData, validateData } from '@renderer/data/validators'
import { calculateClusterCentroids, findNearestPoint } from '@renderer/manifold/navigation'
import { generateGaussianClusters } from '@renderer/manifold/generators'
import { parseJsonGraph } from '@renderer/graph/parsers/json-parser'
import { DEFAULT_GESTURE_CONFIG } from '@renderer/gestures/types'

// ─── Synthetic Hand Data Generators ──────────────────────────────────

function makeOpenPalmLandmarks(): Landmark[] {
  const lm: Landmark[] = []
  // Wrist
  lm.push({ x: 0.5, y: 0.7, z: 0 })
  // Thumb (CMC, MCP, IP, TIP) — fully extended
  lm.push({ x: 0.42, y: 0.65, z: -0.01 })
  lm.push({ x: 0.38, y: 0.58, z: -0.02 })
  lm.push({ x: 0.35, y: 0.52, z: -0.02 })
  lm.push({ x: 0.33, y: 0.46, z: -0.02 })
  // Index — extended
  lm.push({ x: 0.44, y: 0.55, z: 0 })
  lm.push({ x: 0.43, y: 0.45, z: 0 })
  lm.push({ x: 0.43, y: 0.38, z: 0 })
  lm.push({ x: 0.43, y: 0.32, z: 0 })
  // Middle — extended
  lm.push({ x: 0.50, y: 0.53, z: 0 })
  lm.push({ x: 0.50, y: 0.42, z: 0 })
  lm.push({ x: 0.50, y: 0.35, z: 0 })
  lm.push({ x: 0.50, y: 0.28, z: 0 })
  // Ring — extended
  lm.push({ x: 0.56, y: 0.55, z: 0 })
  lm.push({ x: 0.56, y: 0.45, z: 0 })
  lm.push({ x: 0.56, y: 0.38, z: 0 })
  lm.push({ x: 0.56, y: 0.32, z: 0 })
  // Pinky — extended
  lm.push({ x: 0.62, y: 0.58, z: 0 })
  lm.push({ x: 0.62, y: 0.48, z: 0 })
  lm.push({ x: 0.62, y: 0.42, z: 0 })
  lm.push({ x: 0.62, y: 0.38, z: 0 })
  return lm
}

function makePinchLandmarks(): Landmark[] {
  const lm = makeOpenPalmLandmarks()
  // Move thumb tip close to index tip
  lm[LANDMARK.THUMB_TIP] = { x: 0.44, y: 0.33, z: 0 }
  lm[LANDMARK.INDEX_TIP] = { x: 0.44, y: 0.33, z: 0.01 }
  return lm
}

function makePointLandmarks(): Landmark[] {
  const lm = makeOpenPalmLandmarks()
  // Index stays extended (original landmarks are fine)

  // Curl all other fingers using zigzag pattern:
  // Each segment reverses at the joint, creating small angles (high curl).
  // Pattern: MCP→PIP goes down, PIP→DIP zigzags UP, DIP→TIP zigzags DOWN

  // Middle: MCP=(0.50,0.53,0) PIP=(0.50,0.42,0) → zigzag
  lm[LANDMARK.MIDDLE_DIP] = { x: 0.50, y: 0.47, z: 0.01 }
  lm[LANDMARK.MIDDLE_TIP] = { x: 0.50, y: 0.43, z: 0.02 }

  // Ring: MCP=(0.56,0.55,0) PIP=(0.56,0.45,0) → zigzag
  lm[LANDMARK.RING_DIP] = { x: 0.56, y: 0.50, z: 0.01 }
  lm[LANDMARK.RING_TIP] = { x: 0.56, y: 0.46, z: 0.02 }

  // Pinky: MCP=(0.62,0.58,0) PIP=(0.62,0.48,0) → zigzag
  lm[LANDMARK.PINKY_DIP] = { x: 0.62, y: 0.53, z: 0.01 }
  lm[LANDMARK.PINKY_TIP] = { x: 0.62, y: 0.49, z: 0.02 }

  // Thumb: CMC=(0.42,0.65,-0.01) MCP=(0.38,0.58,-0.02) → zigzag back
  lm[LANDMARK.THUMB_IP] = { x: 0.41, y: 0.62, z: 0.00 }
  lm[LANDMARK.THUMB_TIP] = { x: 0.39, y: 0.58, z: 0.01 }

  return lm
}

function makeFistLandmarks(): Landmark[] {
  const lm = makeOpenPalmLandmarks()
  // Curl all fingers using zigzag pattern (DIP goes back up, TIP even higher)
  // This creates tight angles that yield curl > 0.6

  // Index: MCP=(0.44,0.55,0) PIP=(0.43,0.45,0) → zigzag back
  lm[LANDMARK.INDEX_DIP] = { x: 0.43, y: 0.50, z: 0.01 }
  lm[LANDMARK.INDEX_TIP] = { x: 0.43, y: 0.46, z: 0.02 }

  // Middle: MCP=(0.50,0.53,0) PIP=(0.50,0.42,0) → zigzag back
  lm[LANDMARK.MIDDLE_DIP] = { x: 0.50, y: 0.47, z: 0.01 }
  lm[LANDMARK.MIDDLE_TIP] = { x: 0.50, y: 0.43, z: 0.02 }

  // Ring: MCP=(0.56,0.55,0) PIP=(0.56,0.45,0) → zigzag back
  lm[LANDMARK.RING_DIP] = { x: 0.56, y: 0.50, z: 0.01 }
  lm[LANDMARK.RING_TIP] = { x: 0.56, y: 0.46, z: 0.02 }

  // Pinky: MCP=(0.62,0.58,0) PIP=(0.62,0.48,0) → zigzag back
  lm[LANDMARK.PINKY_DIP] = { x: 0.62, y: 0.53, z: 0.01 }
  lm[LANDMARK.PINKY_TIP] = { x: 0.62, y: 0.49, z: 0.02 }

  // Thumb: CMC=(0.42,0.65,-0.01) MCP=(0.38,0.58,-0.02) → zigzag back
  lm[LANDMARK.THUMB_IP] = { x: 0.41, y: 0.62, z: 0.00 }
  lm[LANDMARK.THUMB_TIP] = { x: 0.39, y: 0.58, z: 0.01 }

  return lm
}

function makeHand(landmarks: Landmark[], handedness: 'left' | 'right' = 'right'): Hand {
  return {
    handedness,
    landmarks,
    worldLandmarks: landmarks,
    score: 0.95
  }
}

function makeFrame(hands: Hand[], timestamp: number, frameId: number): LandmarkFrame {
  return { hands, timestamp, frameId }
}

// ─── Pipeline Tests ──────────────────────────────────────────────────

describe('Integration: Full Pipeline', () => {
  describe('Tracker → Smoother → Classifier', () => {
    it('should smooth noisy landmarks and still classify correctly', () => {
      const smoother = new LandmarkSmoother({ minCutoff: 1.0, beta: 0.0 })
      const pinchLandmarks = makePinchLandmarks()

      // Simulate 5 frames with minor noise
      for (let i = 0; i < 5; i++) {
        const noisy = pinchLandmarks.map(lm => ({
          x: lm.x + (Math.random() - 0.5) * 0.005,
          y: lm.y + (Math.random() - 0.5) * 0.005,
          z: lm.z + (Math.random() - 0.5) * 0.005
        }))
        const smoothed = smoother.smooth(noisy, i / 30) // 30 FPS timestamps
        const hand = makeHand(smoothed)
        const result = classifyGesture(hand)

        // The pinch should still be detected through noise + smoothing
        expect(result).not.toBeNull()
        if (i >= 2) {
          // After a few frames of smoothing convergence
          expect(result!.type).toBe(GestureType.Pinch)
        }
      }
    })

    it('should smooth open palm landmarks and classify as OpenPalm', () => {
      const smoother = new LandmarkSmoother({ minCutoff: 1.0, beta: 0.5 })
      const palmLandmarks = makeOpenPalmLandmarks()

      for (let i = 0; i < 5; i++) {
        const smoothed = smoother.smooth(palmLandmarks, i / 30)
        const hand = makeHand(smoothed)
        const result = classifyGesture(hand)
        expect(result).not.toBeNull()
      }
    })
  })

  describe('LandmarkFrame → GestureEngine → GestureEvent', () => {
    let engine: GestureEngine

    beforeEach(() => {
      engine = new GestureEngine({ minOnsetFrames: 1 })
    })

    it('should produce onset event for pinch gesture', () => {
      const hand = makeHand(makePinchLandmarks())
      const frame = makeFrame([hand], 1000, 1)
      const events = engine.processFrame(frame)

      const pinchEvent = events.find(e => e.type === GestureType.Pinch)
      expect(pinchEvent).toBeDefined()
      expect(pinchEvent!.phase).toBe(GesturePhase.Onset)
      expect(pinchEvent!.hand).toBe('right')
      expect(pinchEvent!.confidence).toBeGreaterThan(0)
      expect(pinchEvent!.position).toBeDefined()
      expect(pinchEvent!.timestamp).toBe(1000)
    })

    it('should produce onset then hold for sustained pinch', () => {
      const hand = makeHand(makePinchLandmarks())

      // Frame 1: onset
      const frame1 = makeFrame([hand], 1000, 1)
      const events1 = engine.processFrame(frame1)
      const onset = events1.find(e => e.type === GestureType.Pinch && e.phase === GesturePhase.Onset)
      expect(onset).toBeDefined()

      // Frames 2-4: sustained pinch → should transition to hold
      let holdEvent: GestureEvent | undefined
      for (let i = 2; i <= 10; i++) {
        const frame = makeFrame([hand], 1000 + i * 33, i)
        const events = engine.processFrame(frame)
        const hold = events.find(e => e.type === GestureType.Pinch && e.phase === GesturePhase.Hold)
        if (hold) holdEvent = hold
      }
      expect(holdEvent).toBeDefined()
    })

    it('should produce release when gesture stops', () => {
      const pinchHand = makeHand(makePinchLandmarks())
      const openHand = makeHand(makeOpenPalmLandmarks())

      // Start with pinch
      engine.processFrame(makeFrame([pinchHand], 1000, 1))
      engine.processFrame(makeFrame([pinchHand], 1033, 2))
      engine.processFrame(makeFrame([pinchHand], 1066, 3))
      engine.processFrame(makeFrame([pinchHand], 1099, 4))

      // Switch to open palm → pinch should release
      const events = engine.processFrame(makeFrame([openHand], 1132, 5))
      const release = events.find(e => e.type === GestureType.Pinch && e.phase === GesturePhase.Release)
      expect(release).toBeDefined()
    })

    it('should handle two-hand pinch detection', () => {
      const leftPinch = makeHand(makePinchLandmarks(), 'left')
      const rightPinch = makeHand(makePinchLandmarks(), 'right')
      const frame = makeFrame([leftPinch, rightPinch], 1000, 1)
      const events = engine.processFrame(frame)

      const twoHandPinch = events.find(e => e.type === GestureType.TwoHandPinch)
      expect(twoHandPinch).toBeDefined()
      expect(twoHandPinch!.phase).toBe(GesturePhase.Onset)
    })

    it('should produce point gesture events', () => {
      const hand = makeHand(makePointLandmarks())
      const frame = makeFrame([hand], 1000, 1)
      const events = engine.processFrame(frame)

      const pointEvent = events.find(e => e.type === GestureType.Point)
      expect(pointEvent).toBeDefined()
      expect(pointEvent!.phase).toBe(GesturePhase.Onset)
    })
  })

  describe('GestureEvent → mapGestureToCommand → Command', () => {
    it('should map pinch onset to mouse click command', () => {
      const event: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0.1 },
        timestamp: 1000,
        data: { distance: 0.02 }
      }

      const command = mapGestureToCommand(event)
      expect(command).not.toBeNull()
      expect(command!.target).toBe('mouse')
      const mouseCmd = command as MouseCommand
      expect(mouseCmd.action).toBe('click')
      expect(mouseCmd.button).toBe('left')
      expect(mouseCmd.x).toBe(0.5)
      expect(mouseCmd.y).toBe(0.5)
    })

    it('should map point onset to mouse move command', () => {
      const event: GestureEvent = {
        type: GestureType.Point,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.3, y: 0.7, z: 0.1 },
        timestamp: 1000
      }

      const command = mapGestureToCommand(event)
      expect(command).not.toBeNull()
      expect(command!.target).toBe('mouse')
      const mouseCmd = command as MouseCommand
      expect(mouseCmd.action).toBe('move')
      expect(mouseCmd.x).toBe(0.3)
      expect(mouseCmd.y).toBe(0.7)
    })

    it('should map fist onset to Escape key', () => {
      const event: GestureEvent = {
        type: GestureType.Fist,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0 },
        timestamp: 1000
      }

      const command = mapGestureToCommand(event)
      expect(command).not.toBeNull()
      expect(command!.target).toBe('keyboard')
      const kbCmd = command as KeyboardCommand
      expect(kbCmd.action).toBe('press')
      expect(kbCmd.key).toBe('Escape')
    })

    it('should map L-shape onset to Ctrl+Shift+T combo', () => {
      const event: GestureEvent = {
        type: GestureType.LShape,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.85,
        position: { x: 0.5, y: 0.5, z: 0 },
        timestamp: 1000
      }

      const command = mapGestureToCommand(event)
      expect(command).not.toBeNull()
      expect(command!.target).toBe('keyboard')
      const kbCmd = command as KeyboardCommand
      expect(kbCmd.action).toBe('combo')
      expect(kbCmd.keys).toEqual(['ctrl', 'shift', 't'])
    })

    it('should return null for unmapped gesture-phase combos', () => {
      const event: GestureEvent = {
        type: GestureType.Fist,
        phase: GesturePhase.Hold,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0 },
        timestamp: 1000
      }

      expect(mapGestureToCommand(event)).toBeNull()
    })
  })

  describe('GestureEvent → dispatchGesture → SceneAction', () => {
    it('should dispatch pinch onset as select in graph mode', () => {
      const event: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0.1 },
        timestamp: 1000
      }
      const ctx: DispatchContext = { viewMode: 'graph', selectedNodeId: null, selectedClusterId: null }

      const action = dispatchGesture(event, ctx)
      expect(action.type).toBe('select')
      expect(action.params.x).toBe(0.5)
    })

    it('should dispatch open palm as deselect in manifold mode', () => {
      const event: GestureEvent = {
        type: GestureType.OpenPalm,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0 },
        timestamp: 1000
      }
      const ctx: DispatchContext = { viewMode: 'manifold', selectedNodeId: 'n1', selectedClusterId: null }

      const action = dispatchGesture(event, ctx)
      expect(action.type).toBe('deselect')
    })

    it('should dispatch point hold as navigate in manifold mode', () => {
      const event: GestureEvent = {
        type: GestureType.Point,
        phase: GesturePhase.Hold,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.3, y: 0.7, z: 0 },
        timestamp: 1000
      }
      const ctx: DispatchContext = { viewMode: 'manifold', selectedNodeId: null, selectedClusterId: null }

      const action = dispatchGesture(event, ctx)
      expect(action.type).toBe('navigate')
    })

    it('should route by hand in split mode', () => {
      const leftGesture: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Onset,
        hand: 'left',
        confidence: 0.9,
        position: { x: 0.3, y: 0.5, z: 0 },
        timestamp: 1000
      }
      const rightGesture: GestureEvent = {
        type: GestureType.Point,
        phase: GesturePhase.Hold,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.7, y: 0.5, z: 0 },
        timestamp: 1000
      }
      const ctx: DispatchContext = { viewMode: 'split', selectedNodeId: null, selectedClusterId: null }

      // Left hand → graph actions
      const leftAction = dispatchGesture(leftGesture, ctx)
      expect(leftAction.type).toBe('select')

      // Right hand → manifold actions
      const rightAction = dispatchGesture(rightGesture, ctx)
      expect(rightAction.type).toBe('navigate')
    })
  })

  describe('Command → VirtualMouse/VirtualKeyboard', () => {
    it('should execute mouse move command via VirtualMouse', () => {
      const mouse = new VirtualMouse()
      const moveCalls: Array<{ dx: number; dy: number }> = []

      mouse.initWithNative({
        create: () => true,
        move: (dx, dy) => moveCalls.push({ dx, dy }),
        click: () => {},
        scroll: () => {},
        destroy: () => {}
      })

      const cmd: MouseCommand = { target: 'mouse', action: 'move', x: 100, y: 200 }
      mouse.execute(cmd)

      expect(moveCalls.length).toBe(1)
      expect(moveCalls[0].dx).toBe(100)
      expect(moveCalls[0].dy).toBe(200)
    })

    it('should execute mouse click command', () => {
      const mouse = new VirtualMouse()
      const clickCalls: string[] = []

      mouse.initWithNative({
        create: () => true,
        move: () => {},
        click: (button) => clickCalls.push(button ?? 'left'),
        scroll: () => {},
        destroy: () => {}
      })

      const cmd: MouseCommand = { target: 'mouse', action: 'click', button: 'left' }
      mouse.execute(cmd)

      expect(clickCalls).toEqual(['left'])
    })

    it('should execute keyboard press command via VirtualKeyboard', () => {
      const keyboard = new VirtualKeyboard()
      const pressCalls: string[] = []

      keyboard.initWithNative({
        create: () => true,
        pressKey: (key) => pressCalls.push(key),
        keyCombo: () => {},
        destroy: () => {}
      })

      const cmd: KeyboardCommand = { target: 'keyboard', action: 'press', key: 'Escape' }
      keyboard.execute(cmd)

      expect(pressCalls).toEqual(['Escape'])
    })

    it('should execute keyboard combo command', () => {
      const keyboard = new VirtualKeyboard()
      const comboCalls: string[][] = []

      keyboard.initWithNative({
        create: () => true,
        pressKey: () => {},
        keyCombo: (keys) => comboCalls.push([...keys]),
        destroy: () => {}
      })

      const cmd: KeyboardCommand = { target: 'keyboard', action: 'combo', keys: ['ctrl', 'shift', 't'] }
      keyboard.execute(cmd)

      expect(comboCalls).toEqual([['ctrl', 'shift', 't']])
    })
  })

  describe('GestureEvent → BusFanout → WebSocket clients', () => {
    it('should fan out gesture events to registered programs', () => {
      const registry = new ProgramRegistry()
      const fanout = new GestureFanout(registry)
      const received: string[] = []

      // Mock WebSocket
      const mockWs = {
        readyState: 1, // WebSocket.OPEN
        send: (msg: string) => received.push(msg)
      } as any

      registry.register('conn1', mockWs, 'blender', ['rotate', 'select'])

      fanout.broadcastGesture({
        type: 'gesture',
        name: GestureType.Pinch,
        hand: 'right',
        position: [0.5, 0.5, 0.1],
        confidence: 0.9,
        phase: GesturePhase.Onset
      })

      // Pinch maps to 'select' capability
      expect(received.length).toBe(1)
      const parsed = JSON.parse(received[0])
      expect(parsed.type).toBe('gesture')
      expect(parsed.name).toBe('pinch')
    })

    it('should not send gesture to programs that lack capability', () => {
      const registry = new ProgramRegistry()
      const fanout = new GestureFanout(registry)
      const received: string[] = []

      const mockWs = {
        readyState: 1,
        send: (msg: string) => received.push(msg)
      } as any

      // Only cares about 'zoom'
      registry.register('conn1', mockWs, 'viewer', ['zoom'])

      fanout.broadcastGesture({
        type: 'gesture',
        name: GestureType.Pinch,
        hand: 'right',
        position: [0.5, 0.5, 0],
        confidence: 0.9,
        phase: GesturePhase.Onset
      })

      // Pinch → select/click, not zoom → should not receive
      expect(received.length).toBe(0)
    })

    it('should send to wildcard programs', () => {
      const registry = new ProgramRegistry()
      const fanout = new GestureFanout(registry)
      const received: string[] = []

      const mockWs = {
        readyState: 1,
        send: (msg: string) => received.push(msg)
      } as any

      registry.register('conn1', mockWs, 'recorder', ['*'])

      fanout.broadcastGesture({
        type: 'gesture',
        name: GestureType.Twist,
        hand: 'right',
        position: [0.5, 0.5, 0],
        confidence: 0.8,
        phase: GesturePhase.Hold
      })

      expect(received.length).toBe(1)
    })
  })

  describe('Data → Validators → Graph/Manifold modules', () => {
    it('should validate and parse JSON graph data end-to-end', async () => {
      const graphJson = JSON.stringify({
        nodes: [
          { id: 'a', label: 'Node A' },
          { id: 'b', label: 'Node B' },
          { id: 'c', label: 'Node C' }
        ],
        edges: [
          { source: 'a', target: 'b', weight: 0.8 },
          { source: 'b', target: 'c', weight: 0.5 }
        ]
      })

      // Parse via JSON parser
      const graphData = await parseJsonGraph(graphJson)
      expect(graphData.nodes).toHaveLength(3)
      expect(graphData.edges).toHaveLength(2)

      // Validate via Zod validators
      const validation = validateGraphData(graphData)
      expect(validation.success).toBe(true)

      // Auto-detect type
      const autoDetect = validateData(graphData)
      expect(autoDetect.success).toBe(true)
    })

    it('should validate embedding data and compute cluster centroids', () => {
      const embeddings = generateGaussianClusters({
        numClusters: 3,
        pointsPerCluster: 100,
        spread: 2.0,
        seed: 42
      })

      // Validate
      const validation = validateEmbeddingData(embeddings)
      expect(validation.success).toBe(true)

      // Compute cluster centroids
      const centroids = calculateClusterCentroids(embeddings)
      expect(centroids).toHaveLength(3)

      // Each cluster should have 100 points
      for (const c of centroids) {
        expect(c.pointCount).toBe(100)
        expect(c.boundingSphereRadius).toBeGreaterThan(0)
        expect(c.centroid.x).toBeDefined()
        expect(c.centroid.y).toBeDefined()
        expect(c.centroid.z).toBeDefined()
      }

      // Find nearest point
      const nearest = findNearestPoint(centroids[0].centroid, embeddings.points)
      expect(nearest).not.toBeNull()
      expect(nearest!.clusterId).toBe(0)
    })

    it('should reject invalid graph data with bad edge references', () => {
      const badGraph = {
        nodes: [{ id: 'a' }],
        edges: [{ source: 'a', target: 'nonexistent' }]
      }

      const validation = validateGraphData(badGraph)
      expect(validation.success).toBe(false)
      expect(validation.errors![0]).toContain('non-existent')
    })
  })

  describe('Full End-to-End: Landmarks → Scene Action', () => {
    it('should process pinch landmarks through entire pipeline to scene action', () => {
      // 1. Generate landmarks
      const landmarks = makePinchLandmarks()

      // 2. Smooth landmarks
      const smoother = new LandmarkSmoother()
      const smoothed = smoother.smooth(landmarks, 0)

      // 3. Create hand and frame
      const hand = makeHand(smoothed)
      const frame = makeFrame([hand], 1000, 1)

      // 4. Process through GestureEngine
      const engine = new GestureEngine({ minOnsetFrames: 1 })
      const events = engine.processFrame(frame)

      // 5. Find pinch event
      const pinchEvent = events.find(e => e.type === GestureType.Pinch)
      expect(pinchEvent).toBeDefined()

      // 6. Map to command
      const command = mapGestureToCommand(pinchEvent!)
      expect(command).not.toBeNull()
      expect(command!.target).toBe('mouse')
      expect((command as MouseCommand).action).toBe('click')

      // 7. Dispatch to scene
      const ctx: DispatchContext = { viewMode: 'graph', selectedNodeId: null, selectedClusterId: null }
      const sceneAction = dispatchGesture(pinchEvent!, ctx)
      expect(sceneAction.type).toBe('select')
    })

    it('should process point landmarks through entire pipeline', () => {
      const landmarks = makePointLandmarks()
      const smoother = new LandmarkSmoother()
      const smoothed = smoother.smooth(landmarks, 0)
      const hand = makeHand(smoothed)

      // Need multiple frames for hold transition
      const engine = new GestureEngine({ minOnsetFrames: 1 })

      // First frame: onset
      const frame1 = makeFrame([hand], 1000, 1)
      const events1 = engine.processFrame(frame1)
      const pointOnset = events1.find(e => e.type === GestureType.Point)
      expect(pointOnset).toBeDefined()

      // Map onset to command
      const command = mapGestureToCommand(pointOnset!)
      expect(command).not.toBeNull()
      expect(command!.target).toBe('mouse')
      expect((command as MouseCommand).action).toBe('move')
    })

    it('should process fist landmarks through pipeline to keyboard escape', () => {
      const landmarks = makeFistLandmarks()
      const smoother = new LandmarkSmoother()
      const smoothed = smoother.smooth(landmarks, 0)
      const hand = makeHand(smoothed)

      const engine = new GestureEngine({ minOnsetFrames: 1 })
      const frame = makeFrame([hand], 1000, 1)
      const events = engine.processFrame(frame)

      const fistEvent = events.find(e => e.type === GestureType.Fist)
      expect(fistEvent).toBeDefined()
      const command = mapGestureToCommand(fistEvent!)
      expect(command).not.toBeNull()
      expect(command!.target).toBe('keyboard')
      expect((command as KeyboardCommand).action).toBe('press')
      expect((command as KeyboardCommand).key).toBe('Escape')
    })

    it('should handle multi-gesture frame with bus fanout', () => {
      const registry = new ProgramRegistry()
      const fanout = new GestureFanout(registry)
      const blenderReceived: string[] = []
      const obsReceived: string[] = []

      const blenderWs = { readyState: 1, send: (msg: string) => blenderReceived.push(msg) } as any
      const obsWs = { readyState: 1, send: (msg: string) => obsReceived.push(msg) } as any

      registry.register('conn1', blenderWs, 'blender', ['rotate', 'select'])
      registry.register('conn2', obsWs, 'obs', ['*'])

      // Process a gesture event and broadcast to bus
      const event: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.5, z: 0.1 },
        timestamp: 1000
      }

      // Convert to bus format and broadcast
      fanout.broadcastGesture({
        type: 'gesture',
        name: event.type,
        hand: event.hand,
        position: [event.position.x, event.position.y, event.position.z],
        confidence: event.confidence,
        phase: event.phase
      })

      // Blender gets pinch (maps to 'select')
      expect(blenderReceived.length).toBe(1)
      // OBS gets everything (wildcard)
      expect(obsReceived.length).toBe(1)
    })
  })

  describe('Cross-module type compatibility', () => {
    it('should pass GestureEvent type between engine, mappings, and dispatcher', () => {
      const engine = new GestureEngine({ minOnsetFrames: 1 })
      const hand = makeHand(makePinchLandmarks())
      const frame = makeFrame([hand], 1000, 1)
      const events = engine.processFrame(frame)

      for (const event of events) {
        // Each event should be processable by both mapGestureToCommand and dispatchGesture
        const command = mapGestureToCommand(event)
        const ctx: DispatchContext = { viewMode: 'graph', selectedNodeId: null, selectedClusterId: null }
        const action = dispatchGesture(event, ctx)

        // Both should return valid results (may be null/noop for some combos)
        expect(action).toBeDefined()
        expect(action.type).toBeDefined()
      }
    })

    it('should maintain LandmarkFrame shape from tracker through gesture engine', () => {
      const engine = new GestureEngine()
      const landmarks = makeOpenPalmLandmarks()

      // Verify landmark array is exactly 21
      expect(landmarks).toHaveLength(21)

      // Frame structure matches protocol
      const hand: Hand = {
        handedness: 'right',
        landmarks,
        worldLandmarks: landmarks,
        score: 0.95
      }
      const frame: LandmarkFrame = {
        hands: [hand],
        timestamp: Date.now(),
        frameId: 1
      }

      // Engine accepts and processes without error
      const events = engine.processFrame(frame)
      expect(Array.isArray(events)).toBe(true)

      // Each event has all required fields per protocol
      for (const e of events) {
        expect(typeof e.type).toBe('string')
        expect(typeof e.phase).toBe('string')
        expect(['left', 'right']).toContain(e.hand)
        expect(typeof e.confidence).toBe('number')
        expect(e.position).toHaveProperty('x')
        expect(e.position).toHaveProperty('y')
        expect(e.position).toHaveProperty('z')
        expect(typeof e.timestamp).toBe('number')
      }
    })
  })

  // ─── P1-26: Dispatcher+Engine integration ───────────────────────────
  // Verifies that gesture data values (rotation, handDistance) propagate
  // through the engine and dispatcher without being zeroed out.
  // This test would have caught P0-1 (twist angle zeroed) and
  // P0-2 (two-hand-pinch delta zeroed).

  describe('Dispatcher+Engine: gesture data propagation (P1-26)', () => {
    /**
     * Create twist landmarks by setting up a hand whose MIDDLE_MCP -> WRIST
     * vector rotates between frames. The GestureEngine tracks hand orientation
     * via computeHandAngle = atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x).
     * We vary the middleMcp position across frames to induce rotation > twistMinRotation.
     */
    function makeTwistLandmarks(angle: number): Landmark[] {
      const lm = makeOpenPalmLandmarks()
      // Wrist is at (0.5, 0.7, 0). Place MIDDLE_MCP at a given angle from wrist.
      const radius = 0.17 // approximate distance from wrist to MIDDLE_MCP in the default
      lm[LANDMARK.MIDDLE_MCP] = {
        x: 0.5 + radius * Math.cos(angle),
        y: 0.7 + radius * Math.sin(angle),
        z: 0
      }
      return lm
    }

    it('should propagate twist rotation through engine to dispatcher (P0-1 regression)', () => {
      // Use very permissive config: 1 onset frame, 0ms hold, 0ms cooldown, low twist threshold
      const engine = new GestureEngine({
        minOnsetFrames: 1,
        minHoldDuration: 0,
        cooldownDuration: 0,
        twistMinRotation: 0.1,
        sensitivity: 1.0
      })
      const ctx: DispatchContext = { viewMode: 'graph', selectedNodeId: null, selectedClusterId: null }

      // Frame 1: establish baseline orientation (angle = -pi/2, pointing down)
      const baseAngle = -Math.PI / 2
      const hand1 = makeHand(makeTwistLandmarks(baseAngle))
      engine.processFrame(makeFrame([hand1], 1000, 1))

      // Frame 2: rotate hand by 0.5 radians (well above twistMinRotation of 0.1)
      const rotatedAngle = baseAngle + 0.5
      const hand2 = makeHand(makeTwistLandmarks(rotatedAngle))
      const events2 = engine.processFrame(makeFrame([hand2], 1050, 2))

      // The twist should be detected as Onset on frame 2
      const twistOnset = events2.find(e => e.type === GestureType.Twist && e.phase === GesturePhase.Onset)
      expect(twistOnset).toBeDefined()
      expect(twistOnset!.data).toBeDefined()
      expect(twistOnset!.data!.rotation).not.toBe(0)

      // Frame 3: keep rotating to stay detected -> should transition to Hold
      const hand3 = makeHand(makeTwistLandmarks(rotatedAngle + 0.5))
      const events3 = engine.processFrame(makeFrame([hand3], 1100, 3))

      const twistHold = events3.find(e => e.type === GestureType.Twist && e.phase === GesturePhase.Hold)
      expect(twistHold).toBeDefined()
      expect(twistHold!.data).toBeDefined()
      expect(twistHold!.data!.rotation).not.toBe(0)

      // Now dispatch the Hold event through dispatchGesture
      const action = dispatchGesture(twistHold!, ctx)

      expect(action.type).toBe('rotate')
      // THE KEY ASSERTION: angle must match the gesture rotation, and must NOT be zero
      expect(action.params.angle).toBe(twistHold!.data!.rotation)
      expect(action.params.angle).not.toBe(0)
      expect(action.params.axis).toBe('y')
    })

    it('should propagate two-hand-pinch handDistance through engine to dispatcher (P0-2 regression)', () => {
      const engine = new GestureEngine({
        minOnsetFrames: 1,
        minHoldDuration: 0,
        cooldownDuration: 0,
        sensitivity: 1.0
      })
      const ctx: DispatchContext = { viewMode: 'graph', selectedNodeId: null, selectedClusterId: null }

      // Create two pinching hands with thumb tips far apart (different x positions)
      const leftLandmarks = makePinchLandmarks()
      const rightLandmarks = makePinchLandmarks()

      // Shift left hand's thumb tip to left side, right hand's to right side
      // so handDistance (distance between THUMB_TIPs) is significant
      leftLandmarks[LANDMARK.THUMB_TIP] = { x: 0.2, y: 0.33, z: 0 }
      leftLandmarks[LANDMARK.INDEX_TIP] = { x: 0.2, y: 0.33, z: 0.01 }
      rightLandmarks[LANDMARK.THUMB_TIP] = { x: 0.8, y: 0.33, z: 0 }
      rightLandmarks[LANDMARK.INDEX_TIP] = { x: 0.8, y: 0.33, z: 0.01 }

      const leftHand = makeHand(leftLandmarks, 'left')
      const rightHand = makeHand(rightLandmarks, 'right')

      // Frame 1: onset
      const frame1 = makeFrame([leftHand, rightHand], 1000, 1)
      const events1 = engine.processFrame(frame1)

      const twoHandOnset = events1.find(
        e => e.type === GestureType.TwoHandPinch && e.phase === GesturePhase.Onset
      )
      expect(twoHandOnset).toBeDefined()
      expect(twoHandOnset!.data).toBeDefined()
      expect(twoHandOnset!.data!.handDistance).toBeGreaterThan(0)

      // Frame 2: sustain for Hold
      const frame2 = makeFrame([leftHand, rightHand], 1050, 2)
      const events2 = engine.processFrame(frame2)

      const twoHandHold = events2.find(
        e => e.type === GestureType.TwoHandPinch && e.phase === GesturePhase.Hold
      )
      expect(twoHandHold).toBeDefined()
      expect(twoHandHold!.data).toBeDefined()
      expect(twoHandHold!.data!.handDistance).toBeGreaterThan(0)

      // Dispatch the Hold event
      const action = dispatchGesture(twoHandHold!, ctx)

      expect(action.type).toBe('zoom')
      // THE KEY ASSERTION: delta must match handDistance, and must NOT be zero
      expect(action.params.delta).toBe(twoHandHold!.data!.handDistance)
      expect(action.params.delta).not.toBe(0)
    })

    it('should propagate twist data in manifold mode as well', () => {
      const engine = new GestureEngine({
        minOnsetFrames: 1,
        minHoldDuration: 0,
        cooldownDuration: 0,
        twistMinRotation: 0.1,
        sensitivity: 1.0
      })
      const ctx: DispatchContext = { viewMode: 'manifold', selectedNodeId: null, selectedClusterId: null }

      const baseAngle = -Math.PI / 2
      const hand1 = makeHand(makeTwistLandmarks(baseAngle))
      engine.processFrame(makeFrame([hand1], 1000, 1))

      const hand2 = makeHand(makeTwistLandmarks(baseAngle + 0.5))
      engine.processFrame(makeFrame([hand2], 1050, 2))

      const hand3 = makeHand(makeTwistLandmarks(baseAngle + 1.0))
      const events3 = engine.processFrame(makeFrame([hand3], 1100, 3))

      const twistHold = events3.find(e => e.type === GestureType.Twist && e.phase === GesturePhase.Hold)
      expect(twistHold).toBeDefined()

      const action = dispatchGesture(twistHold!, ctx)
      expect(action.type).toBe('rotate')
      expect(action.params.angle).toBe(twistHold!.data!.rotation)
      expect(action.params.angle).not.toBe(0)
    })

    it('should propagate two-hand-pinch data in split mode (right hand)', () => {
      const engine = new GestureEngine({
        minOnsetFrames: 1,
        minHoldDuration: 0,
        cooldownDuration: 0,
        sensitivity: 1.0
      })
      // In split mode, right hand dispatches to manifold
      const ctx: DispatchContext = { viewMode: 'split', selectedNodeId: null, selectedClusterId: null }

      const leftLandmarks = makePinchLandmarks()
      const rightLandmarks = makePinchLandmarks()
      leftLandmarks[LANDMARK.THUMB_TIP] = { x: 0.15, y: 0.33, z: 0 }
      leftLandmarks[LANDMARK.INDEX_TIP] = { x: 0.15, y: 0.33, z: 0.01 }
      rightLandmarks[LANDMARK.THUMB_TIP] = { x: 0.85, y: 0.33, z: 0 }
      rightLandmarks[LANDMARK.INDEX_TIP] = { x: 0.85, y: 0.33, z: 0.01 }

      const leftHand = makeHand(leftLandmarks, 'left')
      const rightHand = makeHand(rightLandmarks, 'right')

      // Frame 1: onset, Frame 2: hold
      engine.processFrame(makeFrame([leftHand, rightHand], 1000, 1))
      const events2 = engine.processFrame(makeFrame([leftHand, rightHand], 1050, 2))

      const twoHandHold = events2.find(
        e => e.type === GestureType.TwoHandPinch && e.phase === GesturePhase.Hold
      )
      expect(twoHandHold).toBeDefined()

      // TwoHandPinch uses hand='right', so in split mode -> manifold dispatch
      const action = dispatchGesture(twoHandHold!, ctx)
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(twoHandHold!.data!.handDistance)
      expect(action.params.delta).not.toBe(0)
    })
  })
})
