/**
 * GestureGuide component tests.
 * TDD — these tests were written before the implementation.
 */

import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { GestureGuide } from '../GestureGuide'

describe('GestureGuide', () => {
  it('renders nothing when visible=false', () => {
    const { container } = render(
      React.createElement(GestureGuide, { visible: false, onClose: () => {} })
    )
    expect(container.innerHTML).toBe('')
  })

  it('renders overlay when visible=true', () => {
    render(
      React.createElement(GestureGuide, { visible: true, onClose: () => {} })
    )
    expect(screen.getByText('Gesture Guide')).toBeTruthy()
  })

  it('shows all single-hand gesture names', () => {
    render(
      React.createElement(GestureGuide, { visible: true, onClose: () => {} })
    )
    const singleHandGestures = ['Pinch', 'Point', 'OpenPalm', 'Fist', 'LShape', 'FlatDrag', 'Twist']
    for (const name of singleHandGestures) {
      expect(screen.getByText(name)).toBeTruthy()
    }
  })

  it('shows two-hand combo names', () => {
    render(
      React.createElement(GestureGuide, { visible: true, onClose: () => {} })
    )
    const twoHandCombos = [
      'Scale / Zoom',
      'Dolly',
      'Orbit',
      'Roll',
      'Drag + Pan',
      'Unfold',
      'Measure',
      'Fold'
    ]
    for (const name of twoHandCombos) {
      expect(screen.getByText(name)).toBeTruthy()
    }
  })

  it('shows action descriptions for each gesture', () => {
    render(
      React.createElement(GestureGuide, { visible: true, onClose: () => {} })
    )
    // Single-hand descriptions
    expect(screen.getByText('Touch thumb to index. Tap to select, hold to drag.')).toBeTruthy()
    expect(screen.getByText('Extend index finger. Hold to navigate toward target.')).toBeTruthy()
    expect(screen.getByText('Open all fingers. Deselect current node.')).toBeTruthy()
    expect(screen.getByText('Close all fingers. Zoom in when one-handed mode is on.')).toBeTruthy()
    expect(screen.getByText('Thumb + index extended. Zoom out when one-handed mode is on.')).toBeTruthy()
    expect(screen.getByText('All fingers flat. Hold to pan the camera.')).toBeTruthy()
    expect(screen.getByText('Rotate wrist. Hold to rotate the view.')).toBeTruthy()

    // Two-hand descriptions
    expect(screen.getByText('Both hands pinch. Move apart to zoom or scale.')).toBeTruthy()
    expect(screen.getByText('Both palms open. Push/pull to dolly camera.')).toBeTruthy()
    expect(screen.getByText('Twist both hands same direction to orbit.')).toBeTruthy()
    expect(screen.getByText('Twist hands opposite directions to roll.')).toBeTruthy()
    expect(screen.getByText('Pinch with one hand, flat drag with other.')).toBeTruthy()
    expect(screen.getByText('Pinch + open palm to unfold cluster.')).toBeTruthy()
    expect(screen.getByText('Point with both hands to measure distance.')).toBeTruthy()
    expect(screen.getByText('Both fists to fold/collapse cluster.')).toBeTruthy()
  })

  it('calls onClose callback when close button clicked', () => {
    const onClose = vi.fn()
    render(
      React.createElement(GestureGuide, { visible: true, onClose })
    )
    const closeButton = screen.getByLabelText('Close gesture guide')
    fireEvent.click(closeButton)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
