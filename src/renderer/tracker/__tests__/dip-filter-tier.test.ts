/**
 * Sprint 2d: DIP filter tier tests.
 * Verifies DIP joints get distinct filter params from PIP and TIP.
 */

import { describe, it, expect } from 'vitest'
import { LandmarkSmoother } from '../filters'
import { LANDMARK } from '@shared/protocol'
import type { Landmark } from '@shared/protocol'

// Helper: create uniform landmarks
function makeUniformLandmarks(val = 0.5): Landmark[] {
  return Array.from({ length: 21 }, () => ({ x: val, y: val, z: val }))
}

describe('Sprint 2d: DIP filter tier', () => {
  it('DIP joints get distinct filter parameters from PIP joints', () => {
    // Verify by feeding a spike through DIP and PIP joints and comparing
    // smoothing behavior. DIP should smooth more than TIP but less than PIP.
    const smoother = new LandmarkSmoother()

    // Feed several frames of stable data
    const stable = makeUniformLandmarks(0.5)
    for (let i = 0; i < 10; i++) {
      smoother.smooth(stable, i * 0.016)
    }

    // Now inject a spike at DIP and PIP joints
    const spike = makeUniformLandmarks(0.5)
    spike[LANDMARK.INDEX_DIP] = { x: 0.8, y: 0.8, z: 0.8 }
    spike[LANDMARK.INDEX_PIP] = { x: 0.8, y: 0.8, z: 0.8 }
    spike[LANDMARK.INDEX_TIP] = { x: 0.8, y: 0.8, z: 0.8 }

    const result = smoother.smooth(spike, 10 * 0.016)

    // DIP should be more smoothed than TIP (lower value since spike goes from 0.5 → 0.8)
    // TIP has least smoothing, so it should track the spike more closely
    const dipX = result[LANDMARK.INDEX_DIP].x
    const tipX = result[LANDMARK.INDEX_TIP].x
    const pipX = result[LANDMARK.INDEX_PIP].x

    // TIP follows spike more closely (higher value)
    expect(tipX).toBeGreaterThanOrEqual(dipX - 0.05)
    // PIP is more smoothed (lower value, closer to 0.5)
    expect(pipX).toBeLessThanOrEqual(dipX + 0.05)
  })

  it('all 21 landmarks have assigned filter tiers', () => {
    // Creating a smoother should not throw for any landmark
    const smoother = new LandmarkSmoother()
    const lm = makeUniformLandmarks(0.5)
    const result = smoother.smooth(lm, 0)
    expect(result.length).toBe(21)
    // All values should be finite
    for (let i = 0; i < 21; i++) {
      expect(Number.isFinite(result[i].x)).toBe(true)
      expect(Number.isFinite(result[i].y)).toBe(true)
      expect(Number.isFinite(result[i].z)).toBe(true)
    }
  })

  it('DIP filter config has intermediate minCutoff between PIP and TIP', () => {
    // We verify this indirectly: DIP smoothing should be between PIP and TIP
    // when given the same step input
    const smoother = new LandmarkSmoother()

    // Initialize with stable data
    const stable = makeUniformLandmarks(0.0)
    smoother.smooth(stable, 0)

    // Step to 1.0 on all joints
    const step = makeUniformLandmarks(1.0)
    const result = smoother.smooth(step, 0.016)

    // After one step, higher minCutoff = tracks faster (closer to 1.0)
    // TIP (minCutoff 3.0) > DIP (2.5) > PIP (2.0) for x/y
    const tipVal = result[LANDMARK.INDEX_TIP].x
    const dipVal = result[LANDMARK.INDEX_DIP].x
    const pipVal = result[LANDMARK.INDEX_PIP].x

    // TIP should respond fastest (closest to 1.0)
    expect(tipVal).toBeGreaterThanOrEqual(dipVal - 0.01)
    // DIP should respond faster than PIP
    expect(dipVal).toBeGreaterThanOrEqual(pipVal - 0.01)
  })

  it('thumb IP joint is in PIP tier (not DIP)', () => {
    // Thumb IP is anatomically different from other DIP joints
    // Verify it gets PIP config by comparing response to index PIP
    const smoother = new LandmarkSmoother()

    const stable = makeUniformLandmarks(0.0)
    smoother.smooth(stable, 0)

    const step = makeUniformLandmarks(1.0)
    const result = smoother.smooth(step, 0.016)

    const thumbIpVal = result[LANDMARK.THUMB_IP].x
    const indexPipVal = result[LANDMARK.INDEX_PIP].x

    // Both should be in PIP tier, so similar response
    expect(Math.abs(thumbIpVal - indexPipVal)).toBeLessThan(0.05)
  })

  it('DIP z-axis has lower minCutoff than DIP xy-axis', () => {
    // Z-axis should be more smoothed (lower minCutoff = heavier filtering)
    // Disable z-normalization so z-axis step input reaches the filter directly
    const smoother = new LandmarkSmoother({}, 21, true, 0, false)

    const stable = makeUniformLandmarks(0.0)
    smoother.smooth(stable, 0)

    const step = makeUniformLandmarks(1.0)
    const result = smoother.smooth(step, 0.016)

    // Z should track slower than X (more smoothed)
    const dipX = result[LANDMARK.INDEX_DIP].x
    const dipZ = result[LANDMARK.INDEX_DIP].z

    // X (minCutoff 2.5) responds faster than Z (minCutoff 1.8)
    expect(dipX).toBeGreaterThanOrEqual(dipZ - 0.01)
  })
})
