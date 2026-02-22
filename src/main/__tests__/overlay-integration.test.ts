/**
 * @vitest-environment node
 *
 * Overlay integration tests.
 * Verifies overlay toggle, gesture routing, and mode synchronization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Electron modules before importing
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    }),
    getDisplayMatching: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1080 }
    })
  },
  globalShortcut: {
    register: vi.fn(() => true),
    unregister: vi.fn()
  }
}))

import { createOverlayManager, getAlwaysOnTopLevel } from '../overlay'

function createMockWindow() {
  return {
    getBounds: vi.fn(() => ({ x: 100, y: 100, width: 800, height: 600 })),
    setBounds: vi.fn(),
    isMaximized: vi.fn(() => false),
    unmaximize: vi.fn(),
    maximize: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setIgnoreMouseEvents: vi.fn(),
    setSkipTaskbar: vi.fn(),
    setResizable: vi.fn(),
    webContents: {
      send: vi.fn()
    }
  } as any
}

describe('OverlayManager', () => {
  let manager: ReturnType<typeof createOverlayManager>
  let win: ReturnType<typeof createMockWindow>

  beforeEach(() => {
    manager = createOverlayManager()
    win = createMockWindow()
  })

  it('should start inactive', () => {
    expect(manager.isActive()).toBe(false)
  })

  it('should toggle overlay on', () => {
    manager.init(win, 'Super+G')
    manager.toggle()
    expect(manager.isActive()).toBe(true)
  })

  it('should toggle overlay off', () => {
    manager.init(win, 'Super+G')
    manager.toggle() // on
    manager.toggle() // off
    expect(manager.isActive()).toBe(false)
  })

  it('should send OVERLAY_CHANGED IPC on enter', () => {
    manager.init(win, 'Super+G')
    manager.toggle()
    expect(win.webContents.send).toHaveBeenCalledWith('overlay:changed', true)
  })

  it('should send OVERLAY_CHANGED IPC on exit', () => {
    manager.init(win, 'Super+G')
    manager.toggle() // enter
    manager.toggle() // exit
    expect(win.webContents.send).toHaveBeenCalledWith('overlay:changed', false)
  })

  it('should set always-on-top when entering overlay', () => {
    manager.init(win, 'Super+G')
    manager.toggle()
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true, expect.any(String))
  })

  it('should clear always-on-top when exiting overlay', () => {
    manager.init(win, 'Super+G')
    manager.toggle()
    manager.toggle()
    expect(win.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
  })

  it('should enable click-through on enter', () => {
    manager.init(win, 'Super+G')
    manager.toggle()
    expect(win.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
  })

  it('should disable click-through on exit', () => {
    manager.init(win, 'Super+G')
    manager.toggle()
    manager.toggle()
    expect(win.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
  })

  it('should save and restore window bounds', () => {
    const originalBounds = { x: 100, y: 100, width: 800, height: 600 }
    win.getBounds.mockReturnValue(originalBounds)
    manager.init(win, 'Super+G')

    manager.toggle() // enter — expands to display
    expect(win.setBounds).toHaveBeenCalled()

    manager.toggle() // exit — restores
    expect(win.setBounds).toHaveBeenLastCalledWith(originalBounds)
  })

  it('should handle destroy', () => {
    manager.init(win, 'Super+G')
    manager.toggle()
    manager.destroy()
    expect(manager.isActive()).toBe(false)
  })
})

describe('getAlwaysOnTopLevel', () => {
  it('should return screen-saver for X11', () => {
    expect(getAlwaysOnTopLevel('x11')).toBe('screen-saver')
  })

  it('should return floating for Wayland', () => {
    expect(getAlwaysOnTopLevel('wayland')).toBe('floating')
  })

  it('should return floating for unknown', () => {
    expect(getAlwaysOnTopLevel('unknown')).toBe('floating')
  })
})
