import React, { Suspense, useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats, Html } from '@react-three/drei'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import {
  useVisualStore,
  useDataStore,
  useGestureStore,
  useConfigStore,
  useUIStore
} from './controller/store'
import { GestureOverlay } from './controller/GestureOverlay'
import { Calibration } from './controller/Calibration'
import { DataLoader } from './data/DataLoader'
import { RemoteLoader } from './data/RemoteLoader'
import { Settings } from './settings/Settings'
import { ForceGraph } from './graph/ForceGraph'
import { PointCloud } from './manifold/PointCloud'
import { Clusters } from './manifold/Clusters'
import { HoverCard } from './manifold/HoverCard'
import { calculateClusterCentroids } from './manifold/navigation'
import { AxisLabels } from './manifold/AxisLabels'
import { ClusterLegend, type ClusterInfo } from './manifold/ClusterLegend'
import { computeDataBounds } from './manifold/axis-helpers'
import { A11Y_COLORS } from './controller/a11y'
import { getSelectedNodeInfo, getSelectedPointInfo, resolveSelectionInfo } from './controller/selection-info'
import { HUD } from './components/HUD'
import { ToastQueue } from './components/ToastQueue'
import { ModalContainer } from './components/ModalContainer'
import { SelectionPanel } from './components/SelectionPanel'
import { HandChordOverlay } from './components/HandChordOverlay'
import { GestureGuide } from './components/GestureGuide'
import { UndoStack } from './controller/undo'
import { useHandTracker } from './hooks/useHandTracker'
import { validateData } from './data/validators'
import { dispatchGesture } from './controller/dispatcher'
import type { SceneAction, DispatchContext } from './controller/dispatcher'
import { GestureEngine } from './gestures/state'
import { HandMotionTracker } from './tracker/motion'
import type { HandMotionMetrics } from './tracker/motion'
import { TrackingQualityTracker } from './tracker/quality'
import type { GraphData, EmbeddingData, CalibrationProfile, GestureEvent } from '@shared/protocol'
import { GesturePhase } from '@shared/protocol'

export function App(): React.ReactElement {
  // P1-21: Use individual slice selectors instead of useAppStore() to avoid
  // full-tree re-renders when any unrelated slice changes.
  const viewMode = useVisualStore((s) => s.viewMode)
  const selectedNodeId = useVisualStore((s) => s.selectedNodeId)
  const secondarySelectedNodeId = useVisualStore((s) => s.secondarySelectedNodeId)
  const hoveredNodeId = useVisualStore((s) => s.hoveredNodeId)
  const selectedClusterId = useVisualStore((s) => s.selectedClusterId)
  const selectNode = useVisualStore((s) => s.selectNode)
  const selectSecondaryNode = useVisualStore((s) => s.selectSecondaryNode)
  const hoverNode = useVisualStore((s) => s.hoverNode)
  const selectCluster = useVisualStore((s) => s.selectCluster)
  const selection = useVisualStore((s) => s.selection)
  const select = useVisualStore((s) => s.select)
  const setViewMode = useVisualStore((s) => s.setViewMode)

  const graphData = useDataStore((s) => s.graphData)
  const embeddingData = useDataStore((s) => s.embeddingData)
  const setGraphDataRaw = useDataStore((s) => s.setGraphData)
  const setEmbeddingDataRaw = useDataStore((s) => s.setEmbeddingData)

  const activeGesture = useGestureStore((s) => s.activeGesture)
  const setActiveGesture = useGestureStore((s) => s.setActiveGesture)
  const trackingEnabled = useGestureStore((s) => s.trackingEnabled)

  const config = useConfigStore((s) => s.config)
  const updateConfig = useConfigStore((s) => s.updateConfig)
  const setCalibrated = useConfigStore((s) => s.setCalibrated)

  const setError = useUIStore((s) => s.setError)
  const toasts = useUIStore((s) => s.toasts)
  const addToast = useUIStore((s) => s.addToast)
  const removeToast = useUIStore((s) => s.removeToast)
  const activeModal = useUIStore((s) => s.activeModal)
  const setActiveModal = useUIStore((s) => s.setActiveModal)
  const overlayMode = useUIStore((s) => s.overlayMode)
  const setOverlayMode = useUIStore((s) => s.setOverlayMode)

  // Wrap setGraphData/setEmbeddingData to also set viewMode (mirrors useAppStore behavior)
  const setGraphData = useCallback(
    (data: GraphData | null) => {
      setGraphDataRaw(data)
      setViewMode('graph')
    },
    [setGraphDataRaw, setViewMode]
  )

  const setEmbeddingData = useCallback(
    (data: EmbeddingData | null) => {
      setEmbeddingDataRaw(data)
      setViewMode('manifold')
    },
    [setEmbeddingDataRaw, setViewMode]
  )

  const orbitRef = useRef<OrbitControlsImpl>(null)
  const gestureEngineRef = useRef<GestureEngine | null>(null)
  const motionTrackerRef = useRef<HandMotionTracker | null>(null)
  const qualityTrackerRef = useRef<TrackingQualityTracker | null>(null)
  const undoStackRef = useRef(new UndoStack(20))
  const [motionMetrics, setMotionMetrics] = useState<HandMotionMetrics[]>([])
  const [trackingQuality, setTrackingQuality] = useState<number>(0)
  const [gestureGuideVisible, setGestureGuideVisible] = useState(false)

  // Per-hand tracking state (refs to avoid re-render thrashing)
  const prevHandPosRef = useRef<{ left: { x: number; y: number } | null; right: { x: number; y: number } | null }>({ left: null, right: null })
  const lastHoveredRef = useRef<{ left: string | null; right: string | null }>({ left: null, right: null })
  const perHandSelectionRef = useRef<{ left: string | null; right: string | null }>({ left: null, right: null })

  // Per-hand gesture hover positions (for ForceGraph raycasting)
  const [gestureHoverPos, setGestureHoverPos] = useState<{
    left: { x: number; y: number } | null
    right: { x: number; y: number } | null
  }>({ left: null, right: null })

  // Per-hand drag positions
  const [dragPositions, setDragPositions] = useState<{
    left: { nodeId: string; x: number; y: number } | null
    right: { nodeId: string; x: number; y: number } | null
  }>({ left: null, right: null })

  // Lazily create GestureEngine (persists across renders)
  if (!gestureEngineRef.current) {
    gestureEngineRef.current = new GestureEngine({
      minOnsetFrames: 1,
      minHoldDuration: config.gestures.minHoldDuration,
      cooldownDuration: config.gestures.cooldownDuration,
      sensitivity: config.gestures.sensitivity
    })
  }
  if (!motionTrackerRef.current) {
    motionTrackerRef.current = new HandMotionTracker(config.tracking.smoothingFactor)
  }
  if (!qualityTrackerRef.current) {
    qualityTrackerRef.current = new TrackingQualityTracker(10)
  }

  // Hand tracking via hook — graceful degradation on failure
  const { frame: landmarkFrame, error: trackerError, cameraCount } = useHandTracker({
    enabled: trackingEnabled,
    smoothingFactor: config.tracking.smoothingFactor,
    minConfidence: config.tracking.minConfidence
  })

  // Show toast when tracker fails
  useEffect(() => {
    if (trackerError) {
      addToast(`Hand tracking unavailable: ${trackerError.message}`, 'warning')
    }
  }, [trackerError, addToast])

  // Track last hovered node so pinch can select it even after point releases
  // (mouse hover updates both hands since it's not hand-specific)
  useEffect(() => {
    if (hoveredNodeId) {
      lastHoveredRef.current.left = hoveredNodeId
      lastHoveredRef.current.right = hoveredNodeId
    }
  }, [hoveredNodeId])

  // Process landmark frames through GestureEngine → dispatcher → scene (per-hand)
  useEffect(() => {
    if (!landmarkFrame || !trackingEnabled) return

    const engine = gestureEngineRef.current
    if (!engine) return

    // Update motion and quality trackers (use refs directly to avoid per-frame state churn)
    if (motionTrackerRef.current) {
      const metrics = motionTrackerRef.current.update(landmarkFrame)
      if (metrics.length > 0) setMotionMetrics(metrics)
    }
    if (qualityTrackerRef.current && landmarkFrame.hands.length > 0) {
      let totalQ = 0
      for (const hand of landmarkFrame.hands) {
        totalQ += qualityTrackerRef.current.update(hand.landmarks)
      }
      const newQ = totalQ / landmarkFrame.hands.length
      // Only update state if quality changed meaningfully (avoid re-renders)
      setTrackingQuality(prev => Math.abs(prev - newQ) > 2 ? newQ : prev)
    }

    const events = engine.processFrame(landmarkFrame)

    // In overlay mode, forward all events to main process for native input
    if (overlayMode) {
      for (const event of events) {
        window.api.sendGestureEvent(event)
      }
      // Still update activeGesture for overlay display
      const best = events.length > 0 ? events[0] : null
      setActiveGesture(best)
      return
    }

    // Pick the best event per hand in a single pass (zero allocation)
    let bestLeft: GestureEvent | null = null
    let bestRight: GestureEvent | null = null
    let bestLeftScore = -1
    let bestRightScore = -1
    for (const ev of events) {
      const phaseScore = ev.phase === GesturePhase.Onset ? 2 : ev.phase === GesturePhase.Hold ? 1 : 0
      const score = phaseScore + ev.confidence
      if (ev.hand === 'left') {
        if (score > bestLeftScore) { bestLeftScore = score; bestLeft = ev }
      } else {
        if (score > bestRightScore) { bestRightScore = score; bestRight = ev }
      }
    }

    // Push most significant event into store for GestureOverlay
    setActiveGesture(bestLeft ?? bestRight)

    // Per-hand action processing — reuse mutable objects instead of per-frame spreads
    const newHoverLeft = gestureHoverPos.left
    const newHoverRight = gestureHoverPos.right
    const newDragLeft = dragPositions.left
    const newDragRight = dragPositions.right
    let hoverLeftOut = newHoverLeft
    let hoverRightOut = newHoverRight
    let dragLeftOut = newDragLeft
    let dragRightOut = newDragRight
    let hoverChanged = false
    let dragChanged = false

    // Pre-allocated dispatch context (reused per hand)
    const dispatchCtx: DispatchContext = {
      viewMode,
      selection: null,
      selectedNodeId: null,
      selectedClusterId,
      oneHandedMode: config.gestures.oneHandedMode
    }

    const processHand = (event: GestureEvent | null, hand: 'left' | 'right'): void => {
      if (!event) {
        prevHandPosRef.current[hand] = null
        if (hand === 'left' && hoverLeftOut !== null) { hoverLeftOut = null; hoverChanged = true }
        if (hand === 'right' && hoverRightOut !== null) { hoverRightOut = null; hoverChanged = true }
        if (hand === 'left' && dragLeftOut !== null) { dragLeftOut = null; dragChanged = true }
        if (hand === 'right' && dragRightOut !== null) { dragRightOut = null; dragChanged = true }
        return
      }

      // Dispatch with per-hand selected node (reuse context object)
      const handSelectedId = perHandSelectionRef.current[hand]
      dispatchCtx.selectedNodeId = handSelectedId
      dispatchCtx.selection = handSelectedId ? { kind: 'node', id: handSelectedId } : null
      const action: SceneAction = dispatchGesture(event, dispatchCtx)

      if (action.type === 'noop') {
        if (hand === 'left') {
          if (hoverLeftOut !== null) { hoverLeftOut = null; hoverChanged = true }
          if (dragLeftOut !== null) { dragLeftOut = null; dragChanged = true }
        } else {
          if (hoverRightOut !== null) { hoverRightOut = null; hoverChanged = true }
          if (dragRightOut !== null) { dragRightOut = null; dragChanged = true }
        }
        prevHandPosRef.current[hand] = { x: event.position.x, y: event.position.y }
        return
      }

      const controls = orbitRef.current
      const handPos = event.position

      switch (action.type) {
        case 'select': {
          const target = hoveredNodeId ?? lastHoveredRef.current[hand]
          if (target) {
            const current = perHandSelectionRef.current[hand]
            // Record undo before mutating
            if (current) {
              undoStackRef.current.push('select', { type: 'select', target: { kind: 'node', id: current } })
            } else {
              undoStackRef.current.push('select', { type: 'deselect' })
            }
            if (current === target) {
              perHandSelectionRef.current[hand] = null
            } else {
              perHandSelectionRef.current[hand] = target
            }
            selectNode(perHandSelectionRef.current.left)
            selectSecondaryNode(perHandSelectionRef.current.right)
          }
          break
        }
        case 'deselect': {
          const prev = perHandSelectionRef.current[hand]
          if (prev) {
            undoStackRef.current.push('deselect', { type: 'select', target: { kind: 'node', id: prev } })
          }
          perHandSelectionRef.current[hand] = null
          selectNode(perHandSelectionRef.current.left)
          selectSecondaryNode(perHandSelectionRef.current.right)
          if (!perHandSelectionRef.current.left && !perHandSelectionRef.current.right) {
            selectCluster(null)
          }
          break
        }
        case 'rotate': {
          if (!controls) break
          const rotAngle = action.params.angle as number
          undoStackRef.current.push('rotate', { type: 'rotate', params: { angle: -rotAngle, axis: 'y' } })
          const angle = rotAngle * 0.05
          controls.autoRotate = false
          const rt = controls.target
          const cam = controls.object
          const ox = cam.position.x - rt.x
          const oz = cam.position.z - rt.z
          const cos = Math.cos(angle)
          const sin = Math.sin(angle)
          cam.position.x = rt.x + ox * cos - oz * sin
          cam.position.z = rt.z + ox * sin + oz * cos
          cam.lookAt(rt)
          controls.update()
          break
        }
        case 'pan': {
          if (!controls) break
          const prev = prevHandPosRef.current[hand]
          if (prev) {
            const dx = (handPos.x - prev.x) * 30
            const dy = (handPos.y - prev.y) * 30
            controls.target.x -= dx
            controls.target.y += dy
            controls.object.position.x -= dx
            controls.object.position.y += dy
            controls.update()
          }
          break
        }
        case 'zoom': {
          if (!controls) break
          const zoomDelta = action.params.delta as number
          undoStackRef.current.push('zoom', { type: 'zoom', params: { delta: -zoomDelta } })
          const delta = zoomDelta * 0.5
          const camera = controls.object
          const direction = controls.target.clone().sub(camera.position).normalize()
          camera.position.addScaledVector(direction, delta)
          controls.update()
          break
        }
        case 'drag': {
          const nodeId = perHandSelectionRef.current[hand]
          if (nodeId) {
            if (hand === 'left') { dragLeftOut = { nodeId, x: handPos.x, y: handPos.y } }
            else { dragRightOut = { nodeId, x: handPos.x, y: handPos.y } }
            dragChanged = true
          }
          break
        }
        case 'navigate': {
          if (hand === 'left') { hoverLeftOut = { x: handPos.x, y: handPos.y } }
          else { hoverRightOut = { x: handPos.x, y: handPos.y } }
          hoverChanged = true
          break
        }
      }

      // Clear hover/drag for non-matching actions
      if (action.type !== 'navigate') {
        if (hand === 'left' && hoverLeftOut !== null) { hoverLeftOut = null; hoverChanged = true }
        if (hand === 'right' && hoverRightOut !== null) { hoverRightOut = null; hoverChanged = true }
      }
      if (action.type !== 'drag') {
        if (hand === 'left' && dragLeftOut !== null) { dragLeftOut = null; dragChanged = true }
        if (hand === 'right' && dragRightOut !== null) { dragRightOut = null; dragChanged = true }
      }

      prevHandPosRef.current[hand] = { x: handPos.x, y: handPos.y }
    }

    processHand(bestLeft, 'left')
    processHand(bestRight, 'right')

    // Batch state updates
    if (hoverChanged) setGestureHoverPos({ left: hoverLeftOut, right: hoverRightOut })
    if (dragChanged) setDragPositions({ left: dragLeftOut, right: dragRightOut })
  }, [landmarkFrame, trackingEnabled, viewMode, hoveredNodeId, selectedClusterId, config.gestures.oneHandedMode, selectNode, selectCluster, setActiveGesture, graphData, overlayMode])

  // Update gesture engine config when settings change
  useEffect(() => {
    gestureEngineRef.current?.updateConfig({
      minOnsetFrames: 1,
      minHoldDuration: config.gestures.minHoldDuration,
      cooldownDuration: config.gestures.cooldownDuration,
      sensitivity: config.gestures.sensitivity
    })
  }, [config.gestures.minHoldDuration, config.gestures.cooldownDuration, config.gestures.sensitivity])

  // Calibration profile state (backed by IPC persistence)
  const [profiles, setProfiles] = useState<CalibrationProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      window.api.listProfiles(),
      window.api.getActiveProfile(),
      window.api.getConfig()
    ]).then(([loaded, activeId, persistedConfig]) => {
      // Hydrate persisted config
      if (persistedConfig) {
        updateConfig(persistedConfig)
      }

      if (loaded.length === 0) {
        // Seed default profile — no wizard, just go straight to app
        const defaultProfile: CalibrationProfile = {
          id: 'default',
          name: 'Standard',
          sensitivity: 0.5,
          samples: [],
          createdAt: Date.now(),
          updatedAt: Date.now()
        }
        window.api.createProfile(defaultProfile).catch(() => {})
        window.api.setActiveProfile(defaultProfile.id).catch(() => {})
        setProfiles([defaultProfile])
        setActiveProfileId(defaultProfile.id)
      } else {
        setProfiles(loaded)
        setActiveProfileId(activeId)

        // Apply active profile's sensitivity to gesture config
        if (activeId) {
          const active = loaded.find(p => p.id === activeId)
          if (active) {
            updateConfig({ gestures: { ...config.gestures, sensitivity: active.sensitivity } })
          }
        }
      }
      setCalibrated(true)
    }).catch(() => {
      setCalibrated(true)
    })
  }, [])

  const handleSaveProfile = useCallback((profile: CalibrationProfile) => {
    const exists = profiles.some(p => p.id === profile.id)
    if (exists) {
      window.api.updateProfile(profile.id, profile).catch(() => {})
      setProfiles(prev => prev.map(p => p.id === profile.id ? profile : p))
    } else {
      window.api.createProfile(profile).catch(() => {})
      setProfiles(prev => [...prev, profile])
    }
  }, [profiles])

  const handleDeleteProfile = useCallback((id: string) => {
    window.api.deleteProfile(id).catch(() => {})
    setProfiles(prev => prev.filter(p => p.id !== id))
    if (activeProfileId === id) {
      setActiveProfileId(null)
      window.api.setActiveProfile(null).catch(() => {})
    }
  }, [activeProfileId])

  const handleSetActiveProfile = useCallback((id: string) => {
    setActiveProfileId(id)
    window.api.setActiveProfile(id).catch(() => {})
    // Apply this profile's sensitivity immediately
    const profile = profiles.find(p => p.id === id)
    if (profile) {
      updateConfig({ gestures: { ...config.gestures, sensitivity: profile.sensitivity } })
    }
  }, [profiles, config.gestures, updateConfig])

  const [windowSize, setWindowSize] = useState({ width: 1280, height: 800 })

  // Cluster info computed from embedding data
  const clusterInfos = embeddingData ? calculateClusterCentroids(embeddingData) : []

  // Bounds for axis labels (manifold view)
  const embeddingBounds = useMemo(() => {
    if (!embeddingData) return null
    return computeDataBounds(embeddingData.points)
  }, [embeddingData])

  // Cluster legend data
  const clusterLegendData = useMemo((): ClusterInfo[] => {
    if (!embeddingData?.clusters) return []
    const countMap = new Map<number, number>()
    for (const p of embeddingData.points) {
      if (p.clusterId != null) {
        countMap.set(p.clusterId, (countMap.get(p.clusterId) ?? 0) + 1)
      }
    }
    return embeddingData.clusters.map(c => ({
      id: c.id,
      label: c.label,
      color: c.color ?? '#888',
      count: countMap.get(c.id) ?? 0
    }))
  }, [embeddingData])

  // Hovered embedding point
  const [hoveredPoint, setHoveredPoint] = useState<EmbeddingData['points'][0] | null>(null)

  // Enriched selection info for graph nodes
  const selectedNodeInfo = useMemo(() => {
    if (selectedNodeId && graphData) {
      return getSelectedNodeInfo(selectedNodeId, graphData)
    }
    return null
  }, [selectedNodeId, graphData])

  // Enriched selection info for manifold points
  const selectedPointInfo = useMemo(() => {
    if (selectedNodeId && embeddingData) {
      return getSelectedPointInfo(selectedNodeId, embeddingData)
    }
    return null
  }, [selectedNodeId, embeddingData])

  // Unified selection info (resolves any SelectableObject)
  const selectionInfo = useMemo(() =>
    resolveSelectionInfo(selection, graphData, embeddingData),
    [selection, graphData, embeddingData]
  )

  // Track window size
  useEffect(() => {
    const handleResize = (): void => setWindowSize({
      width: Math.max(1, window.innerWidth),
      height: Math.max(1, window.innerHeight)
    })
    window.addEventListener('resize', handleResize)
    handleResize()
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // No calibration popup on boot — default profile is seeded automatically.
  // Users can open calibration from Settings > Tracking or HUD profile dropdown.

  // Undo handler
  const performUndo = useCallback(() => {
    const entry = undoStackRef.current.pop()
    if (!entry) return
    const inv = entry.inverse
    switch (inv.type) {
      case 'deselect':
        if (inv.target?.kind === 'cluster') {
          selectCluster(null)
        } else {
          selectNode(null)
          selectSecondaryNode(null)
          perHandSelectionRef.current.left = null
          perHandSelectionRef.current.right = null
        }
        break
      case 'select':
        switch (inv.target.kind) {
          case 'node':
          case 'point':
            selectNode(inv.target.id)
            break
          case 'cluster':
            selectCluster(inv.target.id)
            break
        }
        break
      case 'zoom':
        if (orbitRef.current) {
          const cam = orbitRef.current.object
          const dir = orbitRef.current.target.clone().sub(cam.position).normalize()
          cam.position.addScaledVector(dir, inv.params.delta * 0.5)
          orbitRef.current.update()
        }
        break
      case 'rotate':
        if (orbitRef.current) {
          const angle = inv.params.angle * 0.05
          const rt = orbitRef.current.target
          const cam = orbitRef.current.object
          const ox = cam.position.x - rt.x
          const oz = cam.position.z - rt.z
          cam.position.x = rt.x + ox * Math.cos(angle) - oz * Math.sin(angle)
          cam.position.z = rt.z + ox * Math.sin(angle) + oz * Math.cos(angle)
          cam.lookAt(rt)
          orbitRef.current.update()
        }
        break
    }
  }, [selectNode, selectSecondaryNode, selectCluster])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Skip when typing in input/textarea/select
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      // Escape dismisses modals/guide
      if (e.key === 'Escape') {
        if (gestureGuideVisible) { setGestureGuideVisible(false); return }
        if (activeModal !== null) { setActiveModal(null); return }
        return
      }

      // Ctrl+Z: Undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault()
        performUndo()
        return
      }

      // ? key: Toggle gesture guide
      if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault()
        setGestureGuideVisible(v => !v)
        return
      }

      // View mode shortcuts (1/2/3)
      if (e.key === '1') { setViewMode('graph'); return }
      if (e.key === '2') { setViewMode('manifold'); return }
      if (e.key === '3') { setViewMode('split'); return }

      // Feature toggles (F1-F5)
      if (e.key === 'F1') {
        e.preventDefault()
        updateConfig({ overlay: { ...config.overlay, showMotionMetrics: !config.overlay.showMotionMetrics } })
        return
      }
      if (e.key === 'F3') {
        e.preventDefault()
        updateConfig({ visualization: { ...config.visualization, showAxisLabels: !config.visualization.showAxisLabels, showClusterLegend: !config.visualization.showClusterLegend } })
        return
      }
      if (e.key === 'F4') {
        e.preventDefault()
        updateConfig({ visualization: { ...config.visualization, proximityColoring: !config.visualization.proximityColoring } })
        return
      }
      if (e.key === 'F5') {
        e.preventDefault()
        updateConfig({ overlay: { ...config.overlay, showMotionTrail: !config.overlay.showMotionTrail } })
        return
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeModal, setActiveModal, gestureGuideVisible, performUndo, setViewMode, updateConfig, config])

  // Auto-dismiss toasts based on their dismissMs
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), toast.dismissMs)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, removeToast])

  // Overlay mode IPC listener
  useEffect(() => {
    const unsub = window.api.onOverlayChanged(setOverlayMode)
    window.api.getOverlayState().then(setOverlayMode)
    return () => { unsub() }
  }, [setOverlayMode])

  const handleGraphLoaded = useCallback((data: GraphData) => {
    setGraphData(data)
    setActiveModal(null)
    addToast(`Graph loaded: ${data.nodes.length} nodes, ${data.edges.length} edges`, 'success', 4000)
  }, [setGraphData, setActiveModal, addToast])

  const handleEmbeddingLoaded = useCallback((data: EmbeddingData) => {
    setEmbeddingData(data)
    setActiveModal(null)
    addToast(`Embeddings loaded: ${data.points.length} points`, 'success', 4000)
  }, [setEmbeddingData, setActiveModal, addToast])

  const handleError = useCallback((msg: string) => {
    setError(msg)
    addToast(msg, 'error')
  }, [setError, addToast])

  const hasGraph = graphData !== null
  const hasManifold = embeddingData !== null
  const hasData = hasGraph || hasManifold

  // Memoize gesture/drag position arrays to preserve identity across renders
  const memoGesturePositions = useMemo(
    () => [gestureHoverPos.left, gestureHoverPos.right].filter(Boolean) as Array<{ x: number; y: number }>,
    [gestureHoverPos.left, gestureHoverPos.right]
  )
  const memoDragPositions = useMemo(
    () => [dragPositions.left, dragPositions.right].filter(Boolean) as Array<{ nodeId: string; x: number; y: number }>,
    [dragPositions.left, dragPositions.right]
  )

  // Click on empty space to deselect
  const handleRootClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      selectNode(null)
    }
  }, [selectNode])

  const handleCloseModal = useCallback(() => setActiveModal(null), [setActiveModal])

  // Root-level drag-and-drop (works without opening the DataLoader modal)
  const [rootDragOver, setRootDragOver] = useState(false)

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setRootDragOver(true)
  }, [])

  const handleRootDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget === e.target) setRootDragOver(false)
  }, [])

  const handleRootDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setRootDragOver(false)
    const file = e.dataTransfer.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const content = reader.result
      if (typeof content !== 'string') { handleError('File content is not text'); return }
      try {
        const parsed = JSON.parse(content)
        const result = validateData(parsed)
        if (!result.success) { handleError(`Validation failed: ${result.errors?.join(', ')}`); return }
        if ('nodes' in result.data! && 'edges' in result.data!) {
          handleGraphLoaded(result.data as GraphData)
        } else {
          handleEmbeddingLoaded(result.data as EmbeddingData)
        }
      } catch (err) {
        handleError(`Failed to parse ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }
    reader.onerror = () => handleError('Failed to read dropped file')
    reader.readAsText(file)
  }, [handleGraphLoaded, handleEmbeddingLoaded, handleError])

  // Load bundled sample files
  const loadSample = useCallback(async (name: string) => {
    try {
      const content = await window.api.loadSample(name)
      const parsed = JSON.parse(content)
      const result = validateData(parsed)
      if (!result.success) { handleError(`Sample validation failed: ${result.errors?.join(', ')}`); return }
      if ('nodes' in result.data! && 'edges' in result.data!) {
        handleGraphLoaded(result.data as GraphData)
      } else {
        handleEmbeddingLoaded(result.data as EmbeddingData)
      }
    } catch (err) {
      handleError(`Failed to load sample: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
  }, [handleGraphLoaded, handleEmbeddingLoaded, handleError])

  return (
    <div
      style={{
        width: '100%', height: '100%', position: 'relative',
        background: overlayMode ? 'transparent' : 'var(--bg-primary)',
        outline: rootDragOver ? '2px solid var(--accent)' : 'none'
      }}
      onClick={handleRootClick}
      onDrop={handleRootDrop}
      onDragOver={handleRootDragOver}
      onDragLeave={handleRootDragLeave}
    >
      {/* 3D Canvas — hidden in overlay mode */}
      {!overlayMode && <Canvas
        camera={{ position: [20, 15, 50], fov: 60, near: 0.1, far: 10000 }}
        style={{ background: 'var(--canvas-bg)' }}
        frameloop="always"
        dpr={Math.min(window.devicePixelRatio, 2)}
        gl={{ antialias: true, powerPreference: 'high-performance', stencil: false, alpha: false }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          {/* Graph View */}
          {(viewMode === 'graph' || viewMode === 'split') && graphData && (
            <ForceGraph
              data={graphData}
              selectedNodeId={selectedNodeId}
              secondarySelectedNodeId={secondarySelectedNodeId}
              gesturePositions={memoGesturePositions}
              dragPositions={memoDragPositions}
              onNodeClick={selectNode}
              onNodeHover={hoverNode}
            />
          )}

          {/* Manifold View */}
          {(viewMode === 'manifold' || viewMode === 'split') && embeddingData && (
            <>
              <PointCloud
                data={embeddingData}
                selectedCluster={selectedClusterId ?? undefined}
                hoveredPointId={hoveredPoint?.id}
                onPointHover={(point) => {
                  setHoveredPoint(point ?? null)
                }}
                onPointClick={(point) => selectNode(point.id)}
              />
              <Clusters
                clusters={clusterInfos}
                selectedCluster={selectedClusterId ?? undefined}
                onClusterClick={(id) => selectCluster(id)}
              />
              {hoveredPoint && (
                <HoverCard point={hoveredPoint} visible={true} />
              )}
              {embeddingBounds && config.visualization.showAxisLabels && (
                <AxisLabels bounds={embeddingBounds} />
              )}
            </>
          )}

          {/* Placeholder when no data loaded (hide when modal is open to avoid text bleeding through) */}
          {!hasData && activeModal === null && <PlaceholderScene onLoadSample={loadSample} />}
        </Suspense>
        <OrbitControls ref={orbitRef} enableDamping dampingFactor={0.1} />
        {import.meta.env.DEV && <Stats />}
      </Canvas>}

      {/* HUD -- Top Bar (visible in both modes for window controls) */}
      <HUD
        hasGraph={hasGraph}
        hasManifold={hasManifold}
        nodeCount={graphData?.nodes.length ?? 0}
        pointCount={embeddingData?.points.length ?? 0}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onProfileChange={handleSetActiveProfile}
        cameraCount={cameraCount}
        trackingQuality={trackingQuality}
        onToggleGuide={() => setGestureGuideVisible(v => !v)}
        canUndo={undoStackRef.current.canUndo}
        onUndo={performUndo}
      />

      {/* Cluster Legend — manifold view, hidden in overlay */}
      {!overlayMode && (viewMode === 'manifold' || viewMode === 'split') && embeddingData && config.visualization.showClusterLegend && (
        <ClusterLegend
          clusters={clusterLegendData}
          selectedClusterId={selectedClusterId}
          onClusterClick={(id) => selectCluster(id)}
        />
      )}

      {/* Selection Info Panel — hidden in overlay mode */}
      {!overlayMode && <SelectionPanel
        selectedNodeInfo={selectedNodeInfo}
        selectedPointInfo={selectedPointInfo}
        selectionInfo={selectionInfo}
        onDeselect={() => select(null)}
      />}

      {/* Gesture Overlay */}
      <GestureOverlay
        landmarkFrame={landmarkFrame}
        activeGesture={activeGesture}
        visible={trackingEnabled}
        width={windowSize.width}
        height={windowSize.height}
        motionMetrics={motionMetrics}
        showMotionMetrics={config.overlay.showMotionMetrics}
        showMotionTrail={config.overlay.showMotionTrail}
      />

      {/* Hand Chord Overlays */}
      <HandChordOverlay
        landmarkFrame={landmarkFrame}
        visible={trackingEnabled}
      />

      {/* Gesture Guide Overlay */}
      <GestureGuide visible={gestureGuideVisible} onClose={() => setGestureGuideVisible(false)} />

      {/* Toast Queue — hidden in overlay mode */}
      {!overlayMode && <ToastQueue toasts={toasts} onDismiss={removeToast} />}

      {/* Modal Container — hidden in overlay mode */}
      {!overlayMode && <ModalContainer activeModal={activeModal} onClose={handleCloseModal}>
        {/* Data Loader Modal */}
        {activeModal === 'dataLoader' && (
          <>
            <DataLoader
              onGraphLoaded={handleGraphLoaded}
              onEmbeddingLoaded={handleEmbeddingLoaded}
              onError={handleError}
            />
            <div style={{
              borderTop: '1px solid var(--border)',
              margin: '12px 0',
              paddingTop: 8
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 4px 16px' }}>
                Or load from URL:
              </p>
              <RemoteLoader
                onGraphLoaded={handleGraphLoaded}
                onEmbeddingLoaded={handleEmbeddingLoaded}
                onError={handleError}
              />
            </div>
            <button
              onClick={handleCloseModal}
              style={{ ...buttonStyle, marginTop: 8, width: '100%' }}
              aria-label="Cancel"
            >
              Cancel
            </button>
          </>
        )}

        {/* Calibration Wizard */}
        {activeModal === 'calibration' && (
          <Calibration
            landmarkFrame={landmarkFrame}
            profiles={profiles}
            activeProfileId={activeProfileId}
            onSaveProfile={handleSaveProfile}
            onDeleteProfile={handleDeleteProfile}
            onSetActive={handleSetActiveProfile}
            onComplete={(sensitivity) => {
              updateConfig({
                gestures: { ...config.gestures, sensitivity }
              })
              setCalibrated(true)
              setActiveModal(null)
            }}
            onSkip={() => {
              setCalibrated(true)
              setActiveModal(null)
            }}
          />
        )}

      </ModalContainer>}

      {/* Settings Panel — rendered outside ModalContainer as a side panel overlay */}
      {!overlayMode && activeModal === 'settings' && (
        <>
          <div
            onClick={handleCloseModal}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.3)',
              zIndex: 140
            }}
          />
          <Settings
            config={config}
            onConfigChange={updateConfig}
            onClose={handleCloseModal}
            onOpenCalibration={() => setActiveModal('calibration')}
            profiles={profiles}
            activeProfileId={activeProfileId}
            onProfileChange={handleSetActiveProfile}
            onCreateProfile={handleSaveProfile}
            onDeleteProfile={handleDeleteProfile}
          />
        </>
      )}
    </div>
  )
}

/** Instructive empty state shown when no data is loaded */
function PlaceholderScene({ onLoadSample }: { onLoadSample: (name: string) => void }): React.ReactElement {
  const sampleBtnStyle: React.CSSProperties = {
    padding: '6px 14px',
    background: 'var(--button-bg, #1a1a2e)',
    border: '1px solid var(--border, #333)',
    borderRadius: 6,
    color: 'var(--accent, #4a9eff)',
    cursor: 'pointer',
    fontSize: 12
  }
  return (
    <group>
      <gridHelper args={[100, 50, '#333', '#222']} />
      <Html center>
        <div style={{
          textAlign: 'center',
          color: A11Y_COLORS.textSecondary,
          userSelect: 'none',
          whiteSpace: 'nowrap'
        }}>
          <p style={{ fontSize: 18, margin: '0 0 8px 0', color: 'var(--text-secondary)' }}>
            Drop a JSON file or click Load to begin
          </p>
          <p style={{ fontSize: 13, margin: '0 0 16px 0', color: 'var(--text-muted)' }}>
            Supports: Graph (nodes + edges) or Embeddings (points + clusters)
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', pointerEvents: 'auto' }}>
            <button style={sampleBtnStyle} onClick={() => onLoadSample('small-graph.json')}>
              Sample Graph
            </button>
            <button style={sampleBtnStyle} onClick={() => onLoadSample('embeddings-5k.json')}>
              Sample Embeddings
            </button>
          </div>
        </div>
      </Html>
    </group>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'var(--button-bg)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--button-text)',
  cursor: 'pointer',
  fontSize: 12
}
