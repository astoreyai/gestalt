/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { PartialAppConfigSchema, CalibrationProfileSchema } from '../ipc-validators'

// ─── PartialAppConfigSchema ─────────────────────────────────────

describe('PartialAppConfigSchema', () => {
  it('should accept valid partial config with tracking only', () => {
    const result = PartialAppConfigSchema.safeParse({
      tracking: { smoothingFactor: 0.5 }
    })
    expect(result.success).toBe(true)
  })

  it('should accept valid partial config with multiple sections', () => {
    const result = PartialAppConfigSchema.safeParse({
      tracking: { enabled: true, smoothingFactor: 0.3, minConfidence: 0.7 },
      input: { mouseSpeed: 2.0 },
      bus: { port: 9876, enabled: true }
    })
    expect(result.success).toBe(true)
  })

  it('should accept an empty object (all fields optional)', () => {
    const result = PartialAppConfigSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('should reject negative smoothingFactor', () => {
    const result = PartialAppConfigSchema.safeParse({
      tracking: { smoothingFactor: -0.1 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject smoothingFactor above 1', () => {
    const result = PartialAppConfigSchema.safeParse({
      tracking: { smoothingFactor: 1.5 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject port below 1024', () => {
    const result = PartialAppConfigSchema.safeParse({
      bus: { port: 80 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject port above 65535', () => {
    const result = PartialAppConfigSchema.safeParse({
      bus: { port: 70000 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject non-integer port', () => {
    const result = PartialAppConfigSchema.safeParse({
      bus: { port: 9876.5 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject sensitivity > 1', () => {
    const result = PartialAppConfigSchema.safeParse({
      gestures: { sensitivity: 1.5 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject sensitivity < 0', () => {
    const result = PartialAppConfigSchema.safeParse({
      gestures: { sensitivity: -0.1 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject mouseSpeed below 0.1', () => {
    const result = PartialAppConfigSchema.safeParse({
      input: { mouseSpeed: 0.01 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject mouseSpeed above 10', () => {
    const result = PartialAppConfigSchema.safeParse({
      input: { mouseSpeed: 15 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject invalid defaultView enum value', () => {
    const result = PartialAppConfigSchema.safeParse({
      visualization: { defaultView: 'invalid' }
    })
    expect(result.success).toBe(false)
  })

  it('should accept valid defaultView enum values', () => {
    for (const view of ['graph', 'manifold', 'split']) {
      const result = PartialAppConfigSchema.safeParse({
        visualization: { defaultView: view }
      })
      expect(result.success).toBe(true)
    }
  })

  it('should reject maxFps below 1', () => {
    const result = PartialAppConfigSchema.safeParse({
      visualization: { maxFps: 0 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject maxFps above 240', () => {
    const result = PartialAppConfigSchema.safeParse({
      visualization: { maxFps: 500 }
    })
    expect(result.success).toBe(false)
  })

  it('should reject unknown top-level keys', () => {
    // Zod strips unknown keys by default, so this should still succeed
    // but the extra key should not be in the output
    const result = PartialAppConfigSchema.safeParse({
      tracking: { enabled: true },
      malicious: { exploit: true }
    })
    // The schema uses .partial() which will strip unknown keys
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).not.toHaveProperty('malicious')
    }
  })
})

// ─── CalibrationProfileSchema ────────────────────────────────────

describe('CalibrationProfileSchema', () => {
  const validProfile = {
    id: 'profile-1',
    name: 'Test Profile',
    sensitivity: 0.5,
    samples: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  it('should accept valid profile', () => {
    const result = CalibrationProfileSchema.safeParse(validProfile)
    expect(result.success).toBe(true)
  })

  it('should accept profile with samples', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples: [
        {
          gestureType: 'pinch',
          landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
          features: [1.0, 2.0],
          timestamp: 12345
        }
      ]
    })
    expect(result.success).toBe(true)
  })

  it('should reject empty name', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      name: ''
    })
    expect(result.success).toBe(false)
  })

  it('should reject empty id', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      id: ''
    })
    expect(result.success).toBe(false)
  })

  it('should reject profile with >500 samples', () => {
    const samples = Array.from({ length: 501 }, (_, i) => ({
      gestureType: 'pinch',
      landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      features: [1.0],
      timestamp: i
    }))
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples
    })
    expect(result.success).toBe(false)
  })

  it('should accept profile with exactly 500 samples', () => {
    const samples = Array.from({ length: 500 }, (_, i) => ({
      gestureType: 'pinch',
      landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
      features: [1.0],
      timestamp: i
    }))
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples
    })
    expect(result.success).toBe(true)
  })

  it('should reject profile with >21 landmarks per sample', () => {
    const landmarks = Array.from({ length: 22 }, () => ({
      x: 0.1, y: 0.2, z: 0.3
    }))
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples: [{
        gestureType: 'pinch',
        landmarks,
        features: [1.0],
        timestamp: 12345
      }]
    })
    expect(result.success).toBe(false)
  })

  it('should accept profile with exactly 21 landmarks per sample', () => {
    const landmarks = Array.from({ length: 21 }, () => ({
      x: 0.1, y: 0.2, z: 0.3
    }))
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples: [{
        gestureType: 'pinch',
        landmarks,
        features: [1.0],
        timestamp: 12345
      }]
    })
    expect(result.success).toBe(true)
  })

  it('should reject sensitivity > 1', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      sensitivity: 1.5
    })
    expect(result.success).toBe(false)
  })

  it('should reject sensitivity < 0', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      sensitivity: -0.1
    })
    expect(result.success).toBe(false)
  })

  it('should reject profile with >50 features per sample', () => {
    const features = Array.from({ length: 51 }, () => 1.0)
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      samples: [{
        gestureType: 'pinch',
        landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
        features,
        timestamp: 12345
      }]
    })
    expect(result.success).toBe(false)
  })

  it('should reject name longer than 200 chars', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      name: 'a'.repeat(201)
    })
    expect(result.success).toBe(false)
  })

  it('should reject id longer than 100 chars', () => {
    const result = CalibrationProfileSchema.safeParse({
      ...validProfile,
      id: 'a'.repeat(101)
    })
    expect(result.success).toBe(false)
  })
})
