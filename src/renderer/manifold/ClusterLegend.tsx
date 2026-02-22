/**
 * ClusterLegend — DOM overlay showing cluster color swatches, labels, and counts.
 * Positioned bottom-left, collapsible.
 */

import React, { useState, useCallback } from 'react'

export interface ClusterInfo {
  id: number
  label?: string
  color: string
  count: number
}

export interface ClusterLegendProps {
  clusters: ClusterInfo[]
  selectedClusterId?: number | null
  onClusterClick?: (id: number) => void
}

export function ClusterLegend({
  clusters,
  selectedClusterId,
  onClusterClick
}: ClusterLegendProps): React.ReactElement | null {
  const [collapsed, setCollapsed] = useState(false)

  const toggle = useCallback(() => setCollapsed(c => !c), [])

  if (clusters.length === 0) return null

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        left: 16,
        background: 'var(--bg-overlay, rgba(0,0,0,0.7))',
        borderRadius: 8,
        padding: collapsed ? '6px 12px' : '8px 12px',
        fontSize: 12,
        color: 'var(--text-primary, #eee)',
        maxHeight: 300,
        overflowY: collapsed ? 'hidden' : 'auto',
        pointerEvents: 'auto',
        zIndex: 50,
        minWidth: 120
      }}
    >
      <div
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: collapsed ? 0 : 6 }}
        onClick={toggle}
      >
        <span style={{ fontWeight: 'bold' }}>Clusters</span>
        <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.6 }}>{collapsed ? '+' : '-'}</span>
      </div>
      {!collapsed && clusters.map(c => (
        <div
          key={c.id}
          onClick={() => onClusterClick?.(c.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 0',
            cursor: onClusterClick ? 'pointer' : 'default',
            opacity: selectedClusterId != null && selectedClusterId !== c.id ? 0.4 : 1
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: c.color,
              flexShrink: 0,
              border: selectedClusterId === c.id ? '2px solid #fff' : 'none'
            }}
          />
          <span style={{ flex: 1 }}>{c.label ?? `Cluster ${c.id}`}</span>
          <span style={{ opacity: 0.6, fontSize: 11 }}>{c.count}</span>
        </div>
      ))}
    </div>
  )
}
