/**
 * OverlayManager — Controls transparent always-on-top overlay mode.
 * Uses the primary display for overlay (avoids white-screen artifacts on
 * heterogeneous multi-monitor setups where a single window spanning all
 * displays creates non-rendered regions).
 */

import { BrowserWindow, screen, globalShortcut } from 'electron'
import { IPC } from '@shared/ipc-channels'
import { detectDisplayServer, type DisplayServer } from './platform'

interface SavedBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface OverlayManager {
  init(win: BrowserWindow, hotkey: string): void
  toggle(): boolean
  isActive(): boolean
  setHotkey(key: string): void
  destroy(): void
}

/**
 * Determine the appropriate always-on-top level for the current display server.
 *
 * - X11: 'screen-saver' level places the window above all other windows.
 * - Wayland: 'screen-saver' is not supported by most compositors; use 'floating'.
 *   Wayland also has limited overlay support — click-through (setIgnoreMouseEvents)
 *   may not work reliably, and global shortcut registration is restricted.
 * - Unknown: default to 'floating' as a safe fallback.
 */
export function getAlwaysOnTopLevel(displayServer: DisplayServer): string {
  switch (displayServer) {
    case 'x11':
      return 'screen-saver'
    case 'wayland':
      return 'floating'
    default:
      return 'floating'
  }
}

export function createOverlayManager(): OverlayManager {
  let window: BrowserWindow | null = null
  let active = false
  let savedBounds: SavedBounds | null = null
  let savedMaximized = false
  let registeredHotkey: string | null = null
  const displayServer = detectDisplayServer()

  /**
   * Get the bounds of the display the window is currently on.
   * Falls back to primary display.
   */
  function getTargetDisplayBounds(): SavedBounds {
    if (window) {
      const winBounds = window.getBounds()
      const display = screen.getDisplayMatching(winBounds)
      return display.workArea
    }
    return screen.getPrimaryDisplay().workArea
  }

  function enterOverlay(): void {
    if (!window || active) return

    // Save current state for restoration
    savedMaximized = window.isMaximized()
    savedBounds = window.getBounds()

    // If maximized, unmaximize first so setBounds works
    if (savedMaximized) {
      window.unmaximize()
    }

    const displayBounds = getTargetDisplayBounds()

    const level = getAlwaysOnTopLevel(displayServer) as 'screen-saver' | 'floating'
    window.setAlwaysOnTop(true, level)
    window.setIgnoreMouseEvents(true, { forward: true })
    window.setSkipTaskbar(true)
    window.setResizable(false)
    window.setBounds({
      x: displayBounds.x,
      y: displayBounds.y,
      width: displayBounds.width,
      height: displayBounds.height
    })

    active = true
    window.webContents.send(IPC.OVERLAY_CHANGED, true)
  }

  function exitOverlay(): void {
    if (!window || !active) return

    window.setAlwaysOnTop(false)
    window.setIgnoreMouseEvents(false)
    window.setSkipTaskbar(false)
    window.setResizable(true)

    if (savedBounds) {
      window.setBounds(savedBounds)
      savedBounds = null
    }
    if (savedMaximized) {
      window.maximize()
      savedMaximized = false
    }

    active = false
    window.webContents.send(IPC.OVERLAY_CHANGED, false)
  }

  function toggle(): boolean {
    if (active) {
      exitOverlay()
    } else {
      enterOverlay()
    }
    return active
  }

  function registerHotkey(key: string): void {
    // Unregister previous
    if (registeredHotkey) {
      globalShortcut.unregister(registeredHotkey)
      registeredHotkey = null
    }

    try {
      const success = globalShortcut.register(key, () => {
        toggle()
      })
      if (success) {
        registeredHotkey = key
      } else {
        console.warn(`[Overlay] Failed to register hotkey: ${key}`)
      }
    } catch (err) {
      console.warn(`[Overlay] Hotkey registration error for ${key}:`, err instanceof Error ? err.message : String(err))
    }
  }

  return {
    init(win: BrowserWindow, hotkey: string): void {
      window = win
      registerHotkey(hotkey)
    },

    toggle,

    isActive(): boolean {
      return active
    },

    setHotkey(key: string): void {
      registerHotkey(key)
    },

    destroy(): void {
      if (registeredHotkey) {
        globalShortcut.unregister(registeredHotkey)
        registeredHotkey = null
      }
      window = null
      active = false
      savedBounds = null
    }
  }
}
