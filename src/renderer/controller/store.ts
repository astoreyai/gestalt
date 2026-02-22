/**
 * Zustand store for application state.
 * Split into domain-specific slices to reduce unnecessary re-renders.
 * The useAppStore facade preserves backward compatibility.
 */

import { create } from 'zustand'
import type { GestureEvent, ViewMode, GraphData, EmbeddingData, AppConfig, GestureType, SelectableObject } from '@shared/protocol'
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

// ─── Slice Interfaces ────────────────────────────────────────────

export interface VisualState {
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // ─── Unified selection model ──────────────────────────────
  /** Primary selection (any object type) */
  selection: SelectableObject | null
  /** Secondary selection for two-hand interaction */
  secondarySelection: SelectableObject | null
  /** Currently hovered object */
  hoveredObject: SelectableObject | null
  /** Select any object (or null to deselect) */
  select: (obj: SelectableObject | null) => void
  /** Select secondary object */
  selectSecondary: (obj: SelectableObject | null) => void
  /** Hover any object (or null to unhover) */
  hover: (obj: SelectableObject | null) => void

  // ─── Convenience aliases (backward compat) ────────────────
  /** @deprecated Use selection?.kind === 'node' ? selection.id : null */
  selectedNodeId: string | null
  secondarySelectedNodeId: string | null
  hoveredNodeId: string | null
  /** @deprecated Use selection?.kind === 'cluster' ? selection.id : null */
  selectedClusterId: number | null
  selectNode: (id: string | null) => void
  selectSecondaryNode: (id: string | null) => void
  hoverNode: (id: string | null) => void
  selectCluster: (id: number | null) => void
}

export interface DataState {
  graphData: GraphData | null
  embeddingData: EmbeddingData | null
  setGraphData: (data: GraphData | null) => void
  setEmbeddingData: (data: EmbeddingData | null) => void
}

export interface GestureSliceState {
  activeGesture: GestureEvent | null
  lastGestureType: GestureType | null
  trackingEnabled: boolean
  setActiveGesture: (gesture: GestureEvent | null) => void
  setTrackingEnabled: (enabled: boolean) => void
}

export interface ConfigState {
  config: AppConfig
  updateConfig: (partial: Partial<AppConfig>) => void
  calibrated: boolean
  setCalibrated: (calibrated: boolean) => void
}

export interface UIState {
  error: string | null
  setError: (error: string | null) => void
  toasts: Toast[]
  addToast: (message: string, severity?: Toast['severity'], dismissMs?: number) => void
  removeToast: (id: string) => void
  activeModal: ModalId
  setActiveModal: (modal: ModalId) => void
  overlayMode: boolean
  setOverlayMode: (active: boolean) => void
}

// ─── Visual State ─────────────────────────────────────────

/** Extract string id from a selectable object (nodes, points share string ids) */
function objectStringId(obj: SelectableObject | null): string | null {
  if (!obj) return null
  if (obj.kind === 'cluster') return null
  return obj.id
}

/** Extract cluster id from a selectable object */
function objectClusterId(obj: SelectableObject | null): number | null {
  if (!obj || obj.kind !== 'cluster') return null
  return obj.id
}

export const useVisualStore = create<VisualState>((set) => ({
  viewMode: 'graph',
  setViewMode: (mode) => set({ viewMode: mode }),

  // Unified selection
  selection: null,
  secondarySelection: null,
  hoveredObject: null,
  select: (obj) => set({
    selection: obj,
    selectedNodeId: objectStringId(obj),
    selectedClusterId: objectClusterId(obj),
  }),
  selectSecondary: (obj) => set({
    secondarySelection: obj,
    secondarySelectedNodeId: objectStringId(obj),
  }),
  hover: (obj) => set({
    hoveredObject: obj,
    hoveredNodeId: objectStringId(obj),
  }),

  // Backward-compat aliases (kept in sync by select/selectSecondary/hover)
  selectedNodeId: null,
  secondarySelectedNodeId: null,
  hoveredNodeId: null,
  selectedClusterId: null,
  selectNode: (id) => set({
    selection: id ? { kind: 'node', id } : null,
    selectedNodeId: id,
    selectedClusterId: null,
  }),
  selectSecondaryNode: (id) => set({
    secondarySelection: id ? { kind: 'node', id } : null,
    secondarySelectedNodeId: id,
  }),
  hoverNode: (id) => set({
    hoveredObject: id ? { kind: 'node', id } : null,
    hoveredNodeId: id,
  }),
  selectCluster: (id) => set({
    selection: id != null ? { kind: 'cluster', id } : null,
    selectedClusterId: id,
    selectedNodeId: null,
  }),
}))

// ─── Data State ───────────────────────────────────────────

export const useDataStore = create<DataState>((set) => ({
  graphData: null,
  embeddingData: null,
  // P1-23: Zustand's shallow merge already replaces the reference, so the old
  // graphData/embeddingData becomes eligible for GC once set() completes.
  // We null out first in a separate set() call to break any closure references
  // that might hold the old data, then assign the new data.
  setGraphData: (data) => {
    set({ graphData: data })
  },
  setEmbeddingData: (data) => {
    set({ embeddingData: data })
  },
}))

// ─── Gesture State ────────────────────────────────────────

export const useGestureStore = create<GestureSliceState>((set) => ({
  activeGesture: null,
  lastGestureType: null,
  trackingEnabled: true,
  setActiveGesture: (gesture) => set({
    activeGesture: gesture,
    lastGestureType: gesture?.type ?? null
  }),
  setTrackingEnabled: (enabled) => set({ trackingEnabled: enabled }),
}))

// ─── Config State ─────────────────────────────────────────

// Debounced IPC persist — batches rapid slider changes into a single write
let _configPersistTimer: ReturnType<typeof setTimeout> | null = null
let _pendingConfigPartial: Partial<AppConfig> | null = null

function debouncedPersistConfig(partial: Partial<AppConfig>): void {
  _pendingConfigPartial = _pendingConfigPartial
    ? { ..._pendingConfigPartial, ...partial }
    : { ...partial }
  if (_configPersistTimer) clearTimeout(_configPersistTimer)
  _configPersistTimer = setTimeout(() => {
    if (_pendingConfigPartial) {
      window.api?.setConfig(_pendingConfigPartial).catch(() => {})
      _pendingConfigPartial = null
    }
    _configPersistTimer = null
  }, 300)
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: DEFAULT_CONFIG,
  updateConfig: (partial) => {
    set((state) => ({
      config: { ...state.config, ...partial }
    }))
    // Auto-persist to disk via debounced IPC (batches rapid slider changes)
    debouncedPersistConfig(partial)
  },
  calibrated: false,
  setCalibrated: (calibrated) => set({ calibrated }),
}))

/** Convenience alias for calibration state (lives in ConfigStore) (P1-21) */
export const useCalibrationStore = useConfigStore

// ─── UI State (toasts, modals, errors) ────────────────────

export const useUIStore = create<UIState>((set) => ({
  error: null,
  setError: (error) => set({ error }),
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
  activeModal: null,
  setActiveModal: (modal) => set({ activeModal: modal }),
  overlayMode: false,
  setOverlayMode: (active) => set({ overlayMode: active }),
}))

// ─── Combined App State (backward compatibility) ─────────

export interface AppState {
  // View state
  viewMode: ViewMode
  setViewMode: (mode: ViewMode) => void

  // Unified selection
  selection: SelectableObject | null
  secondarySelection: SelectableObject | null
  hoveredObject: SelectableObject | null
  select: (obj: SelectableObject | null) => void
  selectSecondary: (obj: SelectableObject | null) => void
  hover: (obj: SelectableObject | null) => void

  // Selection state (backward compat)
  selectedNodeId: string | null
  secondarySelectedNodeId: string | null
  hoveredNodeId: string | null
  selectedClusterId: number | null
  selectNode: (id: string | null) => void
  selectSecondaryNode: (id: string | null) => void
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

  // Overlay mode
  overlayMode: boolean
  setOverlayMode: (active: boolean) => void
}

/**
 * @deprecated Prefer individual slice hooks for better performance:
 *   useVisualStore, useDataStore, useGestureStore, useConfigStore, useUIStore
 *
 * This facade spreads 5 stores together on every call, which triggers a
 * full-tree re-render whenever ANY slice changes (P1-21).
 * Use Zustand selectors on individual stores instead:
 *   const viewMode = useVisualStore(s => s.viewMode)
 */
export function useAppStore(): AppState {
  const visual = useVisualStore()
  const data = useDataStore()
  const gesture = useGestureStore()
  const config = useConfigStore()
  const ui = useUIStore()

  return {
    ...visual,
    ...data,
    ...gesture,
    ...config,
    ...ui,
    // Override setGraphData/setEmbeddingData to also set viewMode
    setGraphData: (d: GraphData | null) => {
      data.setGraphData(d)
      visual.setViewMode('graph')
    },
    setEmbeddingData: (d: EmbeddingData | null) => {
      data.setEmbeddingData(d)
      visual.setViewMode('manifold')
    },
  }
}

// ─── Static helpers for non-hook access (backward compatibility) ──

/** Get combined state snapshot (for use outside React components) */
useAppStore.getState = (): AppState => {
  const visual = useVisualStore.getState()
  const data = useDataStore.getState()
  const gesture = useGestureStore.getState()
  const config = useConfigStore.getState()
  const ui = useUIStore.getState()

  return {
    ...visual,
    ...data,
    ...gesture,
    ...config,
    ...ui,
    setGraphData: (d: GraphData | null) => {
      data.setGraphData(d)
      visual.setViewMode('graph')
    },
    setEmbeddingData: (d: EmbeddingData | null) => {
      data.setEmbeddingData(d)
      visual.setViewMode('manifold')
    },
  }
}

/** Set combined state (for use in tests and non-hook contexts) */
useAppStore.setState = (partial: Partial<AppState>): void => {
  const {
    viewMode, selectedNodeId, secondarySelectedNodeId, hoveredNodeId, selectedClusterId,
    selection, secondarySelection, hoveredObject,
    graphData, embeddingData,
    activeGesture, lastGestureType, trackingEnabled,
    config, calibrated,
    error, toasts, activeModal, overlayMode,
    ..._rest
  } = partial as Partial<AppState>

  // Visual state
  const visualPartial: Partial<VisualState> = {}
  if (viewMode !== undefined) visualPartial.viewMode = viewMode
  if (selection !== undefined) { visualPartial.selection = selection; visualPartial.selectedNodeId = objectStringId(selection ?? null); visualPartial.selectedClusterId = objectClusterId(selection ?? null) }
  if (secondarySelection !== undefined) { visualPartial.secondarySelection = secondarySelection; visualPartial.secondarySelectedNodeId = objectStringId(secondarySelection ?? null) }
  if (hoveredObject !== undefined) { visualPartial.hoveredObject = hoveredObject; visualPartial.hoveredNodeId = objectStringId(hoveredObject ?? null) }
  // Backward-compat: direct field sets still work
  if (selectedNodeId !== undefined && selection === undefined) visualPartial.selectedNodeId = selectedNodeId
  if (secondarySelectedNodeId !== undefined && secondarySelection === undefined) visualPartial.secondarySelectedNodeId = secondarySelectedNodeId
  if (hoveredNodeId !== undefined && hoveredObject === undefined) visualPartial.hoveredNodeId = hoveredNodeId
  if (selectedClusterId !== undefined && selection === undefined) visualPartial.selectedClusterId = selectedClusterId
  if (Object.keys(visualPartial).length > 0) useVisualStore.setState(visualPartial)

  // Data state
  const dataPartial: Partial<DataState> = {}
  if (graphData !== undefined) dataPartial.graphData = graphData
  if (embeddingData !== undefined) dataPartial.embeddingData = embeddingData
  if (Object.keys(dataPartial).length > 0) useDataStore.setState(dataPartial)

  // Gesture state
  const gesturePartial: Partial<GestureSliceState> = {}
  if (activeGesture !== undefined) gesturePartial.activeGesture = activeGesture
  if (lastGestureType !== undefined) gesturePartial.lastGestureType = lastGestureType
  if (trackingEnabled !== undefined) gesturePartial.trackingEnabled = trackingEnabled
  if (Object.keys(gesturePartial).length > 0) useGestureStore.setState(gesturePartial)

  // Config state
  const configPartial: Partial<ConfigState> = {}
  if (config !== undefined) configPartial.config = config
  if (calibrated !== undefined) configPartial.calibrated = calibrated
  if (Object.keys(configPartial).length > 0) useConfigStore.setState(configPartial)

  // UI state
  const uiPartial: Partial<UIState> = {}
  if (error !== undefined) uiPartial.error = error
  if (toasts !== undefined) uiPartial.toasts = toasts
  if (activeModal !== undefined) uiPartial.activeModal = activeModal
  if (overlayMode !== undefined) uiPartial.overlayMode = overlayMode
  if (Object.keys(uiPartial).length > 0) useUIStore.setState(uiPartial)
}

/** Subscribe to state changes across all stores */
useAppStore.subscribe = (listener: (state: AppState) => void): (() => void) => {
  const notify = () => listener(useAppStore.getState())
  const unsubs = [
    useVisualStore.subscribe(notify),
    useDataStore.subscribe(notify),
    useGestureStore.subscribe(notify),
    useConfigStore.subscribe(notify),
    useUIStore.subscribe(notify),
  ]
  return () => unsubs.forEach((unsub) => unsub())
}
