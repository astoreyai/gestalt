/**
 * Touch-target and layout collision tests (Sprint 0c).
 * Verifies minimum 44px touch targets for window controls and
 * non-overlapping positions for bottom-left UI panels.
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
import { SelectionPanel } from '../SelectionPanel'
import { HandChordOverlay } from '../HandChordOverlay'
import { ClusterLegend } from '../../manifold/ClusterLegend'

const defaultHUDProps = {
  hasGraph: true,
  hasManifold: true,
  nodeCount: 10,
  pointCount: 100,
  profiles: [],
  activeProfileId: null,
  onProfileChange: vi.fn()
}

describe('Sprint 0c: Touch targets and layout', () => {
  beforeEach(() => {
    mockViewMode = 'graph'
    mockTrackingEnabled = true
    mockActiveModal = null
    mockOverlayMode = false
    mockConfig = { ...DEFAULT_CONFIG }
    vi.clearAllMocks()
  })

  // ── Window control touch targets ────────────────────────────────

  describe('Window control button touch targets', () => {
    it('minimize button has minimum 44px width', () => {
      render(React.createElement(HUD, defaultHUDProps))
      const btn = screen.getByLabelText('Minimize window')
      const style = btn.getAttribute('style') ?? ''
      expect(style).toContain('width: 44px')
    })

    it('minimize button has minimum 44px height', () => {
      render(React.createElement(HUD, defaultHUDProps))
      const btn = screen.getByLabelText('Minimize window')
      const style = btn.getAttribute('style') ?? ''
      expect(style).toContain('height: 44px')
    })

    it('maximize button has minimum 44px width', () => {
      render(React.createElement(HUD, defaultHUDProps))
      const btn = screen.getByLabelText('Maximize window')
      const style = btn.getAttribute('style') ?? ''
      expect(style).toContain('width: 44px')
    })

    it('maximize button has minimum 44px height', () => {
      render(React.createElement(HUD, defaultHUDProps))
      const btn = screen.getByLabelText('Maximize window')
      const style = btn.getAttribute('style') ?? ''
      expect(style).toContain('height: 44px')
    })

    it('close button has minimum 44px width', () => {
      render(React.createElement(HUD, defaultHUDProps))
      const btn = screen.getByLabelText('Close window')
      const style = btn.getAttribute('style') ?? ''
      expect(style).toContain('width: 44px')
    })

    it('close button has minimum 44px height', () => {
      render(React.createElement(HUD, defaultHUDProps))
      const btn = screen.getByLabelText('Close window')
      const style = btn.getAttribute('style') ?? ''
      expect(style).toContain('height: 44px')
    })
  })

  // ── Layout collision avoidance ──────────────────────────────────

  describe('Bottom-left layout collision avoidance', () => {
    it('SelectionPanel is positioned at left: 220 to avoid ClusterLegend overlap', () => {
      const { container } = render(
        React.createElement(SelectionPanel, {
          selectedNodeInfo: {
            id: 'node-1',
            label: 'Test Node',
            neighborCount: 2,
            edges: [],
            metadata: {}
          },
          selectedPointInfo: null,
          onDeselect: vi.fn()
        })
      )
      const panel = container.firstElementChild as HTMLElement
      expect(panel).toBeTruthy()
      const style = panel.getAttribute('style') ?? ''
      expect(style).toContain('left: 220px')
    })

    it('HandChordOverlay left canvas is positioned at bottom: 230 to clear ClusterLegend', () => {
      const { container } = render(
        React.createElement(HandChordOverlay, {
          landmarkFrame: null,
          visible: true
        })
      )
      // The left canvas is the first canvas element
      const canvases = container.querySelectorAll('canvas')
      expect(canvases.length).toBe(2)
      const leftCanvas = canvases[0] as HTMLElement
      const style = leftCanvas.getAttribute('style') ?? ''
      expect(style).toContain('bottom: calc(16px + 200px + 16px)')
      expect(style).toContain('left: 16px')
    })

    it('ClusterLegend remains at bottom: 16, left: 16', () => {
      const clusters = [
        { id: 0, label: 'Cluster A', color: '#ff0000', count: 10 }
      ]
      const { container } = render(
        React.createElement(ClusterLegend, { clusters })
      )
      const legend = container.firstElementChild as HTMLElement
      expect(legend).toBeTruthy()
      const style = legend.getAttribute('style') ?? ''
      expect(style).toContain('bottom: 16px')
      expect(style).toContain('left: 16px')
    })
  })
})
