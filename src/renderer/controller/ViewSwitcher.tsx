/**
 * View mode switcher — toggles between graph, manifold, and split views.
 */

import React from 'react'
import type { ViewMode } from '@shared/protocol'

export interface ViewSwitcherProps {
  currentView: ViewMode
  onViewChange: (view: ViewMode) => void
  graphAvailable: boolean
  manifoldAvailable: boolean
}

/** Exported labels for each view mode, used for both rendering and testing */
export const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  graph: 'Graph',
  manifold: 'Embeddings',
  split: 'Split'
}

const VIEWS: Array<{ mode: ViewMode; label: string }> = [
  { mode: 'graph', label: VIEW_MODE_LABELS.graph },
  { mode: 'manifold', label: VIEW_MODE_LABELS.manifold },
  { mode: 'split', label: VIEW_MODE_LABELS.split }
]

export function ViewSwitcher({
  currentView,
  onViewChange,
  graphAvailable,
  manifoldAvailable
}: ViewSwitcherProps): React.ReactElement {
  const isDisabled = (mode: ViewMode): boolean => {
    if (mode === 'graph') return !graphAvailable
    if (mode === 'manifold') return !manifoldAvailable
    if (mode === 'split') return !graphAvailable || !manifoldAvailable
    return false
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 4,
        background: 'var(--bg-overlay)',
        borderRadius: 8,
        padding: 4
      }}
    >
      {VIEWS.map(({ mode, label }) => (
        <button
          key={mode}
          onClick={() => onViewChange(mode)}
          disabled={isDisabled(mode)}
          title={label}
          style={{
            padding: '6px 12px',
            border: 'none',
            borderRadius: 6,
            background: currentView === mode ? 'var(--accent)' : 'transparent',
            color: isDisabled(mode) ? 'var(--text-muted)' : (currentView === mode ? '#fff' : 'var(--button-text)'),
            cursor: isDisabled(mode) ? 'not-allowed' : 'pointer',
            fontSize: 13,
            fontWeight: currentView === mode ? 'bold' : 'normal',
            transition: 'all 0.15s'
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
