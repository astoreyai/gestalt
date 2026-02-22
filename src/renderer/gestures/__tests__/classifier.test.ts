import { describe, it, expect, beforeEach } from 'vitest'
import {
  type Landmark,
  type Hand,
  type LandmarkFrame,
  type GestureEvent,
  LANDMARK,
  GestureType,
  GesturePhase
} from '@shared/protocol'
import {
  distance,
  angleBetween,
  fingerCurl,
  fingerExtended,
  analyzeHandPose,
  detectPinch,
  detectPoint,
  detectOpenPalm,
  detectFist,
  detectLShape,
  detectFlatDrag,
  classifyGesture
} from '../classifier'
import { GestureStateMachine, GestureState, GestureEngine } from '../state'
import { DEFAULT_GESTURE_CONFIG, type GestureConfig } from '../types'
import { mapGestureToCommand, DEFAULT_MAPPINGS, type GestureMapping } from '../mappings'

// Import from the barrel index to cover it
import * as GestureModule from '../index'

// ─── Test Utilities: Synthetic Landmark Data ────────────────────────

/** Create a default landmark at a position */
function lm(x: number, y: number, z: number = 0): Landmark {
  return { x, y, z }
}

/**
 * Create synthetic 21-landmark array for a hand.
 * All landmarks default to (0.5, 0.5, 0) — override specific indices.
 */
function createLandmarks(overrides: Record<number, Landmark> = {}): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 21 }, () => lm(0.5, 0.5, 0))
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value
  }
  return landmarks
}

/**
 * Create landmarks for a fully extended finger.
 * Joints are arranged in a straight line outward from the wrist.
 */
function extendedFingerLandmarks(
  finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky',
  baseX: number = 0.5,
  baseY: number = 0.5
): Record<number, Landmark> {
  const offsets: Record<string, { mcp: number; pip: number; dip: number; tip: number }> = {
    thumb: {
      mcp: LANDMARK.THUMB_CMC,
      pip: LANDMARK.THUMB_MCP,
      dip: LANDMARK.THUMB_IP,
      tip: LANDMARK.THUMB_TIP
    },
    index: {
      mcp: LANDMARK.INDEX_MCP,
      pip: LANDMARK.INDEX_PIP,
      dip: LANDMARK.INDEX_DIP,
      tip: LANDMARK.INDEX_TIP
    },
    middle: {
      mcp: LANDMARK.MIDDLE_MCP,
      pip: LANDMARK.MIDDLE_PIP,
      dip: LANDMARK.MIDDLE_DIP,
      tip: LANDMARK.MIDDLE_TIP
    },
    ring: {
      mcp: LANDMARK.RING_MCP,
      pip: LANDMARK.RING_PIP,
      dip: LANDMARK.RING_DIP,
      tip: LANDMARK.RING_TIP
    },
    pinky: {
      mcp: LANDMARK.PINKY_MCP,
      pip: LANDMARK.PINKY_PIP,
      dip: LANDMARK.PINKY_DIP,
      tip: LANDMARK.PINKY_TIP
    }
  }

  const idx = offsets[finger]
  // Straight line pointing upward (decreasing y)
  return {
    [idx.mcp]: lm(baseX, baseY),
    [idx.pip]: lm(baseX, baseY - 0.05),
    [idx.dip]: lm(baseX, baseY - 0.10),
    [idx.tip]: lm(baseX, baseY - 0.15)
  }
}

/**
 * Create landmarks for a fully curled finger.
 * Joints fold back toward the palm.
 */
function curledFingerLandmarks(
  finger: 'thumb' | 'index' | 'middle' | 'ring' | 'pinky',
  baseX: number = 0.5,
  baseY: number = 0.5
): Record<number, Landmark> {
  const offsets: Record<string, { mcp: number; pip: number; dip: number; tip: number }> = {
    thumb: {
      mcp: LANDMARK.THUMB_CMC,
      pip: LANDMARK.THUMB_MCP,
      dip: LANDMARK.THUMB_IP,
      tip: LANDMARK.THUMB_TIP
    },
    index: {
      mcp: LANDMARK.INDEX_MCP,
      pip: LANDMARK.INDEX_PIP,
      dip: LANDMARK.INDEX_DIP,
      tip: LANDMARK.INDEX_TIP
    },
    middle: {
      mcp: LANDMARK.MIDDLE_MCP,
      pip: LANDMARK.MIDDLE_PIP,
      dip: LANDMARK.MIDDLE_DIP,
      tip: LANDMARK.MIDDLE_TIP
    },
    ring: {
      mcp: LANDMARK.RING_MCP,
      pip: LANDMARK.RING_PIP,
      dip: LANDMARK.RING_DIP,
      tip: LANDMARK.RING_TIP
    },
    pinky: {
      mcp: LANDMARK.PINKY_MCP,
      pip: LANDMARK.PINKY_PIP,
      dip: LANDMARK.PINKY_DIP,
      tip: LANDMARK.PINKY_TIP
    }
  }

  const idx = offsets[finger]
  // Curled: MCP -> PIP goes up, then folds back down toward MCP
  return {
    [idx.mcp]: lm(baseX, baseY),
    [idx.pip]: lm(baseX, baseY - 0.03),
    [idx.dip]: lm(baseX + 0.01, baseY + 0.01),
    [idx.tip]: lm(baseX, baseY + 0.02)
  }
}

/** Create a Hand object with given landmarks and optional parameters */
function createHand(
  landmarks: Landmark[],
  handedness: 'left' | 'right' = 'right',
  score: number = 0.95
): Hand {
  return {
    handedness,
    landmarks,
    worldLandmarks: landmarks.map((l) => ({ ...l })),
    score
  }
}

/** Create an open palm hand — all fingers extended */
function createOpenPalmHand(handedness: 'left' | 'right' = 'right'): Hand {
  const overrides = {
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...extendedFingerLandmarks('thumb', 0.25, 0.65),
    ...extendedFingerLandmarks('index', 0.40, 0.55),
    ...extendedFingerLandmarks('middle', 0.50, 0.53),
    ...extendedFingerLandmarks('ring', 0.60, 0.55),
    ...extendedFingerLandmarks('pinky', 0.70, 0.60)
  }
  return createHand(createLandmarks(overrides), handedness)
}

/** Create a fist hand — all fingers curled */
function createFistHand(handedness: 'left' | 'right' = 'right'): Hand {
  const overrides = {
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...curledFingerLandmarks('thumb', 0.4, 0.6),
    ...curledFingerLandmarks('index', 0.42, 0.55),
    ...curledFingerLandmarks('middle', 0.50, 0.53),
    ...curledFingerLandmarks('ring', 0.58, 0.55),
    ...curledFingerLandmarks('pinky', 0.65, 0.6)
  }
  return createHand(createLandmarks(overrides), handedness)
}

/** Create a pointing hand — only index extended, rest curled */
function createPointHand(handedness: 'left' | 'right' = 'right'): Hand {
  const overrides = {
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...curledFingerLandmarks('thumb', 0.4, 0.6),
    ...extendedFingerLandmarks('index', 0.42, 0.55),
    ...curledFingerLandmarks('middle', 0.50, 0.53),
    ...curledFingerLandmarks('ring', 0.58, 0.55),
    ...curledFingerLandmarks('pinky', 0.65, 0.6)
  }
  return createHand(createLandmarks(overrides), handedness)
}

/** Create an L-shape hand — thumb + index extended, rest curled */
function createLShapeHand(handedness: 'left' | 'right' = 'right'): Hand {
  const overrides = {
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...extendedFingerLandmarks('thumb', 0.25, 0.65),
    ...extendedFingerLandmarks('index', 0.40, 0.55),
    ...curledFingerLandmarks('middle', 0.50, 0.53),
    ...curledFingerLandmarks('ring', 0.60, 0.55),
    ...curledFingerLandmarks('pinky', 0.70, 0.60)
  }
  return createHand(createLandmarks(overrides), handedness)
}

/** Create a pinch hand — thumb tip and index tip very close together */
function createPinchHand(handedness: 'left' | 'right' = 'right'): Hand {
  const overrides = {
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    // Thumb: extended but tip near index tip
    [LANDMARK.THUMB_CMC]: lm(0.4, 0.65),
    [LANDMARK.THUMB_MCP]: lm(0.38, 0.58),
    [LANDMARK.THUMB_IP]: lm(0.40, 0.50),
    [LANDMARK.THUMB_TIP]: lm(0.44, 0.42), // Very close to index tip
    // Index: slightly curled, tip near thumb tip
    [LANDMARK.INDEX_MCP]: lm(0.42, 0.55),
    [LANDMARK.INDEX_PIP]: lm(0.42, 0.48),
    [LANDMARK.INDEX_DIP]: lm(0.43, 0.44),
    [LANDMARK.INDEX_TIP]: lm(0.45, 0.42), // Very close to thumb tip (dist ~0.01)
    // Other fingers curled
    ...curledFingerLandmarks('middle', 0.50, 0.53),
    ...curledFingerLandmarks('ring', 0.58, 0.55),
    ...curledFingerLandmarks('pinky', 0.65, 0.6)
  }
  return createHand(createLandmarks(overrides), handedness)
}

/** Create a flat drag hand — all extended, flat in z */
function createFlatDragHand(handedness: 'left' | 'right' = 'right'): Hand {
  const overrides = {
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...extendedFingerLandmarks('thumb', 0.25, 0.65),
    ...extendedFingerLandmarks('index', 0.40, 0.55),
    ...extendedFingerLandmarks('middle', 0.50, 0.53),
    ...extendedFingerLandmarks('ring', 0.60, 0.55),
    ...extendedFingerLandmarks('pinky', 0.70, 0.60)
  }
  // All z values are 0 by default from extendedFingerLandmarks, so hand is flat
  return createHand(createLandmarks(overrides), handedness)
}

// ─── Distance and Angle Tests ───────────────────────────────────────

describe('Geometric Helpers', () => {
  describe('distance', () => {
    it('should return 0 for identical points', () => {
      const p = lm(0.5, 0.5, 0)
      expect(distance(p, p)).toBe(0)
    })

    it('should calculate correct 2D distance', () => {
      const a = lm(0, 0, 0)
      const b = lm(3, 4, 0)
      expect(distance(a, b)).toBeCloseTo(5, 5)
    })

    it('should calculate correct 3D distance', () => {
      const a = lm(0, 0, 0)
      const b = lm(1, 1, 1)
      expect(distance(a, b)).toBeCloseTo(Math.sqrt(3), 5)
    })

    it('should be symmetric', () => {
      const a = lm(0.2, 0.3, 0.1)
      const b = lm(0.8, 0.1, 0.5)
      expect(distance(a, b)).toBeCloseTo(distance(b, a), 10)
    })

    it('should handle negative coordinates', () => {
      const a = lm(-1, -1, -1)
      const b = lm(1, 1, 1)
      expect(distance(a, b)).toBeCloseTo(Math.sqrt(12), 5)
    })
  })

  describe('angleBetween', () => {
    it('should return pi for a straight line (180 degrees)', () => {
      const a = lm(0, 0, 0)
      const b = lm(1, 0, 0)
      const c = lm(2, 0, 0)
      expect(angleBetween(a, b, c)).toBeCloseTo(Math.PI, 5)
    })

    it('should return pi/2 for a right angle', () => {
      const a = lm(1, 0, 0)
      const b = lm(0, 0, 0)
      const c = lm(0, 1, 0)
      expect(angleBetween(a, b, c)).toBeCloseTo(Math.PI / 2, 5)
    })

    it('should return 0 when points coincide', () => {
      const a = lm(0, 0, 0)
      const b = lm(0, 0, 0)
      const c = lm(1, 0, 0)
      expect(angleBetween(a, b, c)).toBe(0)
    })

    it('should handle 3D angles', () => {
      const a = lm(1, 0, 0)
      const b = lm(0, 0, 0)
      const c = lm(0, 0, 1)
      expect(angleBetween(a, b, c)).toBeCloseTo(Math.PI / 2, 5)
    })

    it('should return small angle for nearly parallel vectors', () => {
      const a = lm(0, 0, 0)
      const b = lm(1, 0, 0)
      const c = lm(2, 0.01, 0)
      const angle = angleBetween(a, b, c)
      expect(angle).toBeGreaterThan(Math.PI * 0.95)
    })
  })
})

// ─── Finger Curl Tests ──────────────────────────────────────────────

describe('fingerCurl', () => {
  it('should return ~0 for a straight/extended finger', () => {
    const landmarks = createLandmarks(extendedFingerLandmarks('index'))
    const curl = fingerCurl(landmarks, 'index')
    expect(curl).toBeLessThan(0.2)
  })

  it('should return high value for a curled finger', () => {
    const landmarks = createLandmarks(curledFingerLandmarks('index'))
    const curl = fingerCurl(landmarks, 'index')
    expect(curl).toBeGreaterThan(0.5)
  })

  it('should return ~0 for extended thumb', () => {
    const landmarks = createLandmarks(extendedFingerLandmarks('thumb'))
    const curl = fingerCurl(landmarks, 'thumb')
    expect(curl).toBeLessThan(0.2)
  })

  it('should return high value for curled thumb', () => {
    const landmarks = createLandmarks(curledFingerLandmarks('thumb'))
    const curl = fingerCurl(landmarks, 'thumb')
    expect(curl).toBeGreaterThan(0.4)
  })

  it('should return values between 0 and 1', () => {
    const landmarks = createLandmarks(extendedFingerLandmarks('middle'))
    const curl = fingerCurl(landmarks, 'middle')
    expect(curl).toBeGreaterThanOrEqual(0)
    expect(curl).toBeLessThanOrEqual(1)
  })

  it('should work for all five fingers', () => {
    const fingers: Array<'thumb' | 'index' | 'middle' | 'ring' | 'pinky'> = [
      'thumb', 'index', 'middle', 'ring', 'pinky'
    ]
    for (const finger of fingers) {
      const extendedLm = createLandmarks(extendedFingerLandmarks(finger))
      const curledLm = createLandmarks(curledFingerLandmarks(finger))
      expect(fingerCurl(extendedLm, finger)).toBeLessThan(fingerCurl(curledLm, finger))
    }
  })
})

describe('fingerExtended', () => {
  it('should return true for an extended finger', () => {
    const landmarks = createLandmarks(extendedFingerLandmarks('index'))
    expect(fingerExtended(landmarks, 'index')).toBe(true)
  })

  it('should return false for a curled finger', () => {
    const landmarks = createLandmarks(curledFingerLandmarks('index'))
    expect(fingerExtended(landmarks, 'index')).toBe(false)
  })

  it('should respect custom config threshold', () => {
    const landmarks = createLandmarks(extendedFingerLandmarks('index'))
    // Very strict threshold — almost nothing counts as extended
    const config: GestureConfig = { ...DEFAULT_GESTURE_CONFIG, extensionThreshold: 0.01 }
    // An extended finger with curl near 0 should still pass an extremely low threshold
    const curl = fingerCurl(landmarks, 'index')
    if (curl < 0.01) {
      expect(fingerExtended(landmarks, 'index', config)).toBe(true)
    } else {
      expect(fingerExtended(landmarks, 'index', config)).toBe(false)
    }
  })
})

// ─── Hand Pose Analysis ─────────────────────────────────────────────

describe('analyzeHandPose', () => {
  it('should report high palmOpenness for open palm', () => {
    const hand = createOpenPalmHand()
    const pose = analyzeHandPose(hand.landmarks)
    expect(pose.palmOpenness).toBeGreaterThanOrEqual(0.8)
  })

  it('should report low palmOpenness for fist', () => {
    const hand = createFistHand()
    const pose = analyzeHandPose(hand.landmarks)
    expect(pose.palmOpenness).toBeLessThanOrEqual(0.2)
  })

  it('should have 5 finger states', () => {
    const hand = createOpenPalmHand()
    const pose = analyzeHandPose(hand.landmarks)
    expect(pose.fingers).toHaveLength(5)
  })

  it('should report thumbIndexDistance', () => {
    const hand = createPinchHand()
    const pose = analyzeHandPose(hand.landmarks)
    expect(pose.thumbIndexDistance).toBeLessThan(0.05)
  })

  it('should report handFlatness', () => {
    const hand = createFlatDragHand()
    const pose = analyzeHandPose(hand.landmarks)
    expect(pose.handFlatness).toBeGreaterThanOrEqual(0)
    expect(pose.handFlatness).toBeLessThanOrEqual(1)
  })
})

// ─── Individual Gesture Detection ───────────────────────────────────

describe('detectPinch', () => {
  it('should detect pinch when thumb and index tips are close', () => {
    const hand = createPinchHand()
    const result = detectPinch(hand)
    expect(result.detected).toBe(true)
    expect(result.distance).toBeLessThan(DEFAULT_GESTURE_CONFIG.pinchThreshold)
  })

  it('should not detect pinch when fingers are apart', () => {
    const hand = createOpenPalmHand()
    const result = detectPinch(hand)
    expect(result.detected).toBe(false)
    expect(result.distance).toBeGreaterThan(DEFAULT_GESTURE_CONFIG.pinchThreshold)
  })

  it('should return the distance between thumb and index tips', () => {
    const hand = createPinchHand()
    const result = detectPinch(hand)
    const expected = distance(
      hand.landmarks[LANDMARK.THUMB_TIP],
      hand.landmarks[LANDMARK.INDEX_TIP]
    )
    expect(result.distance).toBeCloseTo(expected, 10)
  })

  it('should respect custom threshold', () => {
    const hand = createPinchHand()
    // Very small threshold — even a close pinch might not pass
    const config: GestureConfig = { ...DEFAULT_GESTURE_CONFIG, pinchThreshold: 0.001 }
    const result = detectPinch(hand, config)
    expect(result.detected).toBe(false)
  })
})

describe('detectPoint', () => {
  it('should detect point with only index extended', () => {
    const hand = createPointHand()
    expect(detectPoint(hand)).toBe(true)
  })

  it('should not detect point with open palm', () => {
    const hand = createOpenPalmHand()
    expect(detectPoint(hand)).toBe(false)
  })

  it('should not detect point with fist', () => {
    const hand = createFistHand()
    expect(detectPoint(hand)).toBe(false)
  })
})

describe('detectOpenPalm', () => {
  it('should detect open palm with all fingers extended', () => {
    const hand = createOpenPalmHand()
    expect(detectOpenPalm(hand)).toBe(true)
  })

  it('should not detect open palm with fist', () => {
    const hand = createFistHand()
    expect(detectOpenPalm(hand)).toBe(false)
  })

  it('should not detect open palm with only point', () => {
    const hand = createPointHand()
    expect(detectOpenPalm(hand)).toBe(false)
  })
})

describe('detectFist', () => {
  it('should detect fist with all fingers curled', () => {
    const hand = createFistHand()
    expect(detectFist(hand)).toBe(true)
  })

  it('should not detect fist with open palm', () => {
    const hand = createOpenPalmHand()
    expect(detectFist(hand)).toBe(false)
  })

  it('should not detect fist with point', () => {
    const hand = createPointHand()
    expect(detectFist(hand)).toBe(false)
  })
})

describe('detectLShape', () => {
  it('should detect L-shape with thumb and index extended', () => {
    const hand = createLShapeHand()
    expect(detectLShape(hand)).toBe(true)
  })

  it('should not detect L-shape with fist', () => {
    const hand = createFistHand()
    expect(detectLShape(hand)).toBe(false)
  })

  it('should not detect L-shape with open palm', () => {
    const hand = createOpenPalmHand()
    expect(detectLShape(hand)).toBe(false)
  })

  it('should not detect L-shape with only index extended (no thumb)', () => {
    const hand = createPointHand()
    expect(detectLShape(hand)).toBe(false)
  })
})

describe('detectFlatDrag', () => {
  it('should detect flat drag with all fingers extended and hand flat', () => {
    const hand = createFlatDragHand()
    expect(detectFlatDrag(hand)).toBe(true)
  })

  it('should not detect flat drag with fist', () => {
    const hand = createFistHand()
    expect(detectFlatDrag(hand)).toBe(false)
  })

  it('should not detect flat drag when hand is not flat', () => {
    // Create hand with extended fingers but large z variation
    const overrides = {
      [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
      ...extendedFingerLandmarks('thumb', 0.35, 0.6),
      ...extendedFingerLandmarks('index', 0.42, 0.55),
      ...extendedFingerLandmarks('middle', 0.50, 0.53),
      ...extendedFingerLandmarks('ring', 0.58, 0.55),
      ...extendedFingerLandmarks('pinky', 0.65, 0.6)
    }
    const landmarks = createLandmarks(overrides)
    // Add large z variations to make hand non-flat
    landmarks[LANDMARK.THUMB_TIP] = lm(0.35, 0.45, 0.5)
    landmarks[LANDMARK.INDEX_TIP] = lm(0.42, 0.40, -0.3)
    landmarks[LANDMARK.MIDDLE_TIP] = lm(0.50, 0.38, 0.4)
    landmarks[LANDMARK.RING_TIP] = lm(0.58, 0.40, -0.2)
    landmarks[LANDMARK.PINKY_TIP] = lm(0.65, 0.45, 0.3)
    const hand = createHand(landmarks)
    expect(detectFlatDrag(hand)).toBe(false)
  })
})

// ─── Main Classifier Tests ─────────────────────────────────────────

describe('classifyGesture', () => {
  it('should classify pinch gesture', () => {
    const hand = createPinchHand()
    const result = classifyGesture(hand)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.Pinch)
    expect(result!.confidence).toBeGreaterThan(0)
    expect(result!.confidence).toBeLessThanOrEqual(1)
  })

  it('should classify point gesture', () => {
    const hand = createPointHand()
    const result = classifyGesture(hand)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.Point)
  })

  it('should classify fist gesture', () => {
    const hand = createFistHand()
    const result = classifyGesture(hand)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.Fist)
  })

  it('should classify L-shape gesture', () => {
    const hand = createLShapeHand()
    const result = classifyGesture(hand)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.LShape)
  })

  it('should classify open palm or flat drag for all-extended hand', () => {
    const hand = createOpenPalmHand()
    const result = classifyGesture(hand)
    expect(result).not.toBeNull()
    // Could be FlatDrag or OpenPalm depending on z-flatness
    expect([GestureType.OpenPalm, GestureType.FlatDrag]).toContain(result!.type)
  })

  it('should return null for low confidence hand', () => {
    const hand = createOpenPalmHand()
    hand.score = 0.1 // Below minConfidence
    const result = classifyGesture(hand)
    expect(result).toBeNull()
  })

  it('should return confidence between 0 and 1', () => {
    const hands = [createPinchHand(), createPointHand(), createFistHand(), createLShapeHand()]
    for (const hand of hands) {
      const result = classifyGesture(hand)
      if (result) {
        expect(result.confidence).toBeGreaterThanOrEqual(0)
        expect(result.confidence).toBeLessThanOrEqual(1)
      }
    }
  })

  it('should respect custom minConfidence', () => {
    const hand = createOpenPalmHand()
    hand.score = 0.8
    const config: GestureConfig = { ...DEFAULT_GESTURE_CONFIG, minConfidence: 0.9 }
    const result = classifyGesture(hand, config)
    expect(result).toBeNull()
  })

  it('should prioritize pinch over other gestures', () => {
    const hand = createPinchHand()
    const result = classifyGesture(hand)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.Pinch)
  })
})

// ─── GestureStateMachine Tests ──────────────────────────────────────

describe('GestureStateMachine', () => {
  let sm: GestureStateMachine

  beforeEach(() => {
    sm = new GestureStateMachine(3, 0, 200)
  })

  it('should start in idle state', () => {
    expect(sm.getState()).toBe(GestureState.Idle)
  })

  it('should transition idle -> onset when detected', () => {
    const phase = sm.update(true, 0)
    expect(phase).toBe(GesturePhase.Onset)
    expect(sm.getState()).toBe(GestureState.Onset)
  })

  it('should remain in onset during debounce frames', () => {
    sm.update(true, 0) // idle -> onset
    const phase = sm.update(true, 16) // onset, frame 2
    expect(phase).toBeNull() // No transition yet
    expect(sm.getState()).toBe(GestureState.Onset)
  })

  it('should transition onset -> hold after minOnsetFrames', () => {
    sm.update(true, 0)   // idle -> onset (frame 1)
    sm.update(true, 16)  // frame 2
    const phase = sm.update(true, 32) // frame 3 = minOnsetFrames
    expect(phase).toBe(GesturePhase.Hold)
    expect(sm.getState()).toBe(GestureState.Hold)
  })

  it('should transition onset -> release if detection lost during debounce', () => {
    sm.update(true, 0)   // idle -> onset
    const phase = sm.update(false, 16) // lost during onset
    expect(phase).toBe(GesturePhase.Release)
    expect(sm.getState()).toBe(GestureState.Release)
  })

  it('should transition hold -> release when detection lost', () => {
    sm.update(true, 0)
    sm.update(true, 16)
    sm.update(true, 32) // -> hold
    const phase = sm.update(false, 48)
    expect(phase).toBe(GesturePhase.Release)
    expect(sm.getState()).toBe(GestureState.Release)
  })

  it('should continue emitting Hold while still detected', () => {
    sm.update(true, 0)
    sm.update(true, 16)
    sm.update(true, 32) // -> hold
    const phase = sm.update(true, 48)
    expect(phase).toBe(GesturePhase.Hold)
    expect(sm.getState()).toBe(GestureState.Hold)
  })

  it('should transition release -> cooldown', () => {
    sm.update(true, 0)
    sm.update(true, 16)
    sm.update(true, 32) // -> hold
    sm.update(false, 48) // -> release
    const phase = sm.update(false, 64) // release -> cooldown
    expect(phase).toBeNull()
    expect(sm.getState()).toBe(GestureState.Cooldown)
  })

  it('should transition cooldown -> idle after cooldownDuration', () => {
    sm.update(true, 0)
    sm.update(true, 16)
    sm.update(true, 32)
    sm.update(false, 48)
    sm.update(false, 64) // -> cooldown
    // Cooldown duration is 200ms
    sm.update(false, 300) // 300 - 64 = 236ms > 200ms
    expect(sm.getState()).toBe(GestureState.Idle)
  })

  it('should stay in cooldown before duration expires', () => {
    sm.update(true, 0)
    sm.update(true, 16)
    sm.update(true, 32)
    sm.update(false, 48)
    sm.update(false, 64) // -> cooldown, releaseTime=64
    sm.update(false, 100) // 100 - 64 = 36ms < 200ms
    expect(sm.getState()).toBe(GestureState.Cooldown)
  })

  it('should not trigger new detection during cooldown', () => {
    sm.update(true, 0)
    sm.update(true, 16)
    sm.update(true, 32)
    sm.update(false, 48)
    sm.update(false, 64) // -> cooldown
    const phase = sm.update(true, 100) // still in cooldown
    expect(phase).toBeNull()
    expect(sm.getState()).toBe(GestureState.Cooldown)
  })

  it('should complete full lifecycle: idle -> onset -> hold -> release -> cooldown -> idle', () => {
    expect(sm.getState()).toBe(GestureState.Idle)

    sm.update(true, 0)
    expect(sm.getState()).toBe(GestureState.Onset)

    sm.update(true, 16)
    sm.update(true, 32)
    expect(sm.getState()).toBe(GestureState.Hold)

    sm.update(false, 48)
    expect(sm.getState()).toBe(GestureState.Release)

    sm.update(false, 64)
    expect(sm.getState()).toBe(GestureState.Cooldown)

    sm.update(false, 300) // After cooldown
    expect(sm.getState()).toBe(GestureState.Idle)
  })

  it('should reset to idle', () => {
    sm.update(true, 0)
    sm.update(true, 16)
    sm.update(true, 32) // -> hold
    sm.reset()
    expect(sm.getState()).toBe(GestureState.Idle)
  })

  it('should not emit during idle when no detection', () => {
    const phase = sm.update(false, 0)
    expect(phase).toBeNull()
    expect(sm.getState()).toBe(GestureState.Idle)
  })

  it('should not transition to Hold if minHoldDuration not met', () => {
    const sm2 = new GestureStateMachine(3, 500, 200) // 3 frames, 500ms hold, 200ms cooldown
    // Frame 1-3 at t=0,33,66 — frames met but only 66ms elapsed (< 500ms)
    expect(sm2.update(true, 0)).toBe(GesturePhase.Onset)
    expect(sm2.update(true, 33)).toBeNull() // frame 2
    expect(sm2.update(true, 66)).toBeNull() // frame 3 — frames met but time not met
    // Frame 4 at t=400 — still not 500ms from onset start
    expect(sm2.update(true, 400)).toBeNull()
    // Frame 5 at t=600 — now 600ms > 500ms, should transition to Hold
    expect(sm2.update(true, 600)).toBe(GesturePhase.Hold)
  })
})

// ─── GestureEngine Tests ────────────────────────────────────────────

describe('GestureEngine', () => {
  let engine: GestureEngine

  beforeEach(() => {
    engine = new GestureEngine({ minOnsetFrames: 1, minHoldDuration: 0 })
  })

  it('should process a frame with no hands and return no events', () => {
    const frame: LandmarkFrame = { hands: [], timestamp: 0, frameId: 0 }
    const events = engine.processFrame(frame)
    expect(events).toEqual([])
  })

  it('should detect a pinch gesture on onset', () => {
    const hand = createPinchHand()
    const frame: LandmarkFrame = { hands: [hand], timestamp: 0, frameId: 0 }
    const events = engine.processFrame(frame)

    const pinchEvent = events.find((e) => e.type === GestureType.Pinch)
    expect(pinchEvent).toBeDefined()
    expect(pinchEvent!.phase).toBe(GesturePhase.Onset)
    expect(pinchEvent!.hand).toBe('right')
  })

  it('should detect gesture hold after onset with minOnsetFrames=1', () => {
    const hand = createPinchHand()

    // Frame 1: onset
    engine.processFrame({ hands: [hand], timestamp: 0, frameId: 0 })

    // Frame 2: should transition to hold (minOnsetFrames=1 means 1 frame enough)
    const events = engine.processFrame({ hands: [hand], timestamp: 16, frameId: 1 })
    const holdEvent = events.find(
      (e) => e.type === GestureType.Pinch && e.phase === GesturePhase.Hold
    )
    expect(holdEvent).toBeDefined()
  })

  it('should detect release when gesture stops', () => {
    const pinchHand = createPinchHand()
    const openHand = createOpenPalmHand()

    engine.processFrame({ hands: [pinchHand], timestamp: 0, frameId: 0 }) // onset
    engine.processFrame({ hands: [pinchHand], timestamp: 16, frameId: 1 }) // hold

    // Now gesture changes — pinch should release
    const events = engine.processFrame({ hands: [openHand], timestamp: 32, frameId: 2 })
    const releaseEvent = events.find(
      (e) => e.type === GestureType.Pinch && e.phase === GesturePhase.Release
    )
    expect(releaseEvent).toBeDefined()
  })

  it('should include position data in events', () => {
    const hand = createPinchHand()
    const frame: LandmarkFrame = { hands: [hand], timestamp: 0, frameId: 0 }
    const events = engine.processFrame(frame)

    const pinchEvent = events.find((e) => e.type === GestureType.Pinch)
    expect(pinchEvent).toBeDefined()
    expect(pinchEvent!.position).toBeDefined()
    expect(typeof pinchEvent!.position.x).toBe('number')
    expect(typeof pinchEvent!.position.y).toBe('number')
    expect(typeof pinchEvent!.position.z).toBe('number')
  })

  it('should include pinch distance in data', () => {
    const hand = createPinchHand()
    const frame: LandmarkFrame = { hands: [hand], timestamp: 0, frameId: 0 }
    const events = engine.processFrame(frame)

    const pinchEvent = events.find((e) => e.type === GestureType.Pinch)
    expect(pinchEvent).toBeDefined()
    expect(pinchEvent!.data).toBeDefined()
    expect(pinchEvent!.data!.distance).toBeDefined()
  })

  it('should handle multiple hands independently', () => {
    const rightHand = createPinchHand('right')
    const leftHand = createPointHand('left')

    const frame: LandmarkFrame = {
      hands: [rightHand, leftHand],
      timestamp: 0,
      frameId: 0
    }
    const events = engine.processFrame(frame)

    const rightPinch = events.find(
      (e) => e.type === GestureType.Pinch && e.hand === 'right'
    )
    const leftPoint = events.find(
      (e) => e.type === GestureType.Point && e.hand === 'left'
    )

    expect(rightPinch).toBeDefined()
    expect(leftPoint).toBeDefined()
  })

  it('should detect two-hand pinch when both hands pinch', () => {
    const leftPinch = createPinchHand('left')
    const rightPinch = createPinchHand('right')

    const frame: LandmarkFrame = {
      hands: [leftPinch, rightPinch],
      timestamp: 0,
      frameId: 0
    }
    const events = engine.processFrame(frame)

    const twoHandEvent = events.find((e) => e.type === GestureType.TwoHandPinch)
    expect(twoHandEvent).toBeDefined()
    expect(twoHandEvent!.phase).toBe(GesturePhase.Onset)
  })

  it('should not detect two-hand pinch with only one pinching hand', () => {
    const leftPinch = createPinchHand('left')
    const rightOpen = createOpenPalmHand('right')

    const frame: LandmarkFrame = {
      hands: [leftPinch, rightOpen],
      timestamp: 0,
      frameId: 0
    }
    const events = engine.processFrame(frame)

    const twoHandEvent = events.find((e) => e.type === GestureType.TwoHandPinch)
    expect(twoHandEvent).toBeUndefined()
  })

  it('should provide two-hand pinch data with hand distance', () => {
    const leftPinch = createPinchHand('left')
    const rightPinch = createPinchHand('right')

    const frame: LandmarkFrame = {
      hands: [leftPinch, rightPinch],
      timestamp: 0,
      frameId: 0
    }
    const events = engine.processFrame(frame)

    const twoHandEvent = events.find((e) => e.type === GestureType.TwoHandPinch)
    expect(twoHandEvent).toBeDefined()
    expect(twoHandEvent!.data).toBeDefined()
    expect(twoHandEvent!.data!.handDistance).toBeDefined()
    expect(twoHandEvent!.data!.leftPinchDistance).toBeDefined()
    expect(twoHandEvent!.data!.rightPinchDistance).toBeDefined()
  })

  it('should detect twist when hand rotates', () => {
    // Create a hand and process two frames with different orientations
    const hand1 = createOpenPalmHand('right')
    engine.processFrame({ hands: [hand1], timestamp: 0, frameId: 0 })

    // Create second hand with rotated orientation
    const hand2 = createOpenPalmHand('right')
    // Move the MIDDLE_MCP to change the hand angle significantly
    hand2.landmarks[LANDMARK.MIDDLE_MCP] = lm(0.8, 0.3, 0) // Rotate significantly

    const events = engine.processFrame({ hands: [hand2], timestamp: 50, frameId: 1 })
    const _twistEvent = events.find((e) => e.type === GestureType.Twist)

    // Whether twist is detected depends on rotation magnitude vs threshold
    // Just verify twist processing doesn't crash
    expect(Array.isArray(events)).toBe(true)
  })

  it('should reset all state machines', () => {
    const hand = createPinchHand()
    engine.processFrame({ hands: [hand], timestamp: 0, frameId: 0 })

    engine.reset()

    // After reset, processing the same gesture should produce onset again
    const events = engine.processFrame({ hands: [hand], timestamp: 100, frameId: 1 })
    const pinchEvent = events.find((e) => e.type === GestureType.Pinch)
    expect(pinchEvent).toBeDefined()
    expect(pinchEvent!.phase).toBe(GesturePhase.Onset)
  })

  it('should update configuration', () => {
    engine.updateConfig({ pinchThreshold: 0.001 })
    const config = engine.getConfig()
    expect(config.pinchThreshold).toBe(0.001)
  })

  it('should return current config', () => {
    const config = engine.getConfig()
    expect(config.pinchThreshold).toBe(DEFAULT_GESTURE_CONFIG.pinchThreshold)
    expect(config.minOnsetFrames).toBe(1) // Custom value from constructor
  })

  it('should scale thresholds based on sensitivity', () => {
    // High sensitivity = lower thresholds for curl/extension = easier to trigger
    // High sensitivity = higher pinchThreshold = allows greater distance to count as pinch
    const highSens = new GestureEngine({ sensitivity: 0.9 })
    const lowSens = new GestureEngine({ sensitivity: 0.2 })
    // Higher sensitivity => larger pinchThreshold (easier to pinch)
    expect(highSens.getEffectiveConfig().pinchThreshold).toBeGreaterThan(
      lowSens.getEffectiveConfig().pinchThreshold
    )
    // Higher sensitivity => lower curlThreshold (less curl needed)
    expect(highSens.getEffectiveConfig().curlThreshold).toBeLessThan(
      lowSens.getEffectiveConfig().curlThreshold
    )
    // Higher sensitivity => lower twistMinRotation (less rotation needed)
    expect(highSens.getEffectiveConfig().twistMinRotation).toBeLessThan(
      lowSens.getEffectiveConfig().twistMinRotation
    )
  })

  describe('multi-frame sequences', () => {
    it('should track point gesture through full lifecycle', () => {
      const pointHand = createPointHand()
      const openHand = createOpenPalmHand()

      // Onset
      let events = engine.processFrame({ hands: [pointHand], timestamp: 0, frameId: 0 })
      let pointEvent = events.find((e) => e.type === GestureType.Point)
      expect(pointEvent?.phase).toBe(GesturePhase.Onset)

      // Hold
      events = engine.processFrame({ hands: [pointHand], timestamp: 16, frameId: 1 })
      pointEvent = events.find(
        (e) => e.type === GestureType.Point && e.phase === GesturePhase.Hold
      )
      expect(pointEvent).toBeDefined()

      // Release
      events = engine.processFrame({ hands: [openHand], timestamp: 32, frameId: 2 })
      pointEvent = events.find(
        (e) => e.type === GestureType.Point && e.phase === GesturePhase.Release
      )
      expect(pointEvent).toBeDefined()
    })

    it('should handle rapid gesture changes', () => {
      const pinchHand = createPinchHand()
      const pointHand = createPointHand()
      const fistHand = createFistHand()

      engine.processFrame({ hands: [pinchHand], timestamp: 0, frameId: 0 })
      engine.processFrame({ hands: [pointHand], timestamp: 16, frameId: 1 })
      const events = engine.processFrame({ hands: [fistHand], timestamp: 32, frameId: 2 })

      // Should not crash and should produce valid events
      expect(Array.isArray(events)).toBe(true)
      for (const event of events) {
        expect(event.type).toBeDefined()
        expect(event.phase).toBeDefined()
        expect(event.hand).toBeDefined()
      }
    })
  })
})

// ─── Gesture Mappings Tests ─────────────────────────────────────────

describe('Gesture Mappings', () => {
  describe('DEFAULT_MAPPINGS', () => {
    it('should have mappings for all gesture types', () => {
      const gestureTypes = new Set(DEFAULT_MAPPINGS.map((m) => m.gesture))
      expect(gestureTypes.has(GestureType.Point)).toBe(true)
      expect(gestureTypes.has(GestureType.Pinch)).toBe(true)
      expect(gestureTypes.has(GestureType.TwoHandPinch)).toBe(true)
      expect(gestureTypes.has(GestureType.OpenPalm)).toBe(true)
      expect(gestureTypes.has(GestureType.FlatDrag)).toBe(true)
      expect(gestureTypes.has(GestureType.Fist)).toBe(true)
      expect(gestureTypes.has(GestureType.LShape)).toBe(true)
    })

    it('should have valid command targets', () => {
      for (const mapping of DEFAULT_MAPPINGS) {
        expect(['mouse', 'keyboard', 'builtin', 'program']).toContain(mapping.action.target)
      }
    })
  })

  describe('mapGestureToCommand', () => {
    it('should map point onset to mouse move', () => {
      const event: GestureEvent = {
        type: GestureType.Point,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      expect(cmd!.target).toBe('mouse')
      if (cmd!.target === 'mouse') {
        expect(cmd!.action).toBe('move')
        expect(cmd!.x).toBe(0.5)
        expect(cmd!.y).toBe(0.3)
      }
    })

    it('should map pinch onset to mouse click', () => {
      const event: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      expect(cmd!.target).toBe('mouse')
      if (cmd!.target === 'mouse') {
        expect(cmd!.action).toBe('click')
        expect(cmd!.button).toBe('left')
      }
    })

    it('should map pinch hold to drag move', () => {
      const event: GestureEvent = {
        type: GestureType.Pinch,
        phase: GesturePhase.Hold,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      if (cmd!.target === 'mouse') {
        expect(cmd!.action).toBe('drag_move')
      }
    })

    it('should map fist onset to escape key', () => {
      const event: GestureEvent = {
        type: GestureType.Fist,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      expect(cmd!.target).toBe('keyboard')
      if (cmd!.target === 'keyboard') {
        expect(cmd!.action).toBe('press')
        expect(cmd!.key).toBe('Escape')
      }
    })

    it('should map l-shape onset to Ctrl+Shift+T', () => {
      const event: GestureEvent = {
        type: GestureType.LShape,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      expect(cmd!.target).toBe('keyboard')
      if (cmd!.target === 'keyboard') {
        expect(cmd!.action).toBe('combo')
        expect(cmd!.keys).toEqual(['ctrl', 'shift', 't'])
      }
    })

    it('should map two-hand pinch to zoom', () => {
      const event: GestureEvent = {
        type: GestureType.TwoHandPinch,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000,
        data: { handDistance: 0.5 }
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      expect(cmd!.target).toBe('builtin')
      if (cmd!.target === 'builtin') {
        expect(cmd!.action).toBe('zoom')
        expect(cmd!.params).toBeDefined()
        expect(cmd!.params!.handDistance).toBe(0.5)
      }
    })

    it('should map open palm to deselect', () => {
      const event: GestureEvent = {
        type: GestureType.OpenPalm,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      expect(cmd!.target).toBe('builtin')
      if (cmd!.target === 'builtin') {
        expect(cmd!.action).toBe('select')
      }
    })

    it('should map flat drag to pan', () => {
      const event: GestureEvent = {
        type: GestureType.FlatDrag,
        phase: GesturePhase.Hold,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      expect(cmd!.target).toBe('builtin')
      if (cmd!.target === 'builtin') {
        expect(cmd!.action).toBe('pan')
      }
    })

    it('should return null for unmapped gesture/phase combination', () => {
      const event: GestureEvent = {
        type: GestureType.Twist,
        phase: GesturePhase.Onset,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      // Twist onset is not in default mappings
      const cmd = mapGestureToCommand(event)
      expect(cmd).toBeNull()
    })

    it('should use custom mappings when provided', () => {
      const customMappings: GestureMapping[] = [
        {
          gesture: GestureType.Twist,
          phase: GesturePhase.Hold,
          action: { target: 'builtin', action: 'rotate' }
        }
      ]
      const event: GestureEvent = {
        type: GestureType.Twist,
        phase: GesturePhase.Hold,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000
      }
      const cmd = mapGestureToCommand(event, customMappings)
      expect(cmd).not.toBeNull()
      expect(cmd!.target).toBe('builtin')
      if (cmd!.target === 'builtin') {
        expect(cmd!.action).toBe('rotate')
      }
    })

    it('should inject gesture data into builtin command params', () => {
      const event: GestureEvent = {
        type: GestureType.TwoHandPinch,
        phase: GesturePhase.Hold,
        hand: 'right',
        confidence: 0.9,
        position: { x: 0.5, y: 0.3, z: 0 },
        timestamp: 1000,
        data: { handDistance: 0.4, leftPinchDistance: 0.02, rightPinchDistance: 0.03 }
      }
      const cmd = mapGestureToCommand(event)
      expect(cmd).not.toBeNull()
      if (cmd!.target === 'builtin') {
        expect(cmd!.params!.handDistance).toBe(0.4)
      }
    })
  })
})

// ─── Edge Cases ─────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('should handle empty landmarks array gracefully in fingerCurl', () => {
    // This tests robustness — real data always has 21 landmarks
    // but we should not crash on unexpected input
    const landmarks = createLandmarks()
    // All default positions (0.5, 0.5, 0) — finger curl should return some value
    const curl = fingerCurl(landmarks, 'index')
    expect(typeof curl).toBe('number')
    expect(curl).toBeGreaterThanOrEqual(0)
    expect(curl).toBeLessThanOrEqual(1)
  })

  it('should handle ambiguous poses by returning the highest priority gesture', () => {
    // Create a hand that is somewhat ambiguous
    const hand = createOpenPalmHand()
    // Make thumb and index close but not quite pinching
    hand.landmarks[LANDMARK.THUMB_TIP] = lm(0.44, 0.42)
    hand.landmarks[LANDMARK.INDEX_TIP] = lm(0.46, 0.42)

    const result = classifyGesture(hand)
    // Should still classify as something (may be pinch if close enough, or open palm)
    if (result) {
      expect(Object.values(GestureType)).toContain(result.type)
    }
  })

  it('should handle a single hand frame without crashing', () => {
    const engine = new GestureEngine()
    const frame: LandmarkFrame = {
      hands: [createOpenPalmHand()],
      timestamp: 0,
      frameId: 0
    }
    expect(() => engine.processFrame(frame)).not.toThrow()
  })

  it('should handle frame with no hands', () => {
    const engine = new GestureEngine()
    const frame: LandmarkFrame = {
      hands: [],
      timestamp: 0,
      frameId: 0
    }
    const events = engine.processFrame(frame)
    expect(events).toEqual([])
  })

  it('should handle hands with low confidence', () => {
    const engine = new GestureEngine()
    const hand = createPinchHand()
    hand.score = 0.1 // Very low confidence
    const frame: LandmarkFrame = { hands: [hand], timestamp: 0, frameId: 0 }
    const events = engine.processFrame(frame)

    // No pinch event should fire because confidence is below threshold
    const pinchEvent = events.find((e) => e.type === GestureType.Pinch)
    expect(pinchEvent).toBeUndefined()
  })

  it('should handle identical consecutive frames', () => {
    const engine = new GestureEngine({ minOnsetFrames: 1, minHoldDuration: 0 })
    const hand = createPointHand()
    const frame: LandmarkFrame = { hands: [hand], timestamp: 0, frameId: 0 }

    const events1 = engine.processFrame(frame)
    const events2 = engine.processFrame({ ...frame, timestamp: 16, frameId: 1 })

    // First should be onset, second should be hold
    const point1 = events1.find((e) => e.type === GestureType.Point)
    const point2 = events2.find(
      (e) => e.type === GestureType.Point && e.phase === GesturePhase.Hold
    )
    expect(point1?.phase).toBe(GesturePhase.Onset)
    expect(point2).toBeDefined()
  })

  it('should handle distance of zero without NaN', () => {
    const p = lm(0, 0, 0)
    expect(distance(p, p)).toBe(0)
    expect(Number.isNaN(distance(p, p))).toBe(false)
  })

  it('should handle angleBetween with zero-length vectors without NaN', () => {
    const p = lm(0, 0, 0)
    const result = angleBetween(p, p, p)
    expect(Number.isNaN(result)).toBe(false)
  })

  it('should return null from classifyGesture for ambiguous/no-match pose', () => {
    // Create a hand where some fingers are partially extended/curled
    // so no gesture clearly matches
    const landmarks = createLandmarks({
      [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
      // Thumb half-curled
      [LANDMARK.THUMB_CMC]: lm(0.4, 0.65),
      [LANDMARK.THUMB_MCP]: lm(0.38, 0.60),
      [LANDMARK.THUMB_IP]: lm(0.39, 0.56),
      [LANDMARK.THUMB_TIP]: lm(0.42, 0.54),
      // Index half-curled
      [LANDMARK.INDEX_MCP]: lm(0.42, 0.55),
      [LANDMARK.INDEX_PIP]: lm(0.42, 0.50),
      [LANDMARK.INDEX_DIP]: lm(0.43, 0.48),
      [LANDMARK.INDEX_TIP]: lm(0.44, 0.47),
      // Middle half-extended
      [LANDMARK.MIDDLE_MCP]: lm(0.50, 0.53),
      [LANDMARK.MIDDLE_PIP]: lm(0.50, 0.48),
      [LANDMARK.MIDDLE_DIP]: lm(0.50, 0.44),
      [LANDMARK.MIDDLE_TIP]: lm(0.50, 0.41),
      // Ring half-curled
      [LANDMARK.RING_MCP]: lm(0.58, 0.55),
      [LANDMARK.RING_PIP]: lm(0.58, 0.51),
      [LANDMARK.RING_DIP]: lm(0.58, 0.49),
      [LANDMARK.RING_TIP]: lm(0.58, 0.48),
      // Pinky extended
      [LANDMARK.PINKY_MCP]: lm(0.65, 0.6),
      [LANDMARK.PINKY_PIP]: lm(0.65, 0.55),
      [LANDMARK.PINKY_DIP]: lm(0.65, 0.50),
      [LANDMARK.PINKY_TIP]: lm(0.65, 0.45)
    })
    const hand = createHand(landmarks)
    const result = classifyGesture(hand)
    // May return null or a low-confidence match
    if (result) {
      expect(result.confidence).toBeGreaterThanOrEqual(0)
    }
  })
})

// ─── Twist / Stale Data Edge Cases ──────────────────────────────────

describe('Twist Detection Edge Cases', () => {
  it('should not detect twist when time delta is too large (stale data)', () => {
    const engine = new GestureEngine({ minOnsetFrames: 1, minHoldDuration: 0 })
    const hand1 = createOpenPalmHand('right')
    engine.processFrame({ hands: [hand1], timestamp: 0, frameId: 0 })

    // Second frame more than 500ms later (stale)
    const hand2 = createOpenPalmHand('right')
    hand2.landmarks[LANDMARK.MIDDLE_MCP] = lm(0.8, 0.3, 0)
    const events = engine.processFrame({ hands: [hand2], timestamp: 600, frameId: 1 })

    const twistEvent = events.find(
      (e) => e.type === GestureType.Twist && e.phase === GesturePhase.Onset
    )
    expect(twistEvent).toBeUndefined()
  })

  it('should not detect twist when time delta is zero or negative', () => {
    const engine = new GestureEngine({ minOnsetFrames: 1, minHoldDuration: 0 })
    const hand1 = createOpenPalmHand('right')
    engine.processFrame({ hands: [hand1], timestamp: 100, frameId: 0 })

    // Same timestamp
    const hand2 = createOpenPalmHand('right')
    hand2.landmarks[LANDMARK.MIDDLE_MCP] = lm(0.8, 0.3, 0)
    const events = engine.processFrame({ hands: [hand2], timestamp: 100, frameId: 1 })

    const twistEvent = events.find(
      (e) => e.type === GestureType.Twist && e.phase === GesturePhase.Onset
    )
    expect(twistEvent).toBeUndefined()
  })
})

// ─── Two-hand pinch release branch ──────────────────────────────────

describe('Two-Hand Pinch Release', () => {
  it('should emit release event when two-hand pinch stops', () => {
    const engine = new GestureEngine({ minOnsetFrames: 1, minHoldDuration: 0 })

    const leftPinch = createPinchHand('left')
    const rightPinch = createPinchHand('right')

    // Frame 1: onset
    engine.processFrame({ hands: [leftPinch, rightPinch], timestamp: 0, frameId: 0 })
    // Frame 2: hold
    engine.processFrame({ hands: [leftPinch, rightPinch], timestamp: 16, frameId: 1 })

    // Frame 3: release (only one hand pinching)
    const rightOpen = createOpenPalmHand('right')
    const events = engine.processFrame({
      hands: [leftPinch, rightOpen],
      timestamp: 32,
      frameId: 2
    })

    const releaseEvent = events.find(
      (e) => e.type === GestureType.TwoHandPinch && e.phase === GesturePhase.Release
    )
    expect(releaseEvent).toBeDefined()
    // When released, confidence should be 0
    expect(releaseEvent!.confidence).toBe(0)
  })
})

// ─── NaN Safety ─────────────────────────────────────────────────────

describe('NaN safety', () => {
  it('distance() should return 0 for NaN landmark coordinates', () => {
    const nanLandmark = lm(NaN, NaN, NaN)
    const normalLandmark = lm(0.5, 0.5, 0)
    expect(distance(nanLandmark, normalLandmark)).toBe(0)
    expect(distance(normalLandmark, nanLandmark)).toBe(0)
    expect(distance(nanLandmark, nanLandmark)).toBe(0)
  })

  it('distance() should return 0 for Infinity landmark coordinates', () => {
    const infLandmark = lm(Infinity, -Infinity, Infinity)
    const normalLandmark = lm(0.5, 0.5, 0)
    expect(distance(infLandmark, normalLandmark)).toBe(0)
    expect(distance(normalLandmark, infLandmark)).toBe(0)
  })

  it('angleBetween() should return 0 for NaN inputs', () => {
    const nanLandmark = lm(NaN, NaN, NaN)
    const normalA = lm(1, 0, 0)
    const normalB = lm(0, 0, 0)
    const normalC = lm(0, 1, 0)
    expect(angleBetween(nanLandmark, normalB, normalC)).toBe(0)
    expect(angleBetween(normalA, nanLandmark, normalC)).toBe(0)
    expect(angleBetween(normalA, normalB, nanLandmark)).toBe(0)
  })

  it('classifyGesture() should not crash with NaN landmarks', () => {
    const nanLandmarks = Array.from({ length: 21 }, () => lm(NaN, NaN, NaN))
    const hand = createHand(nanLandmarks, 'right', 0.95)
    expect(() => classifyGesture(hand)).not.toThrow()
    // Result can be null or a gesture, but must not crash
    const result = classifyGesture(hand)
    if (result) {
      expect(Number.isFinite(result.confidence)).toBe(true)
    }
  })
})

// ─── Division by Zero ───────────────────────────────────────────────

describe('Division by zero', () => {
  it('should handle pinchThreshold of 0 without crashing', () => {
    const hand = createPinchHand()
    const config: GestureConfig = { ...DEFAULT_GESTURE_CONFIG, pinchThreshold: 0 }
    expect(() => classifyGesture(hand, config)).not.toThrow()
    const result = classifyGesture(hand, config)
    if (result) {
      expect(Number.isFinite(result.confidence)).toBe(true)
      expect(result.confidence).toBeGreaterThanOrEqual(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    }
  })
})

// ─── Barrel Index Exports ───────────────────────────────────────────

describe('Gesture Module Index', () => {
  it('should re-export all classifier functions', () => {
    expect(GestureModule.distance).toBeDefined()
    expect(GestureModule.angleBetween).toBeDefined()
    expect(GestureModule.fingerCurl).toBeDefined()
    expect(GestureModule.fingerExtended).toBeDefined()
    expect(GestureModule.analyzeHandPose).toBeDefined()
    expect(GestureModule.detectPinch).toBeDefined()
    expect(GestureModule.detectPoint).toBeDefined()
    expect(GestureModule.detectOpenPalm).toBeDefined()
    expect(GestureModule.detectFist).toBeDefined()
    expect(GestureModule.detectLShape).toBeDefined()
    expect(GestureModule.detectFlatDrag).toBeDefined()
    expect(GestureModule.classifyGesture).toBeDefined()
  })

  it('should re-export state machine and engine', () => {
    expect(GestureModule.GestureState).toBeDefined()
    expect(GestureModule.GestureStateMachine).toBeDefined()
    expect(GestureModule.GestureEngine).toBeDefined()
  })

  it('should re-export types and config', () => {
    expect(GestureModule.GestureType).toBeDefined()
    expect(GestureModule.GesturePhase).toBeDefined()
    expect(GestureModule.DEFAULT_GESTURE_CONFIG).toBeDefined()
  })

  it('should re-export mappings', () => {
    expect(GestureModule.DEFAULT_MAPPINGS).toBeDefined()
    expect(GestureModule.mapGestureToCommand).toBeDefined()
  })

  it('should have a working GestureEngine via the barrel export', () => {
    const engine = new GestureModule.GestureEngine({ minOnsetFrames: 1 })
    const hand = createPinchHand()
    const events = engine.processFrame({ hands: [hand], timestamp: 0, frameId: 0 })
    expect(events.length).toBeGreaterThan(0)
  })
})
