/**
 * Tests for one-handed accessibility gesture mappings and dispatcher integration.
 *
 * Verifies:
 *   - All essential actions are covered by one-handed mappings
 *   - TwoHandPinch is not present in the mapping
 *   - Zoom in/out are mapped to Fist/LShape
 *   - Dispatcher uses correct mappings based on oneHandedMode config
 *   - getOneHandedMappings() returns the expected mapping array
 */

import { describe, it, expect } from 'vitest'
import { GestureType, GesturePhase, type GestureEvent } from '@shared/protocol'
import { ONE_HANDED_MAPPINGS, getOneHandedMappings } from '../one-handed'
import { dispatchGesture, type DispatchContext } from '../../controller/dispatcher'

// ─── Helpers ────────────────────────────────────────────────────────

/** Create a gesture event for testing */
function makeGestureEvent(
  type: GestureType,
  phase: GesturePhase,
  overrides: Partial<GestureEvent> = {}
): GestureEvent {
  return {
    type,
    phase,
    hand: 'right',
    confidence: 0.9,
    position: { x: 0.5, y: 0.3, z: 0 },
    timestamp: 1000,
    ...overrides
  }
}

/** Get unique gesture types from a mapping array */
function getGestureTypes(mappings: typeof ONE_HANDED_MAPPINGS): Set<GestureType> {
  return new Set(mappings.map((m) => m.gesture))
}

// ─── ONE_HANDED_MAPPINGS Structure Tests ────────────────────────────

describe('ONE_HANDED_MAPPINGS', () => {
  it('should not include TwoHandPinch', () => {
    const types = getGestureTypes(ONE_HANDED_MAPPINGS)
    expect(types.has(GestureType.TwoHandPinch)).toBe(false)
  })

  it('should include all single-hand gesture types', () => {
    const types = getGestureTypes(ONE_HANDED_MAPPINGS)
    expect(types.has(GestureType.Pinch)).toBe(true)
    expect(types.has(GestureType.Point)).toBe(true)
    expect(types.has(GestureType.OpenPalm)).toBe(true)
    expect(types.has(GestureType.Twist)).toBe(true)
    expect(types.has(GestureType.Fist)).toBe(true)
    expect(types.has(GestureType.LShape)).toBe(true)
    expect(types.has(GestureType.FlatDrag)).toBe(true)
  })

  it('should map Fist to zoom (builtin)', () => {
    const fistMappings = ONE_HANDED_MAPPINGS.filter(
      (m) => m.gesture === GestureType.Fist
    )
    expect(fistMappings.length).toBeGreaterThan(0)
    for (const mapping of fistMappings) {
      expect(mapping.action.target).toBe('builtin')
      if (mapping.action.target === 'builtin') {
        expect(mapping.action.action).toBe('zoom')
        expect(mapping.action.params?.direction).toBe(1) // zoom in
      }
    }
  })

  it('should map LShape to zoom (builtin) with negative direction', () => {
    const lShapeMappings = ONE_HANDED_MAPPINGS.filter(
      (m) => m.gesture === GestureType.LShape
    )
    expect(lShapeMappings.length).toBeGreaterThan(0)
    for (const mapping of lShapeMappings) {
      expect(mapping.action.target).toBe('builtin')
      if (mapping.action.target === 'builtin') {
        expect(mapping.action.action).toBe('zoom')
        expect(mapping.action.params?.direction).toBe(-1) // zoom out
      }
    }
  })

  it('should map Fist hold for continuous zoom', () => {
    const fistHold = ONE_HANDED_MAPPINGS.find(
      (m) => m.gesture === GestureType.Fist && m.phase === GesturePhase.Hold
    )
    expect(fistHold).toBeDefined()
    expect(fistHold!.action.target).toBe('builtin')
    if (fistHold!.action.target === 'builtin') {
      expect(fistHold!.action.action).toBe('zoom')
    }
  })

  it('should map Pinch to click (same as default)', () => {
    const pinchOnset = ONE_HANDED_MAPPINGS.find(
      (m) => m.gesture === GestureType.Pinch && m.phase === GesturePhase.Onset
    )
    expect(pinchOnset).toBeDefined()
    expect(pinchOnset!.action.target).toBe('mouse')
    if (pinchOnset!.action.target === 'mouse') {
      expect(pinchOnset!.action.action).toBe('click')
    }
  })

  it('should map Point to mouse move (same as default)', () => {
    const pointOnset = ONE_HANDED_MAPPINGS.find(
      (m) => m.gesture === GestureType.Point && m.phase === GesturePhase.Onset
    )
    expect(pointOnset).toBeDefined()
    expect(pointOnset!.action.target).toBe('mouse')
    if (pointOnset!.action.target === 'mouse') {
      expect(pointOnset!.action.action).toBe('move')
    }
  })

  it('should map OpenPalm to pan (not deselect)', () => {
    const palmOnset = ONE_HANDED_MAPPINGS.find(
      (m) => m.gesture === GestureType.OpenPalm && m.phase === GesturePhase.Onset
    )
    expect(palmOnset).toBeDefined()
    expect(palmOnset!.action.target).toBe('builtin')
    if (palmOnset!.action.target === 'builtin') {
      expect(palmOnset!.action.action).toBe('pan')
    }
  })

  it('should map Twist to rotate', () => {
    const twistHold = ONE_HANDED_MAPPINGS.find(
      (m) => m.gesture === GestureType.Twist && m.phase === GesturePhase.Hold
    )
    expect(twistHold).toBeDefined()
    expect(twistHold!.action.target).toBe('builtin')
    if (twistHold!.action.target === 'builtin') {
      expect(twistHold!.action.action).toBe('rotate')
    }
  })

  it('should map FlatDrag to scroll', () => {
    const flatDragHold = ONE_HANDED_MAPPINGS.find(
      (m) => m.gesture === GestureType.FlatDrag && m.phase === GesturePhase.Hold
    )
    expect(flatDragHold).toBeDefined()
    expect(flatDragHold!.action.target).toBe('mouse')
    if (flatDragHold!.action.target === 'mouse') {
      expect(flatDragHold!.action.action).toBe('scroll')
    }
  })

  it('should have valid command targets for all mappings', () => {
    for (const mapping of ONE_HANDED_MAPPINGS) {
      expect(['mouse', 'keyboard', 'builtin', 'program']).toContain(mapping.action.target)
    }
  })

  it('should cover essential actions: move, click, pan, rotate, zoom, scroll', () => {
    const actions = new Set<string>()
    for (const mapping of ONE_HANDED_MAPPINGS) {
      actions.add(mapping.action.action)
    }
    expect(actions.has('move')).toBe(true)      // cursor movement
    expect(actions.has('click')).toBe(true)      // selection
    expect(actions.has('pan')).toBe(true)        // panning
    expect(actions.has('rotate')).toBe(true)     // rotation
    expect(actions.has('zoom')).toBe(true)       // zoom in/out
    expect(actions.has('scroll')).toBe(true)     // scrolling
  })
})

// ─── getOneHandedMappings Tests ─────────────────────────────────────

describe('getOneHandedMappings', () => {
  it('should return the ONE_HANDED_MAPPINGS array', () => {
    const mappings = getOneHandedMappings()
    expect(mappings).toBe(ONE_HANDED_MAPPINGS)
  })

  it('should return a non-empty array', () => {
    const mappings = getOneHandedMappings()
    expect(mappings.length).toBeGreaterThan(0)
  })
})

// ─── Dispatcher Integration Tests ──────────────────────────────────

describe('Dispatcher one-handed mode integration', () => {
  const baseContext: DispatchContext = {
    viewMode: 'graph',
    selectedNodeId: null,
    selectedClusterId: null,
    oneHandedMode: false
  }

  const oneHandedContext: DispatchContext = {
    ...baseContext,
    oneHandedMode: true
  }

  describe('graph view', () => {
    it('should map Fist to zoom in when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.Fist, GesturePhase.Onset)
      const action = dispatchGesture(gesture, oneHandedContext)
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(1)
    })

    it('should map Fist hold to zoom in (continuous) when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.Fist, GesturePhase.Hold)
      const action = dispatchGesture(gesture, oneHandedContext)
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(1)
    })

    it('should map LShape to zoom out when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.LShape, GesturePhase.Onset)
      const action = dispatchGesture(gesture, oneHandedContext)
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(-1)
    })

    it('should map OpenPalm to pan when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.OpenPalm, GesturePhase.Onset)
      const action = dispatchGesture(gesture, oneHandedContext)
      expect(action.type).toBe('pan')
    })

    it('should map OpenPalm to deselect when oneHandedMode is false', () => {
      const gesture = makeGestureEvent(GestureType.OpenPalm, GesturePhase.Onset)
      const action = dispatchGesture(gesture, baseContext)
      expect(action.type).toBe('deselect')
    })

    it('should map TwoHandPinch to noop when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.TwoHandPinch, GesturePhase.Hold, {
        data: { handDistance: 0.5 }
      })
      const action = dispatchGesture(gesture, oneHandedContext)
      expect(action.type).toBe('noop')
    })

    it('should map TwoHandPinch to zoom when oneHandedMode is false', () => {
      const gesture = makeGestureEvent(GestureType.TwoHandPinch, GesturePhase.Hold, {
        data: { handDistance: 0.5 }
      })
      const action = dispatchGesture(gesture, baseContext)
      expect(action.type).toBe('zoom')
    })

    it('should still map Pinch to select when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.Pinch, GesturePhase.Onset)
      const action = dispatchGesture(gesture, oneHandedContext)
      expect(action.type).toBe('select')
    })

    it('should still map Twist to rotate when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.Twist, GesturePhase.Hold, {
        data: { rotation: 0.5 }
      })
      const action = dispatchGesture(gesture, oneHandedContext)
      expect(action.type).toBe('rotate')
    })

    it('should still map FlatDrag to pan when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.FlatDrag, GesturePhase.Hold)
      const action = dispatchGesture(gesture, oneHandedContext)
      expect(action.type).toBe('pan')
    })
  })

  describe('manifold view', () => {
    const manifoldOneHanded: DispatchContext = {
      ...oneHandedContext,
      viewMode: 'manifold'
    }

    const manifoldDefault: DispatchContext = {
      ...baseContext,
      viewMode: 'manifold'
    }

    it('should map Fist to zoom in when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.Fist, GesturePhase.Hold)
      const action = dispatchGesture(gesture, manifoldOneHanded)
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(1)
    })

    it('should map LShape to zoom out when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.LShape, GesturePhase.Hold)
      const action = dispatchGesture(gesture, manifoldOneHanded)
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(-1)
    })

    it('should map OpenPalm to pan when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.OpenPalm, GesturePhase.Hold)
      const action = dispatchGesture(gesture, manifoldOneHanded)
      expect(action.type).toBe('pan')
    })

    it('should map OpenPalm to deselect when oneHandedMode is false', () => {
      const gesture = makeGestureEvent(GestureType.OpenPalm, GesturePhase.Onset)
      const action = dispatchGesture(gesture, manifoldDefault)
      expect(action.type).toBe('deselect')
    })

    it('should map TwoHandPinch to noop when oneHandedMode is true', () => {
      const gesture = makeGestureEvent(GestureType.TwoHandPinch, GesturePhase.Hold, {
        data: { handDistance: 0.5 }
      })
      const action = dispatchGesture(gesture, manifoldOneHanded)
      expect(action.type).toBe('noop')
    })
  })

  describe('split view', () => {
    const splitOneHanded: DispatchContext = {
      ...oneHandedContext,
      viewMode: 'split'
    }

    it('should apply one-handed mode in split view for left hand (graph)', () => {
      const gesture = makeGestureEvent(GestureType.Fist, GesturePhase.Onset, { hand: 'left' })
      const action = dispatchGesture(gesture, splitOneHanded)
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(1)
    })

    it('should apply one-handed mode in split view for right hand (manifold)', () => {
      const gesture = makeGestureEvent(GestureType.LShape, GesturePhase.Onset, { hand: 'right' })
      const action = dispatchGesture(gesture, splitOneHanded)
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(-1)
    })
  })

  describe('backward compatibility', () => {
    it('should work without oneHandedMode in context (defaults to off)', () => {
      const context: DispatchContext = {
        viewMode: 'graph',
        selectedNodeId: null,
        selectedClusterId: null
        // oneHandedMode not set
      }
      const gesture = makeGestureEvent(GestureType.Fist, GesturePhase.Onset)
      // Should fall through to default behavior (Fist onset → context_menu in graph mode)
      const action = dispatchGesture(gesture, context)
      expect(action.type).toBe('context_menu')
    })
  })
})

