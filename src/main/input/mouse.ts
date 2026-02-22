/**
 * Virtual mouse controller wrapping the native uinput addon.
 * Provides high-level mouse operations from gesture data.
 */

import type { MouseCommand } from '@shared/protocol'

/** Interface matching the native addon's mouse API */
interface NativeMouseAPI {
  create(): boolean
  move(dx: number, dy: number): void
  click(button?: 'left' | 'right' | 'middle'): void
  scroll(amount: number): void
  destroy(): void
}

export class VirtualMouse {
  private native: NativeMouseAPI | null = null
  private initialized = false
  private stubMode = false
  private lastX = 0
  private lastY = 0
  private dragging = false
  private speedMultiplier = 1.0

  constructor(private screenWidth = 1920, private screenHeight = 1080) {}

  /** Initialize with a provided native API (for dependency injection / testing) */
  initWithNative(nativeApi: NativeMouseAPI): void {
    if (this.initialized) return
    this.native = nativeApi
    this.native.create()
    this.initialized = true
  }

  /** Initialize the virtual mouse device */
  async init(): Promise<void> {
    if (this.initialized) return

    try {
      const addon = globalThis.require?.('../../native/build/Release/tracking_input.node')
      if (addon?.mouse) {
        this.native = addon.mouse as NativeMouseAPI
        this.native.create()
      } else {
        this.stubMode = true
        this.notifyStubMode('Native addon loaded but mouse API not found')
      }
      this.initialized = true
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[VirtualMouse] Native addon not available, running in stub mode: ${errorMsg}`)
      this.stubMode = true
      this.initialized = true
      this.notifyStubMode(errorMsg)
    }
  }

  /** Notify the renderer that mouse is running in stub mode */
  private notifyStubMode(reason: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BrowserWindow } = require('electron') as typeof import('electron')
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('input:stub-mode', { device: 'mouse', reason })
      }
    } catch {
      // Not in Electron context (tests) -- skip notification
    }
  }

  /** Set the mouse speed multiplier */
  setSpeed(speed: number): void {
    this.speedMultiplier = Math.max(0.1, Math.min(5.0, speed))
  }

  /** Process a mouse command from gesture input */
  execute(cmd: MouseCommand): void {
    if (!this.initialized) return

    switch (cmd.action) {
      case 'move':
        this.handleMove(cmd.x ?? 0, cmd.y ?? 0)
        break
      case 'click':
        this.handleClick(cmd.button ?? 'left')
        break
      case 'doubleclick':
        this.handleDoubleClick(cmd.button ?? 'left')
        break
      case 'drag_start':
        this.dragging = true
        break
      case 'drag_move':
        if (this.dragging) {
          this.handleMove(cmd.x ?? 0, cmd.y ?? 0)
        }
        break
      case 'drag_end':
        this.dragging = false
        break
      case 'scroll':
        this.handleScroll(cmd.deltaY ?? 0)
        break
    }
  }

  /** Move mouse by normalized position delta [0,1] to screen pixels */
  moveToNormalized(nx: number, ny: number): void {
    const targetX = nx * this.screenWidth
    const targetY = ny * this.screenHeight
    const dx = Math.round((targetX - this.lastX) * this.speedMultiplier)
    const dy = Math.round((targetY - this.lastY) * this.speedMultiplier)

    if (dx !== 0 || dy !== 0) {
      this.native?.move(dx, dy)
      this.lastX += dx
      this.lastY += dy
    }
  }

  private handleMove(x: number, y: number): void {
    const dx = Math.round(x * this.speedMultiplier)
    const dy = Math.round(y * this.speedMultiplier)
    if (dx !== 0 || dy !== 0) {
      this.native?.move(dx, dy)
      this.lastX += dx
      this.lastY += dy
    }
  }

  private handleClick(button: 'left' | 'right' | 'middle'): void {
    this.native?.click(button)
  }

  private handleDoubleClick(button: 'left' | 'right' | 'middle'): void {
    this.native?.click(button)
    setTimeout(() => this.native?.click(button), 50)
  }

  private handleScroll(deltaY: number): void {
    const amount = Math.round(deltaY * this.speedMultiplier)
    if (amount !== 0) {
      this.native?.scroll(amount)
    }
  }

  /** Update screen resolution at runtime */
  updateResolution(width: number, height: number): void {
    this.screenWidth = width
    this.screenHeight = height
  }

  /** Whether running in stub mode (native addon unavailable) */
  isStubMode(): boolean {
    return this.stubMode
  }

  /** Get current state */
  getState(): {
    initialized: boolean
    stubMode: boolean
    dragging: boolean
    position: { x: number; y: number }
    resolution: { width: number; height: number }
  } {
    return {
      initialized: this.initialized,
      stubMode: this.stubMode,
      dragging: this.dragging,
      position: { x: this.lastX, y: this.lastY },
      resolution: { width: this.screenWidth, height: this.screenHeight }
    }
  }

  /** Destroy the virtual mouse device */
  destroy(): void {
    this.native?.destroy()
    this.native = null
    this.initialized = false
    this.stubMode = false
  }
}
