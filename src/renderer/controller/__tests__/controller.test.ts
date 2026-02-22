import { describe, it, expect, beforeEach } from 'vitest'
import { dispatchGesture, type DispatchContext } from '../dispatcher'
import { useAppStore, useVisualStore, useDataStore, useGestureStore, useUIStore } from '../store'
import { GestureType, GesturePhase, type GestureEvent } from '@shared/protocol'
import type { GraphData, EmbeddingData } from '@shared/protocol'
import { VIEW_MODE_LABELS } from '../ViewSwitcher'
import { A11Y_COLORS, getTrackingStatusIndicator } from '../a11y'
import { getSelectedNodeInfo, getSelectedPointInfo } from '../selection-info'

function makeGesture(
  type: GestureType,
  phase: GesturePhase,
  hand: 'left' | 'right' = 'right',
  data?: Record<string, number>
): GestureEvent {
  return {
    type,
    phase,
    hand,
    confidence: 0.9,
    position: { x: 0.5, y: 0.5, z: 0.1 },
    timestamp: Date.now(),
    data
  }
}

describe('Gesture Dispatcher', () => {
  const graphCtx: DispatchContext = {
    viewMode: 'graph',
    selectedNodeId: null,
    selectedClusterId: null
  }

  const manifoldCtx: DispatchContext = {
    viewMode: 'manifold',
    selectedNodeId: null,
    selectedClusterId: null
  }

  describe('Graph View', () => {
    it('should dispatch select on pinch onset', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Pinch, GesturePhase.Onset),
        graphCtx
      )
      expect(action.type).toBe('select')
      expect(action.params.x).toBe(0.5)
    })

    it('should dispatch noop on pinch hold with no selection', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Pinch, GesturePhase.Hold),
        graphCtx
      )
      expect(action.type).toBe('noop')
    })

    it('should dispatch drag on pinch hold with selected node', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Pinch, GesturePhase.Hold),
        { ...graphCtx, selectedNodeId: 'node-1' }
      )
      expect(action.type).toBe('drag')
      expect(action.params.x).toBe(0.5)
    })

    it('should dispatch deselect on open palm onset', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.OpenPalm, GesturePhase.Onset),
        graphCtx
      )
      expect(action.type).toBe('deselect')
    })

    it('should dispatch noop on open palm hold', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.OpenPalm, GesturePhase.Hold),
        graphCtx
      )
      expect(action.type).toBe('noop')
    })

    it('should dispatch rotate on twist hold', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Twist, GesturePhase.Hold, 'right', { rotation: 30 }),
        graphCtx
      )
      expect(action.type).toBe('rotate')
      expect(action.params.angle).toBe(30)
    })

    it('should dispatch noop on twist onset', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Twist, GesturePhase.Onset),
        graphCtx
      )
      expect(action.type).toBe('noop')
    })

    it('should dispatch pan on flat drag hold', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.FlatDrag, GesturePhase.Hold),
        graphCtx
      )
      expect(action.type).toBe('pan')
      expect(action.params.dx).toBe(0.5)
    })

    it('should dispatch zoom on two hand pinch hold', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.TwoHandPinch, GesturePhase.Hold, 'right', { handDistance: 0.8 }),
        graphCtx
      )
      expect(action.type).toBe('zoom')
      expect(action.params.delta).toBe(0.8)
    })

    it('should dispatch noop for fist gesture', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Fist, GesturePhase.Onset),
        graphCtx
      )
      expect(action.type).toBe('noop')
    })

    it('should dispatch navigate for point gesture in graph mode', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Point, GesturePhase.Hold),
        graphCtx
      )
      expect(action.type).toBe('navigate')
    })
  })

  describe('Manifold View', () => {
    it('should dispatch select on pinch onset', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Pinch, GesturePhase.Onset),
        manifoldCtx
      )
      expect(action.type).toBe('select')
    })

    it('should dispatch navigate on point hold', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Point, GesturePhase.Hold),
        manifoldCtx
      )
      expect(action.type).toBe('navigate')
    })

    it('should dispatch deselect on open palm', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.OpenPalm, GesturePhase.Onset),
        manifoldCtx
      )
      expect(action.type).toBe('deselect')
    })

    it('should dispatch pan on flat drag', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.FlatDrag, GesturePhase.Hold),
        manifoldCtx
      )
      expect(action.type).toBe('pan')
    })

    it('should dispatch zoom on two hand pinch', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.TwoHandPinch, GesturePhase.Hold),
        manifoldCtx
      )
      expect(action.type).toBe('zoom')
    })

    it('should dispatch rotate on twist hold', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Twist, GesturePhase.Hold, 'right', { rotation: 15 }),
        manifoldCtx
      )
      expect(action.type).toBe('rotate')
    })
  })

  describe('Split View', () => {
    const splitCtx: DispatchContext = {
      viewMode: 'split',
      selectedNodeId: null,
      selectedClusterId: null
    }

    it('should route left hand to graph actions', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Pinch, GesturePhase.Onset, 'left'),
        splitCtx
      )
      expect(action.type).toBe('select')
    })

    it('should route right hand to manifold actions', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Point, GesturePhase.Hold, 'right'),
        splitCtx
      )
      expect(action.type).toBe('navigate')
    })
  })

  describe('Default rotation params', () => {
    it('should default angle to 0 when no data', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.Twist, GesturePhase.Hold),
        graphCtx
      )
      expect(action.params.angle).toBe(0)
    })

    it('should default distance to 0 when no data', () => {
      const action = dispatchGesture(
        makeGesture(GestureType.TwoHandPinch, GesturePhase.Hold),
        graphCtx
      )
      expect(action.params.delta).toBe(0)
    })
  })
})

describe('AppStore', () => {
  beforeEach(() => {
    const { setState } = useAppStore
    setState({
      viewMode: 'graph',
      selectedNodeId: null,
      hoveredNodeId: null,
      selectedClusterId: null,
      graphData: null,
      embeddingData: null,
      activeGesture: null,
      lastGestureType: null,
      trackingEnabled: true,
      calibrated: false,
      error: null,
      toasts: [],
      activeModal: null
    })
  })

  it('should have default view mode', () => {
    expect(useAppStore.getState().viewMode).toBe('graph')
  })

  it('should switch view mode', () => {
    useAppStore.getState().setViewMode('manifold')
    expect(useAppStore.getState().viewMode).toBe('manifold')
  })

  it('should select and deselect nodes', () => {
    useAppStore.getState().selectNode('n1')
    expect(useAppStore.getState().selectedNodeId).toBe('n1')
    useAppStore.getState().selectNode(null)
    expect(useAppStore.getState().selectedNodeId).toBeNull()
  })

  it('should hover nodes', () => {
    useAppStore.getState().hoverNode('n2')
    expect(useAppStore.getState().hoveredNodeId).toBe('n2')
    useAppStore.getState().hoverNode(null)
    expect(useAppStore.getState().hoveredNodeId).toBeNull()
  })

  it('should select clusters', () => {
    useAppStore.getState().selectCluster(3)
    expect(useAppStore.getState().selectedClusterId).toBe(3)
  })

  it('should set graph data and switch to graph view', () => {
    useAppStore.getState().setViewMode('manifold')
    useAppStore.getState().setGraphData({
      nodes: [{ id: 'a' }],
      edges: []
    })
    expect(useAppStore.getState().graphData).not.toBeNull()
    expect(useAppStore.getState().viewMode).toBe('graph')
  })

  it('should set embedding data and switch to manifold view', () => {
    useAppStore.getState().setEmbeddingData({
      points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }]
    })
    expect(useAppStore.getState().embeddingData).not.toBeNull()
    expect(useAppStore.getState().viewMode).toBe('manifold')
  })

  it('should set active gesture and track last type', () => {
    const gesture: GestureEvent = {
      type: GestureType.Pinch,
      phase: GesturePhase.Onset,
      hand: 'right',
      confidence: 0.9,
      position: { x: 0, y: 0, z: 0 },
      timestamp: Date.now()
    }
    useAppStore.getState().setActiveGesture(gesture)
    expect(useAppStore.getState().activeGesture).toBe(gesture)
    expect(useAppStore.getState().lastGestureType).toBe(GestureType.Pinch)
  })

  it('should clear active gesture and keep last type as null', () => {
    useAppStore.getState().setActiveGesture(null)
    expect(useAppStore.getState().activeGesture).toBeNull()
    expect(useAppStore.getState().lastGestureType).toBeNull()
  })

  it('should toggle tracking enabled', () => {
    useAppStore.getState().setTrackingEnabled(false)
    expect(useAppStore.getState().trackingEnabled).toBe(false)
  })

  it('should update config partially', () => {
    useAppStore.getState().updateConfig({
      tracking: { enabled: false, smoothingFactor: 0.5, minConfidence: 0.8 }
    })
    expect(useAppStore.getState().config.tracking.enabled).toBe(false)
    // Other config sections should remain
    expect(useAppStore.getState().config.bus.port).toBe(9876)
  })

  it('should set calibration state', () => {
    useAppStore.getState().setCalibrated(true)
    expect(useAppStore.getState().calibrated).toBe(true)
  })

  it('should set error', () => {
    useAppStore.getState().setError('Something broke')
    expect(useAppStore.getState().error).toBe('Something broke')
    useAppStore.getState().setError(null)
    expect(useAppStore.getState().error).toBeNull()
  })
})

describe('UI Labels', () => {
  it('ViewSwitcher should use full word labels', () => {
    expect(VIEW_MODE_LABELS.graph).toBe('Graph')
    expect(VIEW_MODE_LABELS.manifold).toBe('Embeddings')
    expect(VIEW_MODE_LABELS.split).toBe('Split')
  })
})

describe('Accessibility', () => {
  it('should use accessible color contrast (#999 not #888 for secondary text)', () => {
    // This tests the A11Y_COLORS constant
    expect(A11Y_COLORS.textSecondary).toBe('#999')
  })

  it('should provide status indicators beyond color', () => {
    expect(getTrackingStatusIndicator(true)).toBe('\u25CF')
    expect(getTrackingStatusIndicator(false)).toBe('\u25CB')
  })
})

describe('Selection Info', () => {
  it('getSelectedNodeInfo should return node with metadata and neighbors', () => {
    const graph: GraphData = {
      nodes: [
        { id: 'a', label: 'Node A', metadata: { type: 'concept' } },
        { id: 'b', label: 'Node B' },
        { id: 'c', label: 'Node C' }
      ],
      edges: [
        { source: 'a', target: 'b', weight: 0.8 },
        { source: 'a', target: 'c', weight: 0.5 }
      ]
    }
    const info = getSelectedNodeInfo('a', graph)
    expect(info).not.toBeNull()
    expect(info!.label).toBe('Node A')
    expect(info!.neighborCount).toBe(2)
    expect(info!.edges).toHaveLength(2)
    expect(info!.metadata).toEqual({ type: 'concept' })
  })

  it('getSelectedPointInfo should return point with cluster info', () => {
    const embeddings: EmbeddingData = {
      points: [
        { id: 'p1', position: { x: 1, y: 2, z: 3 }, clusterId: 0, label: 'Point 1', metadata: { score: 0.95 } }
      ],
      clusters: [{ id: 0, label: 'Cluster A', color: '#ff0000' }]
    }
    const info = getSelectedPointInfo('p1', embeddings)
    expect(info).not.toBeNull()
    expect(info!.label).toBe('Point 1')
    expect(info!.clusterLabel).toBe('Cluster A')
    expect(info!.position).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('should return null for non-existent node', () => {
    const graph: GraphData = { nodes: [{ id: 'a' }], edges: [] }
    expect(getSelectedNodeInfo('z', graph)).toBeNull()
  })
})

describe('Toast System', () => {
  beforeEach(() => {
    useAppStore.setState({
      toasts: [],
      error: null
    })
  })

  it('should add toast to queue', () => {
    const store = useAppStore.getState()
    store.addToast('Test error', 'error')
    expect(useAppStore.getState().toasts).toHaveLength(1)
    expect(useAppStore.getState().toasts[0].message).toBe('Test error')
    expect(useAppStore.getState().toasts[0].severity).toBe('error')
  })

  it('should limit queue to 3 toasts', () => {
    const store = useAppStore.getState()
    store.addToast('Error 1', 'error')
    store.addToast('Error 2', 'error')
    store.addToast('Error 3', 'error')
    store.addToast('Error 4', 'error') // should evict oldest
    const toasts = useAppStore.getState().toasts
    expect(toasts).toHaveLength(3)
    expect(toasts[0].message).toBe('Error 2') // oldest evicted
  })

  it('should remove toast by id', () => {
    const store = useAppStore.getState()
    store.addToast('To remove', 'info')
    const toast = useAppStore.getState().toasts[0]
    store.removeToast(toast.id)
    expect(useAppStore.getState().toasts).toHaveLength(0)
  })

  it('should default severity to error and dismissMs to 8000', () => {
    const store = useAppStore.getState()
    store.addToast('Default severity')
    const toast = useAppStore.getState().toasts[0]
    expect(toast.severity).toBe('error')
    expect(toast.dismissMs).toBe(8000)
  })

  it('should use shorter dismiss for success toasts', () => {
    const store = useAppStore.getState()
    store.addToast('Loaded!', 'success', 4000)
    expect(useAppStore.getState().toasts[0].dismissMs).toBe(4000)
  })
})

describe('Modal Management', () => {
  beforeEach(() => {
    useAppStore.setState({
      activeModal: null
    })
  })

  it('should track active modal in store', () => {
    const store = useAppStore.getState()
    store.setActiveModal('dataLoader')
    expect(useAppStore.getState().activeModal).toBe('dataLoader')
  })

  it('should close modal when setting to null', () => {
    const store = useAppStore.getState()
    store.setActiveModal('settings')
    store.setActiveModal(null)
    expect(useAppStore.getState().activeModal).toBeNull()
  })

  it('should enforce mutual exclusion (opening one closes others)', () => {
    const store = useAppStore.getState()
    store.setActiveModal('settings')
    store.setActiveModal('dataLoader')
    expect(useAppStore.getState().activeModal).toBe('dataLoader')
  })
})

describe('Store Splitting', () => {
  beforeEach(() => {
    useVisualStore.setState({
      viewMode: 'graph',
      selectedNodeId: null,
      hoveredNodeId: null,
      selectedClusterId: null
    })
    useDataStore.setState({
      graphData: null,
      embeddingData: null
    })
    useGestureStore.setState({
      activeGesture: null,
      lastGestureType: null,
      trackingEnabled: true
    })
    useUIStore.setState({
      error: null,
      toasts: [],
      activeModal: null
    })
  })

  it('useVisualStore should manage selection independently', () => {
    useVisualStore.getState().selectNode('node-1')
    expect(useVisualStore.getState().selectedNodeId).toBe('node-1')

    useVisualStore.getState().hoverNode('node-2')
    expect(useVisualStore.getState().hoveredNodeId).toBe('node-2')

    useVisualStore.getState().selectCluster(5)
    expect(useVisualStore.getState().selectedClusterId).toBe(5)

    useVisualStore.getState().setViewMode('manifold')
    expect(useVisualStore.getState().viewMode).toBe('manifold')

    // Other stores should be unaffected
    expect(useDataStore.getState().graphData).toBeNull()
    expect(useGestureStore.getState().activeGesture).toBeNull()
  })

  it('useDataStore should manage graph/embedding data independently', () => {
    const graphData = { nodes: [{ id: 'a' }], edges: [] }
    useDataStore.getState().setGraphData(graphData)
    expect(useDataStore.getState().graphData).toEqual(graphData)

    const embeddingData = { points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }] }
    useDataStore.getState().setEmbeddingData(embeddingData)
    expect(useDataStore.getState().embeddingData).toEqual(embeddingData)

    // Other stores should be unaffected
    expect(useVisualStore.getState().selectedNodeId).toBeNull()
  })

  it('useGestureStore should manage gesture state independently', () => {
    const gesture: GestureEvent = {
      type: GestureType.Pinch,
      phase: GesturePhase.Onset,
      hand: 'right',
      confidence: 0.9,
      position: { x: 0, y: 0, z: 0 },
      timestamp: Date.now()
    }
    useGestureStore.getState().setActiveGesture(gesture)
    expect(useGestureStore.getState().activeGesture).toBe(gesture)
    expect(useGestureStore.getState().lastGestureType).toBe(GestureType.Pinch)

    useGestureStore.getState().setTrackingEnabled(false)
    expect(useGestureStore.getState().trackingEnabled).toBe(false)

    // Other stores should be unaffected
    expect(useVisualStore.getState().selectedNodeId).toBeNull()
    expect(useDataStore.getState().graphData).toBeNull()
  })

  it('useUIStore should manage toasts independently', () => {
    useUIStore.getState().addToast('Test message', 'info')
    expect(useUIStore.getState().toasts).toHaveLength(1)
    expect(useUIStore.getState().toasts[0].message).toBe('Test message')

    useUIStore.getState().setError('An error')
    expect(useUIStore.getState().error).toBe('An error')

    useUIStore.getState().setActiveModal('settings')
    expect(useUIStore.getState().activeModal).toBe('settings')

    // Other stores should be unaffected
    expect(useVisualStore.getState().selectedNodeId).toBeNull()
  })

  it('useAppStore facade should combine all stores', () => {
    // Set state through individual stores
    useVisualStore.getState().selectNode('n1')
    useGestureStore.getState().setTrackingEnabled(false)
    useUIStore.getState().setError('err')

    // Read through facade (static getState, not hook)
    const combined = useAppStore.getState()
    expect(combined.selectedNodeId).toBe('n1')
    expect(combined.trackingEnabled).toBe(false)
    expect(combined.error).toBe('err')
  })

  it('useAppStore facade setGraphData should also set viewMode to graph', () => {
    useVisualStore.getState().setViewMode('manifold')
    const facade = useAppStore.getState()
    facade.setGraphData({ nodes: [{ id: 'x' }], edges: [] })

    expect(useDataStore.getState().graphData).not.toBeNull()
    expect(useVisualStore.getState().viewMode).toBe('graph')
  })

  it('useAppStore facade setEmbeddingData should also set viewMode to manifold', () => {
    useVisualStore.getState().setViewMode('graph')
    const facade = useAppStore.getState()
    facade.setEmbeddingData({ points: [{ id: 'p1', position: { x: 0, y: 0, z: 0 } }] })

    expect(useDataStore.getState().embeddingData).not.toBeNull()
    expect(useVisualStore.getState().viewMode).toBe('manifold')
  })
})
