/**
 * Core protocol types shared between main and renderer processes.
 * All hand tracking, gesture, and command types live here.
 */

// ─── Hand Tracking Types ──────────────────────────────────────────

/** A single 3D landmark point from MediaPipe (21 per hand) */
export interface Landmark {
  x: number // Normalized [0, 1] horizontal
  y: number // Normalized [0, 1] vertical
  z: number // Depth relative to wrist
}

/** Which hand */
export type Handedness = 'left' | 'right'

/** A tracked hand with its 21 landmarks */
export interface Hand {
  handedness: Handedness
  landmarks: Landmark[] // Always 21 landmarks
  worldLandmarks: Landmark[] // 3D world coordinates
  score: number // Detection confidence [0, 1]
}

/** A single frame of tracking data */
export interface LandmarkFrame {
  hands: Hand[]
  timestamp: number // performance.now()
  frameId: number
}

// ─── MediaPipe Landmark Indices ───────────────────────────────────

export const LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20
} as const

// ─── Gesture Types ────────────────────────────────────────────────

export enum GestureType {
  Pinch = 'pinch',
  Point = 'point',
  OpenPalm = 'open_palm',
  Twist = 'twist',
  TwoHandPinch = 'two_hand_pinch',
  FlatDrag = 'flat_drag',
  Fist = 'fist',
  LShape = 'l_shape'
}

export enum GesturePhase {
  Onset = 'onset',
  Hold = 'hold',
  Release = 'release'
}

export interface GestureEvent {
  type: GestureType
  phase: GesturePhase
  hand: Handedness
  confidence: number // [0, 1]
  position: { x: number; y: number; z: number } // Normalized center
  timestamp: number
  data?: Record<string, number> // Extra: rotation angle, pinch distance, etc.
}

// ─── Input Command Types ──────────────────────────────────────────

export type InputTarget = 'mouse' | 'keyboard' | 'program' | 'builtin'

export interface MouseCommand {
  target: 'mouse'
  action: 'move' | 'click' | 'doubleclick' | 'drag_start' | 'drag_move' | 'drag_end' | 'scroll'
  x?: number
  y?: number
  deltaX?: number
  deltaY?: number
  button?: 'left' | 'right' | 'middle'
}

export interface KeyboardCommand {
  target: 'keyboard'
  action: 'press' | 'release' | 'combo'
  key?: string
  keys?: string[] // For combos: ['ctrl', 'shift', 't']
}

export interface ProgramCommand {
  target: 'program'
  program: string
  action: string
  payload?: unknown
}

export interface BuiltinCommand {
  target: 'builtin'
  action: 'select' | 'rotate' | 'pan' | 'zoom' | 'switch_view'
  params?: Record<string, number>
}

export type Command = MouseCommand | KeyboardCommand | ProgramCommand | BuiltinCommand

// ─── Graph Data Types ─────────────────────────────────────────────

export interface GraphNode {
  id: string
  label?: string
  position?: { x: number; y: number; z: number }
  color?: string
  size?: number
  metadata?: Record<string, unknown>
}

export interface GraphEdge {
  source: string
  target: string
  weight?: number
  label?: string
  metadata?: Record<string, unknown>
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
  metadata?: Record<string, unknown>
}

// ─── Embedding / Manifold Types ───────────────────────────────────

export interface EmbeddingPoint {
  id: string
  position: { x: number; y: number; z: number }
  clusterId?: number
  label?: string
  metadata?: Record<string, unknown>
}

export interface EmbeddingData {
  points: EmbeddingPoint[]
  clusters?: Array<{
    id: number
    label?: string
    color?: string
    centroid?: { x: number; y: number; z: number }
  }>
  metadata?: Record<string, unknown>
}

// ─── Calibration Profile Types ────────────────────────────────────

/** A single recorded gesture sample for training */
export interface GestureSample {
  gestureType: GestureType
  landmarks: Landmark[]    // 21 landmarks snapshot
  features: number[]       // Extracted feature vector (distances, angles)
  timestamp: number
}

/** A saved calibration profile with user-specific gesture data */
export interface CalibrationProfile {
  id: string
  name: string
  sensitivity: number              // 0-1
  samples: GestureSample[]         // Recorded gesture training samples
  createdAt: number                // Date.now()
  updatedAt: number                // Date.now()
}

/** Persisted application data */
export interface PersistedData {
  config: AppConfig
  profiles: CalibrationProfile[]
  activeProfileId: string | null
  calibrated: boolean
}

// ─── App State Types ──────────────────────────────────────────────

export type ViewMode = 'graph' | 'manifold' | 'split'
export type ThemeMode = 'light' | 'dark' | 'system'

export interface AppConfig {
  tracking: {
    enabled: boolean
    smoothingFactor: number // 0-1, higher = more smoothing
    minConfidence: number // Minimum hand detection confidence
  }
  gestures: {
    minHoldDuration: number // ms before onset → hold
    cooldownDuration: number // ms after release before re-trigger
    sensitivity: number // 0-1, higher = more sensitive
    oneHandedMode: boolean // Use single-hand gestures for all actions (accessibility)
  }
  input: {
    mouseSpeed: number // Multiplier for cursor movement
    scrollSpeed: number // Multiplier for scroll
  }
  bus: {
    port: number // WebSocket server port
    enabled: boolean
  }
  visualization: {
    defaultView: ViewMode
    lodEnabled: boolean
    maxFps: number
  }
  theme: ThemeMode
}

export const DEFAULT_CONFIG: AppConfig = {
  tracking: {
    enabled: true,
    smoothingFactor: 0.3,
    minConfidence: 0.7
  },
  gestures: {
    minHoldDuration: 150,
    cooldownDuration: 200,
    sensitivity: 0.5,
    oneHandedMode: false
  },
  input: {
    mouseSpeed: 1.0,
    scrollSpeed: 1.0
  },
  bus: {
    port: 9876,
    enabled: true
  },
  visualization: {
    defaultView: 'graph',
    lodEnabled: true,
    maxFps: 60
  },
  theme: 'system'
}
