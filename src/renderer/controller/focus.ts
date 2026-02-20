/**
 * Focus ring style and focus trap utilities for keyboard navigation.
 */

import { useEffect } from 'react'
import type React from 'react'

/** Focus ring style for keyboard navigation */
export const FOCUS_RING_STYLE: React.CSSProperties = {
  outline: '2px solid #4a9eff',
  outlineOffset: 2
}

/** Get button style with focus ring support */
export function withFocusRing(baseStyle: React.CSSProperties): React.CSSProperties {
  return { ...baseStyle, outline: 'none' }  // Remove default, apply custom via :focus-visible
}

/** Simple focus trap hook for modals */
export function useFocusTrap(active: boolean, containerRef: React.RefObject<HTMLDivElement>): void {
  useEffect(() => {
    if (!active || !containerRef.current) return

    const container = containerRef.current
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return

      const focusable = container.querySelectorAll(focusableSelector)
      if (focusable.length === 0) return

      const first = focusable[0] as HTMLElement
      const last = focusable[focusable.length - 1] as HTMLElement

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    container.addEventListener('keydown', handleKeyDown)

    // Auto-focus first focusable element
    const firstFocusable = container.querySelector(focusableSelector) as HTMLElement
    firstFocusable?.focus()

    return () => container.removeEventListener('keydown', handleKeyDown)
  }, [active, containerRef])
}
