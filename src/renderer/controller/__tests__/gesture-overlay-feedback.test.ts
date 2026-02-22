import { describe, it, expect } from 'vitest'
import { updateLabelState } from '../gesture-label-state'
import type { LabelState } from '../gesture-label-state'

describe('Gesture label persistence (updateLabelState)', () => {
  it('returns null when no gesture and no current state', () => {
    const result = updateLabelState(null, null, 1000)
    expect(result).toBeNull()
  })

  it('returns active label (opacity 1.0) when gesture phase is onset', () => {
    const result = updateLabelState(null, { type: 'pinch', phase: 'onset' }, 1000)
    expect(result).toEqual({ text: 'pinch', opacity: 1.0, expireTime: 0 })
  })

  it('returns active label (opacity 1.0) when gesture phase is hold', () => {
    const result = updateLabelState(null, { type: 'point', phase: 'hold' }, 2000)
    expect(result).toEqual({ text: 'point', opacity: 1.0, expireTime: 0 })
  })

  it('sets expireTime when gesture transitions to release', () => {
    const result = updateLabelState(
      { text: 'pinch', opacity: 1.0, expireTime: 0 },
      { type: 'pinch', phase: 'release' },
      1000,
      500
    )
    expect(result).not.toBeNull()
    expect(result!.text).toBe('pinch')
    expect(result!.opacity).toBe(1.0)
    expect(result!.expireTime).toBe(1500) // now + fadeDuration
  })

  it('sets expireTime when gesture becomes null (lost tracking)', () => {
    const current: LabelState = { text: 'fist', opacity: 1.0, expireTime: 0 }
    const result = updateLabelState(current, null, 2000, 500)
    expect(result).not.toBeNull()
    expect(result!.text).toBe('fist')
    expect(result!.expireTime).toBe(2500) // now + fadeDuration
  })

  it('returns fading label (opacity < 1.0) during fade period', () => {
    // Fading label: expireTime=1500, fadeDuration=500, now=1250 → 250ms remain → opacity 0.5
    const current: LabelState = { text: 'pinch', opacity: 1.0, expireTime: 1500 }
    const result = updateLabelState(current, null, 1250, 500)
    expect(result).not.toBeNull()
    expect(result!.text).toBe('pinch')
    expect(result!.opacity).toBeCloseTo(0.5, 5)
  })

  it('returns null after fade period expires', () => {
    const current: LabelState = { text: 'pinch', opacity: 0.1, expireTime: 1500 }
    const result = updateLabelState(current, null, 1600, 500)
    expect(result).toBeNull()
  })

  it('replaces label when new gesture type arrives during fade', () => {
    // Currently fading "pinch", but a new "point" onset arrives
    const current: LabelState = { text: 'pinch', opacity: 0.5, expireTime: 1500 }
    const result = updateLabelState(current, { type: 'point', phase: 'onset' }, 1300, 500)
    expect(result).toEqual({ text: 'point', opacity: 1.0, expireTime: 0 })
  })

  it('opacity is proportional to remaining time (linear fade)', () => {
    const fadeDuration = 500
    const expireTime = 2000
    const current: LabelState = { text: 'twist', opacity: 1.0, expireTime }

    // 100ms into fade → 400ms remain → opacity = 400/500 = 0.8
    const r1 = updateLabelState(current, null, 1600, fadeDuration)
    expect(r1).not.toBeNull()
    expect(r1!.opacity).toBeCloseTo(0.8, 5)

    // 250ms into fade → 250ms remain → opacity = 250/500 = 0.5
    const r2 = updateLabelState(current, null, 1750, fadeDuration)
    expect(r2).not.toBeNull()
    expect(r2!.opacity).toBeCloseTo(0.5, 5)

    // 450ms into fade → 50ms remain → opacity = 50/500 = 0.1
    const r3 = updateLabelState(current, null, 1950, fadeDuration)
    expect(r3).not.toBeNull()
    expect(r3!.opacity).toBeCloseTo(0.1, 5)

    // Exactly at expireTime → 0ms remain → null
    const r4 = updateLabelState(current, null, 2000, fadeDuration)
    expect(r4).toBeNull()
  })
})
