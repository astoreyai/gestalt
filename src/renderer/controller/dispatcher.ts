/**
 * Gesture event → 3D scene action dispatcher.
 * Routes gestures to the appropriate handler based on active view mode.
 */

import type { GestureEvent, ViewMode } from '@shared/protocol'
import { GestureType, GesturePhase } from '@shared/protocol'

export interface DispatchContext {
  viewMode: ViewMode
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
  params: Record<string, number | string | null>
  hand?: 'left' | 'right'
}

/** Dispatch result can be a single action or an array of actions (for two-hand combos) */
export type DispatchResult = SceneAction | SceneAction[]

/** Dispatch a gesture event to a scene action based on view mode */
export function dispatchGesture(
  gesture: GestureEvent,
  context: DispatchContext
): SceneAction {
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
      action = { type: 'noop', params: {} }
  }
  // Tag action with hand for per-hand state tracking
  action.hand = gesture.hand
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
      return { type: 'noop', params: {} }

    case GestureType.OpenPalm:
      if (gesture.phase === GesturePhase.Onset) {
        return { type: 'deselect', params: {} }
      }
      return { type: 'noop', params: {} }

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
      return { type: 'noop', params: {} }

    case GestureType.Point:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'navigate',
          params: { x: gesture.position.x, y: gesture.position.y, z: gesture.position.z }
        }
      }
      return { type: 'noop', params: {} }

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
      return { type: 'noop', params: {} }

    case GestureType.TwoHandPinch:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'zoom',
          params: {
            delta: gesture.data?.handDistance ?? 0
          }
        }
      }
      return { type: 'noop', params: {} }

    default:
      return { type: 'noop', params: {} }
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
      return { type: 'noop', params: {} }

    case GestureType.LShape:
      // LShape -> zoom out
      if (gesture.phase === GesturePhase.Onset || gesture.phase === GesturePhase.Hold) {
        return {
          type: 'zoom',
          params: { delta: -1 }
        }
      }
      return { type: 'noop', params: {} }

    case GestureType.OpenPalm:
      // OpenPalm -> pan/drag (instead of deselect)
      if (gesture.phase === GesturePhase.Onset || gesture.phase === GesturePhase.Hold) {
        return {
          type: 'pan',
          params: { dx: gesture.position.x, dy: gesture.position.y }
        }
      }
      return { type: 'noop', params: {} }

    case GestureType.TwoHandPinch:
      // TwoHandPinch is not used in one-handed mode
      return { type: 'noop', params: {} }

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
      return { type: 'noop', params: {} }

    case GestureType.Point:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'navigate',
          params: { x: gesture.position.x, y: gesture.position.y, z: gesture.position.z }
        }
      }
      return { type: 'noop', params: {} }

    case GestureType.OpenPalm:
      if (gesture.phase === GesturePhase.Onset) {
        return { type: 'deselect', params: {} }
      }
      return { type: 'noop', params: {} }

    case GestureType.FlatDrag:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'pan',
          params: { dx: gesture.position.x, dy: gesture.position.y }
        }
      }
      return { type: 'noop', params: {} }

    case GestureType.TwoHandPinch:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'zoom',
          params: { delta: gesture.data?.handDistance ?? 0 }
        }
      }
      return { type: 'noop', params: {} }

    case GestureType.Twist:
      if (gesture.phase === GesturePhase.Hold) {
        return {
          type: 'rotate',
          params: { angle: gesture.data?.rotation ?? 0, axis: 'y' }
        }
      }
      return { type: 'noop', params: {} }

    default:
      return { type: 'noop', params: {} }
  }
}

// ─── Two-Hand Dispatch ────────────────────────────────────────────

/**
 * Resolve two-hand gesture combinations into scene actions.
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
  const lType = left.type
  const rType = right.type
  const bothHold = left.phase === GesturePhase.Hold && right.phase === GesturePhase.Hold
  const eitherOnset = left.phase === GesturePhase.Onset || right.phase === GesturePhase.Onset

  if (!bothHold && !eitherOnset) {
    return { type: 'noop', params: {} }
  }

  // Both Pinch, with a selected target → scale_node
  if (lType === GestureType.Pinch && rType === GestureType.Pinch) {
    if (context.selectedNodeId) {
      return { type: 'scale_node', params: { nodeId: context.selectedNodeId, delta: context.handDistanceDelta } }
    }
    return { type: 'zoom', params: { delta: context.handDistanceDelta } }
  }

  // Both OpenPalm → dolly
  if (lType === GestureType.OpenPalm && rType === GestureType.OpenPalm) {
    return { type: 'dolly', params: { delta: (context.leftZDelta + context.rightZDelta) / 2 } }
  }

  // Both Twist → orbit or roll
  if (lType === GestureType.Twist && rType === GestureType.Twist) {
    const leftRot = left.data?.rotation ?? 0
    const rightRot = right.data?.rotation ?? 0
    const sameDir = (leftRot > 0 && rightRot > 0) || (leftRot < 0 && rightRot < 0)
    if (sameDir) return { type: 'orbit', params: { angle: (leftRot + rightRot) / 2, axis: 'y' } }
    return { type: 'roll', params: { angle: (leftRot - rightRot) / 2 } }
  }

  // Pinch + FlatDrag → [drag, pan]
  if ((lType === GestureType.Pinch && rType === GestureType.FlatDrag) || (lType === GestureType.FlatDrag && rType === GestureType.Pinch)) {
    const pinch = lType === GestureType.Pinch ? left : right
    const drag = lType === GestureType.FlatDrag ? left : right
    return [
      { type: 'drag', params: { x: pinch.position.x, y: pinch.position.y, z: pinch.position.z } },
      { type: 'pan', params: { dx: drag.position.x, dy: drag.position.y } }
    ]
  }

  // Pinch + OpenPalm → unfold
  if ((lType === GestureType.Pinch && rType === GestureType.OpenPalm) || (lType === GestureType.OpenPalm && rType === GestureType.Pinch)) {
    return { type: 'unfold', params: { x: left.position.x, y: left.position.y, clusterId: context.selectedClusterId !== null ? String(context.selectedClusterId) : null } }
  }

  // Point + Point → measure
  if (lType === GestureType.Point && rType === GestureType.Point) {
    return { type: 'measure', params: { x1: left.position.x, y1: left.position.y, z1: left.position.z, x2: right.position.x, y2: right.position.y, z2: right.position.z } }
  }

  // Fist + Fist → fold
  if (lType === GestureType.Fist && rType === GestureType.Fist) {
    return { type: 'fold', params: { clusterId: context.selectedClusterId !== null ? String(context.selectedClusterId) : null } }
  }

  return { type: 'noop', params: {} }
}
