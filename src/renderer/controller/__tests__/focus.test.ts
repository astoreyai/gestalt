import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { FOCUS_RING_STYLE, withFocusRing, useFocusTrap } from '../focus'
import type React from 'react'

describe('Focus utilities', () => {
  it('FOCUS_RING_STYLE should have outline properties', () => {
    expect(FOCUS_RING_STYLE.outline).toBe('2px solid #4a9eff')
    expect(FOCUS_RING_STYLE.outlineOffset).toBe(2)
  })

  it('withFocusRing should remove default outline', () => {
    const base = { backgroundColor: 'red', color: 'white' } as React.CSSProperties
    const result = withFocusRing(base)
    expect(result.outline).toBe('none')
    expect(result.backgroundColor).toBe('red')
    expect(result.color).toBe('white')
  })

  it('withFocusRing should override existing outline', () => {
    const base = { outline: '1px solid black' } as React.CSSProperties
    const result = withFocusRing(base)
    expect(result.outline).toBe('none')
  })

  it('useFocusTrap should exist as a function', () => {
    expect(typeof useFocusTrap).toBe('function')
  })
})

describe('useFocusTrap hook', () => {
  /** Helper: create a container div with focusable children appended to document.body */
  function createContainer(): HTMLDivElement {
    const container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const btn2 = document.createElement('button')
    btn2.textContent = 'Middle'
    const btn3 = document.createElement('button')
    btn3.textContent = 'Last'
    container.appendChild(btn1)
    container.appendChild(btn2)
    container.appendChild(btn3)
    document.body.appendChild(container)
    return container
  }

  afterEach(() => {
    // Clean up any containers we added
    document.body.innerHTML = ''
  })

  it('should add a keydown listener and auto-focus first element when active', () => {
    const container = createContainer()
    const ref = { current: container } as React.RefObject<HTMLDivElement>
    const addSpy = vi.spyOn(container, 'addEventListener')

    renderHook(() => useFocusTrap(true, ref))

    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    // Auto-focus: first button should be focused
    const firstButton = container.querySelector('button') as HTMLButtonElement
    expect(document.activeElement).toBe(firstButton)
  })

  it('should trap Tab key: wrap from last focusable to first', () => {
    const container = createContainer()
    const ref = { current: container } as React.RefObject<HTMLDivElement>
    const buttons = container.querySelectorAll('button')
    const firstBtn = buttons[0] as HTMLButtonElement
    const lastBtn = buttons[buttons.length - 1] as HTMLButtonElement

    renderHook(() => useFocusTrap(true, ref))

    // Focus the last button
    lastBtn.focus()
    expect(document.activeElement).toBe(lastBtn)

    // Press Tab on the last button - should wrap to first
    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    })
    const preventSpy = vi.spyOn(tabEvent, 'preventDefault')
    container.dispatchEvent(tabEvent)

    expect(preventSpy).toHaveBeenCalled()
    expect(document.activeElement).toBe(firstBtn)
  })

  it('should trap Shift+Tab: wrap from first focusable to last', () => {
    const container = createContainer()
    const ref = { current: container } as React.RefObject<HTMLDivElement>
    const buttons = container.querySelectorAll('button')
    const firstBtn = buttons[0] as HTMLButtonElement
    const lastBtn = buttons[buttons.length - 1] as HTMLButtonElement

    renderHook(() => useFocusTrap(true, ref))

    // First button is auto-focused; verify
    expect(document.activeElement).toBe(firstBtn)

    // Press Shift+Tab on the first button - should wrap to last
    const shiftTabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: true,
      bubbles: true,
      cancelable: true
    })
    const preventSpy = vi.spyOn(shiftTabEvent, 'preventDefault')
    container.dispatchEvent(shiftTabEvent)

    expect(preventSpy).toHaveBeenCalled()
    expect(document.activeElement).toBe(lastBtn)
  })

  it('should do nothing when active is false', () => {
    const container = createContainer()
    const ref = { current: container } as React.RefObject<HTMLDivElement>
    const addSpy = vi.spyOn(container, 'addEventListener')

    renderHook(() => useFocusTrap(false, ref))

    expect(addSpy).not.toHaveBeenCalled()
    // First button should NOT be auto-focused
    const firstButton = container.querySelector('button') as HTMLButtonElement
    expect(document.activeElement).not.toBe(firstButton)
  })

  it('should remove keydown listener on cleanup (unmount)', () => {
    const container = createContainer()
    const ref = { current: container } as React.RefObject<HTMLDivElement>
    const removeSpy = vi.spyOn(container, 'removeEventListener')

    const { unmount } = renderHook(() => useFocusTrap(true, ref))

    expect(removeSpy).not.toHaveBeenCalled()

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
  })

  it('should do nothing when containerRef.current is null', () => {
    const ref = { current: null } as React.RefObject<HTMLDivElement>

    // Should not throw
    const { unmount } = renderHook(() => useFocusTrap(true, ref))
    unmount()
  })

  it('should not prevent default for non-Tab keys', () => {
    const container = createContainer()
    const ref = { current: container } as React.RefObject<HTMLDivElement>

    renderHook(() => useFocusTrap(true, ref))

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true
    })
    const preventSpy = vi.spyOn(enterEvent, 'preventDefault')
    container.dispatchEvent(enterEvent)

    expect(preventSpy).not.toHaveBeenCalled()
  })

  it('should not wrap when Tab pressed but active element is not last', () => {
    const container = createContainer()
    const ref = { current: container } as React.RefObject<HTMLDivElement>
    const buttons = container.querySelectorAll('button')
    const firstBtn = buttons[0] as HTMLButtonElement

    renderHook(() => useFocusTrap(true, ref))

    // First button is auto-focused (not last), so Tab should not wrap
    expect(document.activeElement).toBe(firstBtn)

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true
    })
    const preventSpy = vi.spyOn(tabEvent, 'preventDefault')
    container.dispatchEvent(tabEvent)

    // Should NOT have prevented default (focus is on first, not last)
    expect(preventSpy).not.toHaveBeenCalled()
  })
})
