/**
 * Tests for useFocusTrap hook.
 *
 * Verifies focus trapping behavior for modal dialogs:
 * Tab/Shift+Tab cycling, auto-focus, focus restoration, Escape handling,
 * and graceful behavior with no focusable children.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import React from 'react'
import { render } from '@testing-library/react'
import { useFocusTrap } from '../useFocusTrap'

/**
 * Helper: creates a container div with focusable children, appends to document,
 * and returns a ref-like object plus the container element.
 */
function createContainer(...children: HTMLElement[]): {
  ref: React.RefObject<HTMLElement>
  container: HTMLDivElement
} {
  const container = document.createElement('div')
  for (const child of children) {
    container.appendChild(child)
  }
  document.body.appendChild(container)
  const ref = { current: container } as React.RefObject<HTMLElement>
  return { ref, container }
}

/** Helper: creates a button element with a label */
function createButton(label: string): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.textContent = label
  return btn
}

/** Helper: creates an input element */
function createInput(name: string): HTMLInputElement {
  const input = document.createElement('input')
  input.name = name
  return input
}

/** Helper: dispatches a KeyboardEvent on the given target */
function pressKey(
  target: EventTarget,
  key: string,
  opts: Partial<KeyboardEventInit> = {}
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts
  })
  target.dispatchEvent(event)
  return event
}

/**
 * Wrapper component that renders the hook with a real DOM container.
 * Allows us to test focus trapping in a realistic environment.
 */
function FocusTrapHarness({
  active,
  onEscape,
  children
}: {
  active: boolean
  onEscape?: () => void
  children?: React.ReactNode
}): React.ReactElement {
  const ref = React.useRef<HTMLDivElement>(null)
  useFocusTrap(ref, active, onEscape)
  return React.createElement('div', { ref, 'data-testid': 'trap-container' }, children)
}

describe('useFocusTrap', () => {
  let cleanup: (() => void)[] = []

  beforeEach(() => {
    cleanup = []
  })

  afterEach(() => {
    for (const fn of cleanup) fn()
    cleanup = []
  })

  it('should auto-focus the first focusable element when activated', () => {
    const btn1 = createButton('First')
    const btn2 = createButton('Second')
    const { ref, container } = createContainer(btn1, btn2)
    cleanup.push(() => container.remove())

    // Focus something outside the container first
    const outside = document.createElement('button')
    outside.textContent = 'Outside'
    document.body.appendChild(outside)
    cleanup.push(() => outside.remove())
    outside.focus()
    expect(document.activeElement).toBe(outside)

    renderHook(() => useFocusTrap(ref, true))

    expect(document.activeElement).toBe(btn1)
  })

  it('should trap Tab to cycle through focusable elements', () => {
    const btn1 = createButton('First')
    const btn2 = createButton('Second')
    const input = createInput('third')
    const { ref, container } = createContainer(btn1, btn2, input)
    cleanup.push(() => container.remove())

    renderHook(() => useFocusTrap(ref, true))

    // Should start on first element
    expect(document.activeElement).toBe(btn1)

    // Tab from btn1 -> btn2
    pressKey(container, 'Tab')
    expect(document.activeElement).toBe(btn2)

    // Tab from btn2 -> input
    pressKey(container, 'Tab')
    expect(document.activeElement).toBe(input)

    // Tab from input -> wraps to btn1
    pressKey(container, 'Tab')
    expect(document.activeElement).toBe(btn1)
  })

  it('should trap Shift+Tab to reverse-cycle through focusable elements', () => {
    const btn1 = createButton('First')
    const btn2 = createButton('Second')
    const input = createInput('third')
    const { ref, container } = createContainer(btn1, btn2, input)
    cleanup.push(() => container.remove())

    renderHook(() => useFocusTrap(ref, true))

    // Start on first element
    expect(document.activeElement).toBe(btn1)

    // Shift+Tab from btn1 -> wraps to input (last element)
    pressKey(container, 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(input)

    // Shift+Tab from input -> btn2
    pressKey(container, 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(btn2)

    // Shift+Tab from btn2 -> btn1
    pressKey(container, 'Tab', { shiftKey: true })
    expect(document.activeElement).toBe(btn1)
  })

  it('should restore focus to the previously focused element on deactivation', () => {
    const btn1 = createButton('Inside')
    const { ref, container } = createContainer(btn1)
    cleanup.push(() => container.remove())

    // Focus something outside first
    const outside = document.createElement('button')
    outside.textContent = 'Outside'
    document.body.appendChild(outside)
    cleanup.push(() => outside.remove())
    outside.focus()
    expect(document.activeElement).toBe(outside)

    const { rerender } = renderHook(
      ({ active }) => useFocusTrap(ref, active),
      { initialProps: { active: true } }
    )

    // Focus moved into the trap
    expect(document.activeElement).toBe(btn1)

    // Deactivate the trap
    act(() => {
      rerender({ active: false })
    })

    // Focus should be restored to the element that was focused before activation
    expect(document.activeElement).toBe(outside)
  })

  it('should call onEscape when Escape key is pressed', () => {
    const onEscape = vi.fn()
    const btn1 = createButton('Inside')
    const { ref, container } = createContainer(btn1)
    cleanup.push(() => container.remove())

    renderHook(() => useFocusTrap(ref, true, onEscape))

    pressKey(container, 'Escape')
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('should not trap focus or call onEscape when not active', () => {
    const onEscape = vi.fn()
    const btn1 = createButton('Inside')
    const { ref, container } = createContainer(btn1)
    cleanup.push(() => container.remove())

    // Focus something outside
    const outside = document.createElement('button')
    outside.textContent = 'Outside'
    document.body.appendChild(outside)
    cleanup.push(() => outside.remove())
    outside.focus()

    renderHook(() => useFocusTrap(ref, false, onEscape))

    // Focus should NOT move to the container
    expect(document.activeElement).toBe(outside)

    // Escape should NOT trigger onEscape
    pressKey(container, 'Escape')
    expect(onEscape).not.toHaveBeenCalled()

    // Tab should NOT be intercepted (no keydown listener)
    pressKey(container, 'Tab')
    expect(document.activeElement).toBe(outside)
  })

  it('should not crash when container has no focusable elements', () => {
    const container = document.createElement('div')
    const span = document.createElement('span')
    span.textContent = 'Not focusable'
    container.appendChild(span)
    document.body.appendChild(container)
    cleanup.push(() => container.remove())
    const ref = { current: container } as React.RefObject<HTMLElement>

    // Should not throw
    expect(() => {
      renderHook(() => useFocusTrap(ref, true))
    }).not.toThrow()

    // Tab should not crash either
    pressKey(container, 'Tab')
    pressKey(container, 'Tab', { shiftKey: true })
    pressKey(container, 'Escape')
  })

  it('should update when children change (new focusable elements added)', () => {
    const btn1 = createButton('First')
    const { ref, container } = createContainer(btn1)
    cleanup.push(() => container.remove())

    renderHook(() => useFocusTrap(ref, true))

    expect(document.activeElement).toBe(btn1)

    // Tab wraps around with only one element
    pressKey(container, 'Tab')
    expect(document.activeElement).toBe(btn1)

    // Add a second button dynamically
    const btn2 = createButton('Second')
    container.appendChild(btn2)

    // Now Tab should move to btn2 (the hook queries focusable elements on each Tab)
    btn1.focus()
    pressKey(container, 'Tab')
    expect(document.activeElement).toBe(btn2)

    // And wrap back to btn1
    pressKey(container, 'Tab')
    expect(document.activeElement).toBe(btn1)
  })
})
