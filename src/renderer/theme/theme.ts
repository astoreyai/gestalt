/**
 * Theme definitions and utilities.
 *
 * Defines light and dark theme CSS custom property values, the ThemeMode type,
 * and helpers for resolving the effective theme from system preferences.
 */

// ─── Types ──────────────────────────────────────────────────────────

export type ThemeMode = 'light' | 'dark' | 'system'
export type EffectiveTheme = 'light' | 'dark'

// ─── CSS Custom Property Definitions ────────────────────────────────

export interface ThemeTokens {
  '--bg-primary': string
  '--bg-secondary': string
  '--bg-overlay': string
  '--text-primary': string
  '--text-secondary': string
  '--text-muted': string
  '--border': string
  '--border-active': string
  '--accent': string
  '--accent-hover': string
  '--accent-muted': string
  '--error': string
  '--success': string
  '--warning': string
  '--canvas-bg': string
  '--input-bg': string
  '--panel-bg': string
  '--button-bg': string
  '--button-text': string
}

export const DARK_THEME: ThemeTokens = {
  '--bg-primary': '#0a0a0a',
  '--bg-secondary': '#0f0f14',
  '--bg-overlay': 'rgba(0,0,0,0.6)',
  '--text-primary': '#e0e0e0',
  '--text-secondary': '#999',
  '--text-muted': '#666',
  '--border': '#333',
  '--border-active': '#4a9eff',
  '--accent': '#4a9eff',
  '--accent-hover': '#5cafff',
  '--accent-muted': 'rgba(74, 158, 255, 0.08)',
  '--error': '#ff6b6b',
  '--success': '#6bcb77',
  '--warning': '#ffd93d',
  '--canvas-bg': '#0a0a0a',
  '--input-bg': '#1a1a2e',
  '--panel-bg': 'rgba(15, 15, 20, 0.95)',
  '--button-bg': 'rgba(0,0,0,0.6)',
  '--button-text': '#ccc'
}

export const LIGHT_THEME: ThemeTokens = {
  '--bg-primary': '#f5f5f7',
  '--bg-secondary': '#ffffff',
  '--bg-overlay': 'rgba(255,255,255,0.85)',
  '--text-primary': '#1a1a1a',
  '--text-secondary': '#555',
  '--text-muted': '#888',
  '--border': '#d0d0d0',
  '--border-active': '#2a7de1',
  '--accent': '#2a7de1',
  '--accent-hover': '#1a6dcf',
  '--accent-muted': 'rgba(42, 125, 225, 0.08)',
  '--error': '#d32f2f',
  '--success': '#2e7d32',
  '--warning': '#ed6c02',
  '--canvas-bg': '#e8e8ec',
  '--input-bg': '#ffffff',
  '--panel-bg': 'rgba(245, 245, 247, 0.95)',
  '--button-bg': 'rgba(0,0,0,0.08)',
  '--button-text': '#333'
}

// ─── Helpers ────────────────────────────────────────────────────────

/**
 * Resolves a ThemeMode to an effective 'light' or 'dark' theme.
 * When mode is 'system', uses window.matchMedia to detect OS preference.
 */
export function getEffectiveTheme(mode: ThemeMode): EffectiveTheme {
  if (mode === 'light') return 'light'
  if (mode === 'dark') return 'dark'

  // mode === 'system' — detect from OS
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }

  // Fallback to dark if matchMedia is unavailable (e.g. SSR, tests)
  return 'dark'
}

/**
 * Returns the ThemeTokens for the given effective theme.
 */
export function getThemeTokens(theme: EffectiveTheme): ThemeTokens {
  return theme === 'dark' ? DARK_THEME : LIGHT_THEME
}

/**
 * Applies theme tokens as CSS custom properties to a target element.
 */
export function applyThemeTokens(tokens: ThemeTokens, target: HTMLElement): void {
  for (const [prop, value] of Object.entries(tokens)) {
    target.style.setProperty(prop, value)
  }
}
