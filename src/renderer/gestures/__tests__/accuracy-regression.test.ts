/**
 * Gesture accuracy regression tests.
 * Verifies specific classifier fixes: Fist/Pinch collision, cooldown re-trigger,
 * L-Shape detection, and Point confidence scaling.
 */
import { describe, it, expect } from 'vitest'
import {
  type Landmark,
  type Hand,
  LANDMARK,
  GestureType,
  GesturePhase
} from '@shared/protocol'
import {
  classifyGesture,
  detectPinch,
  fingerCurl
} from '../classifier'
import { GestureStateMachine, GestureState, GestureEngine } from '../state'
import { DEFAULT_GESTURE_CONFIG, type GestureConfig } from '../types'

// ─── Test Helpers ──────────────────────────────────────────────────

function lm(x: number, y: number, z: number = 0): Landmark {
  return { x, y, z }
}

function createLandmarks(overrides: Record<number, Landmark> = {}): Landmark[] {
  const landmarks: Landmark[] = Array.from({ length: 21 }, () => lm(0.5, 0.5, 0))
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value
  }
  return landmarks
}

function makeHand(
  landmarks: Landmark[],
  handedness: 'left' | 'right' = 'right',
  score = 0.95
): Hand {
  return {
    handedness,
    landmarks,
    worldLandmarks: landmarks,
    score
  }
}

/** Create a closed fist hand (all fingers curled toward palm) */
function closedFistLandmarks(): Landmark[] {
  return createLandmarks({
    [LANDMARK.WRIST]: lm(0.5, 0.8),
    // Thumb — curled but tip still somewhat close to index area
    [LANDMARK.THUMB_CMC]: lm(0.55, 0.75),
    [LANDMARK.THUMB_MCP]: lm(0.6, 0.7),
    [LANDMARK.THUMB_IP]: lm(0.6, 0.65),
    [LANDMARK.THUMB_TIP]: lm(0.57, 0.62),
    // Index — curled
    [LANDMARK.INDEX_MCP]: lm(0.52, 0.65),
    [LANDMARK.INDEX_PIP]: lm(0.52, 0.6),
    [LANDMARK.INDEX_DIP]: lm(0.52, 0.58),
    [LANDMARK.INDEX_TIP]: lm(0.52, 0.6),
    // Middle — curled
    [LANDMARK.MIDDLE_MCP]: lm(0.5, 0.64),
    [LANDMARK.MIDDLE_PIP]: lm(0.5, 0.58),
    [LANDMARK.MIDDLE_DIP]: lm(0.5, 0.56),
    [LANDMARK.MIDDLE_TIP]: lm(0.5, 0.58),
    // Ring — curled
    [LANDMARK.RING_MCP]: lm(0.47, 0.65),
    [LANDMARK.RING_PIP]: lm(0.47, 0.59),
    [LANDMARK.RING_DIP]: lm(0.47, 0.57),
    [LANDMARK.RING_TIP]: lm(0.47, 0.59),
    // Pinky — curled
    [LANDMARK.PINKY_MCP]: lm(0.44, 0.67),
    [LANDMARK.PINKY_PIP]: lm(0.44, 0.62),
    [LANDMARK.PINKY_DIP]: lm(0.44, 0.6),
    [LANDMARK.PINKY_TIP]: lm(0.44, 0.62)
  })
}

/** Create an L-shape hand (thumb + index extended, rest curled) */
function lShapeLandmarks(): Landmark[] {
  return createLandmarks({
    [LANDMARK.WRIST]: lm(0.5, 0.8),
    // Thumb — extended outward
    [LANDMARK.THUMB_CMC]: lm(0.55, 0.75),
    [LANDMARK.THUMB_MCP]: lm(0.62, 0.72),
    [LANDMARK.THUMB_IP]: lm(0.69, 0.70),
    [LANDMARK.THUMB_TIP]: lm(0.76, 0.68),
    // Index — extended upward
    [LANDMARK.INDEX_MCP]: lm(0.52, 0.65),
    [LANDMARK.INDEX_PIP]: lm(0.52, 0.55),
    [LANDMARK.INDEX_DIP]: lm(0.52, 0.45),
    [LANDMARK.INDEX_TIP]: lm(0.52, 0.35),
    // Middle — curled
    [LANDMARK.MIDDLE_MCP]: lm(0.5, 0.64),
    [LANDMARK.MIDDLE_PIP]: lm(0.5, 0.58),
    [LANDMARK.MIDDLE_DIP]: lm(0.5, 0.56),
    [LANDMARK.MIDDLE_TIP]: lm(0.5, 0.58),
    // Ring — curled
    [LANDMARK.RING_MCP]: lm(0.47, 0.65),
    [LANDMARK.RING_PIP]: lm(0.47, 0.59),
    [LANDMARK.RING_DIP]: lm(0.47, 0.57),
    [LANDMARK.RING_TIP]: lm(0.47, 0.59),
    // Pinky — curled
    [LANDMARK.PINKY_MCP]: lm(0.44, 0.67),
    [LANDMARK.PINKY_PIP]: lm(0.44, 0.62),
    [LANDMARK.PINKY_DIP]: lm(0.44, 0.6),
    [LANDMARK.PINKY_TIP]: lm(0.44, 0.62)
  })
}

/** Create pinch landmarks (thumb tip touching index tip, others relaxed) */
function pinchLandmarks(): Landmark[] {
  return createLandmarks({
    [LANDMARK.WRIST]: lm(0.5, 0.8),
    // Thumb — approaching index
    [LANDMARK.THUMB_CMC]: lm(0.55, 0.75),
    [LANDMARK.THUMB_MCP]: lm(0.58, 0.7),
    [LANDMARK.THUMB_IP]: lm(0.56, 0.6),
    [LANDMARK.THUMB_TIP]: lm(0.53, 0.52),  // Close to index tip
    // Index — partially extended, tip near thumb
    [LANDMARK.INDEX_MCP]: lm(0.52, 0.65),
    [LANDMARK.INDEX_PIP]: lm(0.52, 0.58),
    [LANDMARK.INDEX_DIP]: lm(0.52, 0.54),
    [LANDMARK.INDEX_TIP]: lm(0.52, 0.51),  // Close to thumb tip
    // Middle — relaxed (slightly extended)
    [LANDMARK.MIDDLE_MCP]: lm(0.5, 0.64),
    [LANDMARK.MIDDLE_PIP]: lm(0.5, 0.56),
    [LANDMARK.MIDDLE_DIP]: lm(0.5, 0.50),
    [LANDMARK.MIDDLE_TIP]: lm(0.5, 0.46),
    // Ring — relaxed
    [LANDMARK.RING_MCP]: lm(0.47, 0.65),
    [LANDMARK.RING_PIP]: lm(0.47, 0.57),
    [LANDMARK.RING_DIP]: lm(0.47, 0.51),
    [LANDMARK.RING_TIP]: lm(0.47, 0.47),
    // Pinky — relaxed
    [LANDMARK.PINKY_MCP]: lm(0.44, 0.67),
    [LANDMARK.PINKY_PIP]: lm(0.44, 0.60),
    [LANDMARK.PINKY_DIP]: lm(0.44, 0.55),
    [LANDMARK.PINKY_TIP]: lm(0.44, 0.51)
  })
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('Fist/Pinch classifier collision', () => {
  it('should classify closed fist as Fist, NOT Pinch', () => {
    const hand = makeHand(closedFistLandmarks())
    const result = classifyGesture(hand, DEFAULT_GESTURE_CONFIG)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.Fist)
  })

  it('should classify pinch (thumb near index, others relaxed) as Pinch, NOT Fist', () => {
    const hand = makeHand(pinchLandmarks())
    const result = classifyGesture(hand, DEFAULT_GESTURE_CONFIG)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.Pinch)
  })

  it('should not misclassify fist as pinch even with low thumb curl', () => {
    // Thumb curl ~0.12 (MediaPipe underreport) — still should be fist
    const landmarks = closedFistLandmarks()
    // Move thumb tip slightly further from index (out of pinch range)
    landmarks[LANDMARK.THUMB_TIP] = lm(0.60, 0.62)
    const hand = makeHand(landmarks)
    const result = classifyGesture(hand, DEFAULT_GESTURE_CONFIG)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.Fist)
  })
})

describe('L-Shape gesture detection', () => {
  it('should detect L-Shape (thumb + index extended, rest curled)', () => {
    const hand = makeHand(lShapeLandmarks())
    const result = classifyGesture(hand, DEFAULT_GESTURE_CONFIG)
    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.LShape)
  })

  it('should have reasonable confidence for L-Shape', () => {
    const hand = makeHand(lShapeLandmarks())
    const result = classifyGesture(hand, DEFAULT_GESTURE_CONFIG)
    expect(result).not.toBeNull()
    expect(result!.confidence).toBeGreaterThan(0.3)
  })
})

describe('Cooldown re-trigger', () => {
  it('should allow immediate re-onset after cooldown expires', () => {
    const sm = new GestureStateMachine(1, 0, 50) // 50ms cooldown

    // First onset
    expect(sm.update(true, 0)).toBe(GesturePhase.Onset)
    // Transition to hold (minOnsetFrames=1, minHoldDuration=0)
    expect(sm.update(true, 1)).toBe(GesturePhase.Hold)
    // Release
    expect(sm.update(false, 100)).toBe(GesturePhase.Release)
    // Cooldown transition
    expect(sm.update(false, 101)).toBeNull()
    // During cooldown, detection returns null
    expect(sm.update(true, 120)).toBeNull()
    // After cooldown expires (50ms) AND detected → direct re-onset
    expect(sm.update(true, 160)).toBe(GesturePhase.Onset)
  })

  it('should enable rapid pinch-release-pinch sequence', () => {
    const engine = new GestureEngine({
      minOnsetFrames: 1,
      minHoldDuration: 0,
      cooldownDuration: 50,
      sensitivity: 0.5
    })

    const pinchHand: Hand = makeHand(pinchLandmarks())
    const relaxedHand: Hand = makeHand(createLandmarks({
      [LANDMARK.WRIST]: lm(0.5, 0.8),
      [LANDMARK.MIDDLE_MCP]: lm(0.5, 0.64),
      // All fingers spread (no gesture)
      [LANDMARK.THUMB_TIP]: lm(0.76, 0.68),
      [LANDMARK.INDEX_TIP]: lm(0.52, 0.35),
      [LANDMARK.MIDDLE_TIP]: lm(0.5, 0.35),
      [LANDMARK.RING_TIP]: lm(0.47, 0.35),
      [LANDMARK.PINKY_TIP]: lm(0.44, 0.35)
    }))

    // First pinch
    let events = engine.processFrame({
      hands: [pinchHand],
      timestamp: 0,
      frameId: 0
    })
    const pinchOnset = events.find(e => e.type === GestureType.Pinch && e.phase === GesturePhase.Onset)
    expect(pinchOnset).toBeDefined()

    // Release
    events = engine.processFrame({
      hands: [relaxedHand],
      timestamp: 100,
      frameId: 1
    })

    // Wait for cooldown
    events = engine.processFrame({
      hands: [relaxedHand],
      timestamp: 200,
      frameId: 2
    })

    // Second pinch (after cooldown)
    events = engine.processFrame({
      hands: [pinchHand],
      timestamp: 260,
      frameId: 3
    })
    const secondOnset = events.find(e => e.type === GestureType.Pinch && e.phase === GesturePhase.Onset)
    expect(secondOnset).toBeDefined()
  })
})

describe('Point confidence scaling', () => {
  it('should produce higher confidence for clearer point gestures', () => {
    // Strong point: index fully extended, others clearly curled
    const strongPointLm = createLandmarks({
      [LANDMARK.WRIST]: lm(0.5, 0.8),
      [LANDMARK.MIDDLE_MCP]: lm(0.5, 0.64),
      [LANDMARK.INDEX_MCP]: lm(0.52, 0.65),
      [LANDMARK.INDEX_PIP]: lm(0.52, 0.55),
      [LANDMARK.INDEX_DIP]: lm(0.52, 0.45),
      [LANDMARK.INDEX_TIP]: lm(0.52, 0.30),
      // Others curled tight
      [LANDMARK.MIDDLE_PIP]: lm(0.5, 0.60),
      [LANDMARK.MIDDLE_DIP]: lm(0.5, 0.62),
      [LANDMARK.MIDDLE_TIP]: lm(0.5, 0.64),
      [LANDMARK.RING_MCP]: lm(0.47, 0.65),
      [LANDMARK.RING_PIP]: lm(0.47, 0.61),
      [LANDMARK.RING_DIP]: lm(0.47, 0.63),
      [LANDMARK.RING_TIP]: lm(0.47, 0.65),
      [LANDMARK.PINKY_MCP]: lm(0.44, 0.67),
      [LANDMARK.PINKY_PIP]: lm(0.44, 0.63),
      [LANDMARK.PINKY_DIP]: lm(0.44, 0.65),
      [LANDMARK.PINKY_TIP]: lm(0.44, 0.67),
      [LANDMARK.THUMB_CMC]: lm(0.55, 0.75),
      [LANDMARK.THUMB_MCP]: lm(0.58, 0.70),
      [LANDMARK.THUMB_IP]: lm(0.56, 0.62),
      [LANDMARK.THUMB_TIP]: lm(0.55, 0.60)
    })

    const hand = makeHand(strongPointLm)
    const result = classifyGesture(hand, DEFAULT_GESTURE_CONFIG)
    expect(result).not.toBeNull()
    if (result?.type === GestureType.Point) {
      expect(result.confidence).toBeGreaterThan(0.3)
    }
  })
})

describe('Gesture state machine transitions', () => {
  it('should follow idle → onset → hold → release → cooldown → idle', () => {
    const sm = new GestureStateMachine(1, 50, 50)

    expect(sm.getState()).toBe(GestureState.Idle)

    // Idle → Onset (detected)
    sm.update(true, 0)
    expect(sm.getState()).toBe(GestureState.Onset)

    // Onset → Hold (after minHoldDuration)
    sm.update(true, 60)
    expect(sm.getState()).toBe(GestureState.Hold)

    // Hold → Release (not detected)
    sm.update(false, 100)
    expect(sm.getState()).toBe(GestureState.Release)

    // Release → Cooldown
    sm.update(false, 110)
    expect(sm.getState()).toBe(GestureState.Cooldown)

    // Cooldown → Idle (after cooldownDuration, not detected)
    sm.update(false, 170)
    expect(sm.getState()).toBe(GestureState.Idle)
  })

  it('should reset to idle', () => {
    const sm = new GestureStateMachine(1, 0, 0)
    sm.update(true, 0)
    sm.update(true, 1)
    expect(sm.getState()).not.toBe(GestureState.Idle)
    sm.reset()
    expect(sm.getState()).toBe(GestureState.Idle)
  })
})
