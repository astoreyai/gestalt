/**
 * One-handed accessibility gesture mappings.
 * Maps all essential actions to single-hand gestures, removing the need for
 * TwoHandPinch. Zoom is handled by Fist (zoom in) and LShape (zoom out) instead.
 */

import {
  GestureType,
  GesturePhase,
  type MouseCommand,
  type KeyboardCommand,
  type BuiltinCommand
} from '@shared/protocol'

/** A gesture-to-command mapping entry. */
export interface GestureMapping {
  gesture: GestureType
  phase: GesturePhase
  action: MouseCommand | KeyboardCommand | BuiltinCommand
}

/**
 * One-handed gesture mappings — same shape as DEFAULT_MAPPINGS but only
 * requires a single hand. TwoHandPinch is not used.
 *
 * Mapping summary:
 *   Pinch      -> select/click (same as default)
 *   Point      -> move cursor (same as default)
 *   OpenPalm   -> pan/drag
 *   Twist      -> rotate
 *   Fist       -> zoom in (hold = continuous zoom)
 *   LShape     -> zoom out
 *   FlatDrag   -> scroll
 */
export const ONE_HANDED_MAPPINGS: GestureMapping[] = [
  // Point -> mouse move (same as default)
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

  // Pinch -> select/click (same as default)
  {
    gesture: GestureType.Pinch,
    phase: GesturePhase.Onset,
    action: {
      target: 'mouse',
      action: 'click',
      button: 'left'
    } as MouseCommand
  },
  {
    gesture: GestureType.Pinch,
    phase: GesturePhase.Hold,
    action: {
      target: 'mouse',
      action: 'drag_move'
    } as MouseCommand
  },
  {
    gesture: GestureType.Pinch,
    phase: GesturePhase.Release,
    action: {
      target: 'mouse',
      action: 'drag_end'
    } as MouseCommand
  },

  // Open palm -> pan/drag (replaces deselect in default mappings)
  {
    gesture: GestureType.OpenPalm,
    phase: GesturePhase.Onset,
    action: {
      target: 'builtin',
      action: 'pan'
    } as BuiltinCommand
  },
  {
    gesture: GestureType.OpenPalm,
    phase: GesturePhase.Hold,
    action: {
      target: 'builtin',
      action: 'pan'
    } as BuiltinCommand
  },

  // Twist -> rotate
  {
    gesture: GestureType.Twist,
    phase: GesturePhase.Onset,
    action: {
      target: 'builtin',
      action: 'rotate'
    } as BuiltinCommand
  },
  {
    gesture: GestureType.Twist,
    phase: GesturePhase.Hold,
    action: {
      target: 'builtin',
      action: 'rotate'
    } as BuiltinCommand
  },

  // Fist -> zoom in (hold = continuous zoom)
  {
    gesture: GestureType.Fist,
    phase: GesturePhase.Onset,
    action: {
      target: 'builtin',
      action: 'zoom',
      params: { direction: 1 }
    } as BuiltinCommand
  },
  {
    gesture: GestureType.Fist,
    phase: GesturePhase.Hold,
    action: {
      target: 'builtin',
      action: 'zoom',
      params: { direction: 1 }
    } as BuiltinCommand
  },

  // LShape -> zoom out
  {
    gesture: GestureType.LShape,
    phase: GesturePhase.Onset,
    action: {
      target: 'builtin',
      action: 'zoom',
      params: { direction: -1 }
    } as BuiltinCommand
  },
  {
    gesture: GestureType.LShape,
    phase: GesturePhase.Hold,
    action: {
      target: 'builtin',
      action: 'zoom',
      params: { direction: -1 }
    } as BuiltinCommand
  },

  // FlatDrag -> scroll
  {
    gesture: GestureType.FlatDrag,
    phase: GesturePhase.Onset,
    action: {
      target: 'mouse',
      action: 'scroll'
    } as MouseCommand
  },
  {
    gesture: GestureType.FlatDrag,
    phase: GesturePhase.Hold,
    action: {
      target: 'mouse',
      action: 'scroll'
    } as MouseCommand
  }
]

/** Returns the one-handed gesture mappings for accessibility mode. */
export function getOneHandedMappings(): GestureMapping[] {
  return ONE_HANDED_MAPPINGS
}
