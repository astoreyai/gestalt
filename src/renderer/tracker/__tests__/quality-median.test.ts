import { describe, it, expect, beforeEach } from 'vitest'
import { computeTrackingQuality, TrackingQualityTracker } from '../quality'
import type { Landmark } from '@shared/protocol'

/**
 * Tests for median-based quality smoothing in TrackingQualityTracker.
 * The tracker should use median instead of arithmetic mean for robustness to outliers.
 */

/** Create a proportionally correct hand (bone ratios match expected human proportions) */
function makeGoodHand(): Landmark[] {
  const landmarks: Landmark[] = []
  landmarks[0] = { x: 0.5, y: 0.7, z: 0 }
  landmarks[1] = { x: 0.44, y: 0.66, z: 0 }
  landmarks[2] = { x: 0.40, y: 0.62, z: 0 }
  landmarks[3] = { x: 0.37, y: 0.58, z: 0 }
  landmarks[4] = { x: 0.35, y: 0.55, z: 0 }
  landmarks[5] = { x: 0.46, y: 0.58, z: 0 }
  landmarks[6] = { x: 0.44, y: 0.52, z: 0 }
  landmarks[7] = { x: 0.43, y: 0.48, z: 0 }
  landmarks[8] = { x: 0.42, y: 0.44, z: 0 }
  landmarks[9] = { x: 0.50, y: 0.57, z: 0 }
  landmarks[10] = { x: 0.50, y: 0.50, z: 0 }
  landmarks[11] = { x: 0.50, y: 0.46, z: 0 }
  landmarks[12] = { x: 0.50, y: 0.42, z: 0 }
  landmarks[13] = { x: 0.54, y: 0.58, z: 0 }
  landmarks[14] = { x: 0.55, y: 0.52, z: 0 }
  landmarks[15] = { x: 0.55, y: 0.48, z: 0 }
  landmarks[16] = { x: 0.55, y: 0.44, z: 0 }
  landmarks[17] = { x: 0.57, y: 0.60, z: 0 }
  landmarks[18] = { x: 0.58, y: 0.56, z: 0 }
  landmarks[19] = { x: 0.58, y: 0.53, z: 0 }
  landmarks[20] = { x: 0.58, y: 0.51, z: 0 }
  return landmarks
}

/** Create a distorted hand with non-proportional bone lengths */
function makeDistortedHand(): Landmark[] {
  const lm = makeGoodHand()
  lm[8] = { x: 0.42, y: 0.1, z: 0 }
  lm[10] = { x: 0.50, y: 0.565, z: 0 }
  lm[11] = { x: 0.50, y: 0.565, z: 0 }
  lm[12] = { x: 0.50, y: 0.565, z: 0 }
  return lm
}

describe('TrackingQualityTracker — median smoothing', () => {
  it('handles single outlier spike (median stable, mean would shift)', () => {
    // Window of 5: fill with good frames, then one distorted frame
    const tracker = new TrackingQualityTracker(5)
    const goodHand = makeGoodHand()
    const badHand = makeDistortedHand()

    const goodQ = computeTrackingQuality(goodHand)
    const badQ = computeTrackingQuality(badHand)

    // Fill 4 good frames
    tracker.update(goodHand)
    tracker.update(goodHand)
    tracker.update(goodHand)
    tracker.update(goodHand)

    // One bad frame (outlier)
    const afterOutlier = tracker.update(badHand)

    // With median: buffer is [goodQ, goodQ, goodQ, goodQ, badQ] sorted →
    // median should be goodQ (middle of 5 sorted values)
    // With mean: would be (4*goodQ + badQ) / 5 — shifted down
    // Median should be very close to goodQ
    expect(afterOutlier).toBeCloseTo(goodQ, 0)

    // Verify that mean would give a different (lower) result
    const expectedMean = (4 * goodQ + badQ) / 5
    expect(expectedMean).toBeLessThan(goodQ)
  })

  it('odd window size returns middle element', () => {
    const tracker = new TrackingQualityTracker(3)
    const goodHand = makeGoodHand()
    const badHand = makeDistortedHand()

    const goodQ = computeTrackingQuality(goodHand)

    // Two good, one bad: sorted → [badQ, goodQ, goodQ], median = goodQ
    tracker.update(goodHand)
    tracker.update(badHand)
    const q = tracker.update(goodHand)

    expect(q).toBeCloseTo(goodQ, 0)
  })

  it('even window size returns average of two middle elements', () => {
    const tracker = new TrackingQualityTracker(4)
    const goodHand = makeGoodHand()
    const badHand = makeDistortedHand()

    const goodQ = computeTrackingQuality(goodHand)
    const badQ = computeTrackingQuality(badHand)

    // Fill: [goodQ, goodQ, badQ, goodQ] sorted → [badQ, goodQ, goodQ, goodQ]
    // Median = (goodQ + goodQ) / 2 = goodQ
    tracker.update(goodHand)
    tracker.update(goodHand)
    tracker.update(badHand)
    const q = tracker.update(goodHand)

    expect(q).toBeCloseTo(goodQ, 0)
  })

  it('window of 1 returns exact value', () => {
    const tracker = new TrackingQualityTracker(1)
    const goodHand = makeGoodHand()
    const goodQ = computeTrackingQuality(goodHand)

    const q = tracker.update(goodHand)
    expect(q).toBeCloseTo(goodQ, 5)
  })

  it('quality score still in [0, 100] range', () => {
    const tracker = new TrackingQualityTracker(5)
    const goodHand = makeGoodHand()
    const badHand = makeDistortedHand()

    for (let i = 0; i < 10; i++) {
      const hand = i % 3 === 0 ? badHand : goodHand
      const q = tracker.update(hand)
      expect(q).toBeGreaterThanOrEqual(0)
      expect(q).toBeLessThanOrEqual(100)
    }
  })

  it('computeTrackingQuality unchanged (unit test)', () => {
    const goodHand = makeGoodHand()
    const q = computeTrackingQuality(goodHand)
    // Should still return reasonable score for well-proportioned hand
    expect(q).toBeGreaterThanOrEqual(60)
    expect(q).toBeLessThanOrEqual(100)
    // Should be deterministic
    expect(computeTrackingQuality(goodHand)).toBe(q)
  })
})
