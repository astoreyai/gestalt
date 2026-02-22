# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.5.0] - 2026-02-22

### Added

- **Adversarial audit v3 remediation** — 7-sprint deep-dive addressing ~195 findings across all modules
- **Force layout convergence**: MAX_ITERATIONS (300) cap + stall detection (alpha change < 0.001 for 5 ticks) prevents infinite loops
- **Edges dirty-flag optimization**: positionVersion integer counter replaces Map reference identity (which always failed)
- **Position validation**: `z.number().finite()` rejects NaN/Infinity in graph/embedding positions (prevents Three.js crashes)
- **Duplicate node ID detection**: `superRefine()` on graph schema catches and reports duplicates
- **Expanded overlay gestures**: L-Shape→middle-click, Twist→scroll, OpenPalm→cancel, TwoHandPinch→Ctrl+scroll zoom
- **Double-init guard**: Mouse/keyboard native addon prevents FD leak on re-initialization
- **Cursor sync on overlay enter**: Queries actual cursor position via `screen.getCursorScreenPoint()` to avoid first-frame jump
- **Stub mode feedback**: IPC notification to renderer when native addon fails (shows "Native input unavailable" banner)
- **Bus hardening**: Global rate limit (5000 msg/s), max connections (50), capabilities bound (100 per client)
- **TOCTOU fix**: `fs.realpath()` in SAMPLE_LOAD/FILE_LOAD prevents symlink race between path check and file read
- **Persistence atomic writes**: Unique temp paths (`pid.timestamp.tmp`) prevent concurrent write corruption
- **uinput FD leak fix**: Native C++ closes existing fd before re-init in CreateMouse/CreateKeyboard
- **Z-index normalization**: Full token scale (base→dropdown→overlay→modal→toast→guide→onboarding)
- **WCAG accessibility**: ARIA labels on all Settings controls, `role="radio"` for themes, `prefers-reduced-motion` in GestureOverlay, `aria-live="polite"` for gesture announcements
- **Settings port validation**: Range 1024-65535, integer-only, inline error with red border
- **Design token adoption**: 6 components migrated from hardcoded values to COLORS/FONT_SIZE/SPACING tokens
- **HandChordOverlay positioning**: Dynamic calc() positioning instead of hardcoded pixel offset
- **5 regression test suites**: Force layout convergence, Edges dirty-flag, security validators, gesture accuracy, overlay integration (62 new tests)

### Fixed

- **Fist/Pinch classifier collision**: Thumb curl threshold lowered to 0.10 (MediaPipe reports ~0.12 for fully curled), pinch exclusion tightened from 1.2× to 1.0×
- **Cooldown re-trigger**: Expired cooldown with gesture still detected transitions directly to Onset (enables rapid repeated gestures)
- **Point confidence**: Palm-relative scaling (`curlDiff / (0.15 * palmScale)`) instead of absolute threshold
- **Settings panel opening on gestures**: `toggle_info` action changed from opening Settings modal to no-op
- **Overlay white screen**: Added useEffect to set `document.body.style.background = 'transparent'` in overlay mode (CSS variable was overriding Electron's transparent background)
- **L-Shape + Fist dispatching**: Added missing cases in graph and manifold dispatchers
- **Two-hand action handlers**: fold, unfold, measure, scale_node, roll now handled in App.tsx

### Removed

- **Dead code**: `mappings.ts` (176 lines), `knn-classifier.ts` (195 lines), and test file (438 lines) — never imported at runtime
- **Dead IPC channels**: TRACKING_STATUS, PROGRAM_COMMAND, BUS_STATUS, BUS_SEND, APP_READY, APP_QUIT

### Testing

- 1461 passing tests across 80 files (up from 1444)
- 7-sprint adversarial audit remediation covering all modules

## [0.4.0] - 2026-02-22

### Added

- **Onboarding overlay**: Step-through first-launch guide (Welcome → Hand Detection → Basic Gestures → Advanced Controls). Persists completion via `onboardingComplete` config flag
- **Contextual gesture badges**: GestureOverlay now shows action-based labels ("Select", "Navigate", "Grab") instead of raw gesture types, adapting to view mode and hover target
- **One-handed mode indicator**: Persistent "1H Mode" badge in HUD status bar with tooltip showing remapped gestures
- **Overlay exit instructions**: Overlay mode chip now shows "Super+G to exit" hint
- **Onset feedback**: Expanding ring animation (0→30px, 200ms) at hand center on gesture onset + 880Hz audio click (gated by `audio.onsetSound` config)
- **Gesture guide icons**: SVG hand pose icons for each gesture in the Gesture Guide overlay
- **Inverse-variance stereo fusion**: Welford's running variance per-landmark; weights stereo vs mono Z by reliability when sufficient samples accumulated, cold-start falls back to disparity-confidence blend
- **Z-normalization**: Palm centroid subtraction before One-Euro filtering reduces correlated z-noise ~2.5x
- **Tremor band-reject filter**: 2nd-order Butterworth notch filter at 8–12Hz (physiological tremor band), applied before One-Euro for users with `tremorCompensation > 0`
- **Partial hand accommodation**: `detectMissingFingers()` identifies occluded digits by confidence threshold; `avgCurlExcluding()` enables fist/palm classification with 3-4 visible fingers
- **Wayland overlay fallback**: `getAlwaysOnTopLevel()` uses `'floating'` on Wayland (more portable than `'screen-saver'`), with documented limitations (no click-through, limited global shortcuts)
- **udev rules**: `assets/99-gestalt-uinput.rules` grants input group access to `/dev/uinput`
- **DEFAULT_CONFIG validation tests**: Verify all config sections present with sensible defaults

### Changed

- **Security allowlist**: Config path updated from `.config/tracking` to `.config/gestalt` (project rename alignment)
- **extraResources path**: Fixed packaged build sample path from `resources/assets/samples/` to `resources/samples/` matching electron-builder config
- **Gesture timing**: `minHoldDuration` 40ms → 80ms (within human reaction time window, reduces false triggers)

### Fixed

- **Thumb opposition model**: Measures distance to palm center (midpoint of index MCP + middle MCP) instead of index fingertip. Eliminates context-dependency where thumb curl changed based on other finger positions
- **Per-finger ROM normalization**: Ring (0.85) and pinky (0.75) report higher normalized curl for same geometric angle, matching anatomical range-of-motion
- **Palm normal chirality**: Cross product winding order flipped for left hands, producing consistent normals
- **DIP filter tier**: 5th One-Euro tier between PIP and TIP for noisiest mid-finger landmarks
- **X/Y outlier rejection**: MedianFilter3 added to x/y channels (was only on z-axis)
- **Quality ring buffer**: Replaced arithmetic mean with insertion-sort median (robust to outliers)
- **Quality-to-confidence sigmoid**: Replaces linear mapping; `1 / (1 + exp(-0.1 * (q - 50)))` prevents mid-range overweighting
- **Frame-rate-independent EMA**: Pinch approach alpha uses tau formulation `alpha = 1 - exp(-dt / tau)` instead of fixed per-frame constant
- **Savitzky-Golay velocity**: 5-point quadratic filter on position deltas before velocity computation, reducing noise amplification
- **Camera-distance-scaled pan**: Pan displacement now proportional to `camera.position.length() * 0.03`
- **Multiplicative zoom**: `position = target + (position - target) / clamp(1 + delta * 0.02, 0.5, 2.0)` feels proportional at all zoom levels
- **PointCloud depth**: `depthWrite={true}`, `sizeAttenuation={true}`, `alphaTest={0.5}` for proper occlusion and depth perception
- **Two-hand system wiring**: TwoHandCoordinator + dispatchTwoHandAction now called from App.tsx gesture pipeline (was dead code)
- **InputIpcHandler + SystemTray**: Now instantiated in main process lifecycle (was dead code)
- **View mode data guards**: Keys 1/2/3 check data availability before switching; show toast on missing data
- **Canvas frameloop**: `frameloop="demand"` saves GPU when idle; invalidates on gesture input
- **Fatigue detection**: FatigueDetector warns at 60s / critical at 90s of sustained hand elevation (Gorilla Arm prevention)
- **Focus trap**: ModalContainer traps Tab/Shift+Tab, restores focus on close (WCAG 2.4.3)
- **Touch targets**: All interactive elements ≥44px (WCAG minimum)
- **ARIA roles**: Toggle buttons use `role="switch"` + `aria-checked`, tab controls use `role="tablist"`/`role="tab"`, live regions on status indicators
- **Layout collision**: SelectionPanel, ClusterLegend, HandChordOverlay assigned distinct positions
- **Theme tokens**: Z-index scale, color palette, spacing grid, font scale replace hardcoded hex values
- **Ozone platform hint**: `--ozone-platform-hint=auto` appended on Linux for Wayland compatibility
- **One-Euro dCutoff**: 0.4 → 0.3 for smoother derivative estimation at 60fps

### Testing

- 1444 passing tests across 76 files (up from 1205)
- 9-sprint TDD audit remediation covering VR, UI/UX, Statistics, Biomedical, HCI, and Linux specialist findings

## [0.3.0] - 2026-02-21

### Added

- **Transparent overlay mode**: Always-on-top transparent overlay for OS-level gesture control via uinput. Toggle with Super+G hotkey, HUD button, or system tray. Per-display bounds (avoids multi-monitor white-screen artifacts)
- **Frameless window**: Custom title bar with drag region spacer and minimize/maximize/close controls
- **Hand chord overlay**: `HandChordOverlay` component displaying per-finger curl states
- **Per-joint One-Euro filter tuning**: 4 tiers (anchor/MCP/PIP/TIP) with separate z-axis parameters for each
- **Z-axis median pre-filter**: 3-frame sliding window rejects single-frame MediaPipe z spikes before One-Euro filtering
- **Orientation-adaptive curl weights**: `computePalmFacing()` via palm normal cross product; blend weights shift between angle-based and distance-based curl measurement based on camera-facing factor
- **Thumb opposition measurement**: `thumbCurl()` uses tip-to-palm-center distance (70% opposition + 30% angle) instead of standard curl
- **Pinch approach-vector gating**: `areFingersApproaching()` rejects false pinch when thumb and index are diverging via velocity dot product

### Changed

- **Build**: esbuild minifier (20-30x faster than terser), aggressive tree shaking, manual chunk splitting (three-core 646KB, r3f 267KB, react-vendor 143KB, app 182KB), console/debugger stripping in production
- **AppImage**: 92MB → 71MB (maximum ASAR compression, source map exclusion, sample data compaction)
- **Renderer bundle**: 2.5MB → 1.4MB (code splitting + esbuild minification)
- **Main bundle**: 797KB → 370KB
- **Sample data**: Compacted JSON + rounded floats (1.5MB → 807KB)
- **HUD drag region**: Replaced full-bar `-webkit-app-region: drag` with dedicated flex spacer to avoid eating Canvas mouse events for OrbitControls
- **Canvas alpha**: Kept `alpha: false` for GPU compositing performance (transparent window uses CSS background in normal mode)

## [0.2.0] - 2026-02-21

### Added

- **Two-hand gestures**: TwoHandCoordinator with symmetric combo matrix (both-pinch → scale, both-twist → rotate, both-palm → dolly, both-point → measure) and asymmetric combos (pinch+drag, pinch+palm unfold)
- **Stereo webcam tracking**: StereoFuser for dual-camera triangulation with configurable baseline, disparity-based depth refinement, and hot-plug camera detection
- HUD stereo status indicator
- Onset grace period (100ms) for aligning two-hand gesture onsets

### Changed

- **Performance**: Object pooling for gesture events, pre-allocated 2D state machine grid (O(1) lookup replacing Map), worker frame skipping, Frustum/Raycaster pooling
- **GestureEngine**: Pre-computes hand centers and pinch results per hand to avoid redundant calculations
- Camera tracking frequency increased from 30 FPS to 60 FPS
- Gesture timing defaults tuned: minHoldDuration 150→80ms, cooldownDuration 200→120ms

### Upgraded

- vitest 1.x → 3.x
- vite 5.x → 6.x
- ESLint 8 → 9 (flat config migration)
- electron-vite 2.x → 5.x
- electron-builder 24 → 25

### Renamed

- Project renamed from "Tracking" to "Gestalt"
- Package name: `tracking` → `gestalt`
- App ID: `com.tracking.app` → `com.gestalt.app`

### Testing

- 1041 passing tests at 90%+ coverage (up from 1040)

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
