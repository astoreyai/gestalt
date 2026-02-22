/**
 * Sprint 5b: Contextual gesture badge tests
 *
 * Verifies that getContextualGestureLabel returns action-based labels
 * (e.g., "Select Node" instead of "Pinch") depending on viewMode and hover target.
 */

import { describe, it, expect } from 'vitest'
import { getContextualGestureLabel } from '../gesture-labels'
import { GestureType, GesturePhase } from '@shared/protocol'

describe('Sprint 5b: Contextual gesture labels', () => {
  it('Pinch over node → "Select"', () => {
    const label = getContextualGestureLabel(GestureType.Pinch, GesturePhase.Onset, 'graph', 'node')
    expect(label).toBe('Select')
  })

  it('Pinch in empty space → "Grab"', () => {
    const label = getContextualGestureLabel(GestureType.Pinch, GesturePhase.Hold, 'graph', null)
    expect(label).toBe('Grab')
  })

  it('Point → "Navigate"', () => {
    const label = getContextualGestureLabel(GestureType.Point, GesturePhase.Hold, 'graph', null)
    expect(label).toBe('Navigate')
  })

  it('Point over node → "Inspect"', () => {
    const label = getContextualGestureLabel(GestureType.Point, GesturePhase.Hold, 'graph', 'node')
    expect(label).toBe('Inspect')
  })

  it('FlatDrag → "Pan"', () => {
    const label = getContextualGestureLabel(GestureType.FlatDrag, GesturePhase.Hold, 'graph', null)
    expect(label).toBe('Pan')
  })

  it('Twist → "Rotate"', () => {
    const label = getContextualGestureLabel(GestureType.Twist, GesturePhase.Hold, 'graph', null)
    expect(label).toBe('Rotate')
  })

  it('Fist → "Cancel"', () => {
    const label = getContextualGestureLabel(GestureType.Fist, GesturePhase.Onset, 'graph', null)
    expect(label).toBe('Cancel')
  })

  it('OpenPalm → "Release"', () => {
    const label = getContextualGestureLabel(GestureType.OpenPalm, GesturePhase.Onset, 'graph', null)
    expect(label).toBe('Release')
  })

  it('Pinch over point in manifold → "Select"', () => {
    const label = getContextualGestureLabel(GestureType.Pinch, GesturePhase.Onset, 'manifold', 'point')
    expect(label).toBe('Select')
  })

  it('TwoHandPinch → "Zoom"', () => {
    const label = getContextualGestureLabel(GestureType.TwoHandPinch, GesturePhase.Hold, 'graph', null)
    expect(label).toBe('Zoom')
  })

  it('falls back to gesture display name for unmapped combos', () => {
    const label = getContextualGestureLabel(GestureType.LShape, GesturePhase.Hold, 'graph', null)
    expect(typeof label).toBe('string')
    expect(label.length).toBeGreaterThan(0)
  })
})
