/**
 * Gesture event → 3D scene action dispatcher.
 * Routes gestures to the appropriate handler based on active view mode.
 */

import type { GestureEvent, ViewMode, SelectableObject } from '@shared/protocol'
import { GestureType, GesturePhase } from '@shared/protocol'

export interface DispatchContext {
  viewMode: ViewMode
  /** Unified selection — any selectable object */
  selection?: SelectableObject | null
  /** @deprecated Convenience alias — use selection */
  selectedNodeId: string | null
  selectedClusterId: number | null
  oneHandedMode?: boolean
}

export interface SceneAction {
  type:
    | 'select' | 'deselect' | 'rotate' | 'pan' | 'zoom' | 'navigate' | 'drag' | 'noop'
    | 'orbit' | 'roll' | 'dolly'
    | 'inspect' | 'scale_node' | 'measure'
    | 'fold' | 'unfold'
    | 'undo'
  params: Record<string, number | string | null>
  hand?: 'left' | 'right'
}

/** Dispatch result can be a single action or an array of actions (for two-hand combos) */
export type DispatchResult = SceneAction | SceneAction[]

/** Minimum confidence to dispatch an action (below this → noop) */
const MIN_DISPATCH_CONFIDENCE = 0.3

/** Pre-allocated noop action to avoid per-call object creation (frozen to prevent mutation) */
const NOOP_ACTION: SceneAction = Object.freeze({ type: 'noop', params: {} }) as SceneAction

/** Dispatch a gesture event to a scene action based on view mode */
export function dispatchGesture(
  gesture: GestureEvent,
  context: DispatchContext
): SceneAction {
  // Gate on confidence — only filter low-confidence Onset events (Hold/Release already passed onset)
  if (gesture.phase === GesturePhase.Onset && gesture.confidence > 0 && gesture.confidence < MIN_DISPATCH_CONFIDENCE) {
    return NOOP_ACTION
  }

  let action: SceneAction
  switch (context.viewMode) {
    case 'graph':
      action = dispatchGraphAction(gesture, context)
      break
    case 'manifold':
      action = dispatchManifoldAction(gesture, context)
      break
    case 'split':
      // In split mode, left hand controls graph, right hand controls manifold
      if (gesture.hand === 'left') {
        action = dispatchGraphAction(gesture, context)
      } else {
        action = dispatchManifoldAction(gesture, context)
      }
      break
    default:
      action = NOOP_ACTION
  }
  // Tag action with hand for per-hand state tracking (skip frozen NOOP)
  if (action !== NOOP_ACTION) {
    action.hand = gesture.hand
  }
  return action
}

function dispatchGraphAction(gesture: GestureEvent, context: DispatchContext): SceneAction {
  // One-handed mode: remap Fist/LShape to zoom, OpenPalm to pan
  if (context.oneHandedMode) {
    const oneHandedAction = dispatchOneHandedAction(gesture)
    if (oneHandedAction) return oneHandedAction
  }

  switch (gesture.type) {
    case GestureType.Pinch:
      if (gesture.phase === GesturePhase.Onset) {
        return {
          type: 'select',
          params: { x: gesture.position.x, y: gesture.position.y, z: gesture.position.z }
        }
      }
      // Pinch Hold: drag the selected node
      if (gesture.phase === GesturePhase.Hold && context.selectedNodeId) {
        return {
          type: 'drag',
          params: { x: gesture.position.x, y: gesture.position.y, z: gesture.position.z }
        }
      }
      return NOOP_ACTION

    case GestureType.OpenPalm:
      if (gesture.phase === GesturePhase.Onset) {
        return { type: 'deselect', params: {} }
      }
      return NOOP_ACTION

    case GestureType.Twist:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'rotate',
          params: {
            angle: gesture.data?.rotation ?? 0,
            axis: 'y'
          }
        }
      }
      return NOOP_ACTION

    case GestureType.Point:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'navigate',
          params: { x: gesture.position.x, y: gesture.position.y, z: gesture.position.z }
        }
      }
      return NOOP_ACTION

    case GestureType.FlatDrag:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'pan',
          params: {
            dx: gesture.position.x,
            dy: gesture.position.y
          }
        }
      }
      return NOOP_ACTION

    case GestureType.TwoHandPinch:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'zoom',
          params: {
            delta: gesture.data?.handDistance ?? 0
          }
        }
      }
      return NOOP_ACTION

    default:
      return NOOP_ACTION
  }
}

/**
 * Handle one-handed mode remappings shared by both graph and manifold views.
 * Returns a SceneAction if the gesture is remapped, or null to fall through
 * to the default handler.
 */
function dispatchOneHandedAction(gesture: GestureEvent): SceneAction | null {
  switch (gesture.type) {
    case GestureType.Fist:
      // Fist -> zoom in (onset starts, hold continues)
      if (gesture.phase === GesturePhase.Onset || gesture.phase === GesturePhase.Hold) {
        return {
          type: 'zoom',
          params: { delta: 1 }
        }
      }
      return NOOP_ACTION

    case GestureType.LShape:
      // LShape -> zoom out
      if (gesture.phase === GesturePhase.Onset || gesture.phase === GesturePhase.Hold) {
        return {
          type: 'zoom',
          params: { delta: -1 }
        }
      }
      return NOOP_ACTION

    case GestureType.OpenPalm:
      // OpenPalm -> pan/drag (instead of deselect)
      if (gesture.phase === GesturePhase.Onset || gesture.phase === GesturePhase.Hold) {
        return {
          type: 'pan',
          params: { dx: gesture.position.x, dy: gesture.position.y }
        }
      }
      return NOOP_ACTION

    case GestureType.TwoHandPinch:
      // TwoHandPinch is not used in one-handed mode
      return NOOP_ACTION

    default:
      return null
  }
}

function dispatchManifoldAction(gesture: GestureEvent, context: DispatchContext): SceneAction {
  // One-handed mode: remap Fist/LShape to zoom, OpenPalm to pan
  if (context.oneHandedMode) {
    const oneHandedAction = dispatchOneHandedAction(gesture)
    if (oneHandedAction) return oneHandedAction
  }

  switch (gesture.type) {
    case GestureType.Pinch:
      if (gesture.phase === GesturePhase.Onset) {
        return {
          type: 'select',
          params: { x: gesture.position.x, y: gesture.position.y, z: gesture.position.z }
        }
      }
      if (gesture.phase === GesturePhase.Hold && context.selectedNodeId) {
        return {
          type: 'drag',
          params: { x: gesture.position.x, y: gesture.position.y, z: gesture.position.z }
        }
      }
      return NOOP_ACTION

    case GestureType.Point:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'navigate',
          params: { x: gesture.position.x, y: gesture.position.y, z: gesture.position.z }
        }
      }
      return NOOP_ACTION

    case GestureType.OpenPalm:
      if (gesture.phase === GesturePhase.Onset) {
        return { type: 'deselect', params: {} }
      }
      return NOOP_ACTION

    case GestureType.FlatDrag:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'pan',
          params: { dx: gesture.position.x, dy: gesture.position.y }
        }
      }
      return NOOP_ACTION

    case GestureType.TwoHandPinch:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'zoom',
          params: { delta: gesture.data?.handDistance ?? 0 }
        }
      }
      return NOOP_ACTION

    case GestureType.Twist:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'rotate',
          params: { angle: gesture.data?.rotation ?? 0, axis: 'y' }
        }
      }
      return NOOP_ACTION

    default:
      return NOOP_ACTION
  }
}

// ─── Two-Hand Dispatch ────────────────────────────────────────────

/** Combo key from two gesture types (order-independent for symmetric combos) */
function comboKey(a: GestureType, b: GestureType): string {
  return a <= b ? `${a}|${b}` : `${b}|${a}`
}

/**
 * Combo handler type. Receives the left+right events and context, returns scene action(s).
 * A `null` return delegates to the noop fallback.
 */
type ComboHandler = (
  left: GestureEvent,
  right: GestureEvent,
  context: DispatchContext & { handDistanceDelta: number; leftZDelta: number; rightZDelta: number }
) => DispatchResult

/** Pre-built Map for O(1) two-hand combo lookup instead of linear if-else chain. */
const TWO_HAND_COMBOS = new Map<string, ComboHandler>()

// Both Pinch → scale_node or zoom
TWO_HAND_COMBOS.set(comboKey(GestureType.Pinch, GestureType.Pinch), (_l, _r, ctx): DispatchResult => {
  if (ctx.selectedNodeId) {
    return { type: 'scale_node', params: { nodeId: ctx.selectedNodeId, delta: ctx.handDistanceDelta } }
  }
  return { type: 'zoom', params: { delta: ctx.handDistanceDelta } }
})

// Both OpenPalm → dolly
TWO_HAND_COMBOS.set(comboKey(GestureType.OpenPalm, GestureType.OpenPalm), (_l, _r, ctx): DispatchResult => {
  return { type: 'dolly', params: { delta: (ctx.leftZDelta + ctx.rightZDelta) / 2 } }
})

// Both Twist → orbit or roll
TWO_HAND_COMBOS.set(comboKey(GestureType.Twist, GestureType.Twist), (l, r): DispatchResult => {
  const leftRot = l.data?.rotation ?? 0
  const rightRot = r.data?.rotation ?? 0
  const sameDir = (leftRot > 0 && rightRot > 0) || (leftRot < 0 && rightRot < 0)
  if (sameDir) return { type: 'orbit', params: { angle: (leftRot + rightRot) / 2, axis: 'y' } }
  return { type: 'roll', params: { angle: (leftRot - rightRot) / 2 } }
})

// Pinch + FlatDrag → [drag, pan]
TWO_HAND_COMBOS.set(comboKey(GestureType.Pinch, GestureType.FlatDrag), (l, r): DispatchResult => {
  const pinch = l.type === GestureType.Pinch ? l : r
  const drag = l.type === GestureType.FlatDrag ? l : r
  return [
    { type: 'drag', params: { x: pinch.position.x, y: pinch.position.y, z: pinch.position.z } } as SceneAction,
    { type: 'pan', params: { dx: drag.position.x, dy: drag.position.y } } as SceneAction
  ]
})

// Pinch + OpenPalm → unfold
TWO_HAND_COMBOS.set(comboKey(GestureType.Pinch, GestureType.OpenPalm), (l, _r, ctx): DispatchResult => {
  return { type: 'unfold', params: { x: l.position.x, y: l.position.y, clusterId: ctx.selectedClusterId !== null ? String(ctx.selectedClusterId) : null } }
})

// Point + Point → measure
TWO_HAND_COMBOS.set(comboKey(GestureType.Point, GestureType.Point), (l, r): DispatchResult => {
  return { type: 'measure', params: { x1: l.position.x, y1: l.position.y, z1: l.position.z, x2: r.position.x, y2: r.position.y, z2: r.position.z } }
})

// Fist + Fist → fold
TWO_HAND_COMBOS.set(comboKey(GestureType.Fist, GestureType.Fist), (_l, _r, ctx): DispatchResult => {
  return { type: 'fold', params: { clusterId: ctx.selectedClusterId !== null ? String(ctx.selectedClusterId) : null } }
})

/**
 * Resolve two-hand gesture combinations into scene actions.
 * Uses pre-built Map for O(1) combo lookup.
 */
export function dispatchTwoHandAction(
  left: GestureEvent,
  right: GestureEvent,
  context: DispatchContext & {
    handDistanceDelta: number
    leftZDelta: number
    rightZDelta: number
  }
): DispatchResult {
  const bothHold = left.phase === GesturePhase.Hold && right.phase === GesturePhase.Hold
  const eitherOnset = left.phase === GesturePhase.Onset || right.phase === GesturePhase.Onset

  if (!bothHold && !eitherOnset) {
    return NOOP_ACTION
  }

  const handler = TWO_HAND_COMBOS.get(comboKey(left.type, right.type))
  if (handler) {
    return handler(left, right, context)
  }

  return NOOP_ACTION
}
