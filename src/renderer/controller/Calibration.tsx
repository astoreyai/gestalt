/**
 * Calibration wizard with CRUD profile management.
 *
 * Supports creating, editing, deleting, and activating calibration profiles.
 * Each profile stores sensitivity settings and recorded gesture samples.
 *
 * Flow:
 *   Profile List (entry) -> Create/Edit wizard (name -> position -> record gestures -> sensitivity -> summary)
 */

import React, { useState, useCallback, useRef, useEffect } from 'react'
import type { LandmarkFrame, CalibrationProfile, GestureSample } from '@shared/protocol'
import { GestureType } from '@shared/protocol'
import { extractFeatures } from '../gestures/features'
import { classifyGesture, fingerCurl } from '../gestures/classifier'

// ─── Props ──────────────────────────────────────────────────────────

export interface CalibrationProps {
  landmarkFrame: LandmarkFrame | null
  profiles: CalibrationProfile[]
  activeProfileId: string | null
  onSaveProfile: (profile: CalibrationProfile) => void
  onDeleteProfile: (id: string) => void
  onSetActive: (id: string) => void
  onComplete: (sensitivity: number) => void
  onSkip: () => void
}

// ─── Types ──────────────────────────────────────────────────────────

type WizardView = 'list' | 'name' | 'position' | 'record' | 'sensitivity' | 'summary'

/** The 4 core gestures we record samples for */
const CORE_GESTURES: GestureType[] = [
  GestureType.Pinch,
  GestureType.Point,
  GestureType.OpenPalm,
  GestureType.Fist
]

/** How many samples to record per gesture */
const SAMPLES_PER_GESTURE = 3

/** Human-readable gesture labels */
const GESTURE_LABELS: Record<string, string> = {
  [GestureType.Pinch]: 'Pinch',
  [GestureType.Point]: 'Point',
  [GestureType.OpenPalm]: 'Open Palm',
  [GestureType.Fist]: 'Fist'
}

/** Instructions per gesture */
const GESTURE_INSTRUCTIONS: Record<string, string> = {
  [GestureType.Pinch]: 'Touch your thumb and index finger tips together',
  [GestureType.Point]: 'Extend only your index finger, curl the rest',
  [GestureType.OpenPalm]: 'Extend all five fingers wide open',
  [GestureType.Fist]: 'Close all fingers into a tight fist'
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Generate a unique ID for a new profile */
export function generateProfileId(): string {
  return `profile-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** Generate a default profile name like "Profile 1", "Profile 2", etc. */
export function nextProfileName(existingNames: string[]): string {
  let n = 1
  while (existingNames.includes(`Profile ${n}`)) {
    n++
  }
  return `Profile ${n}`
}

/** Format a timestamp to a readable date string */
function formatDate(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

/** Create a blank CalibrationProfile shell */
export function createBlankProfile(name: string): CalibrationProfile {
  const now = Date.now()
  return {
    id: generateProfileId(),
    name,
    sensitivity: 0.5,
    samples: [],
    createdAt: now,
    updatedAt: now
  }
}

/** Build a GestureSample from the current landmarks and a detected gesture type */
export function buildGestureSample(
  gestureType: GestureType,
  landmarks: import('@shared/protocol').Landmark[]
): GestureSample {
  return {
    gestureType,
    landmarks: landmarks.map(l => ({ x: l.x, y: l.y, z: l.z })),
    features: extractFeatures(landmarks),
    timestamp: Date.now()
  }
}

// ─── Component ──────────────────────────────────────────────────────

export function Calibration({
  landmarkFrame,
  profiles,
  activeProfileId,
  onSaveProfile,
  onDeleteProfile,
  onSetActive,
  onComplete,
  onSkip
}: CalibrationProps): React.ReactElement {
  // View state
  const [view, setView] = useState<WizardView>(profiles.length > 0 ? 'list' : 'name')

  // Profile being created/edited
  const [editingProfile, setEditingProfile] = useState<CalibrationProfile | null>(null)
  const [profileName, setProfileName] = useState('')
  const [sensitivity, setSensitivity] = useState(0.5)
  const [samples, setSamples] = useState<GestureSample[]>([])

  // Recording state
  const [currentGestureIdx, setCurrentGestureIdx] = useState(0)
  const [currentSampleCount, setCurrentSampleCount] = useState(0)
  const [lastRecordedAt, setLastRecordedAt] = useState(0)

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Ref for recording cooldown
  const recordCooldownMs = 800
  const recordingRef = useRef(false)

  const handsDetected = (landmarkFrame?.hands.length ?? 0) > 0

  // ── Navigation helpers ─────────────────────────────────────────

  const startCreate = useCallback(() => {
    const name = nextProfileName(profiles.map(p => p.name))
    setEditingProfile(null)
    setProfileName(name)
    setSensitivity(0.5)
    setSamples([])
    setCurrentGestureIdx(0)
    setCurrentSampleCount(0)
    setView('name')
  }, [profiles])

  const startEdit = useCallback((profile: CalibrationProfile) => {
    setEditingProfile(profile)
    setProfileName(profile.name)
    setSensitivity(profile.sensitivity)
    setSamples(profile.samples)
    setCurrentGestureIdx(0)
    setCurrentSampleCount(0)
    setView('name')
  }, [])

  const goToList = useCallback(() => {
    setView('list')
    setDeleteConfirmId(null)
  }, [])

  // ── Recording logic ────────────────────────────────────────────

  const currentGesture = CORE_GESTURES[currentGestureIdx] ?? null

  // Count completed samples per gesture
  const samplesForGesture = useCallback(
    (gesture: GestureType) => samples.filter(s => s.gestureType === gesture).length,
    [samples]
  )

  // Debug: show finger curl values in real time
  const [debugInfo, setDebugInfo] = useState<string>('')
  const [captureFlash, setCaptureFlash] = useState(false)

  // Update debug info on each frame
  useEffect(() => {
    if (view !== 'record') return
    if (!landmarkFrame || landmarkFrame.hands.length === 0) {
      setDebugInfo('No hands visible')
      return
    }
    for (const hand of landmarkFrame.hands) {
      const names = ['thumb', 'index', 'middle', 'ring', 'pinky'] as const
      const curlStr = names.map(f => `${f[0].toUpperCase()}:${fingerCurl(hand.landmarks, f).toFixed(2)}`).join(' ')
      setDebugInfo(`Hand detected | ${curlStr}`)
    }
  }, [view, landmarkFrame])

  // Manual capture — user holds gesture and presses Space or clicks Capture
  const captureCurrentGesture = useCallback(() => {
    if (!landmarkFrame || landmarkFrame.hands.length === 0) return
    if (!currentGesture) return

    const hand = landmarkFrame.hands[0]
    const sample = buildGestureSample(currentGesture, hand.landmarks)
    setSamples(prev => [...prev, sample])
    setLastRecordedAt(Date.now())

    // Flash feedback
    setCaptureFlash(true)
    setTimeout(() => setCaptureFlash(false), 200)

    const newCount = currentSampleCount + 1
    setCurrentSampleCount(newCount)

    if (newCount >= SAMPLES_PER_GESTURE) {
      const nextIdx = currentGestureIdx + 1
      if (nextIdx < CORE_GESTURES.length) {
        setCurrentGestureIdx(nextIdx)
        setCurrentSampleCount(0)
      } else {
        setView('sensitivity')
      }
    }
  }, [landmarkFrame, currentGesture, currentGestureIdx, currentSampleCount])

  // Spacebar to capture
  useEffect(() => {
    if (view !== 'record') return
    const handleKey = (e: KeyboardEvent): void => {
      if (e.code === 'Space') {
        e.preventDefault()
        captureCurrentGesture()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [view, captureCurrentGesture])

  // ── Save handler ───────────────────────────────────────────────

  const handleSave = useCallback(() => {
    const now = Date.now()
    const profile: CalibrationProfile = {
      id: editingProfile?.id ?? generateProfileId(),
      name: profileName.trim() || 'Untitled',
      sensitivity,
      samples,
      createdAt: editingProfile?.createdAt ?? now,
      updatedAt: now
    }
    onSaveProfile(profile)
    onSetActive(profile.id)
    onComplete(sensitivity)
  }, [editingProfile, profileName, sensitivity, samples, onSaveProfile, onSetActive, onComplete])

  // ── Delete handler ─────────────────────────────────────────────

  const handleDelete = useCallback((id: string) => {
    onDeleteProfile(id)
    setDeleteConfirmId(null)
  }, [onDeleteProfile])

  // ── Renderers ──────────────────────────────────────────────────

  const renderList = (): React.ReactElement => (
    <div>
      <h2 style={{ marginBottom: 16 }}>Calibration Profiles</h2>
      {profiles.length === 0 ? (
        <p style={{ color: '#aaa', marginBottom: 16 }}>No profiles yet. Create one to get started.</p>
      ) : (
        <div style={{ marginBottom: 16, maxHeight: 300, overflowY: 'auto' }}>
          {profiles.map(p => (
            <div
              key={p.id}
              style={{
                padding: 12,
                marginBottom: 8,
                borderRadius: 8,
                border: `1px solid ${p.id === activeProfileId ? '#4a9eff' : '#333'}`,
                background: p.id === activeProfileId ? 'rgba(74, 158, 255, 0.08)' : 'transparent'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
                    {p.name}
                    {p.id === activeProfileId && (
                      <span style={{ color: '#6bcb77', marginLeft: 8, fontSize: 12 }}>Active</span>
                    )}
                  </div>
                  <div style={{ color: '#888', fontSize: 12 }}>
                    {p.samples.length} samples | Sensitivity {Math.round(p.sensitivity * 100)}% | {formatDate(p.updatedAt)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {p.id !== activeProfileId && (
                    <button onClick={() => onSetActive(p.id)} style={btnSmallStyle}>Use</button>
                  )}
                  <button onClick={() => startEdit(p)} style={btnSmallStyle}>Edit</button>
                  {deleteConfirmId === p.id ? (
                    <>
                      <button
                        onClick={() => handleDelete(p.id)}
                        style={{ ...btnSmallStyle, background: '#ff4444', color: '#fff' }}
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(null)}
                        style={btnSmallStyle}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirmId(p.id)}
                      style={{ ...btnSmallStyle, color: '#ff6b6b' }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={startCreate} style={btnStyle}>Create New</button>
        <button onClick={onSkip} style={btnSecondaryStyle}>Skip</button>
      </div>
    </div>
  )

  const renderName = (): React.ReactElement => (
    <div>
      <h2 style={{ marginBottom: 16 }}>
        {editingProfile ? 'Edit Profile' : 'New Profile'}
      </h2>
      <p style={{ marginBottom: 12, color: '#aaa' }}>
        Give this calibration profile a name.
      </p>
      <input
        type="text"
        value={profileName}
        onChange={e => setProfileName(e.target.value)}
        placeholder="Profile name"
        style={inputStyle}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button
          onClick={() => setView('position')}
          disabled={profileName.trim().length === 0}
          style={btnStyle}
        >
          Next
        </button>
        <button onClick={profiles.length > 0 ? goToList : onSkip} style={btnSecondaryStyle}>
          {profiles.length > 0 ? 'Back' : 'Skip'}
        </button>
      </div>
    </div>
  )

  const renderPosition = (): React.ReactElement => (
    <div>
      <h2 style={{ marginBottom: 16 }}>Position Your Hands</h2>
      <p style={{ marginBottom: 16, color: '#aaa' }}>
        Hold your hands in front of the camera, about arm's length away.
        Make sure at least one hand is visible.
      </p>
      <div style={{
        padding: 16,
        background: handsDetected ? 'rgba(107, 203, 119, 0.1)' : 'rgba(255, 107, 107, 0.1)',
        border: `1px solid ${handsDetected ? '#6bcb77' : '#ff6b6b'}`,
        borderRadius: 8,
        marginBottom: 16
      }}>
        {handsDetected
          ? `Hands detected: ${landmarkFrame?.hands.length}`
          : 'No hands detected \u2014 adjust position or lighting'
        }
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <button
          onClick={() => {
            setCurrentGestureIdx(0)
            setCurrentSampleCount(0)
            setLastRecordedAt(0)
            recordingRef.current = false
            setView('record')
          }}
          disabled={!handsDetected}
          style={btnStyle}
        >
          Next
        </button>
        <button onClick={() => setView('name')} style={btnSecondaryStyle}>Back</button>
      </div>
    </div>
  )

  const renderRecord = (): React.ReactElement => {
    const totalSamplesNeeded = CORE_GESTURES.length * SAMPLES_PER_GESTURE
    const totalRecorded = samples.filter(s =>
      CORE_GESTURES.includes(s.gestureType)
    ).length
    // Only count samples recorded during this session's target gestures
    const overallProgress = Math.min(totalRecorded / totalSamplesNeeded, 1)

    return (
      <div>
        <h2 style={{ marginBottom: 16 }}>Record Gesture Samples</h2>

        {/* Overall progress bar */}
        <div style={{
          width: '100%',
          height: 6,
          background: '#333',
          borderRadius: 3,
          marginBottom: 16,
          overflow: 'hidden'
        }}>
          <div style={{
            width: `${overallProgress * 100}%`,
            height: '100%',
            background: '#4a9eff',
            borderRadius: 3,
            transition: 'width 0.3s ease'
          }} />
        </div>

        {/* Per-gesture progress */}
        <div style={{ marginBottom: 16 }}>
          {CORE_GESTURES.map((gesture, idx) => {
            const count = samplesForGesture(gesture)
            const isCurrent = idx === currentGestureIdx
            const isDone = count >= SAMPLES_PER_GESTURE
            return (
              <div
                key={gesture}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 0',
                  color: isCurrent ? '#fff' : isDone ? '#6bcb77' : '#666'
                }}
              >
                <span style={{ width: 20, textAlign: 'center' }}>
                  {isDone ? '\u2713' : isCurrent ? '\u25B6' : '\u25CB'}
                </span>
                <span style={{ flex: 1 }}>{GESTURE_LABELS[gesture]}</span>
                <span style={{ fontSize: 12, color: '#888' }}>
                  {count}/{SAMPLES_PER_GESTURE}
                </span>
              </div>
            )
          })}
        </div>

        {/* Current gesture instruction */}
        {currentGesture && (
          <div style={{
            padding: 16,
            background: captureFlash ? 'rgba(107, 203, 119, 0.2)' : 'rgba(74, 158, 255, 0.1)',
            border: `1px solid ${captureFlash ? '#6bcb77' : '#4a9eff'}`,
            borderRadius: 8,
            marginBottom: 16,
            transition: 'all 0.15s'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>
              {GESTURE_LABELS[currentGesture]} ({currentSampleCount}/{SAMPLES_PER_GESTURE})
            </div>
            <div style={{ color: '#aaa', fontSize: 13 }}>
              {GESTURE_INSTRUCTIONS[currentGesture]}
            </div>
            <div style={{ color: '#888', marginTop: 8, fontSize: 12 }}>
              Hold the gesture, then press <strong style={{ color: '#fff' }}>Space</strong> or click Capture
            </div>
            {!handsDetected && (
              <div style={{ color: '#ff6b6b', marginTop: 8, fontSize: 12 }}>
                No hands detected
              </div>
            )}
            {debugInfo && (
              <div style={{ color: '#666', marginTop: 8, fontSize: 11, fontFamily: 'monospace' }}>
                {debugInfo}
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={captureCurrentGesture}
            disabled={!handsDetected}
            style={{ ...btnStyle, flex: 1 }}
          >
            Capture
          </button>
          <button onClick={() => setView('sensitivity')} style={btnSecondaryStyle}>
            Skip
          </button>
          <button onClick={() => setView('position')} style={btnSecondaryStyle}>Back</button>
        </div>
      </div>
    )
  }

  const renderSensitivity = (): React.ReactElement => (
    <div>
      <h2 style={{ marginBottom: 16 }}>Adjust Sensitivity</h2>
      <p style={{ marginBottom: 16, color: '#aaa' }}>
        Set how sensitive gesture detection should be.
        Higher = more responsive but may trigger false positives.
      </p>
      <input
        type="range"
        min={0.1}
        max={1.0}
        step={0.05}
        value={sensitivity}
        onChange={(e) => setSensitivity(parseFloat(e.target.value))}
        style={{ width: '100%', marginBottom: 8 }}
      />
      <p style={{ textAlign: 'center', color: '#888' }}>
        {(sensitivity * 100).toFixed(0)}%
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button onClick={() => setView('summary')} style={btnStyle}>Next</button>
        <button onClick={() => {
          setCurrentGestureIdx(0)
          setCurrentSampleCount(0)
          setView('record')
        }} style={btnSecondaryStyle}>Back</button>
      </div>
    </div>
  )

  const renderSummary = (): React.ReactElement => {
    const totalSamples = samples.length
    const gestureBreakdown = CORE_GESTURES.map(g => ({
      label: GESTURE_LABELS[g],
      count: samples.filter(s => s.gestureType === g).length
    }))

    return (
      <div>
        <h2 style={{ marginBottom: 16 }}>Profile Summary</h2>
        <div style={{
          padding: 16,
          background: 'rgba(107, 203, 119, 0.08)',
          border: '1px solid #333',
          borderRadius: 8,
          marginBottom: 16
        }}>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#888' }}>Name:</span>{' '}
            <span style={{ fontWeight: 'bold' }}>{profileName}</span>
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#888' }}>Sensitivity:</span>{' '}
            {Math.round(sensitivity * 100)}%
          </div>
          <div style={{ marginBottom: 8 }}>
            <span style={{ color: '#888' }}>Total Samples:</span>{' '}
            {totalSamples}
          </div>
          {gestureBreakdown.map(g => (
            <div key={g.label} style={{ marginLeft: 16, color: '#aaa', fontSize: 13 }}>
              {g.label}: {g.count} samples
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={handleSave} style={btnStyle}>
            {editingProfile ? 'Save Changes' : 'Save Profile'}
          </button>
          <button onClick={() => setView('sensitivity')} style={btnSecondaryStyle}>Back</button>
        </div>
      </div>
    )
  }

  // ── Main render ────────────────────────────────────────────────

  const renderView = (): React.ReactElement => {
    switch (view) {
      case 'list': return renderList()
      case 'name': return renderName()
      case 'position': return renderPosition()
      case 'record': return renderRecord()
      case 'sensitivity': return renderSensitivity()
      case 'summary': return renderSummary()
    }
  }

  return (
    <div style={{
      padding: 32,
      background: 'rgba(20, 20, 25, 0.95)',
      borderRadius: 16,
      border: '1px solid #333',
      maxWidth: 520,
      width: '90%'
    }}>
      {renderView()}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────

const btnStyle: React.CSSProperties = {
  padding: '10px 24px',
  background: '#4a9eff',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 'bold'
}

const btnSecondaryStyle: React.CSSProperties = {
  ...btnStyle,
  background: 'transparent',
  border: '1px solid #555',
  color: '#aaa'
}

const btnSmallStyle: React.CSSProperties = {
  padding: '4px 10px',
  background: 'transparent',
  border: '1px solid #444',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: 12,
  color: '#ccc'
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: '#1a1a1f',
  border: '1px solid #444',
  borderRadius: 8,
  color: '#fff',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box'
}
