/**
 * Accessibility constants and helpers.
 * Ensures WCAG AA compliance for color contrast and
 * provides non-color status indicators for color-blind users.
 */

/** Accessible color palette — all colors pass WCAG AA on #0a0a0a background */
export const A11Y_COLORS = {
  /** Secondary text color — #999 on #0a0a0a gives ~5.3:1 contrast (WCAG AA) */
  textSecondary: '#999',
  /** Tracking active status */
  trackingActive: '#6bcb77',
  /** Tracking paused status */
  trackingPaused: '#ff6b6b'
} as const

/**
 * Returns a shape-based status indicator for tracking state.
 * Provides differentiation beyond color alone (red/green safe).
 *
 * - Tracking: filled circle (U+25CF)
 * - Paused: hollow circle (U+25CB)
 */
export function getTrackingStatusIndicator(tracking: boolean): string {
  return tracking ? '\u25CF' : '\u25CB'
}
