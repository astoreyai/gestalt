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

  /** Initialize with a provided native API (for dependency injection / testing) */
  initWithNative(nativeApi: NativeKeyboardAPI): void {
    this.native = nativeApi
    this.native.create()
    this.initialized = true
  }

  /** Initialize the virtual keyboard device */
  async init(): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const addon = globalThis.require?.('../../native/build/Release/tracking_input.node')
      if (addon?.keyboard) {
        this.native = addon.keyboard as NativeKeyboardAPI
        this.native.create()
      }
      this.initialized = true
    } catch {
      console.warn('[VirtualKeyboard] Native addon not available, running in stub mode')
      this.initialized = true // Stub mode
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

  /** Get current state */
  getState(): { initialized: boolean } {
    return { initialized: this.initialized }
  }

  /** Destroy the virtual keyboard device */
  destroy(): void {
    this.native?.destroy()
    this.native = null
    this.initialized = false
  }
}
