/**
 * Zustand store for application state.
 * Central state management for gestures, selection, and view mode.
 */

import { create } from 'zustand'
import type { GestureEvent, ViewMode, GraphData, EmbeddingData, AppConfig, GestureType } from '@shared/protocol'
import { DEFAULT_CONFIG } from '@shared/protocol'

// ─── Toast Types ─────────────────────────────────────────────────

export interface Toast {
  id: string
  message: string
  severity: 'error' | 'warning' | 'info' | 'success'
  dismissMs: number
  timestamp: number
}

const MAX_TOASTS = 3
const DEFAULT_DISMISS_MS = 8000

let toastCounter = 0

// ─── Modal Types ─────────────────────────────────────────────────

export type ModalId = 'settings' | 'dataLoader' | 'calibration' | null

// ─── App State Interface ─────────────────────────────────────────

export interface AppState {
  // View state
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // Selection state
  selectedNodeId: string | null
  hoveredNodeId: string | null
  selectedClusterId: number | null
  selectNode: (id: string | null) => void
  hoverNode: (id: string | null) => void
  selectCluster: (id: number | null) => void

  // Data state
  graphData: GraphData | null
  embeddingData: EmbeddingData | null
  setGraphData: (data: GraphData | null) => void
  setEmbeddingData: (data: EmbeddingData | null) => void

  // Gesture state
  activeGesture: GestureEvent | null
  lastGestureType: GestureType | null
  trackingEnabled: boolean
  setActiveGesture: (gesture: GestureEvent | null) => void
  setTrackingEnabled: (enabled: boolean) => void

  // Config
  config: AppConfig
  updateConfig: (partial: Partial<AppConfig>) => void

  // Calibration
  calibrated: boolean
  setCalibrated: (calibrated: boolean) => void

  // Error state (kept for backward compatibility)
  error: string | null
  setError: (error: string | null) => void

  // Toast queue
  toasts: Toast[]
  addToast: (message: string, severity?: Toast['severity'], dismissMs?: number) => void
  removeToast: (id: string) => void

  // Modal management
  activeModal: ModalId
  setActiveModal: (modal: ModalId) => void
}

export const useAppStore = create<AppState>((set) => ({
  // View
  viewMode: 'graph',
  setViewMode: (mode) => set({ viewMode: mode }),

  // Selection
  selectedNodeId: null,
  hoveredNodeId: null,
  selectedClusterId: null,
  selectNode: (id) => set({ selectedNodeId: id }),
  hoverNode: (id) => set({ hoveredNodeId: id }),
  selectCluster: (id) => set({ selectedClusterId: id }),

  // Data
  graphData: null,
  embeddingData: null,
  setGraphData: (data) => set({ graphData: data, viewMode: 'graph' }),
  setEmbeddingData: (data) => set({ embeddingData: data, viewMode: 'manifold' }),

  // Gestures
  activeGesture: null,
  lastGestureType: null,
  trackingEnabled: true,
  setActiveGesture: (gesture) => set({
    activeGesture: gesture,
    lastGestureType: gesture?.type ?? null
  }),
  setTrackingEnabled: (enabled) => set({ trackingEnabled: enabled }),

  // Config
  config: DEFAULT_CONFIG,
  updateConfig: (partial) => set((state) => ({
    config: { ...state.config, ...partial }
  })),

  // Calibration
  calibrated: false,
  setCalibrated: (calibrated) => set({ calibrated }),

  // Error (backward compatible — also adds a toast)
  error: null,
  setError: (error) => set({ error }),

  // Toast queue
  toasts: [],
  addToast: (message, severity = 'error', dismissMs = DEFAULT_DISMISS_MS) =>
    set((state) => {
      const newToast: Toast = {
        id: `toast-${++toastCounter}-${Date.now()}`,
        message,
        severity,
        dismissMs,
        timestamp: Date.now()
      }
      const updated = [...state.toasts, newToast]
      // Evict oldest if over the limit
      while (updated.length > MAX_TOASTS) {
        updated.shift()
      }
      return { toasts: updated }
    }),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id)
    })),

  // Modal management
  activeModal: null,
  setActiveModal: (modal) => set({ activeModal: modal })
}))
