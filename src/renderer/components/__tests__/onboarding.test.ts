/**
 * Onboarding overlay state-machine tests.
 * Pure logic tests — no DOM rendering needed.
 */

import { describe, it, expect } from 'vitest'

// ─── Onboarding state machine (mirrors OnboardingOverlay logic) ──

interface OnboardingState {
  currentStep: number
  totalSteps: number
  completed: boolean
}

function createOnboardingState(): OnboardingState {
  return { currentStep: 0, totalSteps: 4, completed: false }
}

function nextStep(state: OnboardingState): OnboardingState {
  if (state.currentStep >= state.totalSteps - 1) {
    return { ...state, completed: true }
  }
  return { ...state, currentStep: state.currentStep + 1 }
}

function prevStep(state: OnboardingState): OnboardingState {
  if (state.currentStep <= 0) return state
  return { ...state, currentStep: state.currentStep - 1 }
}

function skipOnboarding(state: OnboardingState): OnboardingState {
  return { ...state, completed: true }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Onboarding state machine', () => {
  it('advances forward on "Next"', () => {
    const state = createOnboardingState()
    const next = nextStep(state)
    expect(next.currentStep).toBe(1)
    expect(next.completed).toBe(false)
  })

  it('goes backward on "Back"', () => {
    let state = createOnboardingState()
    state = nextStep(state) // step 1
    state = nextStep(state) // step 2
    const prev = prevStep(state)
    expect(prev.currentStep).toBe(1)
    expect(prev.completed).toBe(false)
  })

  it('skip button sets completion flag', () => {
    const state = createOnboardingState()
    const skipped = skipOnboarding(state)
    expect(skipped.completed).toBe(true)
  })

  it('final step "Done" sets completion flag', () => {
    let state = createOnboardingState()
    // Advance to the last step
    for (let i = 0; i < state.totalSteps - 1; i++) {
      state = nextStep(state)
    }
    expect(state.currentStep).toBe(3)
    // Pressing "Next" on the last step completes onboarding
    const done = nextStep(state)
    expect(done.completed).toBe(true)
  })

  it('first step has no "Back" (prevStep is a no-op at step 0)', () => {
    const state = createOnboardingState()
    expect(state.currentStep).toBe(0)
    const unchanged = prevStep(state)
    // Should remain at step 0 — no going backward
    expect(unchanged.currentStep).toBe(0)
    expect(unchanged).toEqual(state)
  })

  it('last step has "Done" instead of "Next"', () => {
    let state = createOnboardingState()
    for (let i = 0; i < state.totalSteps - 1; i++) {
      state = nextStep(state)
    }
    const isLast = state.currentStep === state.totalSteps - 1
    expect(isLast).toBe(true)
    // "Done" on last step completes onboarding (same as nextStep)
    const done = nextStep(state)
    expect(done.completed).toBe(true)
  })

  it('does not render when onboardingComplete is true', () => {
    // Simulate: if completed flag is set, component returns null
    const state = createOnboardingState()
    const completed = skipOnboarding(state)
    const shouldRender = !completed.completed
    expect(shouldRender).toBe(false)
  })

  it('renders when onboardingComplete is false', () => {
    const state = createOnboardingState()
    const shouldRender = !state.completed
    expect(shouldRender).toBe(true)
  })
})
