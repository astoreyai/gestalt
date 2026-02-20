/**
 * Tests for calibration wizard pure logic.
 *
 * Does NOT test React component rendering.
 * Tests the data transformation functions exported from Calibration.tsx:
 *   - generateProfileId
 *   - nextProfileName
 *   - createBlankProfile
 *   - buildGestureSample
 *
 * Also validates CalibrationProfile shape and GestureSample shape.
 */

import { describe, it, expect } from 'vitest'
import { type Landmark, type CalibrationProfile, type GestureSample, GestureType, LANDMARK } from '@shared/protocol'
import {
  generateProfileId,
  nextProfileName,
  createBlankProfile,
  buildGestureSample
} from '../Calibration'
import { extractFeatures } from '../../gestures/features'

// ─── Synthetic Landmark Generators ─────────────────────────────────

function lm(x: number, y: number, z: number = 0): Landmark {
  return { x, y, z }
}

function makeOpenPalmLandmarks(): Landmark[] {
  const landmarks: Landmark[] = []
  landmarks.push(lm(0.5, 0.7, 0))
  landmarks.push(lm(0.42, 0.65, -0.01))
  landmarks.push(lm(0.38, 0.58, -0.02))
  landmarks.push(lm(0.35, 0.52, -0.02))
  landmarks.push(lm(0.33, 0.46, -0.02))
  landmarks.push(lm(0.44, 0.55, 0))
  landmarks.push(lm(0.43, 0.45, 0))
  landmarks.push(lm(0.43, 0.38, 0))
  landmarks.push(lm(0.43, 0.32, 0))
  landmarks.push(lm(0.50, 0.53, 0))
  landmarks.push(lm(0.50, 0.42, 0))
  landmarks.push(lm(0.50, 0.35, 0))
  landmarks.push(lm(0.50, 0.28, 0))
  landmarks.push(lm(0.56, 0.55, 0))
  landmarks.push(lm(0.56, 0.45, 0))
  landmarks.push(lm(0.56, 0.38, 0))
  landmarks.push(lm(0.56, 0.32, 0))
  landmarks.push(lm(0.62, 0.58, 0))
  landmarks.push(lm(0.62, 0.48, 0))
  landmarks.push(lm(0.62, 0.42, 0))
  landmarks.push(lm(0.62, 0.38, 0))
  return landmarks
}

function makeFistLandmarks(): Landmark[] {
  const lmk = makeOpenPalmLandmarks()
  for (const [, indices] of [
    ['thumb', [LANDMARK.THUMB_IP, LANDMARK.THUMB_TIP]],
    ['index', [LANDMARK.INDEX_DIP, LANDMARK.INDEX_TIP]],
    ['middle', [LANDMARK.MIDDLE_DIP, LANDMARK.MIDDLE_TIP]],
    ['ring', [LANDMARK.RING_DIP, LANDMARK.RING_TIP]],
    ['pinky', [LANDMARK.PINKY_DIP, LANDMARK.PINKY_TIP]]
  ] as const) {
    const [dip, tip] = indices as unknown as number[]
    lmk[dip] = lm(lmk[dip].x, lmk[dip].y + 0.12, 0.08)
    lmk[tip] = lm(lmk[tip].x, lmk[tip].y + 0.20, 0.10)
  }
  return lmk
}

// ─── generateProfileId Tests ────────────────────────────────────────

describe('generateProfileId', () => {
  it('should return a non-empty string', () => {
    const id = generateProfileId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('should start with "profile-"', () => {
    const id = generateProfileId()
    expect(id.startsWith('profile-')).toBe(true)
  })

  it('should generate unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateProfileId())
    }
    // All 100 should be unique
    expect(ids.size).toBe(100)
  })
})

// ─── nextProfileName Tests ──────────────────────────────────────────

describe('nextProfileName', () => {
  it('should return "Profile 1" for empty list', () => {
    expect(nextProfileName([])).toBe('Profile 1')
  })

  it('should return "Profile 2" when "Profile 1" exists', () => {
    expect(nextProfileName(['Profile 1'])).toBe('Profile 2')
  })

  it('should find gaps in numbering', () => {
    expect(nextProfileName(['Profile 1', 'Profile 3'])).toBe('Profile 2')
  })

  it('should skip all existing numbers', () => {
    expect(nextProfileName(['Profile 1', 'Profile 2', 'Profile 3'])).toBe('Profile 4')
  })

  it('should ignore non-standard names', () => {
    expect(nextProfileName(['Custom Name', 'My Setup'])).toBe('Profile 1')
  })
})

// ─── createBlankProfile Tests ───────────────────────────────────────

describe('createBlankProfile', () => {
  it('should return a valid CalibrationProfile shape', () => {
    const profile = createBlankProfile('Test')
    expect(profile.id).toBeDefined()
    expect(typeof profile.id).toBe('string')
    expect(profile.name).toBe('Test')
    expect(profile.sensitivity).toBe(0.5)
    expect(profile.samples).toEqual([])
    expect(typeof profile.createdAt).toBe('number')
    expect(typeof profile.updatedAt).toBe('number')
    expect(profile.createdAt).toBe(profile.updatedAt)
  })

  it('should generate unique IDs for different calls', () => {
    const p1 = createBlankProfile('A')
    const p2 = createBlankProfile('B')
    expect(p1.id).not.toBe(p2.id)
  })

  it('should set timestamps to recent values', () => {
    const before = Date.now()
    const profile = createBlankProfile('Test')
    const after = Date.now()
    expect(profile.createdAt).toBeGreaterThanOrEqual(before)
    expect(profile.createdAt).toBeLessThanOrEqual(after)
  })

  it('should have sensitivity default of 0.5', () => {
    const profile = createBlankProfile('Test')
    expect(profile.sensitivity).toBe(0.5)
  })

  it('should have an empty samples array', () => {
    const profile = createBlankProfile('Test')
    expect(Array.isArray(profile.samples)).toBe(true)
    expect(profile.samples.length).toBe(0)
  })
})

// ─── buildGestureSample Tests ───────────────────────────────────────

describe('buildGestureSample', () => {
  it('should return a valid GestureSample shape', () => {
    const sample = buildGestureSample(GestureType.OpenPalm, makeOpenPalmLandmarks())

    expect(sample.gestureType).toBe(GestureType.OpenPalm)
    expect(Array.isArray(sample.landmarks)).toBe(true)
    expect(sample.landmarks).toHaveLength(21)
    expect(Array.isArray(sample.features)).toBe(true)
    expect(sample.features).toHaveLength(14)
    expect(typeof sample.timestamp).toBe('number')
  })

  it('should deep-copy landmarks (not reference the original)', () => {
    const original = makeOpenPalmLandmarks()
    const sample = buildGestureSample(GestureType.OpenPalm, original)

    // Mutate the original
    original[0].x = 999
    // Sample should not be affected
    expect(sample.landmarks[0].x).not.toBe(999)
  })

  it('should produce features matching extractFeatures output', () => {
    const landmarks = makeOpenPalmLandmarks()
    const sample = buildGestureSample(GestureType.OpenPalm, landmarks)
    const directFeatures = extractFeatures(landmarks)

    expect(sample.features).toEqual(directFeatures)
  })

  it('should produce valid features for fist gesture', () => {
    const sample = buildGestureSample(GestureType.Fist, makeFistLandmarks())
    expect(sample.gestureType).toBe(GestureType.Fist)
    expect(sample.features).toHaveLength(14)
    for (const v of sample.features) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('should set a recent timestamp', () => {
    const before = Date.now()
    const sample = buildGestureSample(GestureType.Pinch, makeOpenPalmLandmarks())
    const after = Date.now()
    expect(sample.timestamp).toBeGreaterThanOrEqual(before)
    expect(sample.timestamp).toBeLessThanOrEqual(after)
  })

  it('should preserve all 21 landmark coordinates', () => {
    const landmarks = makeOpenPalmLandmarks()
    const sample = buildGestureSample(GestureType.OpenPalm, landmarks)
    for (let i = 0; i < 21; i++) {
      expect(sample.landmarks[i].x).toBeCloseTo(landmarks[i].x, 10)
      expect(sample.landmarks[i].y).toBeCloseTo(landmarks[i].y, 10)
      expect(sample.landmarks[i].z).toBeCloseTo(landmarks[i].z, 10)
    }
  })
})

// ─── Profile shape validation ───────────────────────────────────────

describe('CalibrationProfile shape', () => {
  it('should create a complete profile with samples', () => {
    const profile = createBlankProfile('Test Profile')

    // Add samples
    const sample1 = buildGestureSample(GestureType.Pinch, makeOpenPalmLandmarks())
    const sample2 = buildGestureSample(GestureType.Fist, makeFistLandmarks())
    profile.samples = [sample1, sample2]
    profile.sensitivity = 0.8
    profile.updatedAt = Date.now()

    // Validate full shape
    expect(profile.id).toBeTruthy()
    expect(profile.name).toBe('Test Profile')
    expect(profile.sensitivity).toBe(0.8)
    expect(profile.samples).toHaveLength(2)
    expect(profile.samples[0].gestureType).toBe(GestureType.Pinch)
    expect(profile.samples[1].gestureType).toBe(GestureType.Fist)
    expect(profile.createdAt).toBeLessThanOrEqual(profile.updatedAt)
  })

  it('should support all core gesture types in samples', () => {
    const coreGestures = [
      GestureType.Pinch,
      GestureType.Point,
      GestureType.OpenPalm,
      GestureType.Fist
    ]
    const landmarks = makeOpenPalmLandmarks()

    const profile = createBlankProfile('All Gestures')
    profile.samples = coreGestures.map(g => buildGestureSample(g, landmarks))

    expect(profile.samples).toHaveLength(4)
    const types = new Set(profile.samples.map(s => s.gestureType))
    for (const g of coreGestures) {
      expect(types.has(g)).toBe(true)
    }
  })

  it('should produce profiles with correct CalibrationProfile fields', () => {
    const profile = createBlankProfile('Field Check')

    // Check all required CalibrationProfile fields
    const requiredKeys: Array<keyof CalibrationProfile> = [
      'id', 'name', 'sensitivity', 'samples', 'createdAt', 'updatedAt'
    ]
    for (const key of requiredKeys) {
      expect(profile).toHaveProperty(key)
    }
  })
})
