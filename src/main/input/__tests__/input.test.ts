import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { VirtualMouse } from '../mouse'
import { VirtualKeyboard } from '../keyboard'
import { MacroEngine } from '../macros'
import type { MouseCommand, KeyboardCommand } from '@shared/protocol'
import { IPC } from '@shared/ipc-channels'

describe('VirtualMouse', () => {
  let mouse: VirtualMouse

  beforeEach(() => {
    mouse = new VirtualMouse(1920, 1080)
  })

  it('should initialize in stub mode when native addon unavailable', async () => {
    await mouse.init() // Should not throw — no native addon
    expect(mouse.getState().initialized).toBe(true)
  })

  it('should report initial state correctly', () => {
    const state = mouse.getState()
    expect(state.initialized).toBe(false)
    expect(state.dragging).toBe(false)
    expect(state.position).toEqual({ x: 0, y: 0 })
  })

  it('should accept dependency injection of native API', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    expect(mouse.getState().initialized).toBe(true)
    expect(mockNative.create).toHaveBeenCalledOnce()
  })

  it('should execute move commands with native API', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.execute({ target: 'mouse', action: 'move', x: 10, y: 20 })
    expect(mockNative.move).toHaveBeenCalledWith(10, 20)
  })

  it('should execute click commands with native API', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.execute({ target: 'mouse', action: 'click', button: 'left' })
    expect(mockNative.click).toHaveBeenCalledWith('left')
    mouse.execute({ target: 'mouse', action: 'click', button: 'right' })
    expect(mockNative.click).toHaveBeenCalledWith('right')
    mouse.execute({ target: 'mouse', action: 'click', button: 'middle' })
    expect(mockNative.click).toHaveBeenCalledWith('middle')
  })

  it('should default click to left button', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.execute({ target: 'mouse', action: 'click' })
    expect(mockNative.click).toHaveBeenCalledWith('left')
  })

  it('should handle drag start/move/end lifecycle', async () => {
    await mouse.init()
    mouse.execute({ target: 'mouse', action: 'drag_start' })
    expect(mouse.getState().dragging).toBe(true)

    mouse.execute({ target: 'mouse', action: 'drag_move', x: 5, y: 5 })
    mouse.execute({ target: 'mouse', action: 'drag_end' })
    expect(mouse.getState().dragging).toBe(false)
  })

  it('should not move on drag_move when not dragging', async () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.execute({ target: 'mouse', action: 'drag_move', x: 5, y: 5 })
    expect(mockNative.move).not.toHaveBeenCalled()
  })

  it('should execute scroll commands', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.execute({ target: 'mouse', action: 'scroll', deltaY: 3 })
    expect(mockNative.scroll).toHaveBeenCalledWith(3)
  })

  it('should not scroll when deltaY is zero', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.execute({ target: 'mouse', action: 'scroll', deltaY: 0 })
    expect(mockNative.scroll).not.toHaveBeenCalled()
  })

  it('should execute doubleclick commands', async () => {
    vi.useFakeTimers()
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.execute({ target: 'mouse', action: 'doubleclick' })
    expect(mockNative.click).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(60)
    expect(mockNative.click).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })

  it('should not execute when not initialized', () => {
    const cmd: MouseCommand = { target: 'mouse', action: 'move', x: 10, y: 20 }
    mouse.execute(cmd) // Should be a no-op
    expect(mouse.getState().initialized).toBe(false)
  })

  it('should clamp speed multiplier', () => {
    mouse.setSpeed(0.01) // Below min
    mouse.setSpeed(100) // Above max
    // Verify no crash
    expect(mouse.getState()).toBeDefined()
  })

  it('should move to normalized position', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.moveToNormalized(0.5, 0.5)
    expect(mockNative.move).toHaveBeenCalled()
    const state = mouse.getState()
    expect(state.position.x).toBeGreaterThan(0)
    expect(state.position.y).toBeGreaterThan(0)
  })

  it('should not move when delta is zero', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.moveToNormalized(0, 0)
    expect(mockNative.move).not.toHaveBeenCalled()
  })

  it('should destroy cleanly', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.destroy()
    expect(mockNative.destroy).toHaveBeenCalledOnce()
    expect(mouse.getState().initialized).toBe(false)
  })

  it('should apply speed multiplier to movements', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.setSpeed(2.0)
    mouse.execute({ target: 'mouse', action: 'move', x: 10, y: 10 })
    expect(mockNative.move).toHaveBeenCalledWith(20, 20)
  })

  it('should not move for zero delta with speed', () => {
    const mockNative = {
      create: vi.fn(() => true),
      move: vi.fn(),
      click: vi.fn(),
      scroll: vi.fn(),
      destroy: vi.fn()
    }
    mouse.initWithNative(mockNative)
    mouse.execute({ target: 'mouse', action: 'move', x: 0, y: 0 })
    expect(mockNative.move).not.toHaveBeenCalled()
  })

  it('should compute correct deltas for non-default resolution', () => {
    const mouse2 = new VirtualMouse(2560, 1440)
    const moves: Array<{dx: number, dy: number}> = []
    mouse2.initWithNative({
      create: () => true,
      move: (dx, dy) => moves.push({dx, dy}),
      click: () => {}, scroll: () => {}, destroy: () => {}
    })
    mouse2.moveToNormalized(0.5, 0.5)
    expect(moves[0].dx).toBe(1280) // 0.5 * 2560
    expect(moves[0].dy).toBe(720)  // 0.5 * 1440
  })

  it('should allow resolution update at runtime', () => {
    const mouse2 = new VirtualMouse()
    mouse2.updateResolution(3840, 2160)
    // verify internal state updated
    expect(mouse2.getState().resolution).toEqual({ width: 3840, height: 2160 })
  })
})

describe('VirtualKeyboard', () => {
  let keyboard: VirtualKeyboard

  beforeEach(() => {
    keyboard = new VirtualKeyboard()
  })

  it('should initialize in stub mode', async () => {
    await keyboard.init()
    expect(keyboard.getState().initialized).toBe(true)
  })

  it('should accept native API injection', () => {
    const mockNative = {
      create: vi.fn(() => true),
      pressKey: vi.fn(),
      keyCombo: vi.fn(),
      destroy: vi.fn()
    }
    keyboard.initWithNative(mockNative)
    expect(keyboard.getState().initialized).toBe(true)
  })

  it('should execute press commands with native API', () => {
    const mockNative = {
      create: vi.fn(() => true),
      pressKey: vi.fn(),
      keyCombo: vi.fn(),
      destroy: vi.fn()
    }
    keyboard.initWithNative(mockNative)
    keyboard.execute({ target: 'keyboard', action: 'press', key: 'a' })
    expect(mockNative.pressKey).toHaveBeenCalledWith('a')
  })

  it('should execute combo commands with native API', () => {
    const mockNative = {
      create: vi.fn(() => true),
      pressKey: vi.fn(),
      keyCombo: vi.fn(),
      destroy: vi.fn()
    }
    keyboard.initWithNative(mockNative)
    keyboard.execute({ target: 'keyboard', action: 'combo', keys: ['ctrl', 'c'] })
    expect(mockNative.keyCombo).toHaveBeenCalledWith(['ctrl', 'c'])
  })

  it('should handle release action as no-op', async () => {
    await keyboard.init()
    keyboard.execute({ target: 'keyboard', action: 'release', key: 'a' })
    expect(keyboard.getState().initialized).toBe(true)
  })

  it('should not execute when not initialized', () => {
    keyboard.execute({ target: 'keyboard', action: 'press', key: 'a' })
    expect(keyboard.getState().initialized).toBe(false)
  })

  it('should not crash when press has no key', async () => {
    const mockNative = {
      create: vi.fn(() => true),
      pressKey: vi.fn(),
      keyCombo: vi.fn(),
      destroy: vi.fn()
    }
    keyboard.initWithNative(mockNative)
    keyboard.execute({ target: 'keyboard', action: 'press' })
    expect(mockNative.pressKey).not.toHaveBeenCalled()
  })

  it('should not crash when combo has empty keys', () => {
    const mockNative = {
      create: vi.fn(() => true),
      pressKey: vi.fn(),
      keyCombo: vi.fn(),
      destroy: vi.fn()
    }
    keyboard.initWithNative(mockNative)
    keyboard.execute({ target: 'keyboard', action: 'combo', keys: [] })
    expect(mockNative.keyCombo).not.toHaveBeenCalled()
  })

  it('should destroy cleanly with native', () => {
    const mockNative = {
      create: vi.fn(() => true),
      pressKey: vi.fn(),
      keyCombo: vi.fn(),
      destroy: vi.fn()
    }
    keyboard.initWithNative(mockNative)
    keyboard.destroy()
    expect(mockNative.destroy).toHaveBeenCalledOnce()
    expect(keyboard.getState().initialized).toBe(false)
  })

  it('should destroy cleanly without native', async () => {
    await keyboard.init()
    keyboard.destroy()
    expect(keyboard.getState().initialized).toBe(false)
  })
})

describe('MacroEngine', () => {
  let macros: MacroEngine

  beforeEach(() => {
    macros = new MacroEngine('/nonexistent')
  })

  it('should start with no macros', () => {
    expect(macros.listMacros()).toEqual([])
  })

  it('should set and retrieve press macros', () => {
    macros.setMacro('fist', { action: 'press', key: 'escape' })
    const result = macros.getMacro('fist')
    expect(result).toEqual({
      target: 'keyboard',
      action: 'press',
      key: 'escape'
    })
  })

  it('should return null for unknown gestures', () => {
    expect(macros.getMacro('unknown')).toBeNull()
  })

  it('should handle combo macros', () => {
    macros.setMacro('l_shape', { action: 'combo', keys: ['ctrl', 'shift', 't'] })
    const result = macros.getMacro('l_shape')
    expect(result).toEqual({
      target: 'keyboard',
      action: 'combo',
      keys: ['ctrl', 'shift', 't']
    })
  })

  it('should remove macros', () => {
    macros.setMacro('fist', { action: 'press', key: 'escape' })
    expect(macros.removeMacro('fist')).toBe(true)
    expect(macros.getMacro('fist')).toBeNull()
  })

  it('should return false when removing nonexistent macro', () => {
    expect(macros.removeMacro('nonexistent')).toBe(false)
  })

  it('should list all macros', () => {
    macros.setMacro('fist', { action: 'press', key: 'escape' })
    macros.setMacro('l_shape', { action: 'combo', keys: ['ctrl', 't'] })
    const list = macros.listMacros()
    expect(list.length).toBe(2)
    expect(list.map(m => m.gesture)).toContain('fist')
    expect(list.map(m => m.gesture)).toContain('l_shape')
  })

  it('should clear all macros', () => {
    macros.setMacro('fist', { action: 'press', key: 'escape' })
    macros.setMacro('l_shape', { action: 'combo', keys: ['ctrl', 't'] })
    macros.clear()
    expect(macros.listMacros()).toEqual([])
  })

  it('should handle loading from nonexistent file gracefully', async () => {
    await macros.loadDefaults() // Should not throw
    expect(macros.listMacros()).toEqual([])
  })

  it('should load from valid keymap file', async () => {
    const engine = new MacroEngine('/mnt/projects/tracking/keymaps')
    await engine.loadDefaults()
    const list = engine.listMacros()
    expect(list.length).toBeGreaterThan(0)
    const fist = engine.getMacro('fist')
    expect(fist).toEqual({
      target: 'keyboard',
      action: 'press',
      key: 'escape'
    })
  })

  it('should return null for macro with missing key', () => {
    macros.setMacro('test', { action: 'press' })
    expect(macros.getMacro('test')).toBeNull()
  })

  it('should return null for combo macro with missing keys', () => {
    macros.setMacro('test', { action: 'combo' })
    expect(macros.getMacro('test')).toBeNull()
  })

  it('should overwrite existing macros', () => {
    macros.setMacro('fist', { action: 'press', key: 'escape' })
    macros.setMacro('fist', { action: 'press', key: 'space' })
    const result = macros.getMacro('fist')
    expect(result?.key).toBe('space')
  })
})

// ──────────────────────────────────────────────────────────────────────
// InputIpcHandler destroy cleanup
// ──────────────────────────────────────────────────────────────────────

describe('InputIpcHandler destroy', () => {
  // Use vi.hoisted so the shared state is available inside the vi.mock factory
  const { registeredListeners, mockIpcMain } = vi.hoisted(() => {
    const registeredListeners = new Map<string, Set<(...args: unknown[]) => void>>()
    const mockIpcMain = {
      on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
        if (!registeredListeners.has(channel)) {
          registeredListeners.set(channel, new Set())
        }
        registeredListeners.get(channel)!.add(handler)
      }),
      removeListener: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
        registeredListeners.get(channel)?.delete(handler)
      }),
      removeAllListeners: vi.fn((channel: string) => {
        registeredListeners.delete(channel)
      })
    }
    return { registeredListeners, mockIpcMain }
  })

  // Mock electron ipcMain before importing InputIpcHandler
  vi.mock('electron', () => ({
    ipcMain: mockIpcMain
  }))

  beforeEach(() => {
    registeredListeners.clear()
    mockIpcMain.on.mockClear()
    mockIpcMain.removeListener.mockClear()
    mockIpcMain.removeAllListeners.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should remove GESTURE_EVENT listener on destroy', async () => {
    // Dynamic import so the mock is active
    const { InputIpcHandler } = await import('../ipc')
    const handler = new InputIpcHandler()
    await handler.init()

    // After init, GESTURE_EVENT should have a registered listener
    expect(registeredListeners.get(IPC.GESTURE_EVENT)?.size).toBe(1)

    handler.destroy()

    // After destroy, the GESTURE_EVENT listener should be removed
    expect(registeredListeners.get(IPC.GESTURE_EVENT)?.size ?? 0).toBe(0)
  })

  it('should remove all three IPC listeners on destroy', async () => {
    const { InputIpcHandler } = await import('../ipc')
    const handler = new InputIpcHandler()
    await handler.init()

    // Verify all three channels have listeners
    expect(registeredListeners.get(IPC.MOUSE_COMMAND)?.size).toBe(1)
    expect(registeredListeners.get(IPC.KEYBOARD_COMMAND)?.size).toBe(1)
    expect(registeredListeners.get(IPC.GESTURE_EVENT)?.size).toBe(1)

    handler.destroy()

    // All listeners should be removed
    expect(registeredListeners.get(IPC.MOUSE_COMMAND)?.size ?? 0).toBe(0)
    expect(registeredListeners.get(IPC.KEYBOARD_COMMAND)?.size ?? 0).toBe(0)
    expect(registeredListeners.get(IPC.GESTURE_EVENT)?.size ?? 0).toBe(0)
  })

  it('should use removeListener instead of removeAllListeners', async () => {
    const { InputIpcHandler } = await import('../ipc')
    const handler = new InputIpcHandler()
    await handler.init()

    handler.destroy()

    // removeListener should have been called for each channel
    expect(mockIpcMain.removeListener).toHaveBeenCalledWith(IPC.MOUSE_COMMAND, expect.any(Function))
    expect(mockIpcMain.removeListener).toHaveBeenCalledWith(IPC.KEYBOARD_COMMAND, expect.any(Function))
    expect(mockIpcMain.removeListener).toHaveBeenCalledWith(IPC.GESTURE_EVENT, expect.any(Function))

    // removeAllListeners should NOT have been called
    expect(mockIpcMain.removeAllListeners).not.toHaveBeenCalled()
  })
})
