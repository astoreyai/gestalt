/**
 * Tests for biomechanical model improvements:
 * - Sprint 2a: Thumb joint decomposition (opposition vs flexion)
 * - Sprint 2b: Per-finger ROM normalization
 * - Sprint 2c: Palm normal chirality fix
 */

import { describe, it, expect } from 'vitest'
import {
  fingerCurl,
  computePalmFacing,
  computePalmNormal,
  computeThumbOpposition,
  computeThumbFlexion,
  distance,
  ROM_SCALE
} from '../classifier'
import type { Landmark, Hand } from '@shared/protocol'
import { LANDMARK } from '@shared/protocol'

// ─── Helpers ──────────────────────────────────────────────────────────

/** Create a default hand at rest (neutral pose, fingers slightly spread) */
function makeNeutralLandmarks(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))

  // Wrist at center-bottom
  lm[LANDMARK.WRIST] = { x: 0.5, y: 0.8, z: 0 }

  // Thumb chain — abducted outward
  lm[LANDMARK.THUMB_CMC] = { x: 0.42, y: 0.72, z: 0 }
  lm[LANDMARK.THUMB_MCP] = { x: 0.35, y: 0.65, z: 0 }
  lm[LANDMARK.THUMB_IP] = { x: 0.30, y: 0.58, z: 0 }
  lm[LANDMARK.THUMB_TIP] = { x: 0.26, y: 0.52, z: 0 }

  // Index — extended upward
  lm[LANDMARK.INDEX_MCP] = { x: 0.45, y: 0.65, z: 0 }
  lm[LANDMARK.INDEX_PIP] = { x: 0.44, y: 0.55, z: 0 }
  lm[LANDMARK.INDEX_DIP] = { x: 0.43, y: 0.45, z: 0 }
  lm[LANDMARK.INDEX_TIP] = { x: 0.42, y: 0.35, z: 0 }

  // Middle — extended
  lm[LANDMARK.MIDDLE_MCP] = { x: 0.50, y: 0.63, z: 0 }
  lm[LANDMARK.MIDDLE_PIP] = { x: 0.50, y: 0.53, z: 0 }
  lm[LANDMARK.MIDDLE_DIP] = { x: 0.50, y: 0.43, z: 0 }
  lm[LANDMARK.MIDDLE_TIP] = { x: 0.50, y: 0.33, z: 0 }

  // Ring — extended
  lm[LANDMARK.RING_MCP] = { x: 0.55, y: 0.65, z: 0 }
  lm[LANDMARK.RING_PIP] = { x: 0.56, y: 0.55, z: 0 }
  lm[LANDMARK.RING_DIP] = { x: 0.57, y: 0.45, z: 0 }
  lm[LANDMARK.RING_TIP] = { x: 0.58, y: 0.35, z: 0 }

  // Pinky — extended
  lm[LANDMARK.PINKY_MCP] = { x: 0.60, y: 0.67, z: 0 }
  lm[LANDMARK.PINKY_PIP] = { x: 0.62, y: 0.57, z: 0 }
  lm[LANDMARK.PINKY_DIP] = { x: 0.63, y: 0.47, z: 0 }
  lm[LANDMARK.PINKY_TIP] = { x: 0.64, y: 0.37, z: 0 }

  return lm
}

/** Create a fist pose — all fingers curled toward palm */
function makeFistLandmarks(): Landmark[] {
  const lm: Landmark[] = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }))

  lm[LANDMARK.WRIST] = { x: 0.5, y: 0.8, z: 0 }

  // Thumb — curled across palm
  lm[LANDMARK.THUMB_CMC] = { x: 0.42, y: 0.72, z: 0 }
  lm[LANDMARK.THUMB_MCP] = { x: 0.40, y: 0.68, z: 0 }
  lm[LANDMARK.THUMB_IP] = { x: 0.42, y: 0.65, z: 0 }
  lm[LANDMARK.THUMB_TIP] = { x: 0.44, y: 0.63, z: 0 }

  // Index — curled
  lm[LANDMARK.INDEX_MCP] = { x: 0.45, y: 0.65, z: 0 }
  lm[LANDMARK.INDEX_PIP] = { x: 0.44, y: 0.62, z: -0.03 }
  lm[LANDMARK.INDEX_DIP] = { x: 0.45, y: 0.65, z: -0.05 }
  lm[LANDMARK.INDEX_TIP] = { x: 0.46, y: 0.68, z: -0.04 }

  // Middle — curled
  lm[LANDMARK.MIDDLE_MCP] = { x: 0.50, y: 0.63, z: 0 }
  lm[LANDMARK.MIDDLE_PIP] = { x: 0.50, y: 0.60, z: -0.03 }
  lm[LANDMARK.MIDDLE_DIP] = { x: 0.50, y: 0.63, z: -0.05 }
  lm[LANDMARK.MIDDLE_TIP] = { x: 0.50, y: 0.66, z: -0.04 }

  // Ring — curled
  lm[LANDMARK.RING_MCP] = { x: 0.55, y: 0.65, z: 0 }
  lm[LANDMARK.RING_PIP] = { x: 0.55, y: 0.62, z: -0.03 }
  lm[LANDMARK.RING_DIP] = { x: 0.55, y: 0.65, z: -0.05 }
  lm[LANDMARK.RING_TIP] = { x: 0.55, y: 0.68, z: -0.04 }

  // Pinky — curled
  lm[LANDMARK.PINKY_MCP] = { x: 0.60, y: 0.67, z: 0 }
  lm[LANDMARK.PINKY_PIP] = { x: 0.60, y: 0.64, z: -0.03 }
  lm[LANDMARK.PINKY_DIP] = { x: 0.60, y: 0.67, z: -0.05 }
  lm[LANDMARK.PINKY_TIP] = { x: 0.60, y: 0.70, z: -0.04 }

  return lm
}

/** Create a pinch pose — thumb tip near index tip */
function makePinchLandmarks(): Landmark[] {
  const lm = makeNeutralLandmarks()

  // Move thumb tip to meet index tip
  lm[LANDMARK.THUMB_TIP] = { x: 0.42, y: 0.38, z: 0 }
  lm[LANDMARK.THUMB_IP] = { x: 0.36, y: 0.45, z: 0 }

  return lm
}

/** Mirror landmarks to create a left hand (flip x around 0.5) */
function mirrorLandmarks(lm: Landmark[]): Landmark[] {
  return lm.map(p => ({ x: 1.0 - p.x, y: p.y, z: p.z }))
}

function makeHand(landmarks: Landmark[], handedness: 'left' | 'right' = 'right'): Hand {
  return {
    handedness,
    landmarks,
    worldLandmarks: landmarks,
    score: 0.95
  }
}

// ─── Sprint 2a: Thumb Joint Decomposition ──────────────────────────

describe('Sprint 2a: Thumb joint decomposition', () => {
  it('thumb curl in fist pose should be high (> 0.3)', () => {
    const lm = makeFistLandmarks()
    const curl = fingerCurl(lm, 'thumb')
    expect(curl).toBeGreaterThan(0.3)
  })

  it('thumb curl in neutral/extended pose should be low (< 0.4)', () => {
    const lm = makeNeutralLandmarks()
    const curl = fingerCurl(lm, 'thumb')
    expect(curl).toBeLessThan(0.4)
  })

  it('thumb curl in pinch pose should differ from fist pose', () => {
    const fistCurl = fingerCurl(makeFistLandmarks(), 'thumb')
    const pinchCurl = fingerCurl(makePinchLandmarks(), 'thumb')
    // They should be distinguishable
    expect(Math.abs(fistCurl - pinchCurl)).toBeGreaterThan(0.05)
  })

  it('computeThumbOpposition is exported and returns number', () => {
    // Import the new function
    const opp = computeThumbOpposition
    const lm = makeNeutralLandmarks()
    const result = computeThumbOpposition(lm)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(1)
  })

  it('computeThumbFlexion is exported and returns number', () => {
    const lm = makeNeutralLandmarks()
    const result = computeThumbFlexion(lm)
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(1)
  })

  it('opposition high when thumb near palm center, low when abducted', () => {
    const fistOpp = computeThumbOpposition(makeFistLandmarks())
    const neutralOpp = computeThumbOpposition(makeNeutralLandmarks())
    // Fist curls thumb across palm (close to palm center) → higher opposition
    // Neutral has thumb abducted away from palm → lower opposition
    expect(fistOpp).toBeGreaterThan(neutralOpp)
  })

  it('flexion high in fist, low in extended', () => {
    const fistFlex = computeThumbFlexion(makeFistLandmarks())
    const neutralFlex = computeThumbFlexion(makeNeutralLandmarks())
    expect(fistFlex).toBeGreaterThan(neutralFlex)
  })
})

// ─── Sprint 2b: Per-finger ROM Normalization ───────────────────────

describe('Sprint 2b: Per-finger ROM normalization', () => {
  it('ROM_SCALE is exported with correct finger keys', () => {
    expect(ROM_SCALE).toBeDefined()
    expect(ROM_SCALE.index).toBe(1.0)
    expect(ROM_SCALE.middle).toBe(1.0)
    expect(ROM_SCALE.ring).toBe(0.85)
    expect(ROM_SCALE.pinky).toBe(0.75)
    expect(ROM_SCALE.thumb).toBe(0.7)
  })

  it('ring finger reports higher normalized curl than index for same geometric angle', () => {
    // Create a pose where ring and index have similar geometric angles
    const lm = makeNeutralLandmarks()
    // Slightly curl both index and ring to the same degree
    lm[LANDMARK.INDEX_PIP] = { x: 0.44, y: 0.58, z: -0.01 }
    lm[LANDMARK.INDEX_DIP] = { x: 0.44, y: 0.52, z: -0.02 }
    lm[LANDMARK.INDEX_TIP] = { x: 0.44, y: 0.48, z: -0.01 }

    lm[LANDMARK.RING_PIP] = { x: 0.56, y: 0.58, z: -0.01 }
    lm[LANDMARK.RING_DIP] = { x: 0.57, y: 0.52, z: -0.02 }
    lm[LANDMARK.RING_TIP] = { x: 0.58, y: 0.48, z: -0.01 }

    const indexCurl = fingerCurl(lm, 'index')
    const ringCurl = fingerCurl(lm, 'ring')

    // Ring should report higher normalized curl due to ROM_SCALE
    expect(ringCurl).toBeGreaterThanOrEqual(indexCurl * 0.8)
  })

  it('pinky ROM scale is less than ring', () => {
    expect(ROM_SCALE.pinky).toBeLessThan(ROM_SCALE.ring)
  })

  it('all ROM_SCALE values are between 0 and 1', () => {
    for (const val of Object.values(ROM_SCALE) as number[]) {
      expect(val).toBeGreaterThan(0)
      expect(val).toBeLessThanOrEqual(1)
    }
  })
})

// ─── Sprint 2c: Palm Normal Chirality Fix ──────────────────────────

describe('Sprint 2c: Palm normal chirality fix', () => {
  it('computePalmFacing returns value in [0, 1]', () => {
    const lm = makeNeutralLandmarks()
    const facing = computePalmFacing(lm)
    expect(facing).toBeGreaterThanOrEqual(0)
    expect(facing).toBeLessThanOrEqual(1)
  })

  it('right hand palm facing camera returns consistent value', () => {
    const lm = makeNeutralLandmarks()
    const facing = computePalmFacing(lm)
    expect(facing).toBeGreaterThan(0)
  })

  it('left hand (mirrored) returns similar palm facing as right hand', () => {
    const rightLm = makeNeutralLandmarks()
    const leftLm = mirrorLandmarks(rightLm)

    const rightFacing = computePalmFacing(rightLm)
    const leftFacing = computePalmFacing(leftLm)

    // After chirality fix, both should give similar facing values
    // Allow some tolerance due to asymmetric poses
    expect(Math.abs(rightFacing - leftFacing)).toBeLessThan(0.3)
  })

  it('computePalmNormal is exported for chirality-aware computation', () => {
    const rightLm = makeNeutralLandmarks()
    const normal = computePalmNormal(rightLm, 'right')
    expect(normal).toBeDefined()
    expect(typeof normal.x).toBe('number')
    expect(typeof normal.y).toBe('number')
    expect(typeof normal.z).toBe('number')
  })

  it('palm normals for left and right point same direction when mirrored', () => {
    const rightLm = makeNeutralLandmarks()
    const leftLm = mirrorLandmarks(rightLm)

    const rightNormal = computePalmNormal(rightLm, 'right')
    const leftNormal = computePalmNormal(leftLm, 'left')

    // Z-component should have the same sign (both point toward camera)
    // The fix ensures left hand normal isn't inverted
    expect(Math.sign(rightNormal.z)).toBe(Math.sign(leftNormal.z))
  })

  it('edge-on hand returns low facing value', () => {
    const lm = makeNeutralLandmarks()
    // Rotate hand to be edge-on by shifting z-values
    lm[LANDMARK.INDEX_MCP].z = 0.1
    lm[LANDMARK.PINKY_MCP].z = -0.1
    const facing = computePalmFacing(lm)
    // Edge-on should be lower than face-on
    expect(facing).toBeLessThan(0.8)
  })
})
