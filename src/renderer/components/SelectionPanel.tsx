/**
 * SelectionPanel — Displays info about the currently selected graph node
 * or manifold point. Uses sanitization for metadata display.
 * Extracted from App.tsx to reduce component size.
 */

import React from 'react'
import { A11Y_COLORS } from '../controller/a11y'
import { sanitizeDisplayValue, sanitizeMetadata } from '../controller/sanitize'
import type { SelectedNodeInfo, SelectedPointInfo, SelectionInfo } from '../controller/selection-info'

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

/** Shared panel style for the selection info container — offset left to avoid ClusterLegend */
const panelStyle: React.CSSProperties = {
  position: 'absolute',
  bottom: 16,
  left: 220,
  padding: 16,
  background: 'var(--panel-bg)',
  borderRadius: 12,
  border: '1px solid var(--border)',
  maxWidth: 300
}

export interface SelectionPanelProps {
  selectedNodeInfo: SelectedNodeInfo | null
  selectedPointInfo: SelectedPointInfo | null
  /** Unified selection info (preferred over individual node/point info) */
  selectionInfo?: SelectionInfo
  onDeselect: () => void
}

export function SelectionPanel({
  selectedNodeInfo,
  selectedPointInfo,
  selectionInfo,
  onDeselect
}: SelectionPanelProps): React.ReactElement | null {
  // Unified path: render cluster info
  if (selectionInfo?.kind === 'cluster') {
    return (
      <div style={panelStyle}>
        <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>
          {sanitizeDisplayValue(selectionInfo.info.label ?? `Cluster ${selectionInfo.info.id}`)}
        </h4>
        {selectionInfo.info.color && (
          <div style={{ fontSize: 12, color: A11Y_COLORS.textSecondary, marginBottom: 8 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: selectionInfo.info.color, marginRight: 6, verticalAlign: 'middle' }} />
            Cluster
          </div>
        )}
        <button
          onClick={onDeselect}
          style={{ ...buttonStyle, padding: '4px 10px', fontSize: 11 }}
          aria-label="Deselect cluster"
        >
          Deselect
        </button>
      </div>
    )
  }

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
