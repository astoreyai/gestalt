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
