/**
 * HUD — Top bar overlay with status indicators, view switcher, and action buttons.
 * Extracted from App.tsx to reduce component size.
 */

import React from 'react'
import { useAppStore } from '../controller/store'
import { ViewSwitcher } from '../controller/ViewSwitcher'
import { A11Y_COLORS, getTrackingStatusIndicator } from '../controller/a11y'

/** Shared button style (matches App.tsx buttonStyle) */
const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'rgba(0,0,0,0.6)',
  border: '1px solid #444',
  borderRadius: 6,
  color: '#ccc',
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
  const {
    viewMode, setViewMode,
    trackingEnabled,
    activeModal, setActiveModal
  } = useAppStore()

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
      {/* Status */}
      <div style={{
        padding: '6px 14px',
        background: 'rgba(0,0,0,0.6)',
        borderRadius: 8,
        fontSize: 13,
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        pointerEvents: 'auto'
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
