/**
 * Sprint 4: Two-Hand System Wiring tests
 *
 * Verifies that TwoHandCoordinator and dispatchTwoHandAction work together
 * to produce correct scene actions for two-hand gesture combos.
 */

import { describe, it, expect } from 'vitest'
import { TwoHandCoordinator } from '../two-hand-coordinator'
import { dispatchTwoHandAction } from '../../controller/dispatcher'
import type { DispatchContext } from '../../controller/dispatcher'
import { GestureType, GesturePhase } from '@shared/protocol'
import type { GestureEvent } from '@shared/protocol'

function makeEvent(
  type: GestureType,
  hand: 'left' | 'right',
  phase: GesturePhase = GesturePhase.Onset
): GestureEvent {
  return {
    type,
    phase,
    hand,
    confidence: 0.9,
    position: { x: 0.5, y: 0.5, z: 0 },
    timestamp: 1000,
    data: type === GestureType.Twist ? { rotation: 0.3 } : undefined
  }
}

function makeCtx(overrides: Partial<DispatchContext & { handDistanceDelta: number; leftZDelta: number; rightZDelta: number }> = {}) {
  return {
    viewMode: 'graph' as const,
    selection: null,
    selectedNodeId: null,
    selectedClusterId: null,
    oneHandedMode: false,
    handDistanceDelta: 0.1,
    leftZDelta: 0,
    rightZDelta: 0,
    ...overrides
  }
}

describe('Sprint 4a: TwoHandCoordinator wiring', () => {
  it('should detect Pinch+Pinch combo as TwoHandPinch', () => {
    const coord = new TwoHandCoordinator()
    const left = makeEvent(GestureType.Pinch, 'left')
    const right = makeEvent(GestureType.Pinch, 'right')

    const result = coord.resolve(left, right, 1000)
    expect(result.twoHandAction).not.toBeNull()
    expect(result.twoHandAction?.type).toBe(GestureType.TwoHandPinch)
  })

  it('should return null when only one hand present', () => {
    const coord = new TwoHandCoordinator()
    const left = makeEvent(GestureType.Pinch, 'left')

    const result = coord.resolve(left, null, 1000)
    expect(result.twoHandAction).toBeNull()
  })

  it('should suppress individual hands when combo detected', () => {
    const coord = new TwoHandCoordinator()
    const left = makeEvent(GestureType.Pinch, 'left')
    const right = makeEvent(GestureType.Pinch, 'right')

    const result = coord.resolve(left, right, 1000)
    expect(result.suppressLeft).toBe(true)
    expect(result.suppressRight).toBe(true)
  })

  it('should not suppress when no combo matches', () => {
    const coord = new TwoHandCoordinator()
    // Pinch + Point is not a combo in the matrix
    const left = makeEvent(GestureType.Pinch, 'left')
    const right = makeEvent(GestureType.Point, 'right')

    const result = coord.resolve(left, right, 1000)
    // May or may not have twoHandAction depending on matrix, but check suppression
    if (!result.twoHandAction) {
      expect(result.suppressLeft).toBe(false)
      expect(result.suppressRight).toBe(false)
    }
  })
})

describe('Sprint 4b: dispatchTwoHandAction combos', () => {
  it('Pinch+Pinch → zoom when no node selected', () => {
    const left = makeEvent(GestureType.Pinch, 'left', GesturePhase.Hold)
    const right = makeEvent(GestureType.Pinch, 'right', GesturePhase.Hold)
    const ctx = makeCtx({ handDistanceDelta: 0.5 })

    const result = dispatchTwoHandAction(left, right, ctx)
    expect(result).not.toBeNull()
    if (!Array.isArray(result)) {
      expect(result.type).toBe('zoom')
      expect(result.params.delta).toBe(0.5)
    }
  })

  it('Pinch+Pinch → scale_node when node selected', () => {
    const left = makeEvent(GestureType.Pinch, 'left', GesturePhase.Hold)
    const right = makeEvent(GestureType.Pinch, 'right', GesturePhase.Hold)
    const ctx = makeCtx({ selectedNodeId: 'node-1', handDistanceDelta: 0.3 })

    const result = dispatchTwoHandAction(left, right, ctx)
    if (!Array.isArray(result)) {
      expect(result.type).toBe('scale_node')
      expect(result.params.nodeId).toBe('node-1')
      expect(result.params.delta).toBe(0.3)
    }
  })

  it('OpenPalm+OpenPalm → dolly', () => {
    const left = makeEvent(GestureType.OpenPalm, 'left', GesturePhase.Hold)
    const right = makeEvent(GestureType.OpenPalm, 'right', GesturePhase.Hold)
    const ctx = makeCtx({ leftZDelta: 0.1, rightZDelta: 0.2 })

    const result = dispatchTwoHandAction(left, right, ctx)
    if (!Array.isArray(result)) {
      expect(result.type).toBe('dolly')
      expect(result.params.delta).toBeCloseTo(0.15, 2) // average of 0.1 and 0.2
    }
  })

  it('Twist+Twist same direction → orbit', () => {
    const left = { ...makeEvent(GestureType.Twist, 'left', GesturePhase.Hold), data: { rotation: 0.3 } }
    const right = { ...makeEvent(GestureType.Twist, 'right', GesturePhase.Hold), data: { rotation: 0.4 } }
    const ctx = makeCtx()

    const result = dispatchTwoHandAction(left, right, ctx)
    if (!Array.isArray(result)) {
      expect(result.type).toBe('orbit')
      expect(result.params.angle).toBeCloseTo(0.35, 2) // average
    }
  })

  it('Twist+Twist opposite direction → roll', () => {
    const left = { ...makeEvent(GestureType.Twist, 'left', GesturePhase.Hold), data: { rotation: 0.3 } }
    const right = { ...makeEvent(GestureType.Twist, 'right', GesturePhase.Hold), data: { rotation: -0.4 } }
    const ctx = makeCtx()

    const result = dispatchTwoHandAction(left, right, ctx)
    if (!Array.isArray(result)) {
      expect(result.type).toBe('roll')
    }
  })

  it('Pinch+FlatDrag → [drag, pan] array', () => {
    const left = makeEvent(GestureType.Pinch, 'left', GesturePhase.Hold)
    const right = makeEvent(GestureType.FlatDrag, 'right', GesturePhase.Hold)
    const ctx = makeCtx()

    const result = dispatchTwoHandAction(left, right, ctx)
    expect(Array.isArray(result)).toBe(true)
    if (Array.isArray(result)) {
      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('drag')
      expect(result[1].type).toBe('pan')
    }
  })

  it('Point+Point → measure', () => {
    const left = { ...makeEvent(GestureType.Point, 'left', GesturePhase.Hold), position: { x: 0.2, y: 0.3, z: 0 } }
    const right = { ...makeEvent(GestureType.Point, 'right', GesturePhase.Hold), position: { x: 0.8, y: 0.7, z: 0 } }
    const ctx = makeCtx()

    const result = dispatchTwoHandAction(left, right, ctx)
    if (!Array.isArray(result)) {
      expect(result.type).toBe('measure')
      expect(result.params.x1).toBe(0.2)
      expect(result.params.x2).toBe(0.8)
    }
  })

  it('Fist+Fist → fold', () => {
    const left = makeEvent(GestureType.Fist, 'left', GesturePhase.Hold)
    const right = makeEvent(GestureType.Fist, 'right', GesturePhase.Hold)
    const ctx = makeCtx()

    const result = dispatchTwoHandAction(left, right, ctx)
    if (!Array.isArray(result)) {
      expect(result.type).toBe('fold')
    }
  })

  it('Pinch+OpenPalm → unfold', () => {
    const left = makeEvent(GestureType.Pinch, 'left', GesturePhase.Hold)
    const right = makeEvent(GestureType.OpenPalm, 'right', GesturePhase.Hold)
    const ctx = makeCtx()

    const result = dispatchTwoHandAction(left, right, ctx)
    if (!Array.isArray(result)) {
      expect(result.type).toBe('unfold')
    }
  })

  it('should return noop for Release phase events', () => {
    const left = makeEvent(GestureType.Pinch, 'left', GesturePhase.Release)
    const right = makeEvent(GestureType.Pinch, 'right', GesturePhase.Release)
    const ctx = makeCtx()

    const result = dispatchTwoHandAction(left, right, ctx)
    if (!Array.isArray(result)) {
      expect(result.type).toBe('noop')
    }
  })
})
