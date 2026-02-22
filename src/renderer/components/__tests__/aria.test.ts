/**
 * ARIA and role attribute tests (Sprint 0d).
 * Verifies that interactive controls have proper ARIA roles, states,
 * and live regions for screen reader accessibility.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'
import type { ViewMode } from '@shared/protocol'
import { DEFAULT_CONFIG } from '@shared/protocol'

// ── Mock Zustand stores ──────────────────────────────────────────

const mockSetViewMode = vi.fn()
const mockSetActiveModal = vi.fn()
const mockUpdateConfig = vi.fn()

let mockViewMode: ViewMode = 'graph'
let mockTrackingEnabled = true
let mockActiveModal: string | null = null
let mockOverlayMode = false
let mockConfig = { ...DEFAULT_CONFIG }

vi.mock('@renderer/controller/store', () => ({
  useVisualStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = { viewMode: mockViewMode, setViewMode: mockSetViewMode }
    return selector ? selector(state) : state
  },
  useGestureStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = { trackingEnabled: mockTrackingEnabled }
    return selector ? selector(state) : state
  },
  useUIStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      activeModal: mockActiveModal,
      setActiveModal: mockSetActiveModal,
      overlayMode: mockOverlayMode,
      setOverlayMode: vi.fn()
    }
    return selector ? selector(state) : state
  },
  useConfigStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = { config: mockConfig, updateConfig: mockUpdateConfig }
    return selector ? selector(state) : state
  }
}))

vi.mock('@renderer/controller/ViewSwitcher', () => ({
  ViewSwitcher: ({ currentView }: { currentView: ViewMode }) =>
    React.createElement('div', { 'data-testid': 'view-switcher' }, currentView),
  VIEW_MODE_LABELS: { graph: 'Graph', manifold: 'Embeddings', split: 'Split' }
}))

vi.mock('@renderer/controller/a11y', () => ({
  A11Y_COLORS: {
    trackingActive: '#4ade80',
    trackingPaused: '#ef4444',
    textSecondary: '#999'
  },
  getTrackingStatusIndicator: (active: boolean) => active ? '\u25CF' : '\u25CB'
}))

// Mock window.api
;(window as unknown as Record<string, unknown>).api = {
  toggleOverlay: vi.fn(),
  minimizeWindow: vi.fn(),
  maximizeWindow: vi.fn(),
  closeWindow: vi.fn()
}

// Import after mocks
import { HUD } from '../HUD'
import { Settings } from '../../settings/Settings'

const defaultHUDProps = {
  hasGraph: true,
  hasManifold: true,
  nodeCount: 10,
  pointCount: 100,
  profiles: [],
  activeProfileId: null,
  onProfileChange: vi.fn()
}

describe('Sprint 0d: ARIA and role fixes', () => {
  beforeEach(() => {
    mockViewMode = 'graph'
    mockTrackingEnabled = true
    mockActiveModal = null
    mockOverlayMode = false
    mockConfig = { ...DEFAULT_CONFIG }
    vi.clearAllMocks()
  })

  // ── Settings Toggle ARIA ────────────────────────────────────────

  describe('Settings Toggle component', () => {
    it('toggle button has role="switch"', () => {
      const { container } = render(
        React.createElement(Settings, {
          config: DEFAULT_CONFIG,
          onConfigChange: vi.fn(),
          onClose: vi.fn()
        })
      )
      const switches = container.querySelectorAll('[role="switch"]')
      expect(switches.length).toBeGreaterThan(0)
    })

    it('toggle button has aria-checked matching its value', () => {
      const config = {
        ...DEFAULT_CONFIG,
        tracking: { ...DEFAULT_CONFIG.tracking, enabled: true }
      }
      const { container } = render(
        React.createElement(Settings, {
          config,
          onConfigChange: vi.fn(),
          onClose: vi.fn()
        })
      )
      const switches = container.querySelectorAll('[role="switch"]')
      expect(switches.length).toBeGreaterThan(0)
      // The first toggle on tracking tab is "Enable Tracking" which is true
      const firstSwitch = switches[0] as HTMLElement
      expect(firstSwitch.getAttribute('aria-checked')).toBe('true')
    })
  })

  // ── Settings Tab ARIA ───────────────────────────────────────────

  describe('Settings tab bar', () => {
    it('tab container has role="tablist"', () => {
      const { container } = render(
        React.createElement(Settings, {
          config: DEFAULT_CONFIG,
          onConfigChange: vi.fn(),
          onClose: vi.fn()
        })
      )
      const tablist = container.querySelector('[role="tablist"]')
      expect(tablist).toBeTruthy()
    })

    it('tab buttons have role="tab"', () => {
      const { container } = render(
        React.createElement(Settings, {
          config: DEFAULT_CONFIG,
          onConfigChange: vi.fn(),
          onClose: vi.fn()
        })
      )
      const tabs = container.querySelectorAll('[role="tab"]')
      expect(tabs.length).toBe(6) // tracking, gestures, input, bus, visualization, appearance
    })

    it('active tab has aria-selected="true"', () => {
      const { container } = render(
        React.createElement(Settings, {
          config: DEFAULT_CONFIG,
          onConfigChange: vi.fn(),
          onClose: vi.fn()
        })
      )
      const tabs = container.querySelectorAll('[role="tab"]')
      // Default active tab is 'tracking'
      const trackingTab = Array.from(tabs).find(t => t.textContent === 'Tracking') as HTMLElement
      expect(trackingTab).toBeTruthy()
      expect(trackingTab.getAttribute('aria-selected')).toBe('true')
    })

    it('inactive tabs have aria-selected="false"', () => {
      const { container } = render(
        React.createElement(Settings, {
          config: DEFAULT_CONFIG,
          onConfigChange: vi.fn(),
          onClose: vi.fn()
        })
      )
      const tabs = container.querySelectorAll('[role="tab"]')
      const inactiveTabs = Array.from(tabs).filter(t => t.textContent !== 'Tracking')
      expect(inactiveTabs.length).toBe(5)
      for (const tab of inactiveTabs) {
        expect(tab.getAttribute('aria-selected')).toBe('false')
      }
    })
  })

  // ── Live regions ────────────────────────────────────────────────

  describe('HUD live regions', () => {
    it('tracking quality score has aria-live="polite"', () => {
      render(React.createElement(HUD, { ...defaultHUDProps, trackingQuality: 85 }))
      // Find the quality span — it displays "Q: 85%"
      const qualityEl = screen.getByText(/Q:\s*85%/)
      expect(qualityEl.getAttribute('aria-live')).toBe('polite')
    })

    it('overlay mode indicator has aria-live="polite"', () => {
      mockOverlayMode = true
      const { container } = render(React.createElement(HUD, defaultHUDProps))
      // In overlay mode, the HUD shows "Overlay Mode" text
      const overlayIndicator = container.querySelector('[aria-live="polite"]')
      expect(overlayIndicator).toBeTruthy()
      expect(overlayIndicator?.textContent).toContain('Overlay Mode')
    })
  })
})
