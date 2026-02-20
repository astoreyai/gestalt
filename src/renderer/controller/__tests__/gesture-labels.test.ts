import { describe, it, expect } from 'vitest'
import { getGestureDisplayName, getPhaseDisplayName, getGestureActionLabel } from '../gesture-labels'
import { GestureType, GesturePhase } from '@shared/protocol'

describe('Gesture Display Labels', () => {
  it('should map all gesture types to readable names', () => {
    expect(getGestureDisplayName(GestureType.Pinch)).toBe('Pinch')
    expect(getGestureDisplayName(GestureType.Point)).toBe('Point')
    expect(getGestureDisplayName(GestureType.OpenPalm)).toBe('Open Palm')
    expect(getGestureDisplayName(GestureType.Twist)).toBe('Twist')
    expect(getGestureDisplayName(GestureType.TwoHandPinch)).toBe('Two-Hand Pinch')
    expect(getGestureDisplayName(GestureType.FlatDrag)).toBe('Flat Drag')
    expect(getGestureDisplayName(GestureType.Fist)).toBe('Fist')
    expect(getGestureDisplayName(GestureType.LShape)).toBe('L-Shape')
  })

  it('should map all phases to readable names', () => {
    expect(getPhaseDisplayName(GesturePhase.Onset)).toBe('Started')
    expect(getPhaseDisplayName(GesturePhase.Hold)).toBe('Holding')
    expect(getPhaseDisplayName(GesturePhase.Release)).toBe('Released')
  })

  it('should map gesture+phase combinations to action descriptions', () => {
    expect(getGestureActionLabel(GestureType.Pinch, GesturePhase.Onset)).toBe('Selecting')
    expect(getGestureActionLabel(GestureType.Pinch, GesturePhase.Hold)).toBe('Dragging')
    expect(getGestureActionLabel(GestureType.Point, GesturePhase.Hold)).toBe('Pointing')
    expect(getGestureActionLabel(GestureType.OpenPalm, GesturePhase.Onset)).toBe('Releasing')
    expect(getGestureActionLabel(GestureType.FlatDrag, GesturePhase.Hold)).toBe('Panning')
    expect(getGestureActionLabel(GestureType.Twist, GesturePhase.Hold)).toBe('Rotating')
    expect(getGestureActionLabel(GestureType.TwoHandPinch, GesturePhase.Hold)).toBe('Zooming')
    expect(getGestureActionLabel(GestureType.Fist, GesturePhase.Onset)).toBe('Cancelling')
    expect(getGestureActionLabel(GestureType.LShape, GesturePhase.Onset)).toBe('Shortcut')
  })

  it('should return fallback for unknown combinations', () => {
    const label = getGestureActionLabel(GestureType.Fist, GesturePhase.Hold)
    expect(typeof label).toBe('string')
    expect(label.length).toBeGreaterThan(0)
  })
})
