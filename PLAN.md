# Development Plan: Hand-Tracked 3D Knowledge Graph Explorer

> **Status: COMPLETE** -- All phases implemented. 1040 tests passing at 90%+ coverage.

## 1. Architectural Overview
The system follows a unified TypeScript/Electron architecture with three layers:
1.  **Sensing & Tracking (Renderer Process):** Uses the MediaPipe HandLandmarker WASM bundle running in the Electron renderer process. Gesture classification is rule-based (geometric analysis) with an optional KNN classifier trained on per-user calibration data.
2.  **Interaction Middleware (Main Process):** Maps detected hand landmarks and gestures to OS-level cursor/keyboard events via a native N-API addon wrapping Linux uinput, plus application-specific 3D scene transformations dispatched through Zustand stores.
3.  **Visualization Engine (Renderer Process):** React Three Fiber (Three.js) renders 3D force-directed graphs and latent-space manifold point clouds. Uses instanced rendering and LOD for performance.

## 2. Implementation Phases

### Phase 1: Hand Tracking & Gesture Recognition (Weeks 1-2)
- [x] Implement single-camera hand landmark detection using MediaPipe HandLandmarker WASM in the Electron renderer.
- [x] Build a rule-based gesture classifier (Pinch, Twist, Open Palm, Point, Fist, L-Shape, Flat Drag) using geometric analysis of the 21-landmark hand model.
- [x] Implement a gesture state machine with onset/hold/release/cooldown lifecycle and debouncing.
- [x] Add a KNN classifier option trained on per-user calibration samples for improved accuracy.
- [x] **Validation:** Benchmarked at >700K classifications/sec, well within the 30 FPS budget.

### Phase 2: Interaction Module & Cursor Control (Weeks 3-4)
- [x] Build a native N-API addon wrapping Linux uinput for virtual mouse and keyboard control.
- [x] Implement "Point" (cursor move), "Pinch" (click/drag), "Flat Drag" (pan), and "Fist" (cancel) mouse mappings.
- [x] Implement a One-Euro filter for landmark smoothing to reduce cursor jitter.
- [x] Add a configurable macro engine mapping gestures to keyboard combos via JSON keymap files.
- [x] **Validation:** End-to-end latency measured at <0.01ms (pipeline only), well under the 50ms target.

### Phase 3: 3D Visualization & Data Ingestion (Weeks 5-6)
- [x] Build the visualization with React Three Fiber, instanced mesh rendering, and PBR lighting.
- [x] Build parsers for `GraphML` and `JSON` with Zod schema validation.
- [x] Implement point cloud rendering with spatial indexing for O(log n) hover queries.
- [x] Develop the Level of Detail (LOD) system for handling large node counts.

### Phase 4: Integration & UX Refinement (Weeks 7-8)
- [x] Build a WebSocket connector bus in the main process for external program integration (with token authentication and rate limiting).
- [x] Implement the user-guided calibration wizard and gesture overlay UI.
- [x] Build a connector SDK (TypeScript) and document the protocol for Python/Node.js clients.
- [x] **Validation:** Full test suite (1040 tests) covering classifiers, state machines, bus protocol, persistence, and rendering logic.

### Phase 5: Polish & Documentation (Week 9)
- [x] Add URL import for loading graph/manifold data from remote sources.
- [x] Integrate electron-updater for automatic update checks and installation.
- [x] Implement one-handed mode for accessibility (all actions mapped to single-hand gestures).
- [x] Add light, dark, and system-following theme modes.
- [x] Build automated live test suite for end-to-end validation.
- [x] Resolve 61+ audit findings across security, performance, architecture, and test coverage.
- [x] **Validation:** 1040 tests passing, 90%+ coverage across statements, branches, functions, and lines.

## 3. Technical Decisions
- **All TypeScript:** The entire application is TypeScript running in Electron -- no Python dependency. Hand tracking runs in the renderer via MediaPipe WASM, input control uses a native N-API addon for uinput.
- **Communication:** WebSocket bus server in the main process enables external programs to receive gesture events and send data. Token authentication is required by default.
- **State Management:** Zustand with domain-specific store slices (visual, data, gesture, config, UI) to minimize re-renders. A combined `useAppStore` facade preserves backward compatibility.

## 4. Risks & Mitigations
- **Lighting/Reflection Sensitivity:** Mitigated by the environmental constraints defined in the PRD and MediaPipe's built-in robustness to lighting variation.
- **Performance Bottlenecks:** Addressed by running gesture classification in the renderer (same process as tracking), using instanced rendering for large graphs, and offloading force layout to a Web Worker.
- **Jitter in Cursor Control:** Mitigated by the One-Euro filter with configurable smoothing parameters and per-user calibration profiles.
