/**
 * Component render tests.
 * Verifies that each extracted component renders correctly with minimal props.
 */

import { describe, it, expect } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import { ToastQueue } from '../ToastQueue'
import { ModalContainer } from '../ModalContainer'
import { SelectionPanel } from '../SelectionPanel'

describe('Component render tests', () => {
  it('ToastQueue renders an alert region when empty', () => {
    const { container } = render(
      React.createElement(ToastQueue, { toasts: [], onDismiss: () => {} })
    )
    expect(container.querySelector('[role="alert"]')).toBeTruthy()
  })

  it('ToastQueue renders toast messages', () => {
    const toasts = [
      { id: 't1', message: 'Test toast', severity: 'info' as const, dismissMs: 5000, timestamp: Date.now() }
    ]
    render(React.createElement(ToastQueue, { toasts, onDismiss: () => {} }))
    expect(screen.getByText('Test toast')).toBeTruthy()
  })

  it('ModalContainer returns null when activeModal is null', () => {
    const { container } = render(
      React.createElement(ModalContainer, {
        activeModal: null,
        onClose: () => {},
        children: React.createElement('div', null, 'Content')
      })
    )
    expect(container.innerHTML).toBe('')
  })

  it('ModalContainer renders dialog when activeModal is set', () => {
    const { container } = render(
      React.createElement(ModalContainer, {
        activeModal: 'settings',
        onClose: () => {},
        children: React.createElement('div', null, 'Settings Content')
      })
    )
    expect(container.querySelector('[role="dialog"]')).toBeTruthy()
    expect(container.textContent).toContain('Settings Content')
  })

  it('SelectionPanel returns null when nothing selected', () => {
    const { container } = render(
      React.createElement(SelectionPanel, {
        selectedNodeInfo: null,
        selectedPointInfo: null,
        onDeselect: () => {}
      })
    )
    expect(container.innerHTML).toBe('')
  })
})
