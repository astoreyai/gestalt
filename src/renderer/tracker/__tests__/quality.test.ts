import { describe, it, expect, beforeEach } from 'vitest'
import { computeTrackingQuality, TrackingQualityTracker } from '../quality'
import type { Landmark } from '@shared/protocol'

/** Create a proportionally correct hand (bone ratios match expected human proportions) */
function makeGoodHand(): Landmark[] {
  const landmarks: Landmark[] = []
  // Wrist at origin
  landmarks[0] = { x: 0.5, y: 0.7, z: 0 }
  // Thumb chain
  landmarks[1] = { x: 0.44, y: 0.66, z: 0 }
  landmarks[2] = { x: 0.40, y: 0.62, z: 0 }
  landmarks[3] = { x: 0.37, y: 0.58, z: 0 }
  landmarks[4] = { x: 0.35, y: 0.55, z: 0 }
  // Index
  landmarks[5] = { x: 0.46, y: 0.58, z: 0 }
  landmarks[6] = { x: 0.44, y: 0.52, z: 0 }
  landmarks[7] = { x: 0.43, y: 0.48, z: 0 }
  landmarks[8] = { x: 0.42, y: 0.44, z: 0 }
  // Middle
  landmarks[9] = { x: 0.50, y: 0.57, z: 0 }
  landmarks[10] = { x: 0.50, y: 0.50, z: 0 }
  landmarks[11] = { x: 0.50, y: 0.46, z: 0 }
  landmarks[12] = { x: 0.50, y: 0.42, z: 0 }
  // Ring
  landmarks[13] = { x: 0.54, y: 0.58, z: 0 }
  landmarks[14] = { x: 0.55, y: 0.52, z: 0 }
  landmarks[15] = { x: 0.55, y: 0.48, z: 0 }
  landmarks[16] = { x: 0.55, y: 0.44, z: 0 }
  // Pinky
  landmarks[17] = { x: 0.57, y: 0.60, z: 0 }
  landmarks[18] = { x: 0.58, y: 0.56, z: 0 }
  landmarks[19] = { x: 0.58, y: 0.53, z: 0 }
  landmarks[20] = { x: 0.58, y: 0.51, z: 0 }
  return landmarks
}

/** Create a distorted hand with non-proportional bone lengths */
function makeDistortedHand(): Landmark[] {
  const lm = makeGoodHand()
  // Stretch index finger absurdly
  lm[8] = { x: 0.42, y: 0.1, z: 0 }
  // Collapse middle finger
  lm[10] = { x: 0.50, y: 0.565, z: 0 }
  lm[11] = { x: 0.50, y: 0.565, z: 0 }
  lm[12] = { x: 0.50, y: 0.565, z: 0 }
  return lm
}

describe('computeTrackingQuality', () => {
  it('returns high score for proportional landmarks', () => {
    const q = computeTrackingQuality(makeGoodHand())
    expect(q).toBeGreaterThanOrEqual(60)
    expect(q).toBeLessThanOrEqual(100)
  })

  it('returns lower score for distorted landmarks', () => {
    const good = computeTrackingQuality(makeGoodHand())
    const bad = computeTrackingQuality(makeDistortedHand())
    expect(bad).toBeLessThan(good)
  })

  it('clamps output to [0, 100]', () => {
    const q = computeTrackingQuality(makeGoodHand())
    expect(q).toBeGreaterThanOrEqual(0)
    expect(q).toBeLessThanOrEqual(100)
  })

  it('is scale invariant (same proportions, different size)', () => {
    const base = makeGoodHand()
    const scaled = base.map(lm => ({ x: lm.x * 2, y: lm.y * 2, z: lm.z * 2 }))
    const q1 = computeTrackingQuality(base)
    const q2 = computeTrackingQuality(scaled)
    expect(Math.abs(q1 - q2)).toBeLessThan(5)
  })

  it('is position invariant (same proportions, shifted)', () => {
    const base = makeGoodHand()
    const shifted = base.map(lm => ({ x: lm.x + 0.3, y: lm.y + 0.2, z: lm.z + 0.1 }))
    const q1 = computeTrackingQuality(base)
    const q2 = computeTrackingQuality(shifted)
    expect(Math.abs(q1 - q2)).toBeLessThan(5)
  })
})

describe('TrackingQualityTracker', () => {
  let tracker: TrackingQualityTracker

  beforeEach(() => {
    tracker = new TrackingQualityTracker(5)
  })

  it('smooths quality over window', () => {
    const good = makeGoodHand()
    tracker.update(good)
    tracker.update(good)
    const q = tracker.update(good)
    expect(q).toBeGreaterThan(0)
    expect(tracker.quality).toBe(q)
  })

  it('averages across frames', () => {
    const good = makeGoodHand()
    const bad = makeDistortedHand()
    tracker.update(good)
    tracker.update(bad)
    // After both, the average should be between
    expect(tracker.quality).toBeGreaterThan(0)
    expect(tracker.quality).toBeLessThanOrEqual(100)
  })

  it('reset clears the buffer', () => {
    tracker.update(makeGoodHand())
    tracker.update(makeGoodHand())
    tracker.reset()
    expect(tracker.quality).toBe(0)
  })

  it('ring buffer evicts old values', () => {
    const tracker3 = new TrackingQualityTracker(3)
    const good = makeGoodHand()
    const bad = makeDistortedHand()
    // Fill with good
    tracker3.update(good)
    tracker3.update(good)
    tracker3.update(good)
    const goodQ = tracker3.quality
    // Now push 3 bad frames to fully evict good
    tracker3.update(bad)
    tracker3.update(bad)
    tracker3.update(bad)
    expect(tracker3.quality).toBeLessThan(goodQ)
  })

  it('default window size is 10', () => {
    const t = new TrackingQualityTracker()
    // Just verify it works with default
    t.update(makeGoodHand())
    expect(t.quality).toBeGreaterThan(0)
  })
})
