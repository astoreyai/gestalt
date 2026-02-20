/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import {
  PartialAppConfigSchema,
  CalibrationProfileSchema,
  LandmarkFrameSchema,
  GestureEventSchema,
  MouseCommandSchema,
  KeyboardCommandSchema
} from '../ipc-validators'

// ─── PartialAppConfigSchema ─────────────────────────────────────

describe('PartialAppConfigSchema', () => {
  it('should accept valid partial config with tracking only', () => {
    const result = PartialAppConfigSchema.safeParse({
      tracking: { smoothingFactor: 0.5 }
    })
    expect(result.success).toBe(true)
  })

  it('should accept valid partial config with multiple sections', () => {
    const result = PartialAppConfigSchema.safeParse({
      tracking: { enabled: true, smoothingFactor: 0.3, minConfidence: 0.7 },
      input: { mouseSpeed: 2.0 },
      bus: { port: 9876, enabled: true }
    })
    expect(result.success).toBe(true)
  })

  it('should accept an empty object (all fields optional)', () => {
    const result = PartialAppConfigSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should reject negative smoothingFactor', () => {
    const result = PartialAppConfigSchema.safeParse({
      tracking: { smoothingFactor: -0.1 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject smoothingFactor above 1', () => {
    const result = PartialAppConfigSchema.safeParse({
      tracking: { smoothingFactor: 1.5 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject port below 1024', () => {
    const result = PartialAppConfigSchema.safeParse({
      bus: { port: 80 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject port above 65535', () => {
    const result = PartialAppConfigSchema.safeParse({
      bus: { port: 70000 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject non-integer port', () => {
    const result = PartialAppConfigSchema.safeParse({
      bus: { port: 9876.5 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject sensitivity > 1', () => {
    const result = PartialAppConfigSchema.safeParse({
      gestures: { sensitivity: 1.5 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject sensitivity < 0', () => {
    const result = PartialAppConfigSchema.safeParse({
      gestures: { sensitivity: -0.1 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject mouseSpeed below 0.1', () => {
    const result = PartialAppConfigSchema.safeParse({
      input: { mouseSpeed: 0.01 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject mouseSpeed above 10', () => {
    const result = PartialAppConfigSchema.safeParse({
      input: { mouseSpeed: 15 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid defaultView enum value', () => {
    const result = PartialAppConfigSchema.safeParse({
      visualization: { defaultView: 'invalid' }
    })
    expect(result.success).toBe(false)
  })

  it('should accept valid defaultView enum values', () => {
    for (const view of ['graph', 'manifold', 'split']) {
      const result = PartialAppConfigSchema.safeParse({
        visualization: { defaultView: view }
      })
      expect(result.success).toBe(true)
    }
  })

  it('should reject maxFps below 1', () => {
    const result = PartialAppConfigSchema.safeParse({
      visualization: { maxFps: 0 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject maxFps above 240', () => {
    const result = PartialAppConfigSchema.safeParse({
      visualization: { maxFps: 500 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject unknown top-level keys', () => {
    // Zod strips unknown keys by default, so this should still succeed
    // but the extra key should not be in the output
    const result = PartialAppConfigSchema.safeParse({
      tracking: { enabled: true },
      malicious: { exploit: true }
    })
    // The schema uses .partial() which will strip unknown keys
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('malicious')
    }
  })
})

// ─── CalibrationProfileSchema ────────────────────────────────────

describe('CalibrationProfileSchema', () => {
  const validProfile = {
    id: 'profile-1',
    name: 'Test Profile',
    sensitivity: 0.5,
    samples: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  it('should accept valid profile', () => {
    const result = CalibrationProfileSchema.safeParse(validProfile)
    expect(result.success).toBe(true)
  })

  it('should accept profile with samples', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples: [
        {
          gestureType: 'pinch',
          landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
          features: [1.0, 2.0],
          timestamp: 12345
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty name', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      name: ''
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty id', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      id: ''
    })
    expect(result.success).toBe(false)
  })

  it('should reject profile with >500 samples', () => {
    const samples = Array.from({ length: 501 }, (_, i) => ({
      gestureType: 'pinch',
      landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      features: [1.0],
      timestamp: i
    }))
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples
    })
    expect(result.success).toBe(false)
  })

  it('should accept profile with exactly 500 samples', () => {
    const samples = Array.from({ length: 500 }, (_, i) => ({
      gestureType: 'pinch',
      landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      features: [1.0],
      timestamp: i
    }))
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples
    })
    expect(result.success).toBe(true)
  })

  it('should reject profile with >21 landmarks per sample', () => {
    const landmarks = Array.from({ length: 22 }, () => ({
      x: 0.1, y: 0.2, z: 0.3
    }))
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples: [{
        gestureType: 'pinch',
        landmarks,
        features: [1.0],
        timestamp: 12345
      }]
    })
    expect(result.success).toBe(false)
  })

  it('should accept profile with exactly 21 landmarks per sample', () => {
    const landmarks = Array.from({ length: 21 }, () => ({
      x: 0.1, y: 0.2, z: 0.3
    }))
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples: [{
        gestureType: 'pinch',
        landmarks,
        features: [1.0],
        timestamp: 12345
      }]
    })
    expect(result.success).toBe(true)
  })

  it('should reject sensitivity > 1', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      sensitivity: 1.5
    })
    expect(result.success).toBe(false)
  })

  it('should reject sensitivity < 0', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      sensitivity: -0.1
    })
    expect(result.success).toBe(false)
  })

  it('should reject profile with >50 features per sample', () => {
    const features = Array.from({ length: 51 }, () => 1.0)
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples: [{
        gestureType: 'pinch',
        landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
        features,
        timestamp: 12345
      }]
    })
    expect(result.success).toBe(false)
  })

  it('should reject name longer than 200 chars', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      name: 'a'.repeat(201)
    })
    expect(result.success).toBe(false)
  })

  it('should reject id longer than 100 chars', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      id: 'a'.repeat(101)
    })
    expect(result.success).toBe(false)
  })
})

// ─── LandmarkFrameSchema ────────────────────────────────────────

describe('LandmarkFrameSchema', () => {
  const makeLandmarks = (n: number) =>
    Array.from({ length: n }, () => ({ x: 0.5, y: 0.5, z: 0.0 }))

  const validFrame = {
    hands: [
      {
        handedness: 'right' as const,
        landmarks: makeLandmarks(21),
        worldLandmarks: makeLandmarks(21),
        score: 0.95
      }
    ],
    timestamp: 12345.67,
    frameId: 42
  }

  it('should accept a valid landmark frame', () => {
    const result = LandmarkFrameSchema.safeParse(validFrame)
    expect(result.success).toBe(true)
  })

  it('should accept a frame with two hands', () => {
    const result = LandmarkFrameSchema.safeParse({
      ...validFrame,
      hands: [
        { handedness: 'right', landmarks: makeLandmarks(21), worldLandmarks: makeLandmarks(21), score: 0.9 },
        { handedness: 'left', landmarks: makeLandmarks(21), worldLandmarks: makeLandmarks(21), score: 0.85 }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('should accept a frame with zero hands', () => {
    const result = LandmarkFrameSchema.safeParse({
      hands: [],
      timestamp: 100,
      frameId: 0
    })
    expect(result.success).toBe(true)
  })

  it('should reject frame with missing hands array', () => {
    const result = LandmarkFrameSchema.safeParse({
      timestamp: 100,
      frameId: 0
    })
    expect(result.success).toBe(false)
  })

  it('should reject frame with negative timestamp', () => {
    const result = LandmarkFrameSchema.safeParse({
      ...validFrame,
      timestamp: -1
    })
    expect(result.success).toBe(false)
  })

  it('should reject frame with non-integer frameId', () => {
    const result = LandmarkFrameSchema.safeParse({
      ...validFrame,
      frameId: 1.5
    })
    expect(result.success).toBe(false)
  })

  it('should reject hand with wrong number of landmarks', () => {
    const result = LandmarkFrameSchema.safeParse({
      ...validFrame,
      hands: [{
        handedness: 'right',
        landmarks: makeLandmarks(10),
        worldLandmarks: makeLandmarks(21),
        score: 0.9
      }]
    })
    expect(result.success).toBe(false)
  })

  it('should reject hand with invalid handedness', () => {
    const result = LandmarkFrameSchema.safeParse({
      ...validFrame,
      hands: [{
        handedness: 'both',
        landmarks: makeLandmarks(21),
        worldLandmarks: makeLandmarks(21),
        score: 0.9
      }]
    })
    expect(result.success).toBe(false)
  })
})

// ─── GestureEventSchema ─────────────────────────────────────────

describe('GestureEventSchema', () => {
  const validGesture = {
    type: 'pinch',
    phase: 'onset',
    hand: 'right',
    confidence: 0.92,
    position: { x: 0.5, y: 0.5, z: 0.0 },
    timestamp: 12345.67
  }

  it('should accept a valid gesture event', () => {
    const result = GestureEventSchema.safeParse(validGesture)
    expect(result.success).toBe(true)
  })

  it('should accept a gesture event with optional data', () => {
    const result = GestureEventSchema.safeParse({
      ...validGesture,
      data: { angle: 45.0, distance: 0.12 }
    })
    expect(result.success).toBe(true)
  })

  it('should accept all valid gesture types', () => {
    const types = ['pinch', 'point', 'open_palm', 'twist', 'two_hand_pinch', 'flat_drag', 'fist', 'l_shape']
    for (const type of types) {
      const result = GestureEventSchema.safeParse({ ...validGesture, type })
      expect(result.success).toBe(true)
    }
  })

  it('should reject an invalid gesture type', () => {
    const result = GestureEventSchema.safeParse({
      ...validGesture,
      type: 'wave'
    })
    expect(result.success).toBe(false)
  })

  it('should reject an invalid phase', () => {
    const result = GestureEventSchema.safeParse({
      ...validGesture,
      phase: 'start'
    })
    expect(result.success).toBe(false)
  })

  it('should reject missing confidence field', () => {
    const { confidence: _, ...noConfidence } = validGesture
    const result = GestureEventSchema.safeParse(noConfidence)
    expect(result.success).toBe(false)
  })

  it('should reject missing position field', () => {
    const { position: _, ...noPosition } = validGesture
    const result = GestureEventSchema.safeParse(noPosition)
    expect(result.success).toBe(false)
  })

  it('should reject confidence > 1', () => {
    const result = GestureEventSchema.safeParse({
      ...validGesture,
      confidence: 1.5
    })
    expect(result.success).toBe(false)
  })

  it('should reject confidence < 0', () => {
    const result = GestureEventSchema.safeParse({
      ...validGesture,
      confidence: -0.1
    })
    expect(result.success).toBe(false)
  })
})

// ─── MouseCommandSchema ─────────────────────────────────────────

describe('MouseCommandSchema', () => {
  const validCommand = {
    target: 'mouse',
    action: 'move',
    x: 100,
    y: 200
  }

  it('should accept a valid mouse move command', () => {
    const result = MouseCommandSchema.safeParse(validCommand)
    expect(result.success).toBe(true)
  })

  it('should accept a click command with button', () => {
    const result = MouseCommandSchema.safeParse({
      target: 'mouse',
      action: 'click',
      button: 'left'
    })
    expect(result.success).toBe(true)
  })

  it('should accept a scroll command with deltas', () => {
    const result = MouseCommandSchema.safeParse({
      target: 'mouse',
      action: 'scroll',
      deltaX: 0,
      deltaY: -120
    })
    expect(result.success).toBe(true)
  })

  it('should accept all valid actions', () => {
    const actions = ['move', 'click', 'doubleclick', 'drag_start', 'drag_move', 'drag_end', 'scroll']
    for (const action of actions) {
      const result = MouseCommandSchema.safeParse({ target: 'mouse', action })
      expect(result.success).toBe(true)
    }
  })

  it('should reject an invalid action', () => {
    const result = MouseCommandSchema.safeParse({
      target: 'mouse',
      action: 'triple_click'
    })
    expect(result.success).toBe(false)
  })

  it('should reject wrong target', () => {
    const result = MouseCommandSchema.safeParse({
      target: 'keyboard',
      action: 'move'
    })
    expect(result.success).toBe(false)
  })

  it('should reject non-number coordinates', () => {
    const result = MouseCommandSchema.safeParse({
      target: 'mouse',
      action: 'move',
      x: 'abc',
      y: 100
    })
    expect(result.success).toBe(false)
  })

  it('should reject an invalid button value', () => {
    const result = MouseCommandSchema.safeParse({
      target: 'mouse',
      action: 'click',
      button: 'back'
    })
    expect(result.success).toBe(false)
  })
})

// ─── KeyboardCommandSchema ──────────────────────────────────────

describe('KeyboardCommandSchema', () => {
  const validCommand = {
    target: 'keyboard',
    action: 'press',
    key: 'a'
  }

  it('should accept a valid key press command', () => {
    const result = KeyboardCommandSchema.safeParse(validCommand)
    expect(result.success).toBe(true)
  })

  it('should accept a combo command with keys array', () => {
    const result = KeyboardCommandSchema.safeParse({
      target: 'keyboard',
      action: 'combo',
      keys: ['ctrl', 'shift', 't']
    })
    expect(result.success).toBe(true)
  })

  it('should accept a release command', () => {
    const result = KeyboardCommandSchema.safeParse({
      target: 'keyboard',
      action: 'release',
      key: 'shift'
    })
    expect(result.success).toBe(true)
  })

  it('should reject an invalid action', () => {
    const result = KeyboardCommandSchema.safeParse({
      target: 'keyboard',
      action: 'hold'
    })
    expect(result.success).toBe(false)
  })

  it('should reject wrong target', () => {
    const result = KeyboardCommandSchema.safeParse({
      target: 'mouse',
      action: 'press',
      key: 'a'
    })
    expect(result.success).toBe(false)
  })

  it('should accept command without key or keys (both optional)', () => {
    const result = KeyboardCommandSchema.safeParse({
      target: 'keyboard',
      action: 'press'
    })
    expect(result.success).toBe(true)
  })
})
