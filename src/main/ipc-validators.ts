/**
 * Zod validation schemas for IPC handler input.
 * Ensures all data crossing the IPC boundary from the renderer
 * is validated before the main process acts on it.
 */

import { z } from 'zod'

// ─── App Config Schema ──────────────────────────────────────────

export const PartialAppConfigSchema = z.object({
  tracking: z.object({
    enabled: z.boolean(),
    smoothingFactor: z.number().min(0).max(1),
    minConfidence: z.number().min(0).max(1)
  }).partial().optional(),
  gestures: z.object({
    minHoldDuration: z.number().min(0).max(5000),
    cooldownDuration: z.number().min(0).max(5000),
    sensitivity: z.number().min(0).max(1)
  }).partial().optional(),
  input: z.object({
    mouseSpeed: z.number().min(0.1).max(10),
    scrollSpeed: z.number().min(0.1).max(10)
  }).partial().optional(),
  bus: z.object({
    port: z.number().int().min(1024).max(65535),
    enabled: z.boolean()
  }).partial().optional(),
  visualization: z.object({
    defaultView: z.enum(['graph', 'manifold', 'split']),
    lodEnabled: z.boolean(),
    maxFps: z.number().int().min(1).max(240)
  }).partial().optional()
}).partial()

// ─── Calibration Profile Schema ──────────────────────────────────

export const CalibrationProfileSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  sensitivity: z.number().min(0).max(1),
  samples: z.array(z.object({
    gestureType: z.string(),
    landmarks: z.array(z.object({
      x: z.number(),
      y: z.number(),
      z: z.number()
    })).max(21),
    features: z.array(z.number()).max(50),
    timestamp: z.number()
  })).max(500),
  createdAt: z.number(),
  updatedAt: z.number()
})

// ─── Partial profile update schema (for PROFILE_UPDATE) ─────────

export const PartialCalibrationProfileSchema = CalibrationProfileSchema.partial()

// ─── Landmark / Hand Schemas ────────────────────────────────────

const LandmarkSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number()
})

const HandSchema = z.object({
  handedness: z.enum(['left', 'right']),
  landmarks: z.array(LandmarkSchema).length(21),
  worldLandmarks: z.array(LandmarkSchema).length(21),
  score: z.number().min(0).max(1)
})

export const LandmarkFrameSchema = z.object({
  hands: z.array(HandSchema).max(2),
  timestamp: z.number().nonnegative(),
  frameId: z.number().int().nonnegative()
})

// ─── Gesture Event Schema ───────────────────────────────────────

export const GestureEventSchema = z.object({
  type: z.enum([
    'pinch', 'point', 'open_palm', 'twist',
    'two_hand_pinch', 'flat_drag', 'fist', 'l_shape'
  ]),
  phase: z.enum(['onset', 'hold', 'release']),
  hand: z.enum(['left', 'right']),
  confidence: z.number().min(0).max(1),
  position: z.object({ x: z.number(), y: z.number(), z: z.number() }),
  timestamp: z.number().nonnegative(),
  data: z.record(z.number()).optional()
})

// ─── Mouse Command Schema ───────────────────────────────────────

export const MouseCommandSchema = z.object({
  target: z.literal('mouse'),
  action: z.enum([
    'move', 'click', 'doubleclick',
    'drag_start', 'drag_move', 'drag_end', 'scroll'
  ]),
  x: z.number().optional(),
  y: z.number().optional(),
  deltaX: z.number().optional(),
  deltaY: z.number().optional(),
  button: z.enum(['left', 'right', 'middle']).optional()
})

// ─── Keyboard Command Schema ────────────────────────────────────

export const KeyboardCommandSchema = z.object({
  target: z.literal('keyboard'),
  action: z.enum(['press', 'release', 'combo']),
  key: z.string().optional(),
  keys: z.array(z.string()).optional()
})
