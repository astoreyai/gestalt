/**
 * OnboardingOverlay — Step-through guide for first-time users.
 * Shows 4 steps explaining hand tracking basics, with Next/Back/Skip/Done controls.
 * Hides itself once the user completes or skips, persisting the flag via config.
 */

import React, { useState, useCallback } from 'react'
import { useConfigStore } from '../controller/store'
import { COLORS } from '../styles/tokens'

const STEPS = [
  {
    title: 'Welcome to Gestalt',
    body: 'Navigate 3D knowledge graphs and embedding spaces with hand gestures.'
  },
  {
    title: 'Hand Detection',
    body: "Position your hands in front of the webcam. You'll see a skeleton overlay when detected."
  },
  {
    title: 'Basic Gestures',
    body: 'Point to navigate. Pinch to select nodes. Open palm to release. Flat hand drag to pan.'
  },
  {
    title: 'Advanced Controls',
    body: 'Twist to rotate. Two-hand pinch to zoom. Fist to cancel. Press ? for the gesture guide.'
  }
]

export function OnboardingOverlay(): React.ReactElement | null {
  const onboardingComplete = useConfigStore((s) => s.config.onboardingComplete)
  const updateConfig = useConfigStore((s) => s.updateConfig)
  const [step, setStep] = useState(0)

  const complete = useCallback(() => {
    updateConfig({ onboardingComplete: true })
  }, [updateConfig])

  if (onboardingComplete) return null

  const isLast = step === STEPS.length - 1
  const isFirst = step === 0
  const current = STEPS[step]

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      <div
        style={{
          background: COLORS.cardBg,
          borderRadius: 12,
          padding: 32,
          maxWidth: 440,
          width: '90%',
          color: '#e0e0e0'
        }}
      >
        <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
          Step {step + 1} of {STEPS.length}
        </div>
        <h2 style={{ margin: '0 0 12px', fontSize: 20, color: '#fff' }}>{current.title}</h2>
        <p style={{ margin: '0 0 24px', lineHeight: 1.5, fontSize: 14 }}>{current.body}</p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            onClick={complete}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#888',
              cursor: 'pointer',
              fontSize: 12
            }}
          >
            Skip
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {!isFirst && (
              <button
                onClick={() => setStep((s) => s - 1)}
                style={{
                  padding: '8px 16px',
                  background: '#2a2a3e',
                  border: '1px solid #444',
                  borderRadius: 6,
                  color: '#ccc',
                  cursor: 'pointer'
                }}
              >
                Back
              </button>
            )}
            <button
              onClick={isLast ? complete : () => setStep((s) => s + 1)}
              style={{
                padding: '8px 16px',
                background: COLORS.accent,
                border: 'none',
                borderRadius: 6,
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              {isLast ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
