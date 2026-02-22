/**
 * Human-readable display labels for gesture types and phases.
 * Used by GestureOverlay to show user-friendly badge text
 * instead of raw enum values like "flat_drag (hold)".
 */

import { GestureType, GesturePhase } from '@shared/protocol'

const GESTURE_DISPLAY_NAMES: Record<GestureType, string> = {
  [GestureType.Pinch]: 'Pinch',
  [GestureType.Point]: 'Point',
  [GestureType.OpenPalm]: 'Open Palm',
  [GestureType.Twist]: 'Twist',
  [GestureType.TwoHandPinch]: 'Two-Hand Pinch',
  [GestureType.TwoHandRotate]: 'Two-Hand Rotate',
  [GestureType.TwoHandPush]: 'Two-Hand Push',
  [GestureType.FlatDrag]: 'Flat Drag',
  [GestureType.Fist]: 'Fist',
  [GestureType.LShape]: 'L-Shape'
}

const PHASE_DISPLAY_NAMES: Record<GesturePhase, string> = {
  [GesturePhase.Onset]: 'Started',
  [GesturePhase.Hold]: 'Holding',
  [GesturePhase.Release]: 'Released'
}

/**
 * Maps specific gesture+phase combinations to contextual action descriptions.
 * Falls back to "GestureName - Phase" for unmapped combinations.
 */
const ACTION_LABELS: Partial<Record<GestureType, Partial<Record<GesturePhase, string>>>> = {
  [GestureType.Pinch]: {
    [GesturePhase.Onset]: 'Selecting',
    [GesturePhase.Hold]: 'Dragging'
  },
  [GestureType.Point]: {
    [GesturePhase.Hold]: 'Pointing'
  },
  [GestureType.OpenPalm]: {
    [GesturePhase.Onset]: 'Releasing'
  },
  [GestureType.FlatDrag]: {
    [GesturePhase.Hold]: 'Panning'
  },
  [GestureType.Twist]: {
    [GesturePhase.Hold]: 'Rotating'
  },
  [GestureType.TwoHandPinch]: {
    [GesturePhase.Hold]: 'Zooming'
  },
  [GestureType.Fist]: {
    [GesturePhase.Onset]: 'Cancelling'
  },
  [GestureType.LShape]: {
    [GesturePhase.Onset]: 'Shortcut'
  }
}

/** Returns a human-readable name for a gesture type */
export function getGestureDisplayName(type: GestureType): string {
  return GESTURE_DISPLAY_NAMES[type] ?? type
}

/** Returns a human-readable name for a gesture phase */
export function getPhaseDisplayName(phase: GesturePhase): string {
  return PHASE_DISPLAY_NAMES[phase] ?? phase
}

/** Returns a contextual action label for a gesture+phase combination */
export function getGestureActionLabel(type: GestureType, phase: GesturePhase): string {
  const actionLabel = ACTION_LABELS[type]?.[phase]
  if (actionLabel) return actionLabel
  // Fallback: "GestureName - Phase"
  return `${getGestureDisplayName(type)} - ${getPhaseDisplayName(phase)}`
}

/** Hover target type for contextual labeling */
export type HoverTarget = 'node' | 'point' | 'cluster' | null

/**
 * Returns a contextual action label based on gesture type, viewMode, and hover target.
 * Example: Pinch over a node → "Select", Pinch in empty space → "Grab"
 */
export function getContextualGestureLabel(
  type: GestureType,
  _phase: GesturePhase,
  _viewMode: string,
  hoverTarget: HoverTarget
): string {
  const hasTarget = hoverTarget === 'node' || hoverTarget === 'point' || hoverTarget === 'cluster'

  switch (type) {
    case GestureType.Pinch:
      return hasTarget ? 'Select' : 'Grab'
    case GestureType.Point:
      return hasTarget ? 'Inspect' : 'Navigate'
    case GestureType.FlatDrag:
      return 'Pan'
    case GestureType.Twist:
      return 'Rotate'
    case GestureType.OpenPalm:
      return 'Release'
    case GestureType.Fist:
      return 'Cancel'
    case GestureType.TwoHandPinch:
      return 'Zoom'
    case GestureType.TwoHandRotate:
      return 'Orbit'
    case GestureType.TwoHandPush:
      return 'Push'
    default:
      return getGestureDisplayName(type)
  }
}
