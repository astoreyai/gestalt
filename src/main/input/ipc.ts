/**
 * IPC handlers for input commands from the renderer process.
 * Routes gesture events to the appropriate input handler (mouse, keyboard, bus).
 */

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { GestureEvent, MouseCommand, KeyboardCommand } from '@shared/protocol'
import { MouseCommandSchema, KeyboardCommandSchema, GestureEventSchema } from '../ipc-validators'
import { VirtualMouse } from './mouse'
import { VirtualKeyboard } from './keyboard'
import { MacroEngine } from './macros'

export class InputIpcHandler {
  private mouse: VirtualMouse
  private keyboard: VirtualKeyboard
  private macros: MacroEngine
  private enabled = true

  // Stored handler references for proper cleanup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _mouseHandler: ((...args: any[]) => void) | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _keyboardHandler: ((...args: any[]) => void) | null = null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _gestureHandler: ((...args: any[]) => void) | null = null

  constructor() {
    this.mouse = new VirtualMouse()
    this.keyboard = new VirtualKeyboard()
    this.macros = new MacroEngine()
  }

  /** Initialize all input devices and register IPC handlers */
  async init(): Promise<void> {
    await Promise.all([
      this.mouse.init(),
      this.keyboard.init(),
      this.macros.loadDefaults()
    ])

    this.registerHandlers()
  }

  private registerHandlers(): void {
    // Direct mouse commands from renderer
    this._mouseHandler = (_event: unknown, cmd: MouseCommand) => {
      if (!this.enabled) return
      const parsed = MouseCommandSchema.safeParse(cmd)
      if (!parsed.success) {
        console.warn('[Input] Invalid MouseCommand, dropping:', parsed.error.message)
        return
      }
      this.mouse.execute(parsed.data as MouseCommand)
    }
    ipcMain.on(IPC.MOUSE_COMMAND, this._mouseHandler)

    // Direct keyboard commands from renderer
    this._keyboardHandler = (_event: unknown, cmd: KeyboardCommand) => {
      if (!this.enabled) return
      const parsed = KeyboardCommandSchema.safeParse(cmd)
      if (!parsed.success) {
        console.warn('[Input] Invalid KeyboardCommand, dropping:', parsed.error.message)
        return
      }
      this.keyboard.execute(parsed.data as KeyboardCommand)
    }
    ipcMain.on(IPC.KEYBOARD_COMMAND, this._keyboardHandler)

    // Gesture events → check for macros, then route to mouse/keyboard
    this._gestureHandler = (_event: unknown, gesture: GestureEvent) => {
      if (!this.enabled) return
      const parsed = GestureEventSchema.safeParse(gesture)
      if (!parsed.success) {
        console.warn('[Input] Invalid GestureEvent, dropping:', parsed.error.message)
        return
      }
      this.handleGesture(parsed.data as GestureEvent)
    }
    ipcMain.on(IPC.GESTURE_EVENT, this._gestureHandler)
  }

  /** Route a gesture event to the appropriate handler */
  handleGesture(gesture: GestureEvent): void {
    // Check for keyboard macro first
    const macro = this.macros.getMacro(gesture.type)
    if (macro && gesture.phase === 'onset') {
      this.keyboard.execute(macro)
      return
    }

    // Default gesture → mouse mapping is handled by the scene controller
    // in the renderer. This only handles OS-level input forwarding.
  }

  /** Enable/disable input forwarding */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled
  }

  /** Get status of all input devices */
  getStatus(): {
    enabled: boolean
    mouse: ReturnType<VirtualMouse['getState']>
    keyboard: ReturnType<VirtualKeyboard['getState']>
    macros: ReturnType<MacroEngine['listMacros']>
  } {
    return {
      enabled: this.enabled,
      mouse: this.mouse.getState(),
      keyboard: this.keyboard.getState(),
      macros: this.macros.listMacros()
    }
  }

  /** Cleanup all input devices and remove IPC listeners */
  destroy(): void {
    this.mouse.destroy()
    this.keyboard.destroy()
    this.macros.clear()

    if (this._mouseHandler) {
      ipcMain.removeListener(IPC.MOUSE_COMMAND, this._mouseHandler)
      this._mouseHandler = null
    }
    if (this._keyboardHandler) {
      ipcMain.removeListener(IPC.KEYBOARD_COMMAND, this._keyboardHandler)
      this._keyboardHandler = null
    }
    if (this._gestureHandler) {
      ipcMain.removeListener(IPC.GESTURE_EVENT, this._gestureHandler)
      this._gestureHandler = null
    }
  }
}
