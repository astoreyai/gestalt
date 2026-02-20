import { describe, it, expect } from 'vitest'
import {
  GestureType,
  GesturePhase,
  LANDMARK,
  DEFAULT_CONFIG,
  type Landmark,
  type Hand,
  type LandmarkFrame,
  type GestureEvent,
  type MouseCommand,
  type KeyboardCommand,
  type GraphNode,
  type GraphEdge,
  type GraphData,
  type EmbeddingPoint,
  type EmbeddingData,
  type AppConfig
} from '../protocol'
import { IPC } from '../ipc-channels'
import type { BusMessage, BusRegisterMessage, BusGestureMessage } from '../bus-protocol'

describe('Protocol Types', () => {
  describe('Landmark', () => {
    it('should represent a 3D point with x, y, z', () => {
      const lm: Landmark = { x: 0.5, y: 0.3, z: -0.1 }
      expect(lm.x).toBe(0.5)
      expect(lm.y).toBe(0.3)
      expect(lm.z).toBe(-0.1)
    })
  })

  describe('LANDMARK indices', () => {
    it('should have 21 landmark indices (0-20)', () => {
      expect(LANDMARK.WRIST).toBe(0)
      expect(LANDMARK.THUMB_TIP).toBe(4)
      expect(LANDMARK.INDEX_TIP).toBe(8)
      expect(LANDMARK.MIDDLE_TIP).toBe(12)
      expect(LANDMARK.RING_TIP).toBe(16)
      expect(LANDMARK.PINKY_TIP).toBe(20)
    })

    it('should have all 21 unique values', () => {
      const values = Object.values(LANDMARK)
      expect(values.length).toBe(21)
      expect(new Set(values).size).toBe(21)
    })
  })

  describe('Hand', () => {
    it('should represent a tracked hand', () => {
      const hand: Hand = {
        handedness: 'right',
        landmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
        worldLandmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
        score: 0.95
      }
      expect(hand.landmarks.length).toBe(21)
      expect(hand.handedness).toBe('right')
    })
  })

  describe('LandmarkFrame', () => {
    it('should represent a frame of tracking data', () => {
      const frame: LandmarkFrame = {
        hands: [],
        timestamp: 1000.5,
        frameId: 42
      }
      expect(frame.hands).toEqual([])
      expect(frame.timestamp).toBe(1000.5)
      expect(frame.frameId).toBe(42)
    })
  })

  describe('GestureType', () => {
    it('should enumerate all gesture types', () => {
      expect(GestureType.Pinch).toBe('pinch')
      expect(GestureType.Point).toBe('point')
      expect(GestureType.OpenPalm).toBe('open_palm')
      expect(GestureType.Twist).toBe('twist')
      expect(GestureType.TwoHandPinch).toBe('two_hand_pinch')
      expect(GestureType.FlatDrag).toBe('flat_drag')
      expect(GestureType.Fist).toBe('fist')
      expect(GestureType.LShape).toBe('l_shape')
    })

    it('should have 8 gesture types', () => {
      const values = Object.values(GestureType)
      expect(values.length).toBe(8)
    })
  })

  describe('GesturePhase', () => {
    it('should have onset, hold, release phases', () => {
      expect(GesturePhase.Onset).toBe('onset')
      expect(GesturePhase.Hold).toBe('hold')
      expect(GesturePhase.Release).toBe('release')
    })
  })

  describe('GestureEvent', () => {
    it('should represent a gesture event', () => {
      const event: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.95,
        position: { x: 0.5, y: 0.3, z: 0.1 },
        timestamp: 1000
      }
      expect(event.type).toBe('pinch')
      expect(event.phase).toBe('onset')
    })

    it('should support optional data payload', () => {
      const event: GestureEvent = {
        type: GestureType.Twist,
        phase: GesturePhase.Hold,
        hand: 'left',
        confidence: 0.8,
        position: { x: 0, y: 0, z: 0 },
        timestamp: 1000,
        data: { rotation: 45.0, speed: 2.3 }
      }
      expect(event.data?.rotation).toBe(45.0)
    })
  })

  describe('Command types', () => {
    it('should create a mouse command', () => {
      const cmd: MouseCommand = {
        target: 'mouse',
        action: 'move',
        x: 100,
        y: 200
      }
      expect(cmd.target).toBe('mouse')
      expect(cmd.action).toBe('move')
    })

    it('should create a keyboard command', () => {
      const cmd: KeyboardCommand = {
        target: 'keyboard',
        action: 'combo',
        keys: ['ctrl', 'shift', 't']
      }
      expect(cmd.keys).toEqual(['ctrl', 'shift', 't'])
    })
  })

  describe('GraphData', () => {
    it('should represent a graph with nodes and edges', () => {
      const graph: GraphData = {
        nodes: [
          { id: 'a', label: 'Node A', size: 2 },
          { id: 'b', label: 'Node B' }
        ],
        edges: [
          { source: 'a', target: 'b', weight: 0.8 }
        ]
      }
      expect(graph.nodes.length).toBe(2)
      expect(graph.edges[0].weight).toBe(0.8)
    })
  })

  describe('EmbeddingData', () => {
    it('should represent embedding points with clusters', () => {
      const data: EmbeddingData = {
        points: [
          { id: 'p1', position: { x: 1, y: 2, z: 3 }, clusterId: 0, label: 'Point 1' }
        ],
        clusters: [
          { id: 0, label: 'Cluster 0', color: '#ff0000' }
        ]
      }
      expect(data.points[0].clusterId).toBe(0)
      expect(data.clusters![0].color).toBe('#ff0000')
    })
  })

  describe('DEFAULT_CONFIG', () => {
    it('should have valid default values', () => {
      expect(DEFAULT_CONFIG.tracking.enabled).toBe(true)
      expect(DEFAULT_CONFIG.tracking.smoothingFactor).toBeGreaterThan(0)
      expect(DEFAULT_CONFIG.tracking.smoothingFactor).toBeLessThan(1)
      expect(DEFAULT_CONFIG.gestures.minHoldDuration).toBeGreaterThan(0)
      expect(DEFAULT_CONFIG.bus.port).toBe(9876)
      expect(DEFAULT_CONFIG.visualization.defaultView).toBe('graph')
    })

    it('should have all config sections', () => {
      expect(DEFAULT_CONFIG).toHaveProperty('tracking')
      expect(DEFAULT_CONFIG).toHaveProperty('gestures')
      expect(DEFAULT_CONFIG).toHaveProperty('input')
      expect(DEFAULT_CONFIG).toHaveProperty('bus')
      expect(DEFAULT_CONFIG).toHaveProperty('visualization')
    })
  })
})

describe('IPC Channels', () => {
  it('should have all channel constants defined', () => {
    expect(IPC.LANDMARK_FRAME).toBe('tracking:landmark-frame')
    expect(IPC.GESTURE_EVENT).toBe('gesture:event')
    expect(IPC.MOUSE_COMMAND).toBe('input:mouse')
    expect(IPC.KEYBOARD_COMMAND).toBe('input:keyboard')
    expect(IPC.BUS_STATUS).toBe('bus:status')
    expect(IPC.CONFIG_GET).toBe('config:get')
    expect(IPC.CONFIG_SET).toBe('config:set')
    expect(IPC.ECHO).toBe('dev:echo')
  })

  it('should have unique channel names', () => {
    const values = Object.values(IPC)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('Bus Protocol', () => {
  it('should create a register message', () => {
    const msg: BusRegisterMessage = {
      type: 'register',
      program: 'blender',
      capabilities: ['rotate', 'select']
    }
    expect(msg.type).toBe('register')
    expect(msg.capabilities).toContain('rotate')
  })

  it('should create a gesture message', () => {
    const msg: BusGestureMessage = {
      type: 'gesture',
      name: GestureType.Pinch,
      phase: GesturePhase.Onset,
      hand: 'right',
      position: [0.5, 0.3, 0.1],
      confidence: 0.95
    }
    expect(msg.position).toEqual([0.5, 0.3, 0.1])
  })

  it('should be assignable to BusMessage union', () => {
    const messages: BusMessage[] = [
      { type: 'register', program: 'test', capabilities: [] },
      { type: 'ping', timestamp: Date.now() },
      { type: 'pong', timestamp: Date.now() },
      { type: 'error', code: 'E001', message: 'test error' },
      { type: 'status', programs: [] }
    ]
    expect(messages.length).toBe(5)
  })
})
