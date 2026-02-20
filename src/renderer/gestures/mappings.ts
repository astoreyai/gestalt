/**
 * Gesture-to-action mappings.
 * Maps gesture events to input commands (mouse, keyboard, builtin).
 */

import {
  GestureType,
  GesturePhase,
  type GestureEvent,
  type Command,
  type MouseCommand,
  type KeyboardCommand,
  type BuiltinCommand
} from '@shared/protocol'

/** A mapping from a gesture + phase to a command */
export interface GestureMapping {
  gesture: GestureType
  phase: GesturePhase
  action: Command
}

/** Default gesture-to-command mappings */
export const DEFAULT_MAPPINGS: GestureMapping[] = [
  // Point -> mouse move (onset starts tracking, hold continues)
  {
    gesture: GestureType.Point,
    phase: GesturePhase.Onset,
    action: {
      target: 'mouse',
      action: 'move'
    } as MouseCommand
  },
  {
    gesture: GestureType.Point,
    phase: GesturePhase.Hold,
    action: {
      target: 'mouse',
      action: 'move'
    } as MouseCommand
  },

  // Pinch onset -> mouse click
  {
    gesture: GestureType.Pinch,
    phase: GesturePhase.Onset,
    action: {
      target: 'mouse',
      action: 'click',
      button: 'left'
    } as MouseCommand
  },

  // Pinch hold -> drag
  {
    gesture: GestureType.Pinch,
    phase: GesturePhase.Hold,
    action: {
      target: 'mouse',
      action: 'drag_move'
    } as MouseCommand
  },

  // Pinch release -> end drag
  {
    gesture: GestureType.Pinch,
    phase: GesturePhase.Release,
    action: {
      target: 'mouse',
      action: 'drag_end'
    } as MouseCommand
  },

  // Two-hand pinch -> zoom
  {
    gesture: GestureType.TwoHandPinch,
    phase: GesturePhase.Onset,
    action: {
      target: 'builtin',
      action: 'zoom'
    } as BuiltinCommand
  },
  {
    gesture: GestureType.TwoHandPinch,
    phase: GesturePhase.Hold,
    action: {
      target: 'builtin',
      action: 'zoom'
    } as BuiltinCommand
  },

  // Open palm -> deselect (builtin select with no params = deselect)
  {
    gesture: GestureType.OpenPalm,
    phase: GesturePhase.Onset,
    action: {
      target: 'builtin',
      action: 'select',
      params: {}
    } as BuiltinCommand
  },

  // Flat drag -> pan
  {
    gesture: GestureType.FlatDrag,
    phase: GesturePhase.Onset,
    action: {
      target: 'builtin',
      action: 'pan'
    } as BuiltinCommand
  },
  {
    gesture: GestureType.FlatDrag,
    phase: GesturePhase.Hold,
    action: {
      target: 'builtin',
      action: 'pan'
    } as BuiltinCommand
  },

  // Fist -> escape key
  {
    gesture: GestureType.Fist,
    phase: GesturePhase.Onset,
    action: {
      target: 'keyboard',
      action: 'press',
      key: 'Escape'
    } as KeyboardCommand
  },

  // L-shape -> Ctrl+Shift+T
  {
    gesture: GestureType.LShape,
    phase: GesturePhase.Onset,
    action: {
      target: 'keyboard',
      action: 'combo',
      keys: ['ctrl', 'shift', 't']
    } as KeyboardCommand
  }
]

/**
 * Map a gesture event to a command using the provided mappings.
 * Returns the first matching mapping's action, or null if no match.
 */
export function mapGestureToCommand(
  event: GestureEvent,
  mappings: GestureMapping[] = DEFAULT_MAPPINGS
): Command | null {
  const mapping = mappings.find(
    (m) => m.gesture === event.type && m.phase === event.phase
  )

  if (!mapping) {
    return null
  }

  const command = { ...mapping.action }

  // Inject position data for mouse commands
  if (command.target === 'mouse' && event.position) {
    const mouseCmd = command as MouseCommand
    mouseCmd.x = event.position.x
    mouseCmd.y = event.position.y
  }

  // Inject params for builtin commands with gesture data
  if (command.target === 'builtin' && event.data) {
    const builtinCmd = command as BuiltinCommand
    builtinCmd.params = { ...builtinCmd.params, ...event.data }
  }

  return command
}
