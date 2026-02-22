/**
 * HUD — Top bar overlay with status indicators, profile selector, view switcher, and action buttons.
 * Extracted from App.tsx to reduce component size.
 */

import React from 'react'
import type { CalibrationProfile } from '@shared/protocol'
import { useVisualStore, useGestureStore, useUIStore } from '../controller/store'
import { ViewSwitcher } from '../controller/ViewSwitcher'
import { A11Y_COLORS, getTrackingStatusIndicator } from '../controller/a11y'

// Electron -webkit-app-region is not in React.CSSProperties — cast via Record
type DragStyle = React.CSSProperties & Record<string, unknown>

/** Shared button style (matches App.tsx buttonStyle) */
const buttonStyle: DragStyle = {
  padding: '6px 12px',
  background: 'var(--button-bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--button-text)',
  cursor: 'pointer',
  fontSize: 12,
  '-webkit-app-region': 'no-drag'
}

/** Window control button style (minimize/maximize/close) */
const winBtnStyle: DragStyle = {
  width: 28,
  height: 28,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: 'none',
  color: 'var(--button-text)',
  cursor: 'pointer',
  fontSize: 14,
  borderRadius: 4,
  '-webkit-app-region': 'no-drag'
}

export interface HUDProps {
  hasGraph: boolean
  hasManifold: boolean
  nodeCount: number
  pointCount: number
  profiles: CalibrationProfile[]
  activeProfileId: string | null
  onProfileChange: (id: string) => void
  /** Number of detected cameras (0 = none, 1 = mono, 2+ = stereo capable) */
  cameraCount?: number
}

export const HUD = React.memo(function HUD({ hasGraph, hasManifold, nodeCount, pointCount, profiles, activeProfileId, onProfileChange, cameraCount = 0 }: HUDProps): React.ReactElement {
  // P1-21: Use individual slice selectors instead of useAppStore()
  const viewMode = useVisualStore((s) => s.viewMode)
  const setViewMode = useVisualStore((s) => s.setViewMode)
  const trackingEnabled = useGestureStore((s) => s.trackingEnabled)
  const activeModal = useUIStore((s) => s.activeModal)
  const setActiveModal = useUIStore((s) => s.setActiveModal)
  const overlayMode = useUIStore((s) => s.overlayMode)

  const activeProfile = profiles.find(p => p.id === activeProfileId)

  // In overlay mode, show only the overlay indicator (no drag region needed since click-through is on)
  if (overlayMode) {
    return (
      <div style={{
        position: 'absolute',
        top: 12,
        right: 12,
        pointerEvents: 'none'
      }}>
        <div style={{
          padding: '6px 14px',
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 8,
          fontSize: 13,
          color: '#4a9eff',
          pointerEvents: 'none'
        }}>
          Overlay Mode
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      pointerEvents: 'none',
      padding: '8px 12px'
    }}>
      {/* Status — offset left to clear the Stats (FPS) panel */}
      <div style={{
        padding: '6px 14px',
        background: 'var(--bg-overlay)',
        borderRadius: 8,
        fontSize: 13,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        pointerEvents: 'auto',
        marginLeft: 84,
        '-webkit-app-region': 'no-drag'
      } as DragStyle}>
        <span
          role="status"
          aria-live="polite"
          style={{ color: trackingEnabled ? A11Y_COLORS.trackingActive : A11Y_COLORS.trackingPaused }}
        >
          {getTrackingStatusIndicator(trackingEnabled)} {trackingEnabled ? 'Tracking' : 'Paused'}
        </span>
        {cameraCount > 0 && (
          <span style={{ color: cameraCount >= 2 ? A11Y_COLORS.trackingActive : A11Y_COLORS.textSecondary, fontSize: 11 }}>
            {cameraCount >= 2 ? 'Stereo' : 'Mono'}
          </span>
        )}
        {hasGraph && (
          <span style={{ color: A11Y_COLORS.textSecondary }}>
            {nodeCount} nodes
          </span>
        )}
        {hasManifold && (
          <span style={{ color: A11Y_COLORS.textSecondary }}>
            {pointCount} points
          </span>
        )}
        {/* Profile selector */}
        {profiles.length > 0 && (
          <select
            value={activeProfileId ?? ''}
            onChange={e => onProfileChange(e.target.value)}
            title={`Profile: ${activeProfile?.name ?? 'None'}`}
            style={{
              padding: '2px 6px',
              background: 'var(--input-bg, #1a1a2e)',
              border: '1px solid var(--border, #333)',
              borderRadius: 4,
              color: 'var(--button-text, #ccc)',
              fontSize: 11,
              cursor: 'pointer',
              maxWidth: 120,
              '-webkit-app-region': 'no-drag'
            } as DragStyle}
          >
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Drag region — fills space between left and right HUD sections */}
      <div style={{
        flex: 1,
        alignSelf: 'stretch',
        pointerEvents: 'auto',
        '-webkit-app-region': 'drag'
      } as DragStyle} />

      {/* View Switcher + Controls + Window Controls */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', pointerEvents: 'auto' }}>
        <ViewSwitcher
          currentView={viewMode}
          onViewChange={setViewMode}
          graphAvailable={hasGraph}
          manifoldAvailable={hasManifold}
        />
        <button
          onClick={() => setActiveModal(activeModal === 'dataLoader' ? null : 'dataLoader')}
          style={buttonStyle}
          title="Load Data"
          aria-label="Load data"
        >
          Load
        </button>
        <button
          onClick={() => setActiveModal(activeModal === 'settings' ? null : 'settings')}
          style={buttonStyle}
          title="Settings"
          aria-label="Settings"
        >
          Settings
        </button>
        <button
          onClick={() => window.api.toggleOverlay()}
          style={{ ...buttonStyle, background: 'var(--button-bg)', borderColor: '#4a9eff' }}
          title="Toggle Overlay Mode (Super+G)"
          aria-label="Toggle overlay mode"
        >
          Overlay
        </button>

        {/* Window controls (frameless) */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 8 }}>
          <button onClick={() => window.api.minimizeWindow()} style={winBtnStyle} title="Minimize" aria-label="Minimize window">
            &#x2014;
          </button>
          <button onClick={() => window.api.maximizeWindow()} style={winBtnStyle} title="Maximize" aria-label="Maximize window">
            &#x25A1;
          </button>
          <button
            onClick={() => window.api.closeWindow()}
            style={{ ...winBtnStyle, borderRadius: '4px' }}
            title="Close"
            aria-label="Close window"
            onMouseEnter={e => { (e.target as HTMLElement).style.background = '#e81123'; (e.target as HTMLElement).style.color = '#fff' }}
            onMouseLeave={e => { (e.target as HTMLElement).style.background = 'transparent'; (e.target as HTMLElement).style.color = 'var(--button-text)' }}
          >
            &#x2715;
          </button>
        </div>
      </div>
    </div>
  )
})
