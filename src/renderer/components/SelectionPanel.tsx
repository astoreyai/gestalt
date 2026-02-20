/**
 * SelectionPanel — Displays info about the currently selected graph node
 * or manifold point. Uses sanitization for metadata display.
 * Extracted from App.tsx to reduce component size.
 */

import React from 'react'
import { A11Y_COLORS } from '../controller/a11y'
import { sanitizeDisplayValue, sanitizeMetadata } from '../controller/sanitize'
import type { SelectedNodeInfo } from '../controller/selection-info'
import type { SelectedPointInfo } from '../controller/selection-info'

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

/** Shared panel style for the selection info container */
const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 16,
  padding: 16,
  background: 'rgba(0,0,0,0.8)',
  borderRadius: 12,
  border: '1px solid #333',
  maxWidth: 300
}

export interface SelectionPanelProps {
  selectedNodeInfo: SelectedNodeInfo | null
  selectedPointInfo: SelectedPointInfo | null
  onDeselect: () => void
}

export function SelectionPanel({
  selectedNodeInfo,
  selectedPointInfo,
  onDeselect
}: SelectionPanelProps): React.ReactElement | null {
  // Graph node selection
  if (selectedNodeInfo) {
    const sanitizedMeta = sanitizeMetadata(selectedNodeInfo.metadata)

    return (
      <div style={panelStyle}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>
          {sanitizeDisplayValue(selectedNodeInfo.label)}
        </h4>
        <div style={{ fontSize: 12, color: A11Y_COLORS.textSecondary, marginBottom: 8 }}>
          <div>{selectedNodeInfo.neighborCount} connection{selectedNodeInfo.neighborCount !== 1 ? 's' : ''}</div>
          {sanitizedMeta.map((entry) => (
            <div key={entry.key}>{entry.key}: {entry.value}</div>
          ))}
        </div>
        {selectedNodeInfo.edges.length > 0 && (
          <div style={{ fontSize: 11, color: A11Y_COLORS.textSecondary, marginBottom: 8, maxHeight: 100, overflowY: 'auto' }}>
            {selectedNodeInfo.edges.map(edge => (
              <div key={edge.targetId}>
                {sanitizeDisplayValue(edge.targetLabel ?? edge.targetId)}{edge.weight !== undefined ? ` (${edge.weight.toFixed(2)})` : ''}
              </div>
            ))}
          </div>
        )}
        <button
          onClick={onDeselect}
          style={{ ...buttonStyle, padding: '4px 10px', fontSize: 11 }}
          aria-label="Deselect node"
        >
          Deselect
        </button>
      </div>
    )
  }

  // Manifold point selection (when no graph node matched)
  if (selectedPointInfo) {
    const sanitizedMeta = sanitizeMetadata(selectedPointInfo.metadata)

    return (
      <div style={panelStyle}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>
          {sanitizeDisplayValue(selectedPointInfo.label)}
        </h4>
        <div style={{ fontSize: 12, color: A11Y_COLORS.textSecondary, marginBottom: 8 }}>
          {selectedPointInfo.clusterLabel && (
            <div>
              Cluster: <span style={{ color: selectedPointInfo.clusterColor ?? '#ccc' }}>{sanitizeDisplayValue(selectedPointInfo.clusterLabel)}</span>
            </div>
          )}
          <div>
            Position: ({selectedPointInfo.position.x.toFixed(2)}, {selectedPointInfo.position.y.toFixed(2)}, {selectedPointInfo.position.z.toFixed(2)})
          </div>
          {sanitizedMeta.map((entry) => (
            <div key={entry.key}>{entry.key}: {entry.value}</div>
          ))}
        </div>
        <button
          onClick={onDeselect}
          style={{ ...buttonStyle, padding: '4px 10px', fontSize: 11 }}
          aria-label="Deselect node"
        >
          Deselect
        </button>
      </div>
    )
  }

  return null
}
