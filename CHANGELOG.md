# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-20

Initial release of the hand-tracked 3D knowledge graph and latent space explorer.

### Added

- Real-time hand tracking via MediaPipe Hand Landmarker (21 landmarks, 30+ FPS)
- 8 gesture types: pinch, point, open palm, twist, two-hand pinch, flat drag, fist, L-shape
- Gesture state machine with onset/hold/release phases and configurable cooldown
- KNN classifier for per-user calibrated gesture profiles
- 3D knowledge graph visualization with d3-force-3d layout, instanced rendering, LOD, and PBR lighting
- Latent space manifold point cloud with cluster visualization and hover cards
- OS-level cursor and keyboard control via native N-API uinput addon (Linux)
- WebSocket connector bus (ws://127.0.0.1:9876) with token auth, rate limiting, and capability filtering
- Node.js connector SDK and protocol documentation
- Calibration wizard UI for recording gesture training samples
- Configurable keymaps (JSON) mapping gestures to keyboard shortcuts, mouse actions, or program commands
- Dual data format support: JSON and GraphML graphs, JSON embedding manifolds
- Split view mode (graph, manifold, or side-by-side)
- URL import for loading graph/manifold data from remote sources
- Automatic update checks and installation via electron-updater
- One-handed mode for accessibility (all actions mapped to single-hand gestures)
- Light, dark, and system-following theme modes
- Settings panel with tracking, gesture, input, bus, and visualization configuration
- Toast notification queue and modal dialog system
- HUD overlay with live gesture feedback
- Gesture overlay showing recognized gesture type and phase
- Selection panel with node/point details
- System tray integration
- Atomic JSON persistence with backup rotation
- Web Workers for force-directed layout computation
- Spatial index for O(log n) nearest-neighbor hover queries
- One-Euro filter for landmark smoothing
- Sample data files (small-graph.json, embeddings-5k.json)
- Demo scripts for gesture recognition and WebSocket bus protocol
- AppImage and .deb packaging via electron-builder

### Security

- Token-based WebSocket authentication (crypto.randomBytes)
- Rate limiting on bus connections (100 msg/s)
- 64 KB payload limit on WebSocket messages
- IPC message validation with Zod schemas
- Input sanitization for all user-provided data
- Local-only webcam processing (no cloud video transmission)
- CSP headers configured for Electron renderer

### Testing

- 1040 passing tests at 90%+ coverage
- Unit tests for gesture classifier, state machine, feature extraction, KNN classifier
- Integration tests for bus protocol, persistence, IPC handlers, and input pipeline
- Component tests for React UI with Testing Library and happy-dom
- Automated live test suite for end-to-end validation
