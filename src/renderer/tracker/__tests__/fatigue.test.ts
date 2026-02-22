import { describe, it, expect, beforeEach } from 'vitest'
import { FatigueDetector, FatigueLevel } from '../fatigue'

describe('FatigueDetector', () => {
  let detector: FatigueDetector

  beforeEach(() => {
    detector = new FatigueDetector()
  })

  it('should report no fatigue when hand is below elevation threshold', () => {
    // wristY > 0.33 means hand is in the lower 2/3 of the frame (not elevated)
    const state = detector.update('right', 0.5, 0)
    expect(state.level).toBe(FatigueLevel.None)
    expect(state.durationMs).toBe(0)
    expect(state.handedness).toBe('right')
  })

  it('should report no fatigue at start even when elevated (0ms duration)', () => {
    const state = detector.update('right', 0.1, 1000)
    expect(state.level).toBe(FatigueLevel.None)
    expect(state.durationMs).toBe(0)
  })

  it('should report Warning level at exactly 60s of continuous elevation', () => {
    const t0 = 1000
    detector.update('right', 0.2, t0) // start elevation
    const state = detector.update('right', 0.2, t0 + 60_000)
    expect(state.level).toBe(FatigueLevel.Warning)
    expect(state.durationMs).toBe(60_000)
  })

  it('should report Critical level at exactly 90s of continuous elevation', () => {
    const t0 = 1000
    detector.update('right', 0.2, t0)
    const state = detector.update('right', 0.2, t0 + 90_000)
    expect(state.level).toBe(FatigueLevel.Critical)
    expect(state.durationMs).toBe(90_000)
  })

  it('should reset fatigue when arm drops below threshold', () => {
    const t0 = 0
    detector.update('right', 0.1, t0) // elevated
    detector.update('right', 0.1, t0 + 65_000) // Warning level

    // Arm drops
    const state = detector.update('right', 0.5, t0 + 66_000)
    expect(state.level).toBe(FatigueLevel.None)
    expect(state.durationMs).toBe(0)
  })

  it('should track left and right hands independently', () => {
    const t0 = 0
    // Left hand elevated
    detector.update('left', 0.1, t0)
    const leftState = detector.update('left', 0.1, t0 + 65_000)

    // Right hand not elevated
    const rightState = detector.update('right', 0.5, t0 + 65_000)

    expect(leftState.level).toBe(FatigueLevel.Warning)
    expect(leftState.handedness).toBe('left')
    expect(rightState.level).toBe(FatigueLevel.None)
    expect(rightState.handedness).toBe('right')
  })

  it('should track duration correctly across multiple updates', () => {
    const t0 = 0
    detector.update('right', 0.2, t0)
    detector.update('right', 0.15, t0 + 10_000)
    detector.update('right', 0.25, t0 + 20_000)
    const state = detector.update('right', 0.1, t0 + 30_000)
    expect(state.durationMs).toBe(30_000)
    expect(state.level).toBe(FatigueLevel.None) // Still below 60s Warning
  })

  it('should clear state on reset()', () => {
    const t0 = 0
    detector.update('right', 0.1, t0)
    detector.update('right', 0.1, t0 + 65_000) // Warning

    detector.reset()

    // After reset, starts fresh
    const state = detector.update('right', 0.1, t0 + 70_000)
    expect(state.level).toBe(FatigueLevel.None)
    expect(state.durationMs).toBe(0)
  })

  it('should clear only specified hand on reset(handedness)', () => {
    const t0 = 0
    detector.update('left', 0.1, t0)
    detector.update('right', 0.1, t0)

    detector.update('left', 0.1, t0 + 65_000)
    detector.update('right', 0.1, t0 + 65_000)

    // Reset only left
    detector.reset('left')

    // Left starts fresh
    const leftState = detector.update('left', 0.1, t0 + 70_000)
    expect(leftState.level).toBe(FatigueLevel.None)
    expect(leftState.durationMs).toBe(0)

    // Right continues tracking
    const rightState = detector.update('right', 0.1, t0 + 70_000)
    expect(rightState.level).toBe(FatigueLevel.Warning)
    expect(rightState.durationMs).toBe(70_000)
  })

  it('should start fresh counter after arm drop and re-elevation', () => {
    const t0 = 0
    detector.update('right', 0.1, t0) // elevated
    detector.update('right', 0.1, t0 + 30_000) // 30s in

    // Drop arm
    detector.update('right', 0.5, t0 + 31_000) // not elevated

    // Re-elevate — should start from 0
    detector.update('right', 0.1, t0 + 40_000) // new elevation start
    const state = detector.update('right', 0.1, t0 + 50_000)
    expect(state.durationMs).toBe(10_000) // Only 10s since re-elevation
    expect(state.level).toBe(FatigueLevel.None)
  })

  it('should handle boundary wristY exactly at threshold (0.33)', () => {
    // wristY == 0.33 is NOT elevated (threshold is strict <)
    const state = detector.update('right', 0.33, 0)
    expect(state.level).toBe(FatigueLevel.None)
    expect(state.durationMs).toBe(0)
  })

  it('should detect elevation when wristY is just below threshold', () => {
    const t0 = 0
    detector.update('right', 0.329, t0)
    const state = detector.update('right', 0.329, t0 + 60_000)
    expect(state.level).toBe(FatigueLevel.Warning)
  })
})
