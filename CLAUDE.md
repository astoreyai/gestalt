# Gestalt — Hand-Tracked 3D Knowledge Graph & Latent Space Explorer

## Project Overview

Electron desktop app for navigating 3D knowledge graphs and embedding manifolds using real-time hand gestures from a webcam. Built with MediaPipe, React Three Fiber, and Zustand.

- **Stack**: Electron 28 + electron-vite 5, React 18, Three.js/R3F, MediaPipe HandLandmarker, Zustand, Zod, d3-force-3d
- **Platform**: Linux (X11/Wayland), requires `$DISPLAY` set
- **GitHub**: astoreyai/gestalt
- **AppImage**: 71MB (deps bundled, esbuild minification, maximum ASAR compression)

## Commands

```bash
npm run dev              # Launch dev mode (electron-vite dev)
npm run build            # Production build
npm run test             # Run vitest (1461 tests, 80 files)
npm run test:watch       # Vitest watch mode
npm run typecheck        # tsc --noEmit
npm run lint             # ESLint 9 (flat config)
npm run native:build     # Compile uinput N-API addon
npm run package:appimage # Build AppImage (~71MB)
npm run package:deb      # Build .deb package
npm run demo             # Run CLI demo
npm run demo:bus         # Run bus connector demo
```

## Architecture

```
src/
├── main/                    # Electron main process
│   ├── index.ts             # IPC handlers, window creation (transparent, frameless)
│   ├── overlay.ts           # OverlayManager — transparent always-on-top mode
│   ├── security.ts          # Path validation (isAllowedPath)
│   ├── bus/                 # WebSocket connector bus (port 9876)
│   ├── connectors/          # SDK connectors
│   ├── input/               # Native input (uinput mouse/keyboard), overlay gesture routing
│   └── persistence/         # JSON file persistence for profiles/config
├── preload/
│   └── index.ts             # contextBridge API (IPC channels)
├── renderer/
│   ├── App.tsx              # Root component — canvas, modals, gesture dispatch
│   ├── components/          # HUD, ToastQueue, ModalContainer, SelectionPanel, HandChordOverlay
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

- **Store**: `src/renderer/controller/store.ts` — 5 slices: Visual, Data, Gesture, Config, UI; debounced IPC persist for config
- **Dispatcher**: `src/renderer/controller/dispatcher.ts` — Gesture → SceneAction mapping with O(1) combo Map, confidence gating
- **OverlayManager**: `src/main/overlay.ts` — Transparent always-on-top overlay, per-display bounds, global hotkey (Super+G), click-through with forwarding
- **Classifier**: `src/renderer/gestures/classifier.ts` — Hybrid angle+distance fingerCurl with orientation-adaptive weights, thumb opposition measurement, pinch approach-vector gating, `computePalmFacing()`, `computeHandFlatness()`, pre-allocated curls buffer. Priority: Fist → Pinch → L-Shape → Point → FlatDrag → OpenPalm
- **GestureEngine**: `src/renderer/gestures/state.ts` — Pre-allocated 2D state machine grid [2 hands × 10 types], O(1) lookup, cached effectiveConfig, pooled Maps
- **HandTracker**: `src/renderer/tracker/HandTracker.ts` — MediaPipe wrapper, GPU delegate, 60fps camera, One-Euro smoothing
- **StereoFuser**: `src/renderer/tracker/stereo-fuser.ts` — Dual-camera triangulation for improved z-depth
- **Force Layout**: `src/renderer/graph/force-layout.ts` — Synchronous d3-force-3d (Worker had reliability issues)
- **Nodes/Edges**: `src/renderer/graph/Nodes.tsx`, `Edges.tsx` — InstancedMesh/LineSegments with dirty-flag GPU upload guards
- **Protocol**: `src/shared/protocol.ts` — All type definitions, GestureType/GesturePhase enums, DEFAULT_CONFIG

## Build & Packaging

The main process bundles `zod`, `ws`, `d3-force-3d`, and `electron-updater` directly (via `externalizeDepsPlugin({ exclude: [...] })`). Only `electron` is externalized. This eliminates node_modules from the AppImage.

- **Minification**: esbuild (20-30x faster than terser)
- **Tree shaking**: `moduleSideEffects: false`, `propertyReadSideEffects: false`
- **Code splitting**: Manual chunks — `three-core` (646KB), `r3f` (267KB), `react-vendor` (143KB), app code (182KB)
- **Production stripping**: `console` and `debugger` calls dropped via esbuild
- **ASAR compression**: `"maximum"` (LZMA)
- `ws` optional native deps (`bufferutil`, `utf-8-validate`) are marked external in rollupOptions — ws works without them
- `electronLanguages: ["en-US"]` strips all non-English Chromium locales
- Source maps excluded from packaged builds (`!**/*.map`)
- Native `.node` addon is asar-unpacked for dlopen compatibility

## Performance

- **Gesture throughput**: ~778K frames/sec (25,930x headroom at 30fps input)
- **Pipeline optimizations**: Cached effectiveConfig, squared-distance comparisons, pre-allocated buffers, INV_PI constants, palm-scaled thresholds
- **Tracking accuracy**: Per-joint One-Euro filter tuning (4 tiers: anchor/MCP/PIP/TIP), z-axis median pre-filter, orientation-adaptive curl blend weights, thumb opposition measurement, pinch approach-vector gating
- **Rendering optimizations**: Dirty-flag GPU uploads (Nodes/Edges skip when unchanged), ForceGraph setPositions throttled to ~30fps, LOD geometry swap, InstancedMesh batching
- **GC pressure**: Object pooling for hand centers, pinch results, reusable Maps; module-level pre-allocated vectors
- **State management**: 5 Zustand slices prevent full-tree re-renders; debounced IPC config persistence (300ms batching)
- **Bundle sizes**: Main 370KB, renderer 1.4MB (code-split into 4 chunks)

## Overlay Mode

Transparent always-on-top overlay mode for OS-level gesture control. Toggle via Super+G hotkey, HUD button, or tray icon.

- **Window**: `transparent: true`, `frame: false` at creation (Linux requires this at init time)
- **OverlayManager** (`src/main/overlay.ts`): Saves/restores window bounds, uses current display's workArea (not multi-monitor spanning — avoids white-screen artifacts on heterogeneous setups)
- **Click-through**: `setIgnoreMouseEvents(true, { forward: true })` — CSS pointer events still forward to the renderer for gesture overlay display
- **Gesture routing**: In overlay mode, gestures route to `input/ipc.ts` for native mouse/keyboard via uinput. Point→cursor, Pinch→click, Fist→right-click, FlatDrag→scroll
- **HUD in overlay**: Shows minimal "Overlay Mode" indicator. Normal mode HUD has dedicated drag spacer (not full-bar drag) to avoid eating Canvas mouse events
- **Custom window controls**: Minimize/maximize/close buttons in HUD (frameless window)

## Known Issues & Quirks

1. **Force layout → blob**: The Web Worker force layout silently fails. Current implementation uses synchronous rAF-based simulation. Graph may still render as a clump if positions aren't spreading — check `force-layout.ts` charge/link strengths.
2. **Fist misclassified as Pinch**: A closed fist brings thumb tip near index tip. Fist MUST be checked before Pinch in classifier priority.
3. **Thumb curl underreported**: MediaPipe reports thumb curl ~0.12 even when fully curled. Thumb threshold for fist scales with palm size (base 0.08).
4. **MediaPipe z-depth unreliable**: Curled fingers can report low curl (0.1-0.3). The classifier uses relative comparisons (avgOtherCurl - indexCurl > 0.1) as fallback.
5. **Calibration uses manual capture**: Auto-detection was chicken-and-egg. User holds gesture then presses Space/clicks "Capture".
6. **Settings panel positioning**: Settings renders inside ModalContainer but has its own `position: absolute; right: 0` — these conflict when the modal centers it.
7. **HMR destroys tracker**: The `useHandTracker` hook has a `cancelled` flag to prevent "HandTracker destroyed" errors during Vite HMR.
8. **Overlay single-display only**: Overlay uses current display's workArea rather than spanning all monitors. Multi-monitor spanning caused white-screen artifacts on heterogeneous setups.

## Gesture Timing Defaults

```
minOnsetFrames: 2       (consecutive matching frames)
minHoldDuration: 80ms   (before action fires)
cooldownDuration: 80ms  (after release before re-trigger)
```

Total latency: ~143ms (camera 16ms + MediaPipe ~15ms + onset 32ms + hold 80ms).
Adjustable via Settings > Gestures > Responsiveness slider.

## Testing

- 1461 tests, 80 test files, all passing
- Test framework: Vitest 3 with happy-dom
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
