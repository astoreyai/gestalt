/**
 * Component export tests.
 * Verifies that each extracted component is properly exported and is a function.
 */

import { describe, it, expect } from 'vitest'
import { HUD } from '../HUD'
import { ToastQueue } from '../ToastQueue'
import { ModalContainer } from '../ModalContainer'
import { SelectionPanel } from '../SelectionPanel'

describe('Component exports', () => {
  it('should export HUD component', () => {
    expect(typeof HUD).toBe('function')
  })

  it('should export ToastQueue component', () => {
    expect(typeof ToastQueue).toBe('function')
  })

  it('should export ModalContainer component', () => {
    expect(typeof ModalContainer).toBe('function')
  })

  it('should export SelectionPanel component', () => {
    expect(typeof SelectionPanel).toBe('function')
  })
})
