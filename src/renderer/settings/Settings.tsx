/**
 * Settings panel — configurable tracking, gestures, input, and visualization options.
 */

import React, { useState } from 'react'
import type { AppConfig, ThemeMode, CalibrationProfile } from '@shared/protocol'

export interface SettingsProps {
  config: AppConfig
  onConfigChange: (config: Partial<AppConfig>) => void
  onClose: () => void
  onOpenCalibration?: () => void
  profiles?: CalibrationProfile[]
  activeProfileId?: string | null
  onProfileChange?: (id: string) => void
  onCreateProfile?: (profile: CalibrationProfile) => void
  onDeleteProfile?: (id: string) => void
}

type SettingsTab = 'tracking' | 'gestures' | 'input' | 'bus' | 'visualization' | 'appearance'

export function Settings({ config, onConfigChange, onClose, onOpenCalibration, profiles, activeProfileId, onProfileChange, onCreateProfile, onDeleteProfile }: SettingsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTab>('tracking')

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'tracking', label: 'Tracking' },
    { id: 'gestures', label: 'Gestures' },
    { id: 'input', label: 'Input' },
    { id: 'bus', label: 'Bus' },
    { id: 'visualization', label: 'Visuals' },
    { id: 'appearance', label: 'Theme' }
  ]

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      width: 360,
      height: '100%',
      background: 'var(--panel-bg)',
      borderLeft: '1px solid var(--border)',
      zIndex: 150,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)'
      }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Settings</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 18,
            cursor: 'pointer'
          }}
        >
          x
        </button>
      </div>

      <div role="tablist" style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: activeTab === tab.id ? 'var(--input-bg)' : 'transparent',
              color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: activeTab === tab.id ? 'bold' : 'normal'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
        {activeTab === 'tracking' && (
          <TrackingSettings
            config={config}
            onChange={onConfigChange}
            onOpenCalibration={onOpenCalibration}
            profiles={profiles}
            activeProfileId={activeProfileId}
            onProfileChange={onProfileChange}
            onCreateProfile={onCreateProfile}
            onDeleteProfile={onDeleteProfile}
          />
        )}
        {activeTab === 'gestures' && (
          <GestureSettings config={config} onChange={onConfigChange} />
        )}
        {activeTab === 'input' && (
          <InputSettings config={config} onChange={onConfigChange} />
        )}
        {activeTab === 'bus' && (
          <BusSettings config={config} onChange={onConfigChange} />
        )}
        {activeTab === 'visualization' && (
          <VisualizationSettings config={config} onChange={onConfigChange} />
        )}
        {activeTab === 'appearance' && (
          <AppearanceSettings config={config} onChange={onConfigChange} />
        )}
      </div>
    </div>
  )
}

function Slider({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, color: 'var(--button-text)', display: 'block', marginBottom: 4 }}>
        {label}: {value.toFixed(2)}
      </label>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  )
}

function Toggle({ label, value, onChange }: {
  label: string; value: boolean; onChange: (v: boolean) => void
}): React.ReactElement {
  return (
    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 13, color: 'var(--button-text)' }}>{label}</span>
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: value ? 'var(--accent)' : 'var(--border)',
          cursor: 'pointer', position: 'relative', transition: 'background 0.2s'
        }}
      >
        <div style={{
          width: 18, height: 18, borderRadius: 9, background: '#fff',
          position: 'absolute', top: 3,
          left: value ? 22 : 4, transition: 'left 0.2s'
        }} />
      </button>
    </div>
  )
}

function TrackingSettings({ config, onChange, onOpenCalibration, profiles, activeProfileId, onProfileChange, onCreateProfile, onDeleteProfile }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void; onOpenCalibration?: () => void
  profiles?: CalibrationProfile[]
  activeProfileId?: string | null
  onProfileChange?: (id: string) => void
  onCreateProfile?: (profile: CalibrationProfile) => void
  onDeleteProfile?: (id: string) => void
}): React.ReactElement {
  const [creatingProfile, setCreatingProfile] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSensitivity, setNewSensitivity] = useState(0.5)

  const handleCreate = (): void => {
    if (!newName.trim() || !onCreateProfile) return
    const profile: CalibrationProfile = {
      id: `profile-${Date.now()}`,
      name: newName.trim(),
      sensitivity: newSensitivity,
      samples: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    onCreateProfile(profile)
    onProfileChange?.(profile.id)
    setNewName('')
    setNewSensitivity(0.5)
    setCreatingProfile(false)
  }

  const activeProfile = profiles?.find(p => p.id === activeProfileId)

  return (
    <>
      {/* Profile management */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--button-text)', display: 'block', marginBottom: 4 }}>
          Calibration Profile
        </label>

        {/* Profile dropdown with inline "+ New Profile" option */}
        {profiles && profiles.length > 0 && onProfileChange && (
          <select
            value={creatingProfile ? '__new__' : (activeProfileId ?? '')}
            onChange={e => {
              if (e.target.value === '__new__') {
                setCreatingProfile(true)
              } else {
                setCreatingProfile(false)
                onProfileChange(e.target.value)
              }
            }}
            style={{
              width: '100%', padding: 8, background: 'var(--input-bg)', border: '1px solid var(--border)',
              borderRadius: 6, color: 'var(--button-text)', fontSize: 14, marginBottom: 8
            }}
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.name} (sensitivity: {p.sensitivity.toFixed(2)})
              </option>
            ))}
            {onCreateProfile && (
              <option value="__new__">+ New Profile</option>
            )}
          </select>
        )}

        {/* New profile form (shown when "+ New Profile" selected) */}
        {creatingProfile && (
          <div style={{ padding: 10, background: 'var(--input-bg)', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 8 }}>
            <input
              type="text"
              placeholder="Profile name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleCreate() }}
              autoFocus
              style={{
                width: '100%', padding: 6, background: 'var(--panel-bg)', border: '1px solid var(--border)',
                borderRadius: 4, color: 'var(--button-text)', fontSize: 13, marginBottom: 8, boxSizing: 'border-box'
              }}
            />
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 2 }}>
                Sensitivity: {newSensitivity.toFixed(2)}
              </label>
              <input
                type="range" min={0.1} max={1.0} step={0.05}
                value={newSensitivity}
                onChange={e => setNewSensitivity(parseFloat(e.target.value))}
                style={{ width: '100%' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={handleCreate}
                disabled={!newName.trim()}
                style={{
                  flex: 1, padding: '6px 10px', background: 'var(--accent)', border: 'none',
                  borderRadius: 4, color: '#fff', cursor: 'pointer', fontSize: 12,
                  opacity: newName.trim() ? 1 : 0.5
                }}
              >
                Create
              </button>
              <button
                onClick={() => {
                  setCreatingProfile(false)
                  setNewName('')
                  setNewSensitivity(0.5)
                }}
                style={{
                  flex: 1, padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)',
                  borderRadius: 4, color: 'var(--button-text)', cursor: 'pointer', fontSize: 12
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Delete button (only when not creating, and more than 1 profile exists) */}
        {!creatingProfile && onDeleteProfile && activeProfile && profiles && profiles.length > 1 && (
          <button
            onClick={() => onDeleteProfile(activeProfile.id)}
            style={{
              width: '100%', padding: '6px 10px', background: 'transparent', border: '1px solid var(--border)',
              borderRadius: 4, color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12
            }}
          >
            Delete "{activeProfile.name}"
          </button>
        )}
      </div>

      <Toggle
        label="Enable Tracking"
        value={config.tracking.enabled}
        onChange={v => onChange({ tracking: { ...config.tracking, enabled: v } })}
      />
      <Slider
        label="Smoothing Factor"
        value={config.tracking.smoothingFactor}
        min={0} max={1} step={0.05}
        onChange={v => onChange({ tracking: { ...config.tracking, smoothingFactor: v } })}
      />
      <Slider
        label="Min Confidence"
        value={config.tracking.minConfidence}
        min={0.1} max={1.0} step={0.05}
        onChange={v => onChange({ tracking: { ...config.tracking, minConfidence: v } })}
      />
      {onOpenCalibration && (
        <div style={{ marginTop: 8, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onOpenCalibration}
            style={{
              width: '100%',
              padding: '8px 14px',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 6,
              color: '#fff',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: 'bold'
            }}
          >
            Open Calibration
          </button>
        </div>
      )}
    </>
  )
}

function GestureSettings({ config, onChange }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void
}): React.ReactElement {
  // Responsiveness: 0 = cautious (high latency, few false positives), 1 = instant (low latency, more false positives)
  // Maps to minHoldDuration [200..10] and cooldownDuration [250..30]
  const responsiveness = 1 - ((config.gestures.minHoldDuration - 10) / 190)
  const clampedResponsiveness = Math.max(0, Math.min(1, responsiveness))

  const handleResponsiveness = (v: number): void => {
    const holdMs = Math.round(200 - v * 190)   // 1.0 → 10ms, 0.0 → 200ms
    const coolMs = Math.round(250 - v * 220)    // 1.0 → 30ms, 0.0 → 250ms
    onChange({ gestures: { ...config.gestures, minHoldDuration: holdMs, cooldownDuration: coolMs } })
  }

  const responsivenessLabel = clampedResponsiveness > 0.7 ? 'Fast' : clampedResponsiveness > 0.3 ? 'Balanced' : 'Cautious'

  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--button-text)', display: 'block', marginBottom: 4 }}>
          Responsiveness: {responsivenessLabel}
        </label>
        <input
          type="range"
          min={0} max={1} step={0.05}
          value={clampedResponsiveness}
          onChange={e => handleResponsiveness(parseFloat(e.target.value))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
          <span>Cautious</span>
          <span>Fast</span>
        </div>
      </div>
      <Slider
        label="Min Hold Duration (ms)"
        value={config.gestures.minHoldDuration}
        min={30} max={300} step={10}
        onChange={v => onChange({ gestures: { ...config.gestures, minHoldDuration: v } })}
      />
      <Slider
        label="Cooldown Duration (ms)"
        value={config.gestures.cooldownDuration}
        min={50} max={400} step={10}
        onChange={v => onChange({ gestures: { ...config.gestures, cooldownDuration: v } })}
      />
      <Slider
        label="Sensitivity"
        value={config.gestures.sensitivity}
        min={0.1} max={1.0} step={0.05}
        onChange={v => onChange({ gestures: { ...config.gestures, sensitivity: v } })}
      />
      <Toggle
        label="One-handed mode"
        value={config.gestures.oneHandedMode}
        onChange={v => onChange({ gestures: { ...config.gestures, oneHandedMode: v } })}
      />
      <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 16px 0', lineHeight: 1.4 }}>
        Use single-hand gestures for all actions (accessibility).
        Zoom uses Fist/L-shape instead of two-hand pinch.
      </p>
    </>
  )
}

function InputSettings({ config, onChange }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void
}): React.ReactElement {
  return (
    <>
      <Slider
        label="Mouse Speed"
        value={config.input.mouseSpeed}
        min={0.1} max={5.0} step={0.1}
        onChange={v => onChange({ input: { ...config.input, mouseSpeed: v } })}
      />
      <Slider
        label="Scroll Speed"
        value={config.input.scrollSpeed}
        min={0.1} max={5.0} step={0.1}
        onChange={v => onChange({ input: { ...config.input, scrollSpeed: v } })}
      />
    </>
  )
}

function BusSettings({ config, onChange }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void
}): React.ReactElement {
  return (
    <>
      <Toggle
        label="Enable Connector Bus"
        value={config.bus.enabled}
        onChange={v => onChange({ bus: { ...config.bus, enabled: v } })}
      />
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--button-text)', display: 'block', marginBottom: 4 }}>
          Port
        </label>
        <input
          type="number"
          value={config.bus.port}
          onChange={e => onChange({ bus: { ...config.bus, port: parseInt(e.target.value) || 9876 } })}
          style={{
            width: '100%', padding: 8, background: 'var(--input-bg)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--button-text)', fontSize: 14
          }}
        />
      </div>
    </>
  )
}

function VisualizationSettings({ config, onChange }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void
}): React.ReactElement {
  // Detect monitor refresh rate
  const [monitorHz, setMonitorHz] = useState(60)
  React.useEffect(() => {
    let frames = 0
    let start = 0
    let rafId = 0
    const measure = (ts: number): void => {
      if (frames === 0) { start = ts }
      frames++
      if (frames < 30) {
        rafId = requestAnimationFrame(measure)
      } else {
        const elapsed = ts - start
        const hz = Math.round((frames - 1) / (elapsed / 1000))
        setMonitorHz(hz)
      }
    }
    rafId = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(rafId)
  }, [])

  return (
    <>
      <Toggle
        label="Enable LOD"
        value={config.visualization.lodEnabled}
        onChange={v => onChange({ visualization: { ...config.visualization, lodEnabled: v } })}
      />
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--button-text)', display: 'block', marginBottom: 4 }}>
          Render Rate
        </label>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 4px 0' }}>
          Monitor: {monitorHz} Hz — rendering synced to native refresh rate
        </p>
      </div>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--button-text)', display: 'block', marginBottom: 4 }}>
          Default View
        </label>
        <select
          value={config.visualization.defaultView}
          onChange={e => onChange({
            visualization: { ...config.visualization, defaultView: e.target.value as 'graph' | 'manifold' | 'split' }
          })}
          style={{
            width: '100%', padding: 8, background: 'var(--input-bg)', border: '1px solid var(--border)',
            borderRadius: 6, color: 'var(--button-text)', fontSize: 14
          }}
        >
          <option value="graph">Graph</option>
          <option value="manifold">Manifold</option>
          <option value="split">Split</option>
        </select>
      </div>
    </>
  )
}

/** Theme option labels */
const THEME_OPTIONS: Array<{ value: ThemeMode; label: string; description: string }> = [
  { value: 'system', label: 'System', description: 'Follow OS preference' },
  { value: 'light', label: 'Light', description: 'Light backgrounds' },
  { value: 'dark', label: 'Dark', description: 'Dark backgrounds' }
]

function AppearanceSettings({ config, onChange }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void
}): React.ReactElement {
  return (
    <>
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: 'var(--button-text)', display: 'block', marginBottom: 8 }}>
          Theme
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {THEME_OPTIONS.map(opt => {
            const isActive = config.theme === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => onChange({ theme: opt.value })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 14px',
                  background: isActive ? 'var(--accent-muted)' : 'transparent',
                  border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--text-primary)',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                  background: isActive ? 'var(--accent)' : 'transparent',
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {isActive && (
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      background: '#fff'
                    }} />
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: isActive ? 'bold' : 'normal' }}>
                    {opt.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                    {opt.description}
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        When set to System, the theme automatically matches your operating system preference.
      </p>
    </>
  )
}
