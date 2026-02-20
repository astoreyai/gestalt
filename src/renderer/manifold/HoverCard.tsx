/**
 * HoverCard component for displaying metadata about a hovered embedding point.
 * Uses drei's Html component for 3D-positioned HTML overlay.
 */

import React from 'react'
import { Html } from '@react-three/drei'
import type { EmbeddingPoint } from '@shared/protocol'
import { CLUSTER_COLORS } from './types'

export interface HoverCardProps {
  /** The hovered point to display, or null */
  point: EmbeddingPoint | null
  /** Whether the card is visible */
  visible: boolean
}

/** Styles for the hover card */
const cardStyle: React.CSSProperties = {
  background: 'rgba(10, 10, 10, 0.92)',
  border: '1px solid rgba(255, 255, 255, 0.15)',
  borderRadius: 8,
  padding: '10px 14px',
  fontSize: 12,
  fontFamily: 'monospace',
  color: '#e0e0e0',
  pointerEvents: 'none',
  whiteSpace: 'nowrap',
  minWidth: 160,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.6)'
}

const labelStyle: React.CSSProperties = {
  fontWeight: 'bold',
  fontSize: 13,
  marginBottom: 4
}

const metaKeyStyle: React.CSSProperties = {
  color: '#888',
  marginRight: 6
}

const metaValueStyle: React.CSSProperties = {
  color: '#ccc'
}

export function HoverCard({ point, visible }: HoverCardProps): React.ReactElement | null {
  if (!point || !visible) return null

  const clusterColor =
    point.clusterId !== undefined
      ? CLUSTER_COLORS[point.clusterId % CLUSTER_COLORS.length]
      : '#ffffff'

  // Format metadata entries (limit display to avoid overly large cards)
  const metaEntries = point.metadata ? Object.entries(point.metadata).slice(0, 6) : []

  return (
    <Html
      position={[point.position.x, point.position.y + 0.5, point.position.z]}
      center
      style={{ transform: 'translate(10px, -100%)' }}
      zIndexRange={[100, 0]}
    >
      <div style={cardStyle}>
        {/* Point label */}
        <div style={labelStyle}>
          {point.label ?? point.id}
        </div>

        {/* Cluster badge */}
        {point.clusterId !== undefined && (
          <div style={{ marginBottom: 4 }}>
            <span
              style={{
                display: 'inline-block',
                width: 8,
                height: 8,
                borderRadius: '50%',
                backgroundColor: clusterColor,
                marginRight: 6,
                verticalAlign: 'middle'
              }}
            />
            <span style={{ color: clusterColor, fontSize: 11 }}>
              Cluster {point.clusterId}
            </span>
          </div>
        )}

        {/* Position */}
        <div style={{ fontSize: 10, color: '#666', marginBottom: 4 }}>
          ({point.position.x.toFixed(2)}, {point.position.y.toFixed(2)},{' '}
          {point.position.z.toFixed(2)})
        </div>

        {/* Metadata key-value pairs */}
        {metaEntries.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 4 }}>
            {metaEntries.map(([key, value]) => (
              <div key={key} style={{ fontSize: 11, lineHeight: '16px' }}>
                <span style={metaKeyStyle}>{key}:</span>
                <span style={metaValueStyle}>{String(value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Html>
  )
}
