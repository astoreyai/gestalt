/**
 * Gesture recognizer module.
 * Re-exports all gesture types, classifier, state machine, engine, and mappings.
 */

// Types
export {
  GestureType,
  GesturePhase,
  type GestureEvent,
  type FingerState,
  type FingerName,
  type HandPose,
  type GestureConfig,
  DEFAULT_GESTURE_CONFIG
} from './types'

// Classifier
export {
  distance,
  angleBetween,
  fingerCurl,
  fingerExtended,
  analyzeHandPose,
  detectPinch,
  detectPoint,
  detectOpenPalm,
  detectFist,
  detectLShape,
  detectFlatDrag,
  classifyGesture
} from './classifier'

// State machine and engine
export { GestureState, GestureStateMachine, GestureEngine } from './state'

// Mappings
export {
  type GestureMapping,
  DEFAULT_MAPPINGS,
  mapGestureToCommand
} from './mappings'

// One-handed accessibility mappings
export {
  ONE_HANDED_MAPPINGS,
  getOneHandedMappings
} from './one-handed'

// Two-hand coordinator
export {
  TwoHandCoordinator,
  type TwoHandCoordResult
} from './two-hand-coordinator'
