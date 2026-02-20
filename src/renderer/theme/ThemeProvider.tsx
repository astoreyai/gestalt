/**
 * ThemeProvider — Reads theme preference from the config store,
 * resolves system preferences, applies CSS custom properties and
 * data-theme attribute to document.documentElement, and listens
 * for OS-level preference changes.
 */

import { useEffect, useRef } from 'react'
import { useConfigStore } from '../controller/store'
import {
  getEffectiveTheme,
  getThemeTokens,
  applyThemeTokens,
  type ThemeMode,
  type EffectiveTheme
} from './theme'

/**
 * Applies the resolved theme to the DOM. Call this whenever the
 * effective theme changes.
 */
function applyTheme(effective: EffectiveTheme): void {
  const root = document.documentElement
  root.setAttribute('data-theme', effective)
  applyThemeTokens(getThemeTokens(effective), root)
}

export interface ThemeProviderProps {
  children: React.ReactNode
}

/**
 * ThemeProvider component.
 *
 * - Reads `config.theme` from the Zustand config store
 * - Resolves 'system' to 'light' or 'dark' via matchMedia
 * - Sets `data-theme` attribute and CSS custom properties on `<html>`
 * - Listens for OS `prefers-color-scheme` changes when mode is 'system'
 */
export function ThemeProvider({ children }: ThemeProviderProps): React.ReactElement {
  const themeMode: ThemeMode = useConfigStore((s) => s.config.theme)
  const appliedRef = useRef<EffectiveTheme | null>(null)

  useEffect(() => {
    // Apply the initial/changed theme
    const effective = getEffectiveTheme(themeMode)
    applyTheme(effective)
    appliedRef.current = effective

    // When mode is 'system', listen for OS preference changes
    if (themeMode !== 'system') return

    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = (e: MediaQueryListEvent): void => {
      const newEffective: EffectiveTheme = e.matches ? 'dark' : 'light'
      if (newEffective !== appliedRef.current) {
        applyTheme(newEffective)
        appliedRef.current = newEffective
      }
    }

    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [themeMode])

  return <>{children}</>
}
