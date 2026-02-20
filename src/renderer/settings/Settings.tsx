/**
 * Settings panel — configurable tracking, gestures, input, and visualization options.
 */

import React, { useState, useCallback } from 'react'
import type { AppConfig } from '@shared/protocol'

export interface SettingsProps {
  config: AppConfig
  onConfigChange: (config: Partial<AppConfig>) => void
  onClose: () => void
}

type SettingsTab = 'tracking' | 'gestures' | 'input' | 'bus' | 'visualization'

export function Settings({ config, onConfigChange, onClose }: SettingsProps): React.ReactElement {
  const [activeTab, setActiveTab] = useState<SettingsTab>('tracking')

  const tabs: Array<{ id: SettingsTab; label: string }> = [
    { id: 'tracking', label: 'Tracking' },
    { id: 'gestures', label: 'Gestures' },
    { id: 'input', label: 'Input' },
    { id: 'bus', label: 'Bus' },
    { id: 'visualization', label: 'Visuals' }
  ]

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      right: 0,
      width: 360,
      height: '100%',
      background: 'rgba(15, 15, 20, 0.95)',
      borderLeft: '1px solid #333',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        borderBottom: '1px solid #333'
      }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Settings</h3>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: 18,
            cursor: 'pointer'
          }}
        >
          x
        </button>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #333' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: 1,
              padding: '8px 4px',
              background: activeTab === tab.id ? '#1a1a2e' : 'transparent',
              color: activeTab === tab.id ? '#4a9eff' : '#888',
              border: 'none',
              borderBottom: activeTab === tab.id ? '2px solid #4a9eff' : '2px solid transparent',
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
          <TrackingSettings config={config} onChange={onConfigChange} />
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
      <label style={{ fontSize: 13, color: '#ccc', display: 'block', marginBottom: 4 }}>
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
      <span style={{ fontSize: 13, color: '#ccc' }}>{label}</span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: value ? '#4a9eff' : '#444',
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

function TrackingSettings({ config, onChange }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void
}): React.ReactElement {
  return (
    <>
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
    </>
  )
}

function GestureSettings({ config, onChange }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void
}): React.ReactElement {
  return (
    <>
      <Slider
        label="Min Hold Duration (ms)"
        value={config.gestures.minHoldDuration}
        min={50} max={500} step={10}
        onChange={v => onChange({ gestures: { ...config.gestures, minHoldDuration: v } })}
      />
      <Slider
        label="Cooldown Duration (ms)"
        value={config.gestures.cooldownDuration}
        min={50} max={500} step={10}
        onChange={v => onChange({ gestures: { ...config.gestures, cooldownDuration: v } })}
      />
      <Slider
        label="Sensitivity"
        value={config.gestures.sensitivity}
        min={0.1} max={1.0} step={0.05}
        onChange={v => onChange({ gestures: { ...config.gestures, sensitivity: v } })}
      />
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
        <label style={{ fontSize: 13, color: '#ccc', display: 'block', marginBottom: 4 }}>
          Port
        </label>
        <input
          type="number"
          value={config.bus.port}
          onChange={e => onChange({ bus: { ...config.bus, port: parseInt(e.target.value) || 9876 } })}
          style={{
            width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333',
            borderRadius: 6, color: '#ccc', fontSize: 14
          }}
        />
      </div>
    </>
  )
}

function VisualizationSettings({ config, onChange }: {
  config: AppConfig; onChange: (c: Partial<AppConfig>) => void
}): React.ReactElement {
  return (
    <>
      <Toggle
        label="Enable LOD"
        value={config.visualization.lodEnabled}
        onChange={v => onChange({ visualization: { ...config.visualization, lodEnabled: v } })}
      />
      <Slider
        label="Max FPS"
        value={config.visualization.maxFps}
        min={15} max={144} step={1}
        onChange={v => onChange({ visualization: { ...config.visualization, maxFps: v } })}
      />
      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, color: '#ccc', display: 'block', marginBottom: 4 }}>
          Default View
        </label>
        <select
          value={config.visualization.defaultView}
          onChange={e => onChange({
            visualization: { ...config.visualization, defaultView: e.target.value as 'graph' | 'manifold' | 'split' }
          })}
          style={{
            width: '100%', padding: 8, background: '#1a1a2e', border: '1px solid #333',
            borderRadius: 6, color: '#ccc', fontSize: 14
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
