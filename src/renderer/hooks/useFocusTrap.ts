/**
 * useFocusTrap — React hook that traps keyboard focus within a container element.
 *
 * When active, Tab/Shift+Tab cycle through focusable elements inside the container.
 * On activation, the first focusable element receives focus. On deactivation,
 * focus is restored to the element that was focused before the trap was activated.
 * Pressing Escape invokes an optional callback.
 *
 * Designed for modal dialogs and overlay panels. Supports nested traps —
 * the innermost active trap takes priority since its keydown listener fires first.
 */

import { useEffect, useRef, useCallback } from 'react'
import type { RefObject } from 'react'

/** CSS selector for all standard focusable elements */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ')

/**
 * Returns all focusable elements within the given container, in DOM order.
 */
function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
}

/**
 * Traps keyboard focus within a container element.
 *
 * @param containerRef - React ref to the container DOM element
 * @param active - Whether the focus trap is currently active
 * @param onEscape - Optional callback invoked when Escape is pressed
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void
): void {
  // Store the element that was focused before the trap activated.
  // Using a ref so the value persists across renders without triggering re-renders.
  const previousFocusRef = useRef<Element | null>(null)

  // Keep onEscape in a ref to avoid re-attaching the listener when the callback changes
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    const container = containerRef.current
    if (!container) return

    if (event.key === 'Escape') {
      if (onEscapeRef.current) {
        onEscapeRef.current()
      }
      return
    }

    if (event.key !== 'Tab') return

    const focusable = getFocusableElements(container)
    if (focusable.length === 0) {
      // Prevent Tab from leaving the container when there's nothing to focus
      event.preventDefault()
      return
    }

    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement)

    if (event.shiftKey) {
      // Shift+Tab: move backwards, wrap to end
      const nextIndex = currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
      event.preventDefault()
      focusable[nextIndex].focus()
    } else {
      // Tab: move forwards, wrap to start
      const nextIndex = currentIndex >= focusable.length - 1 ? 0 : currentIndex + 1
      event.preventDefault()
      focusable[nextIndex].focus()
    }
  }, [containerRef])

  useEffect(() => {
    const container = containerRef.current
    if (!active || !container) return

    // Save the currently focused element so we can restore it later
    previousFocusRef.current = document.activeElement

    // Auto-focus the first focusable element
    const focusable = getFocusableElements(container)
    if (focusable.length > 0) {
      focusable[0].focus()
    }

    // Attach keydown listener to the container
    container.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('keydown', handleKeyDown)

      // Restore focus to the previously focused element
      const previous = previousFocusRef.current
      if (previous && previous instanceof HTMLElement) {
        previous.focus()
      }
      previousFocusRef.current = null
    }
  }, [active, containerRef, handleKeyDown])
}
