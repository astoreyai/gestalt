/**
 * GestureGuide — Full-screen overlay showing all available gestures and their actions.
 * Displays single-hand gestures and two-hand combo mappings in a table format.
 */

import React from 'react'
import { getGestureIcon } from './gesture-icons'
import { COLORS } from '../styles/tokens'

export interface GestureGuideProps {
  visible: boolean
  onClose: () => void
}

interface GestureEntry {
  gesture: string
  action: string
  description: string
}

const SINGLE_HAND_GESTURES: GestureEntry[] = [
  { gesture: 'Pinch', action: 'Select / Drag', description: 'Touch thumb to index. Tap to select, hold to drag.' },
  { gesture: 'Point', action: 'Navigate', description: 'Extend index finger. Hold to navigate toward target.' },
  { gesture: 'OpenPalm', action: 'Deselect', description: 'Open all fingers. Deselect current node.' },
  { gesture: 'Fist', action: 'Zoom In', description: 'Close all fingers. Zoom in when one-handed mode is on.' },
  { gesture: 'LShape', action: 'Zoom Out', description: 'Thumb + index extended. Zoom out when one-handed mode is on.' },
  { gesture: 'FlatDrag', action: 'Pan', description: 'All fingers flat. Hold to pan the camera.' },
  { gesture: 'Twist', action: 'Rotate', description: 'Rotate wrist. Hold to rotate the view.' }
]

const TWO_HAND_GESTURES: GestureEntry[] = [
  { gesture: 'Pinch + Pinch', action: 'Scale / Zoom', description: 'Both hands pinch. Move apart to zoom or scale.' },
  { gesture: 'OpenPalm + OpenPalm', action: 'Dolly', description: 'Both palms open. Push/pull to dolly camera.' },
  { gesture: 'Twist + Twist (same)', action: 'Orbit', description: 'Twist both hands same direction to orbit.' },
  { gesture: 'Twist + Twist (opposite)', action: 'Roll', description: 'Twist hands opposite directions to roll.' },
  { gesture: 'Pinch + FlatDrag', action: 'Drag + Pan', description: 'Pinch with one hand, flat drag with other.' },
  { gesture: 'Pinch + OpenPalm', action: 'Unfold', description: 'Pinch + open palm to unfold cluster.' },
  { gesture: 'Point + Point', action: 'Measure', description: 'Point with both hands to measure distance.' },
  { gesture: 'Fist + Fist', action: 'Fold', description: 'Both fists to fold/collapse cluster.' }
]

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0,0,0,0.85)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  pointerEvents: 'all'
}

const cardStyle: React.CSSProperties = {
  position: 'relative',
  background: COLORS.cardBg,
  borderRadius: 12,
  padding: 24,
  maxWidth: 600,
  width: '90%',
  maxHeight: '80vh',
  overflowY: 'auto',
  color: '#e0e0e0'
}

const titleStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
  fontSize: 20,
  color: '#ffffff',
  fontWeight: 600
}

const sectionHeaderStyle: React.CSSProperties = {
  margin: '20px 0 8px 0',
  fontSize: 15,
  color: '#ffffff',
  fontWeight: 600
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 13
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '8px 12px',
  borderBottom: '2px solid #444',
  color: '#ffffff',
  fontWeight: 600
}

const tdStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderBottom: '1px solid #333'
}

const closeBtnStyle: React.CSSProperties = {
  position: 'absolute',
  top: 12,
  right: 12,
  background: 'none',
  border: 'none',
  color: '#ffffff',
  fontSize: 20,
  cursor: 'pointer',
  lineHeight: 1,
  padding: '4px 8px'
}

function GestureTable({ entries }: { entries: GestureEntry[] }): React.ReactElement {
  return React.createElement('table', { style: tableStyle },
    React.createElement('thead', null,
      React.createElement('tr', null,
        React.createElement('th', { style: thStyle }, 'Gesture'),
        React.createElement('th', { style: thStyle }, 'Action'),
        React.createElement('th', { style: thStyle }, 'Description')
      )
    ),
    React.createElement('tbody', null,
      entries.map((entry) =>
        React.createElement('tr', { key: entry.gesture },
          React.createElement('td', { style: { ...tdStyle, display: 'flex', alignItems: 'center', gap: 6 } },
            React.createElement('span', { dangerouslySetInnerHTML: { __html: getGestureIcon(entry.gesture) } }),
            entry.gesture
          ),
          React.createElement('td', { style: tdStyle }, entry.action),
          React.createElement('td', { style: tdStyle }, entry.description)
        )
      )
    )
  )
}

export function GestureGuide({ visible, onClose }: GestureGuideProps): React.ReactElement | null {
  if (!visible) return null

  return React.createElement('div', { style: overlayStyle },
    React.createElement('div', { style: cardStyle },
      React.createElement('h2', { style: titleStyle }, 'Gesture Guide'),
      React.createElement('button', {
        style: closeBtnStyle,
        onClick: onClose,
        'aria-label': 'Close gesture guide'
      }, '\u00D7'),
      React.createElement('h3', { style: sectionHeaderStyle }, 'Single Hand'),
      React.createElement(GestureTable, { entries: SINGLE_HAND_GESTURES }),
      React.createElement('h3', { style: sectionHeaderStyle }, 'Two Hands'),
      React.createElement(GestureTable, { entries: TWO_HAND_GESTURES })
    )
  )
}
