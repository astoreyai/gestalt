import React, { Suspense, useState, useCallback, useEffect, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Stats, Html } from '@react-three/drei'
import { useAppStore } from './controller/store'
import type { Toast } from './controller/store'
import { ViewSwitcher } from './controller/ViewSwitcher'
import { GestureOverlay } from './controller/GestureOverlay'
import { Calibration } from './controller/Calibration'
import { DataLoader } from './data/DataLoader'
import { Settings } from './settings/Settings'
import { ForceGraph } from './graph/ForceGraph'
import { PointCloud } from './manifold/PointCloud'
import { Clusters } from './manifold/Clusters'
import { HoverCard } from './manifold/HoverCard'
import { calculateClusterCentroids, findNearestPoint } from './manifold/navigation'
import { A11Y_COLORS, getTrackingStatusIndicator } from './controller/a11y'
import { getSelectedNodeInfo, getSelectedPointInfo } from './controller/selection-info'
import type { GraphData, EmbeddingData, LandmarkFrame } from '@shared/protocol'

/** Severity-based background colors for toast notifications */
const TOAST_COLORS: Record<Toast['severity'], string> = {
  error: '#ff6b6b',
  warning: '#ffd93d',
  info: '#4a9eff',
  success: '#6bcb77'
}

export function App(): React.ReactElement {
  const {
    viewMode, setViewMode,
    graphData, embeddingData, setGraphData, setEmbeddingData,
    selectedNodeId, hoveredNodeId, selectNode, hoverNode,
    selectedClusterId, selectCluster,
    activeGesture, trackingEnabled,
    config, updateConfig,
    calibrated, setCalibrated,
    error, setError,
    toasts, addToast, removeToast,
    activeModal, setActiveModal
  } = useAppStore()

  const [landmarkFrame, setLandmarkFrame] = useState<LandmarkFrame | null>(null)
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

  return (
    <div
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onClick={handleRootClick}
    >
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [0, 0, 50], fov: 60, near: 0.1, far: 10000 }}
        style={{ background: '#0a0a0a' }}
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
                onPointHover={(id) => {
                  if (id && embeddingData) {
                    const pt = embeddingData.points.find(p => p.id === id)
                    setHoveredPoint(pt ?? null)
                  } else {
                    setHoveredPoint(null)
                  }
                }}
                onPointClick={(id) => selectNode(id)}
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
      <div style={{
        position: 'absolute',
        top: 12,
        left: 12,
        right: 12,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        pointerEvents: 'none'
      }}>
        {/* Status */}
        <div style={{
          padding: '6px 14px',
          background: 'rgba(0,0,0,0.6)',
          borderRadius: 8,
          fontSize: 13,
          display: 'flex',
          gap: 12,
          alignItems: 'center',
          pointerEvents: 'auto'
        }}>
          <span
            role="status"
            aria-live="polite"
            style={{ color: trackingEnabled ? A11Y_COLORS.trackingActive : A11Y_COLORS.trackingPaused }}
          >
            {getTrackingStatusIndicator(trackingEnabled)} {trackingEnabled ? 'Tracking' : 'Paused'}
          </span>
          {hasGraph && (
            <span style={{ color: A11Y_COLORS.textSecondary }}>
              {graphData!.nodes.length} nodes
            </span>
          )}
          {hasManifold && (
            <span style={{ color: A11Y_COLORS.textSecondary }}>
              {embeddingData!.points.length} points
            </span>
          )}
        </div>

        {/* View Switcher + Controls */}
        <div style={{ display: 'flex', gap: 8, pointerEvents: 'auto' }}>
          <ViewSwitcher
            currentView={viewMode}
            onViewChange={setViewMode}
            graphAvailable={hasGraph}
            manifoldAvailable={hasManifold}
          />
          <button
            onClick={() => setActiveModal(activeModal === 'dataLoader' ? null : 'dataLoader')}
            style={buttonStyle}
            title="Load Data"
            aria-label="Load data"
          >
            Load
          </button>
          <button
            onClick={() => setActiveModal(activeModal === 'settings' ? null : 'settings')}
            style={buttonStyle}
            title="Settings"
            aria-label="Settings"
          >
            Settings
          </button>
        </div>
      </div>

      {/* Selection Info -- Graph Node */}
      {selectedNodeInfo && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          padding: 16,
          background: 'rgba(0,0,0,0.8)',
          borderRadius: 12,
          border: '1px solid #333',
          maxWidth: 300
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>
            {selectedNodeInfo.label}
          </h4>
          <div style={{ fontSize: 12, color: A11Y_COLORS.textSecondary, marginBottom: 8 }}>
            <div>{selectedNodeInfo.neighborCount} connection{selectedNodeInfo.neighborCount !== 1 ? 's' : ''}</div>
            {selectedNodeInfo.metadata && Object.entries(selectedNodeInfo.metadata).map(([key, value]) => (
              <div key={key}>{key}: {String(value)}</div>
            ))}
          </div>
          {selectedNodeInfo.edges.length > 0 && (
            <div style={{ fontSize: 11, color: A11Y_COLORS.textSecondary, marginBottom: 8, maxHeight: 100, overflowY: 'auto' }}>
              {selectedNodeInfo.edges.map(edge => (
                <div key={edge.targetId}>
                  {edge.targetLabel ?? edge.targetId}{edge.weight !== undefined ? ` (${edge.weight.toFixed(2)})` : ''}
                </div>
              ))}
            </div>
          )}
          <button
            onClick={() => selectNode(null)}
            style={{ ...buttonStyle, padding: '4px 10px', fontSize: 11 }}
            aria-label="Deselect node"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Selection Info -- Manifold Point (when no graph node matched) */}
      {!selectedNodeInfo && selectedPointInfo && (
        <div style={{
          position: 'absolute',
          bottom: 16,
          left: 16,
          padding: 16,
          background: 'rgba(0,0,0,0.8)',
          borderRadius: 12,
          border: '1px solid #333',
          maxWidth: 300
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 14 }}>
            {selectedPointInfo.label}
          </h4>
          <div style={{ fontSize: 12, color: A11Y_COLORS.textSecondary, marginBottom: 8 }}>
            {selectedPointInfo.clusterLabel && (
              <div>
                Cluster: <span style={{ color: selectedPointInfo.clusterColor ?? '#ccc' }}>{selectedPointInfo.clusterLabel}</span>
              </div>
            )}
            <div>
              Position: ({selectedPointInfo.position.x.toFixed(2)}, {selectedPointInfo.position.y.toFixed(2)}, {selectedPointInfo.position.z.toFixed(2)})
            </div>
            {selectedPointInfo.metadata && Object.entries(selectedPointInfo.metadata).map(([key, value]) => (
              <div key={key}>{key}: {String(value)}</div>
            ))}
          </div>
          <button
            onClick={() => selectNode(null)}
            style={{ ...buttonStyle, padding: '4px 10px', fontSize: 11 }}
            aria-label="Deselect node"
          >
            Deselect
          </button>
        </div>
      )}

      {/* Gesture Overlay */}
      <GestureOverlay
        landmarkFrame={landmarkFrame}
        activeGesture={activeGesture}
        visible={trackingEnabled}
        width={windowSize.width}
        height={windowSize.height}
      />

      {/* Toast Queue */}
      <div
        aria-live="polite"
        role="alert"
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          zIndex: 200,
          maxWidth: 400
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            style={{
              padding: '10px 16px',
              background: TOAST_COLORS[toast.severity],
              borderRadius: 8,
              color: toast.severity === 'warning' ? '#1a1a1a' : '#fff',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12
            }}
          >
            <span>{toast.message}</span>
            <button
              onClick={() => removeToast(toast.id)}
              aria-label="Dismiss notification"
              style={{
                background: 'none',
                border: 'none',
                color: toast.severity === 'warning' ? '#1a1a1a' : '#fff',
                fontSize: 16,
                cursor: 'pointer',
                padding: '0 2px',
                lineHeight: 1,
                flexShrink: 0
              }}
            >
              {'\u00D7'}
            </button>
          </div>
        ))}
      </div>

      {/* Modal Backdrop */}
      {activeModal !== null && (
        <div
          onClick={() => setActiveModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 140
          }}
        />
      )}

      {/* Data Loader Modal */}
      {activeModal === 'dataLoader' && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 150,
          width: 400
        }}>
          <DataLoader
            onGraphLoaded={handleGraphLoaded}
            onEmbeddingLoaded={handleEmbeddingLoaded}
            onError={handleError}
          />
          <button
            onClick={() => setActiveModal(null)}
            style={{ ...buttonStyle, marginTop: 8, width: '100%' }}
            aria-label="Cancel"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Calibration Wizard */}
      {activeModal === 'calibration' && (
        <Calibration
          landmarkFrame={landmarkFrame}
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
          onClose={() => setActiveModal(null)}
        />
      )}
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
          <p style={{ fontSize: 18, margin: '0 0 8px 0', color: '#aaa' }}>
            Drop a JSON file or click Load to begin
          </p>
          <p style={{ fontSize: 13, margin: 0, color: '#666' }}>
            Supports: Graph (nodes + edges) or Embeddings (points + clusters)
          </p>
        </div>
      </Html>
    </group>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '6px 12px',
  background: 'rgba(0,0,0,0.6)',
  border: '1px solid #444',
  borderRadius: 6,
  color: '#ccc',
  cursor: 'pointer',
  fontSize: 12
}
