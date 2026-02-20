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
}

export interface SceneAction {
  type: 'select' | 'deselect' | 'rotate' | 'pan' | 'zoom' | 'navigate' | 'noop'
  params: Record<string, number | string | null>
}

/** Dispatch a gesture event to a scene action based on view mode */
export function dispatchGesture(
  gesture: GestureEvent,
  context: DispatchContext
): SceneAction {
  switch (context.viewMode) {
    case 'graph':
      return dispatchGraphAction(gesture, context)
    case 'manifold':
      return dispatchManifoldAction(gesture, context)
    case 'split':
      // In split mode, left hand controls graph, right hand controls manifold
      if (gesture.hand === 'left') {
        return dispatchGraphAction(gesture, context)
      }
      return dispatchManifoldAction(gesture, context)
    default:
      return { type: 'noop', params: {} }
  }
}

function dispatchGraphAction(gesture: GestureEvent, context: DispatchContext): SceneAction {
  switch (gesture.type) {
    case GestureType.Pinch:
      if (gesture.phase === GesturePhase.Onset) {
        return {
          type: 'select',
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

function dispatchManifoldAction(gesture: GestureEvent, context: DispatchContext): SceneAction {
  switch (gesture.type) {
    case GestureType.Pinch:
      if (gesture.phase === GesturePhase.Onset) {
        return {
          type: 'select',
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
