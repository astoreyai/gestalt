/**
 * IPC handlers for input commands from the renderer process.
 * Routes gesture events to the appropriate input handler (mouse, keyboard, bus).
 */

import { ipcMain } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type { GestureEvent, MouseCommand, KeyboardCommand } from '@shared/protocol'
import { VirtualMouse } from './mouse'
import { VirtualKeyboard } from './keyboard'
import { MacroEngine } from './macros'

export class InputIpcHandler {
  private mouse: VirtualMouse
  private keyboard: VirtualKeyboard
  private macros: MacroEngine
  private enabled = true

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
    console.log('[InputIPC] Initialized — mouse, keyboard, macros ready')
  }

  private registerHandlers(): void {
    // Direct mouse commands from renderer
    ipcMain.on(IPC.MOUSE_COMMAND, (_event, cmd: MouseCommand) => {
      if (!this.enabled) return
      this.mouse.execute(cmd)
    })

    // Direct keyboard commands from renderer
    ipcMain.on(IPC.KEYBOARD_COMMAND, (_event, cmd: KeyboardCommand) => {
      if (!this.enabled) return
      this.keyboard.execute(cmd)
    })

    // Gesture events → check for macros, then route to mouse/keyboard
    ipcMain.on(IPC.GESTURE_EVENT, (_event, gesture: GestureEvent) => {
      if (!this.enabled) return
      this.handleGesture(gesture)
    })
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

  /** Cleanup all input devices */
  destroy(): void {
    this.mouse.destroy()
    this.keyboard.destroy()
    this.macros.clear()
    ipcMain.removeAllListeners(IPC.MOUSE_COMMAND)
    ipcMain.removeAllListeners(IPC.KEYBOARD_COMMAND)
  }
}
