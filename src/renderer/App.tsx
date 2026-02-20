import React, { Suspense, useState, useCallback, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats, Html } from '@react-three/drei'
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
import { A11Y_COLORS } from './controller/a11y'
import { getSelectedNodeInfo, getSelectedPointInfo } from './controller/selection-info'
import { HUD } from './components/HUD'
import { ToastQueue } from './components/ToastQueue'
import { ModalContainer } from './components/ModalContainer'
import { SelectionPanel } from './components/SelectionPanel'
import { useHandTracker } from './hooks/useHandTracker'
import type { GraphData, EmbeddingData, CalibrationProfile } from '@shared/protocol'

export function App(): React.ReactElement {
  // P1-21: Use individual slice selectors instead of useAppStore() to avoid
  // full-tree re-renders when any unrelated slice changes.
  const viewMode = useVisualStore((s) => s.viewMode)
  const selectedNodeId = useVisualStore((s) => s.selectedNodeId)
  const hoveredNodeId = useVisualStore((s) => s.hoveredNodeId)
  const selectedClusterId = useVisualStore((s) => s.selectedClusterId)
  const selectNode = useVisualStore((s) => s.selectNode)
  const hoverNode = useVisualStore((s) => s.hoverNode)
  const selectCluster = useVisualStore((s) => s.selectCluster)
  const setViewMode = useVisualStore((s) => s.setViewMode)

  const graphData = useDataStore((s) => s.graphData)
  const embeddingData = useDataStore((s) => s.embeddingData)
  const setGraphDataRaw = useDataStore((s) => s.setGraphData)
  const setEmbeddingDataRaw = useDataStore((s) => s.setEmbeddingData)

  const activeGesture = useGestureStore((s) => s.activeGesture)
  const trackingEnabled = useGestureStore((s) => s.trackingEnabled)

  const config = useConfigStore((s) => s.config)
  const updateConfig = useConfigStore((s) => s.updateConfig)
  const calibrated = useConfigStore((s) => s.calibrated)
  const setCalibrated = useConfigStore((s) => s.setCalibrated)

  const error = useUIStore((s) => s.error)
  const setError = useUIStore((s) => s.setError)
  const toasts = useUIStore((s) => s.toasts)
  const addToast = useUIStore((s) => s.addToast)
  const removeToast = useUIStore((s) => s.removeToast)
  const activeModal = useUIStore((s) => s.activeModal)
  const setActiveModal = useUIStore((s) => s.setActiveModal)

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

  // Hand tracking via hook — graceful degradation on failure
  const { frame: landmarkFrame, error: trackerError } = useHandTracker({
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

  // Calibration profile state (backed by IPC persistence)
  const [profiles, setProfiles] = useState<CalibrationProfile[]>([])
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null)

  useEffect(() => {
    window.api.listProfiles().then(setProfiles).catch(() => {})
    window.api.getActiveProfile().then(setActiveProfileId).catch(() => {})
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
  }, [])

  const [windowSize, setWindowSize] = useState({ width: 1280, height: 800 })

  // Cluster info computed from embedding data
  const clusterInfos = embeddingData ? calculateClusterCentroids(embeddingData) : []

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

  // Show calibration on first run
  useEffect(() => {
    if (!calibrated && trackingEnabled) {
      setActiveModal('calibration')
    }
  }, [calibrated, trackingEnabled, setActiveModal])

  // Escape key dismisses active modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && activeModal !== null) {
        setActiveModal(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activeModal, setActiveModal])

  // Auto-dismiss toasts based on their dismissMs
  useEffect(() => {
    if (toasts.length === 0) return
    const timers = toasts.map((toast) =>
      setTimeout(() => removeToast(toast.id), toast.dismissMs)
    )
    return () => timers.forEach(clearTimeout)
  }, [toasts, removeToast])

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

  // Click on empty space to deselect
  const handleRootClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      selectNode(null)
    }
  }, [selectNode])

  const handleCloseModal = useCallback(() => setActiveModal(null), [setActiveModal])

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onClick={handleRootClick}
    >
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 50], fov: 60, near: 0.1, far: 10000 }}
        style={{ background: 'var(--canvas-bg)' }}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <Suspense fallback={null}>
          {/* Graph View */}
          {(viewMode === 'graph' || viewMode === 'split') && graphData && (
            <ForceGraph
              data={graphData}
              onNodeClick={(id) => selectNode(id)}
              onNodeHover={(id) => hoverNode(id)}
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
            </>
          )}

          {/* Placeholder when no data loaded */}
          {!hasData && <PlaceholderScene />}
        </Suspense>
        <OrbitControls enableDamping dampingFactor={0.1} />
        <Stats />
      </Canvas>

      {/* HUD -- Top Bar */}
      <HUD
        hasGraph={hasGraph}
        hasManifold={hasManifold}
        nodeCount={graphData?.nodes.length ?? 0}
        pointCount={embeddingData?.points.length ?? 0}
      />

      {/* Selection Info Panel */}
      <SelectionPanel
        selectedNodeInfo={selectedNodeInfo}
        selectedPointInfo={selectedPointInfo}
        onDeselect={() => selectNode(null)}
      />

      {/* Gesture Overlay */}
      <GestureOverlay
        landmarkFrame={landmarkFrame}
        activeGesture={activeGesture}
        visible={trackingEnabled}
        width={windowSize.width}
        height={windowSize.height}
      />

      {/* Toast Queue */}
      <ToastQueue toasts={toasts} onDismiss={removeToast} />

      {/* Modal Container */}
      <ModalContainer activeModal={activeModal} onClose={handleCloseModal}>
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

        {/* Settings Panel */}
        {activeModal === 'settings' && (
          <Settings
            config={config}
            onConfigChange={updateConfig}
            onClose={handleCloseModal}
          />
        )}
      </ModalContainer>
    </div>
  )
}

/** Instructive empty state shown when no data is loaded */
function PlaceholderScene(): React.ReactElement {
  return (
    <group>
      <gridHelper args={[100, 50, '#333', '#222']} />
      <Html center>
        <div style={{
          textAlign: 'center',
          color: A11Y_COLORS.textSecondary,
          userSelect: 'none',
          pointerEvents: 'none',
          whiteSpace: 'nowrap'
        }}>
          <p style={{ fontSize: 18, margin: '0 0 8px 0', color: 'var(--text-secondary)' }}>
            Drop a JSON file or click Load to begin
          </p>
          <p style={{ fontSize: 13, margin: 0, color: 'var(--text-muted)' }}>
            Supports: Graph (nodes + edges) or Embeddings (points + clusters)
          </p>
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
