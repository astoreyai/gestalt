# Gestalt — Hand-Tracked 3D Knowledge Graph & Latent Space Explorer

## Project Overview

Electron desktop app for navigating 3D knowledge graphs and embedding manifolds using real-time hand gestures from a webcam. Built with MediaPipe, React Three Fiber, and Zustand.

- **Stack**: Electron + electron-vite, React 18, Three.js/R3F, MediaPipe HandLandmarker, Zustand, Zod, d3-force-3d
- **Platform**: Linux (X11/Wayland), requires `$DISPLAY` set
- **GitHub**: astoreyai/tracking

## Commands

```bash
npm run dev              # Launch dev mode (electron-vite dev)
npm run build            # Production build
npm run test             # Run vitest (1041 tests, 34 files)
npm run test:watch       # Vitest watch mode
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint
npm run native:build     # Compile uinput N-API addon
npm run demo             # Run CLI demo
npm run demo:bus         # Run bus connector demo
```

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # IPC handlers, window creation
│   ├── security.ts          # Path validation (isAllowedPath)
│   ├── bus/                 # WebSocket connector bus (port 9876)
│   ├── connectors/          # SDK connectors
│   ├── input/               # Native input (uinput mouse/keyboard)
│   └── persistence/         # JSON file persistence for profiles/config
├── preload/
│   └── index.ts             # contextBridge API (IPC channels)
├── renderer/
│   ├── App.tsx              # Root component — canvas, modals, gesture dispatch
│   ├── components/          # HUD, ToastQueue, ModalContainer, SelectionPanel
│   ├── controller/          # Store (5 Zustand slices), Calibration, GestureOverlay, dispatcher
│   ├── data/                # DataLoader, RemoteLoader, validators
│   ├── gestures/            # Classifier (hybrid curl), state machine, engine, mappings
│   ├── graph/               # ForceGraph, Nodes (instanced), Edges, LOD, force-layout
│   ├── hooks/               # useHandTracker
│   ├── manifold/            # PointCloud, Clusters, HoverCard, navigation
│   ├── settings/            # Settings panel (6 tabs + calibration button)
│   └── tracker/             # HandTracker class, normalize, filters (One-Euro), StereoFuser
├── shared/
│   ├── protocol.ts          # All shared types, enums, config defaults
│   └── ipc-channels.ts      # IPC channel constants
└── workers/                 # Web Workers (force layout, tracking)
```

## Key Files

- **Store**: `src/renderer/controller/store.ts` — 5 slices: Visual, Data, Gesture, Config, UI
- **Dispatcher**: `src/renderer/controller/dispatcher.ts` — Gesture → SceneAction mapping (wired into App.tsx)
- **Classifier**: `src/renderer/gestures/classifier.ts` — Hybrid angle+distance fingerCurl, priority: Fist → Pinch → L-Shape → Point → FlatDrag → OpenPalm
- **GestureEngine**: `src/renderer/gestures/state.ts` — Pre-allocated 2D state machine grid [2 hands × 10 types], O(1) lookup
- **TwoHandCoordinator**: `src/renderer/gestures/two-hand-coordinator.ts` — Combo matrix (both-pinch → scale, both-twist → rotate, etc.)
- **HandTracker**: `src/renderer/tracker/HandTracker.ts` — MediaPipe wrapper, GPU delegate, 60fps camera, One-Euro smoothing
- **StereoFuser**: `src/renderer/tracker/stereo-fuser.ts` — Dual-camera triangulation for improved z-depth
- **Force Layout**: `src/renderer/graph/force-layout.ts` — Synchronous d3-force-3d (Worker had reliability issues)
- **Protocol**: `src/shared/protocol.ts` — All type definitions, GestureType/GesturePhase enums, DEFAULT_CONFIG

## Screenshots

Screenshots are saved to `screenshots/` in the project root (KDE Spectacle default for this project).
Best screenshots copied to `docs/images/` for README.

## Known Issues & Quirks

1. **Force layout → blob**: The Web Worker force layout silently fails. Current implementation uses synchronous rAF-based simulation. Graph may still render as a clump if positions aren't spreading — check `force-layout.ts` charge/link strengths.
2. **Fist misclassified as Pinch**: A closed fist brings thumb tip near index tip. Fist MUST be checked before Pinch in classifier priority.
3. **Thumb curl underreported**: MediaPipe reports thumb curl ~0.12 even when fully curled. Thumb threshold for fist is 0.08 (not the normal curlThreshold).
4. **MediaPipe z-depth unreliable**: Curled fingers can report low curl (0.1-0.3). The classifier uses relative comparisons (avgOtherCurl - indexCurl > 0.1) as fallback.
5. **Calibration uses manual capture**: Auto-detection was chicken-and-egg. User holds gesture then presses Space/clicks "Capture".
6. **Settings panel positioning**: Settings renders inside ModalContainer but has its own `position: absolute; right: 0` — these conflict when the modal centers it.
7. **HMR destroys tracker**: The `useHandTracker` hook has a `cancelled` flag to prevent "HandTracker destroyed" errors during Vite HMR.

## Gesture Timing Defaults

```
minOnsetFrames: 2       (consecutive matching frames)
minHoldDuration: 80ms   (before action fires)
cooldownDuration: 120ms (after release before re-trigger)
```

Total latency: ~143ms (camera 16ms + MediaPipe ~15ms + onset 32ms + hold 80ms).
Adjustable via Settings > Gestures > Responsiveness slider.

## Testing

- 1041 tests, 34 test files, all passing
- Test framework: Vitest with happy-dom
- Synthetic hand data in `src/renderer/gestures/__tests__/classifier.test.ts` — fingers must be spread far enough that thumb tip and index tip distance > pinchThreshold (0.10)
- GestureEngine tests use `{ minOnsetFrames: 1, minHoldDuration: 0 }` to avoid timing sensitivity

## Content Security Policy

The renderer CSP in `src/renderer/index.html` must include:
- `'wasm-unsafe-eval'` in script-src (MediaPipe WASM compilation)
- `https://cdn.jsdelivr.net/npm/@mediapipe/` in script-src and connect-src
- `https://storage.googleapis.com/mediapipe-models/` in connect-src

## IPC Channels

Defined in `src/shared/ipc-channels.ts`. All use `ipcMain.handle` / `ipcRenderer.invoke` pattern with Zod validation in `src/main/__tests__/ipc-validators.test.ts`.

## Data Formats

- **Graph**: `{ nodes: GraphNode[], edges: GraphEdge[] }` — nodes have id, label, position, color, size
- **Embeddings**: `{ points: EmbeddingPoint[], clusters?: Cluster[] }` — points have id, position (x,y,z), cluster
- **Samples**: `assets/samples/small-graph.json` (20 nodes), `assets/samples/embeddings-5k.json` (5K points)
