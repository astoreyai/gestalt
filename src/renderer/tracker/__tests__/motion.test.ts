import { describe, it, expect, beforeEach } from 'vitest'
import { HandMotionTracker } from '../motion'
import type { LandmarkFrame, Hand, Landmark, Handedness } from '@shared/protocol'

/** Create a minimal 21-landmark hand at a given wrist position */
function makeHand(handedness: Handedness, wristX: number, wristY: number, wristZ: number): Hand {
  const landmarks: Landmark[] = Array.from({ length: 21 }, (_, i) => {
    // Spread MCP joints around wrist for rotation measurement
    if (i === 5) return { x: wristX + 0.05, y: wristY - 0.08, z: wristZ } // INDEX_MCP
    if (i === 9) return { x: wristX, y: wristY - 0.1, z: wristZ }          // MIDDLE_MCP
    if (i === 13) return { x: wristX - 0.05, y: wristY - 0.08, z: wristZ } // RING_MCP
    return { x: wristX, y: wristY, z: wristZ }
  })
  return { handedness, landmarks, worldLandmarks: landmarks, score: 0.9 }
}

function makeFrame(hands: Hand[], timestamp: number, frameId: number): LandmarkFrame {
  return { hands, timestamp, frameId }
}

describe('HandMotionTracker', () => {
  let tracker: HandMotionTracker

  beforeEach(() => {
    tracker = new HandMotionTracker()
  })

  it('returns empty array for empty frame', () => {
    const frame = makeFrame([], 0, 0)
    expect(tracker.update(frame)).toEqual([])
  })

  it('returns zero velocity on first frame', () => {
    const hand = makeHand('right', 0.5, 0.5, 0.3)
    const frame = makeFrame([hand], 100, 0)
    const metrics = tracker.update(frame)
    expect(metrics).toHaveLength(1)
    expect(metrics[0].velocity).toBe(0)
    expect(metrics[0].rotationRate).toBe(0)
    expect(metrics[0].handedness).toBe('right')
  })

  it('computes positive velocity from movement', () => {
    const frame1 = makeFrame([makeHand('right', 0.5, 0.5, 0.3)], 100, 0)
    const frame2 = makeFrame([makeHand('right', 0.6, 0.5, 0.3)], 200, 1)
    tracker.update(frame1)
    const metrics = tracker.update(frame2)
    expect(metrics[0].velocity).toBeGreaterThan(0)
  })

  it('computes rotation rate from orientation change', () => {
    // Frame 1: MCPs above wrist
    const hand1 = makeHand('right', 0.5, 0.5, 0.3)
    // Frame 2: rotate MCPs (change x spread)
    const hand2 = makeHand('right', 0.5, 0.5, 0.3)
    hand2.landmarks[5] = { x: 0.58, y: 0.42, z: 0.3 }
    hand2.landmarks[9] = { x: 0.53, y: 0.40, z: 0.3 }
    hand2.landmarks[13] = { x: 0.48, y: 0.42, z: 0.3 }

    tracker.update(makeFrame([hand1], 100, 0))
    const metrics = tracker.update(makeFrame([hand2], 200, 1))
    expect(metrics[0].rotationRate).toBeGreaterThan(0)
  })

  it('tracks distanceFromOrigin from wrist z', () => {
    const hand = makeHand('right', 0.5, 0.5, 0.7)
    const frame = makeFrame([hand], 100, 0)
    const metrics = tracker.update(frame)
    expect(metrics[0].distanceFromOrigin).toBeCloseTo(0.7, 1)
  })

  it('tracks left and right hands independently', () => {
    const left = makeHand('left', 0.3, 0.5, 0.2)
    const right = makeHand('right', 0.7, 0.5, 0.4)
    const frame = makeFrame([left, right], 100, 0)
    const metrics = tracker.update(frame)
    expect(metrics).toHaveLength(2)
    const leftM = metrics.find(m => m.handedness === 'left')!
    const rightM = metrics.find(m => m.handedness === 'right')!
    expect(leftM.distanceFromOrigin).toBeCloseTo(0.2, 1)
    expect(rightM.distanceFromOrigin).toBeCloseTo(0.4, 1)
  })

  it('applies EMA smoothing to velocity', () => {
    // Big velocity spike then stop — EMA should smooth the drop
    const frame1 = makeFrame([makeHand('right', 0.5, 0.5, 0.3)], 100, 0)
    const frame2 = makeFrame([makeHand('right', 0.8, 0.5, 0.3)], 200, 1)
    const frame3 = makeFrame([makeHand('right', 0.8, 0.5, 0.3)], 300, 2)

    tracker.update(frame1)
    const spikeMetrics = tracker.update(frame2)
    const spikeVelocity = spikeMetrics[0].velocity // capture before overwrite
    const after = tracker.update(frame3)
    // After stop, velocity should still be > 0 due to EMA
    expect(after[0].velocity).toBeGreaterThan(0)
    expect(after[0].velocity).toBeLessThan(spikeVelocity)
  })

  it('handles angle wrapping correctly', () => {
    // Rotation near PI boundary should not produce huge rotation rate
    const hand1 = makeHand('right', 0.5, 0.5, 0.3)
    // Manipulate MCPs to create angle near PI
    hand1.landmarks[5] = { x: 0.45, y: 0.5, z: 0.3 }
    hand1.landmarks[9] = { x: 0.5, y: 0.5, z: 0.3 }
    hand1.landmarks[13] = { x: 0.55, y: 0.5, z: 0.3 }

    const hand2 = makeHand('right', 0.5, 0.5, 0.3)
    hand2.landmarks[5] = { x: 0.45, y: 0.5, z: 0.3 }
    hand2.landmarks[9] = { x: 0.5, y: 0.501, z: 0.3 }
    hand2.landmarks[13] = { x: 0.55, y: 0.5, z: 0.3 }

    tracker.update(makeFrame([hand1], 100, 0))
    const metrics = tracker.update(makeFrame([hand2], 200, 1))
    // Should be a small rotation, not a huge jump
    expect(metrics[0].rotationRate).toBeLessThan(50)
  })

  it('EMA converges towards zero when hand is stationary', () => {
    const hand = makeHand('right', 0.5, 0.5, 0.3)
    tracker.update(makeFrame([makeHand('right', 0.3, 0.3, 0.3)], 100, 0))
    tracker.update(makeFrame([hand], 200, 1))

    // Feed same position many times
    let lastVel = Infinity
    for (let i = 0; i < 20; i++) {
      const m = tracker.update(makeFrame([hand], 300 + i * 100, 2 + i))
      expect(m[0].velocity).toBeLessThanOrEqual(lastVel + 0.001)
      lastVel = m[0].velocity
    }
    expect(lastVel).toBeLessThan(0.01)
  })

  it('reset clears state for a specific hand', () => {
    const frame1 = makeFrame([makeHand('right', 0.5, 0.5, 0.3)], 100, 0)
    tracker.update(frame1)
    tracker.reset('right')
    // After reset, next frame should be treated as first (zero velocity)
    const frame2 = makeFrame([makeHand('right', 0.8, 0.8, 0.3)], 200, 1)
    const metrics = tracker.update(frame2)
    expect(metrics[0].velocity).toBe(0)
  })

  it('reset without argument clears all hands', () => {
    tracker.update(makeFrame([makeHand('left', 0.3, 0.5, 0.2), makeHand('right', 0.7, 0.5, 0.4)], 100, 0))
    tracker.reset()
    const metrics = tracker.update(makeFrame([makeHand('left', 0.5, 0.5, 0.2), makeHand('right', 0.5, 0.5, 0.4)], 200, 1))
    expect(metrics[0].velocity).toBe(0)
    expect(metrics[1].velocity).toBe(0)
  })

  it('handles zero dt gracefully (same timestamp)', () => {
    tracker.update(makeFrame([makeHand('right', 0.5, 0.5, 0.3)], 100, 0))
    const metrics = tracker.update(makeFrame([makeHand('right', 0.6, 0.5, 0.3)], 100, 1))
    // Should not produce Infinity or NaN
    expect(Number.isFinite(metrics[0].velocity)).toBe(true)
    expect(Number.isFinite(metrics[0].rotationRate)).toBe(true)
  })

  it('handles stale timestamps (>500ms gap) gracefully', () => {
    tracker.update(makeFrame([makeHand('right', 0.5, 0.5, 0.3)], 100, 0))
    const metrics = tracker.update(makeFrame([makeHand('right', 0.8, 0.8, 0.3)], 1000, 1))
    // Should treat as first frame after gap (no huge velocity spike)
    expect(metrics[0].velocity).toBe(0)
  })

  it('custom smoothing alpha', () => {
    const fast = new HandMotionTracker(0.9) // high alpha = less smoothing
    const slow = new HandMotionTracker(0.1) // low alpha = more smoothing
    const f1 = makeFrame([makeHand('right', 0.5, 0.5, 0.3)], 100, 0)
    const f2 = makeFrame([makeHand('right', 0.8, 0.5, 0.3)], 200, 1)
    const f3 = makeFrame([makeHand('right', 0.8, 0.5, 0.3)], 300, 2)
    fast.update(f1); slow.update(f1)
    fast.update(f2); slow.update(f2)
    const fastM = fast.update(f3)
    const slowM = slow.update(f3)
    // Slow tracker should retain more of the spike velocity
    expect(slowM[0].velocity).toBeGreaterThan(fastM[0].velocity)
  })
})
