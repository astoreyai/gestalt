/**
 * Design tokens — centralized style constants for the Gestalt UI.
 *
 * Sprint 0b TDD remediation. These tokens replace hardcoded values
 * scattered across components with a single source of truth.
 *
 * - Z_INDEX: Stacking context scale (8 levels, strictly ascending)
 * - COLORS: Semantic color palette (CSS var refs + literal hex)
 * - SPACING: 4px-grid spacing scale
 * - FONT_SIZE: Typographic scale in px
 * - MIN_TOUCH_TARGET: WCAG 2.5.8 minimum touch target (44px)
 */

// ─── Z-Index Scale ──────────────────────────────────────────────────

export const Z_INDEX = {
  base: 0,
  dropdown: 10,
  overlay: 50,
  modalBackdrop: 140,
  modal: 150,
  toast: 200,
  gestureOverlay: 300,
  guide: 1000
} as const

// ─── Color Palette ──────────────────────────────────────────────────

export const COLORS = {
  // Semantic references to CSS custom properties (set by ThemeProvider)
  bg: 'var(--bg-primary)',
  bgOverlay: 'var(--bg-overlay)',
  text: 'var(--text-primary)',
  textSecondary: 'var(--text-secondary)',
  textMuted: 'var(--text-muted)',
  accent: 'var(--accent, #4a9eff)',
  border: 'var(--border)',
  panelBg: 'var(--panel-bg)',
  buttonBg: 'var(--button-bg)',
  buttonText: 'var(--button-text)',

  // Hand tracking colors (fixed, not theme-dependent)
  handRight: '#4a9eff',
  handLeft: '#6bcb77',

  // Semantic status colors (fixed)
  success: '#6bcb77',
  warning: '#f0c040',
  error: '#e05050',

  // Card surface colors (fixed for dark glass-panel aesthetic)
  cardBg: '#1a1a2e',
  cardBorder: 'rgba(255,255,255,0.15)'
} as const

// ─── Spacing Grid ───────────────────────────────────────────────────

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const

// ─── Type Scale ─────────────────────────────────────────────────────

export const FONT_SIZE = {
  xs: 10,
  sm: 11,
  md: 12,
  lg: 13,
  xl: 14,
  xxl: 16,
  title: 20
} as const

// ─── Accessibility ──────────────────────────────────────────────────

/** WCAG 2.5.8 minimum touch/click target size in pixels */
export const MIN_TOUCH_TARGET = 44
