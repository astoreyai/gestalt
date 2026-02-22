/**
 * Virtual keyboard controller wrapping the native uinput addon.
 * Provides high-level keyboard operations from gesture data.
 */

import type { KeyboardCommand } from '@shared/protocol'

/** Interface matching the native addon's keyboard API */
interface NativeKeyboardAPI {
  create(): boolean
  pressKey(key: string): void
  keyCombo(keys: string[]): void
  destroy(): void
}

export class VirtualKeyboard {
  private native: NativeKeyboardAPI | null = null
  private initialized = false
  private stubMode = false

  /** Initialize with a provided native API (for dependency injection / testing) */
  initWithNative(nativeApi: NativeKeyboardAPI): void {
    // Destroy previous device to prevent FD leak on re-initialization
    if (this.native && this.initialized) {
      this.native.destroy()
    }
    this.native = nativeApi
    this.native.create()
    this.initialized = true
  }

  /** Initialize the virtual keyboard device */
  async init(): Promise<void> {
    // Destroy previous device to prevent FD leak on re-initialization
    if (this.native && this.initialized) {
      this.native.destroy()
      this.native = null
      this.initialized = false
    }

    try {
      const addon = globalThis.require?.('../../native/build/Release/tracking_input.node')
      if (addon?.keyboard) {
        this.native = addon.keyboard as NativeKeyboardAPI
        this.native.create()
      } else {
        this.stubMode = true
        this.notifyStubMode('Native addon loaded but keyboard API not found')
      }
      this.initialized = true
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[VirtualKeyboard] Native addon not available, running in stub mode: ${errorMsg}`)
      this.stubMode = true
      this.initialized = true
      this.notifyStubMode(errorMsg)
    }
  }

  /** Notify the renderer that keyboard is running in stub mode */
  private notifyStubMode(reason: string): void {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { BrowserWindow } = require('electron') as typeof import('electron')
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('input:stub-mode', { device: 'keyboard', reason })
      }
    } catch {
      // Not in Electron context (tests) -- skip notification
    }
  }

  /** Process a keyboard command */
  execute(cmd: KeyboardCommand): void {
    if (!this.initialized) return

    switch (cmd.action) {
      case 'press':
        if (cmd.key) {
          this.native?.pressKey(cmd.key)
        }
        break
      case 'release':
        // uinput handles press+release atomically in pressKey
        break
      case 'combo':
        if (cmd.keys && cmd.keys.length > 0) {
          this.native?.keyCombo(cmd.keys)
        }
        break
    }
  }

  /** Whether running in stub mode (native addon unavailable) */
  isStubMode(): boolean {
    return this.stubMode
  }

  /** Get current state */
  getState(): { initialized: boolean; stubMode: boolean } {
    return { initialized: this.initialized, stubMode: this.stubMode }
  }

  /** Destroy the virtual keyboard device */
  destroy(): void {
    this.native?.destroy()
    this.native = null
    this.initialized = false
    this.stubMode = false
  }
}
