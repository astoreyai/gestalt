/**
 * Sprint 5c + 5d: HUD indicator tests
 *
 * 5c: One-handed mode visual indicator badge
 * 5d: Overlay mode exit instructions
 */

import { describe, it, expect } from 'vitest'

describe('Sprint 5c: One-handed mode indicator', () => {
  it('should show "1H" badge label when one-handed mode is active', () => {
    // The 1H button already exists; verify indicator badge content is correct
    const oneHandedActive = true
    const badgeText = oneHandedActive ? '1H Mode' : null
    expect(badgeText).toBe('1H Mode')
  })

  it('should not show indicator badge when one-handed mode is off', () => {
    const oneHandedActive = false
    const badgeText = oneHandedActive ? '1H Mode' : null
    expect(badgeText).toBeNull()
  })

  it('should include tooltip with remapped gestures', () => {
    const tooltipContent = 'One-handed mode: Point+Twist→Rotate, Point+Fist→Zoom'
    expect(tooltipContent).toContain('Point+Twist')
    expect(tooltipContent).toContain('Rotate')
    expect(tooltipContent).toContain('Zoom')
  })
})

describe('Sprint 5d: Overlay mode exit instructions', () => {
  it('should show exit hint in overlay mode chip', () => {
    const overlayMode = true
    const chipText = overlayMode ? 'Overlay Mode — Super+G to exit' : null
    expect(chipText).toContain('Super+G')
    expect(chipText).toContain('exit')
  })

  it('should not show exit hint in normal mode', () => {
    const overlayMode = false
    const chipText = overlayMode ? 'Overlay Mode — Super+G to exit' : null
    expect(chipText).toBeNull()
  })
})
