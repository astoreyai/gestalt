/**
 * HUD mode visibility tests.
 * Verifies active view mode highlighting, one-handed toggle, and split labels.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ViewMode } from '@shared/protocol'
import { DEFAULT_CONFIG } from '@shared/protocol'

// ── Mock Zustand stores ──────────────────────────────────────────
// HUD imports useVisualStore, useGestureStore, useUIStore directly.
// We also need useConfigStore for the one-handed mode toggle.

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
    const state = {
      viewMode: mockViewMode,
      setViewMode: mockSetViewMode
    }
    return selector ? selector(state) : state
  },
  useGestureStore: (selector: (s: Record<string, unknown>) => unknown) => {
    const state = {
      trackingEnabled: mockTrackingEnabled
    }
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
    const state = {
      config: mockConfig,
      updateConfig: mockUpdateConfig
    }
    return selector ? selector(state) : state
  }
}))

// Mock ViewSwitcher — we test its highlighting via data-testid attributes
vi.mock('@renderer/controller/ViewSwitcher', () => ({
  ViewSwitcher: ({ currentView, onViewChange, graphAvailable, manifoldAvailable }: {
    currentView: ViewMode
    onViewChange: (v: ViewMode) => void
    graphAvailable: boolean
    manifoldAvailable: boolean
  }) => {
    const views: ViewMode[] = ['graph', 'manifold', 'split']
    return React.createElement('div', { 'data-testid': 'view-switcher' },
      ...views.map(mode =>
        React.createElement('button', {
          key: mode,
          'data-testid': `view-btn-${mode}`,
          'data-active': String(currentView === mode),
          onClick: () => onViewChange(mode),
          disabled: mode === 'graph' ? !graphAvailable
            : mode === 'manifold' ? !manifoldAvailable
            : !graphAvailable || !manifoldAvailable
        }, mode)
      )
    )
  },
  VIEW_MODE_LABELS: { graph: 'Graph', manifold: 'Embeddings', split: 'Split' }
}))

// Mock a11y utilities
vi.mock('@renderer/controller/a11y', () => ({
  A11Y_COLORS: {
    trackingActive: '#4ade80',
    trackingPaused: '#ef4444',
    textSecondary: '#999'
  },
  getTrackingStatusIndicator: (active: boolean) => active ? '\u25CF' : '\u25CB'
}))

// Mock window.api — add to existing window object (do NOT replace window itself,
// which would break happy-dom's prototype chain and cause instanceof errors)
;(window as unknown as Record<string, unknown>).api = {
  toggleOverlay: vi.fn(),
  minimizeWindow: vi.fn(),
  maximizeWindow: vi.fn(),
  closeWindow: vi.fn()
}

// Import after mocks
import { HUD } from '../HUD'

const defaultProps = {
  hasGraph: true,
  hasManifold: true,
  nodeCount: 10,
  pointCount: 100,
  profiles: [],
  activeProfileId: null,
  onProfileChange: vi.fn()
}

function renderHUD(overrides: Partial<typeof defaultProps> = {}) {
  return render(
    React.createElement(HUD, { ...defaultProps, ...overrides })
  )
}

describe('HUD mode visibility', () => {
  beforeEach(() => {
    mockViewMode = 'graph'
    mockTrackingEnabled = true
    mockActiveModal = null
    mockOverlayMode = false
    mockConfig = { ...DEFAULT_CONFIG }
    vi.clearAllMocks()
  })

  // ── Test 1: Active view mode button highlighting ──────────────

  it('highlights active view mode button (graph)', () => {
    mockViewMode = 'graph'
    renderHUD()
    const btn = screen.getByTestId('view-btn-graph')
    expect(btn.getAttribute('data-active')).toBe('true')
    const manifoldBtn = screen.getByTestId('view-btn-manifold')
    expect(manifoldBtn.getAttribute('data-active')).toBe('false')
  })

  it('highlights active view mode button (manifold)', () => {
    mockViewMode = 'manifold'
    renderHUD()
    const btn = screen.getByTestId('view-btn-manifold')
    expect(btn.getAttribute('data-active')).toBe('true')
    const graphBtn = screen.getByTestId('view-btn-graph')
    expect(graphBtn.getAttribute('data-active')).toBe('false')
  })

  it('highlights active view mode button (split)', () => {
    mockViewMode = 'split'
    renderHUD()
    const btn = screen.getByTestId('view-btn-split')
    expect(btn.getAttribute('data-active')).toBe('true')
  })

  // ── Test 2: One-handed mode toggle button ─────────────────────

  it('renders one-handed mode toggle button', () => {
    renderHUD()
    const toggle = screen.getByTestId('one-handed-toggle')
    expect(toggle).toBeTruthy()
    expect(toggle.getAttribute('title')).toBe('Toggle one-handed mode')
    expect(toggle.textContent).toBe('1H')
  })

  // ── Test 3: One-handed toggle active state ────────────────────

  it('one-handed toggle shows active state when oneHandedMode is true', () => {
    mockConfig = {
      ...DEFAULT_CONFIG,
      gestures: { ...DEFAULT_CONFIG.gestures, oneHandedMode: true }
    }
    renderHUD()
    const toggle = screen.getByTestId('one-handed-toggle')
    const style = toggle.getAttribute('style') ?? ''
    // Active state should include the accent background color
    expect(style).toContain('rgba(100, 140, 255, 0.3)')
  })

  it('one-handed toggle shows inactive state when oneHandedMode is false', () => {
    mockConfig = {
      ...DEFAULT_CONFIG,
      gestures: { ...DEFAULT_CONFIG.gestures, oneHandedMode: false }
    }
    renderHUD()
    const toggle = screen.getByTestId('one-handed-toggle')
    const style = toggle.getAttribute('style') ?? ''
    // Inactive state should NOT include the accent background
    expect(style).not.toContain('rgba(100, 140, 255, 0.3)')
  })

  it('clicking one-handed toggle calls updateConfig to toggle the flag', () => {
    mockConfig = {
      ...DEFAULT_CONFIG,
      gestures: { ...DEFAULT_CONFIG.gestures, oneHandedMode: false }
    }
    renderHUD()
    const toggle = screen.getByTestId('one-handed-toggle')
    fireEvent.click(toggle)
    expect(mockUpdateConfig).toHaveBeenCalledWith({
      gestures: expect.objectContaining({ oneHandedMode: true })
    })
  })

  // ── Test 4: Split mode labels ─────────────────────────────────

  it('shows split labels when in split view mode', () => {
    mockViewMode = 'split'
    renderHUD()
    const labels = screen.getByTestId('split-labels')
    expect(labels).toBeTruthy()
    expect(labels.textContent).toContain('Graph')
    expect(labels.textContent).toContain('Manifold')
  })

  it('does not show split labels when not in split view mode', () => {
    mockViewMode = 'graph'
    renderHUD()
    expect(screen.queryByTestId('split-labels')).toBeNull()
  })
})
