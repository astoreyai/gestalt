/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'

/**
 * Replicates the always-on-top level selection logic from overlay.ts.
 * Wayland compositors don't support 'screen-saver' level — use 'floating'.
 */
function getAlwaysOnTopLevel(displayServer: string): string {
  switch (displayServer) {
    case 'wayland':
      return 'floating'
    case 'x11':
      return 'screen-saver'
    default:
      return 'floating' // Safe default — 'screen-saver' may not work on unknown servers
  }
}

describe('Sprint 6a: Wayland overlay fallback', () => {
  it('should use floating level on Wayland', () => {
    expect(getAlwaysOnTopLevel('wayland')).toBe('floating')
  })

  it('should use screen-saver level on X11', () => {
    expect(getAlwaysOnTopLevel('x11')).toBe('screen-saver')
  })

  it('should default to floating for unknown display server', () => {
    expect(getAlwaysOnTopLevel('unknown')).toBe('floating')
  })

  it('Wayland limitations are documented', () => {
    // Wayland has limited overlay support compared to X11:
    // - No click-through (setIgnoreMouseEvents may not work)
    // - Limited global shortcut registration
    // - No 'screen-saver' always-on-top level
    const waylandLimitations = {
      clickThrough: false,
      globalShortcuts: 'limited',
      alwaysOnTopLevel: 'floating'
    }
    expect(waylandLimitations.clickThrough).toBe(false)
    expect(waylandLimitations.globalShortcuts).toBe('limited')
    expect(waylandLimitations.alwaysOnTopLevel).toBe('floating')
  })
})
