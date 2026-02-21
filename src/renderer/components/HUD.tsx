/**
 * HUD — Top bar overlay with status indicators, view switcher, and action buttons.
 * Extracted from App.tsx to reduce component size.
 */

import React from 'react'
import { useVisualStore, useGestureStore, useUIStore } from '../controller/store'
import { ViewSwitcher } from '../controller/ViewSwitcher'
import { A11Y_COLORS, getTrackingStatusIndicator } from '../controller/a11y'

/** Shared button style (matches App.tsx buttonStyle) */
const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--button-bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--button-text)',
  cursor: 'pointer',
  fontSize: 12
}

export interface HUDProps {
  hasGraph: boolean
  hasManifold: boolean
  nodeCount: number
  pointCount: number
}

export function HUD({ hasGraph, hasManifold, nodeCount, pointCount }: HUDProps): React.ReactElement {
  // P1-21: Use individual slice selectors instead of useAppStore()
  const viewMode = useVisualStore((s) => s.viewMode)
  const setViewMode = useVisualStore((s) => s.setViewMode)
  const trackingEnabled = useGestureStore((s) => s.trackingEnabled)
  const activeModal = useUIStore((s) => s.activeModal)
  const setActiveModal = useUIStore((s) => s.setActiveModal)

  return (
    <div style={{
      position: 'absolute',
      top: 12,
      left: 12,
      right: 12,
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      pointerEvents: 'none'
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
        marginLeft: 84
      }}>
        <span
          role="status"
          aria-live="polite"
          style={{ color: trackingEnabled ? A11Y_COLORS.trackingActive : A11Y_COLORS.trackingPaused }}
        >
          {getTrackingStatusIndicator(trackingEnabled)} {trackingEnabled ? 'Tracking' : 'Paused'}
        </span>
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
      </div>

      {/* View Switcher + Controls */}
      <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
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
      </div>
    </div>
  )
}
