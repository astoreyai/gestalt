import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getEffectiveTheme,
  getThemeTokens,
  applyThemeTokens,
  DARK_THEME,
  LIGHT_THEME,
  type ThemeMode,
  type ThemeTokens
} from '../theme'

// ─── Helpers ──────────────────────────────────────────────────────

/** Create a mock matchMedia that returns the specified preference */
function mockMatchMedia(prefersDark: boolean): void {
  const listeners: Array<(e: MediaQueryListEvent) => void> = []

  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(prefers-color-scheme: dark)' ? prefersDark : !prefersDark,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, handler: (e: MediaQueryListEvent) => void) => {
        listeners.push(handler)
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    }))
  })
}

// ─── getEffectiveTheme ────────────────────────────────────────────

describe('getEffectiveTheme', () => {
  beforeEach(() => {
    // Reset matchMedia to a neutral state
    mockMatchMedia(true)
  })

  it('returns "dark" when mode is "dark"', () => {
    expect(getEffectiveTheme('dark')).toBe('dark')
  })

  it('returns "light" when mode is "light"', () => {
    expect(getEffectiveTheme('light')).toBe('light')
  })

  it('returns "dark" when mode is "system" and OS prefers dark', () => {
    mockMatchMedia(true)
    expect(getEffectiveTheme('system')).toBe('dark')
  })

  it('returns "light" when mode is "system" and OS prefers light', () => {
    mockMatchMedia(false)
    expect(getEffectiveTheme('system')).toBe('light')
  })

  it('falls back to "dark" when matchMedia is unavailable', () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: undefined
    })
    expect(getEffectiveTheme('system')).toBe('dark')
  })

  it('handles all ThemeMode values exhaustively', () => {
    const modes: ThemeMode[] = ['light', 'dark', 'system']
    for (const mode of modes) {
      const result = getEffectiveTheme(mode)
      expect(['light', 'dark']).toContain(result)
    }
  })
})

// ─── getThemeTokens ──────────────────────────────────────────────

describe('getThemeTokens', () => {
  it('returns DARK_THEME for "dark"', () => {
    expect(getThemeTokens('dark')).toBe(DARK_THEME)
  })

  it('returns LIGHT_THEME for "light"', () => {
    expect(getThemeTokens('light')).toBe(LIGHT_THEME)
  })
})

// ─── Theme token structure ───────────────────────────────────────

describe('theme token structure', () => {
  const REQUIRED_PROPERTIES: Array<keyof ThemeTokens> = [
    '--bg-primary',
    '--bg-secondary',
    '--bg-overlay',
    '--text-primary',
    '--text-secondary',
    '--text-muted',
    '--border',
    '--border-active',
    '--accent',
    '--accent-hover',
    '--accent-muted',
    '--error',
    '--success',
    '--warning',
    '--canvas-bg',
    '--input-bg',
    '--panel-bg',
    '--button-bg',
    '--button-text'
  ]

  it('DARK_THEME has all required CSS custom properties', () => {
    for (const prop of REQUIRED_PROPERTIES) {
      expect(DARK_THEME).toHaveProperty(prop)
      expect(typeof DARK_THEME[prop]).toBe('string')
      expect(DARK_THEME[prop].length).toBeGreaterThan(0)
    }
  })

  it('LIGHT_THEME has all required CSS custom properties', () => {
    for (const prop of REQUIRED_PROPERTIES) {
      expect(LIGHT_THEME).toHaveProperty(prop)
      expect(typeof LIGHT_THEME[prop]).toBe('string')
      expect(LIGHT_THEME[prop].length).toBeGreaterThan(0)
    }
  })

  it('DARK_THEME and LIGHT_THEME have the same set of keys', () => {
    expect(Object.keys(DARK_THEME).sort()).toEqual(Object.keys(LIGHT_THEME).sort())
  })

  it('DARK_THEME and LIGHT_THEME have different values for key properties', () => {
    // At minimum, bg-primary and text-primary should differ between themes
    expect(DARK_THEME['--bg-primary']).not.toBe(LIGHT_THEME['--bg-primary'])
    expect(DARK_THEME['--text-primary']).not.toBe(LIGHT_THEME['--text-primary'])
  })
})

// ─── applyThemeTokens ────────────────────────────────────────────

describe('applyThemeTokens', () => {
  let element: HTMLDivElement

  beforeEach(() => {
    element = document.createElement('div')
  })

  afterEach(() => {
    element.remove()
  })

  it('sets all CSS custom properties on the target element', () => {
    applyThemeTokens(DARK_THEME, element)

    for (const [prop, value] of Object.entries(DARK_THEME)) {
      expect(element.style.getPropertyValue(prop)).toBe(value)
    }
  })

  it('overrides previous theme properties when switching themes', () => {
    // Apply dark first
    applyThemeTokens(DARK_THEME, element)
    expect(element.style.getPropertyValue('--bg-primary')).toBe(DARK_THEME['--bg-primary'])

    // Switch to light
    applyThemeTokens(LIGHT_THEME, element)
    expect(element.style.getPropertyValue('--bg-primary')).toBe(LIGHT_THEME['--bg-primary'])
  })

  it('applies to document.documentElement without error', () => {
    expect(() => {
      applyThemeTokens(DARK_THEME, document.documentElement)
    }).not.toThrow()

    // Verify at least one property was set
    expect(
      document.documentElement.style.getPropertyValue('--bg-primary')
    ).toBe(DARK_THEME['--bg-primary'])
  })
})

// ─── System preference integration ──────────────────────────────

describe('system preference detection', () => {
  it('matchMedia is called with correct query for system mode', () => {
    const matchMediaSpy = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaSpy
    })

    getEffectiveTheme('system')
    expect(matchMediaSpy).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })

  it('does not call matchMedia for explicit light/dark modes', () => {
    const matchMediaSpy = vi.fn().mockReturnValue({
      matches: true,
      media: '(prefers-color-scheme: dark)',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })

    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: matchMediaSpy
    })

    getEffectiveTheme('light')
    getEffectiveTheme('dark')
    expect(matchMediaSpy).not.toHaveBeenCalled()
  })
})
