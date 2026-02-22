/**
 * Sprint 5f: Gesture guide icon tests
 *
 * Verifies that gesture guide entries include SVG hand pose icons
 * that match the gesture type.
 */

import { describe, it, expect } from 'vitest'
import { getGestureIcon, GESTURE_ICON_MAP } from '../gesture-icons'

describe('Sprint 5f: Gesture guide icons', () => {
  it('should have icons for all single-hand gestures', () => {
    const gestures = ['Pinch', 'Point', 'OpenPalm', 'Fist', 'LShape', 'FlatDrag', 'Twist']
    for (const g of gestures) {
      expect(getGestureIcon(g)).toBeTruthy()
    }
  })

  it('should return an SVG string for each gesture', () => {
    const svg = getGestureIcon('Pinch')
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
  })

  it('should return distinct icons for different gestures', () => {
    const pinch = getGestureIcon('Pinch')
    const point = getGestureIcon('Point')
    const fist = getGestureIcon('Fist')
    expect(pinch).not.toBe(point)
    expect(point).not.toBe(fist)
  })

  it('should return a fallback icon for unknown gestures', () => {
    const icon = getGestureIcon('UnknownGesture')
    expect(icon).toBeTruthy()
    expect(icon).toContain('<svg')
  })

  it('should have consistent dimensions', () => {
    for (const key of Object.keys(GESTURE_ICON_MAP)) {
      const svg = getGestureIcon(key)
      expect(svg).toContain('width="24"')
      expect(svg).toContain('height="24"')
    }
  })
})
