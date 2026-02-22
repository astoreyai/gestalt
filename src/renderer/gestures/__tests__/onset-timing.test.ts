import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG } from '@shared/protocol'
import { DEFAULT_GESTURE_CONFIG } from '../types'
import { GestureStateMachine, GestureState } from '../state'
import { GesturePhase } from '@shared/protocol'

describe('Onset Timing Defaults', () => {
  it('DEFAULT_CONFIG.gestures.minHoldDuration should be 80ms', () => {
    expect(DEFAULT_CONFIG.gestures.minHoldDuration).toBe(80)
  })

  it('DEFAULT_GESTURE_CONFIG.minHoldDuration should be 80ms', () => {
    expect(DEFAULT_GESTURE_CONFIG.minHoldDuration).toBe(80)
  })

  it('gesture should require 80ms hold before transitioning to Hold', () => {
    // Use default minHoldDuration (80ms) with minOnsetFrames=1
    const sm = new GestureStateMachine(1, 80, 100)

    // Frame 1 at t=0: idle -> onset
    expect(sm.update(true, 0)).toBe(GesturePhase.Onset)

    // Frame 2 at t=40: frames met but only 40ms < 80ms — no hold yet
    expect(sm.update(true, 40)).toBeNull()
    expect(sm.getState()).toBe(GestureState.Onset)

    // Frame 3 at t=80: now 80ms >= 80ms — transitions to Hold
    expect(sm.update(true, 80)).toBe(GesturePhase.Hold)
    expect(sm.getState()).toBe(GestureState.Hold)
  })

  it('gesture should NOT fire at 40ms hold with the new default', () => {
    // Use default minHoldDuration (80ms) with minOnsetFrames=1
    const sm = new GestureStateMachine(1, 80, 100)

    // Frame 1 at t=0: onset
    sm.update(true, 0)

    // Frame 2 at t=40: 40ms elapsed — should NOT transition to Hold
    const phase = sm.update(true, 40)
    expect(phase).not.toBe(GesturePhase.Hold)
    expect(sm.getState()).toBe(GestureState.Onset)
  })
})
