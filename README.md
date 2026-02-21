# Tracking

![Tests](https://img.shields.io/badge/tests-1040%20passing-brightgreen)
![Coverage](https://img.shields.io/badge/coverage-90%25+-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Platform](https://img.shields.io/badge/platform-Linux-lightgrey)

## Overview

Tracking is a standalone Electron desktop application that lets users navigate 3D knowledge graphs and latent space manifolds using real-time hand gestures captured from a standard webcam. It combines MediaPipe hand tracking, Three.js 3D rendering, and a native Linux input addon to deliver sub-50ms end-to-end latency without any specialized hardware.

## Quick Start

```bash
git clone https://github.com/astoreyai/tracking.git
cd tracking
npm install
npm run native:build   # Compile the uinput addon (Linux only)
npm run dev            # Launch with hot reload
```

To load sample data, open the app and use **File > Open** or drag-and-drop one of the files in `assets/samples/`:
- `small-graph.json` — a small knowledge graph
- `embeddings-5k.json` — a 5,000-point embedding manifold

## Screenshots

> **Note:** Screenshots have not yet been captured. To add them, run the app and take screenshots of the three views described below, then place the images in `docs/images/` and update the paths here.

<!-- Capture instructions:
1. Graph view:   Load small-graph.json, orbit to a good angle, take a screenshot.
2. Manifold view: Load embeddings-5k.json, hover over a cluster, take a screenshot.
3. Gesture overlay: Enable the gesture overlay (Settings > Show Overlay), perform a pinch gesture in front of the webcam, take a screenshot.

Save images as:
  docs/images/graph-view.png
  docs/images/manifold-view.png
  docs/images/gesture-overlay.png

For an animated GIF demo:
  - Use a screen recorder (e.g., peek, OBS, or gifski)
  - Record ~15 seconds of gesture-driven navigation
  - Save as docs/images/demo.gif
  - Add: ![Demo](docs/images/demo.gif)
-->

| Graph View | Manifold View | Gesture Overlay |
|:---:|:---:|:---:|
| *`docs/images/graph-view.png`* | *`docs/images/manifold-view.png`* | *`docs/images/gesture-overlay.png`* |

## Features

- **Real-time hand tracking** -- MediaPipe Hand Landmarker with 21-landmark detection at 30+ FPS
- **8 recognized gestures** -- pinch, point, open palm, twist, two-hand pinch, flat drag, fist, L-shape
- **3D knowledge graph visualization** -- force-directed layouts with d3-force-3d, LOD, and PBR rendering
- **Latent space manifold explorer** -- point cloud rendering with cluster visualization and hover cards
- **OS-level cursor control** -- native N-API addon writes to Linux uinput for mouse and keyboard emulation
- **WebSocket connector bus** -- external programs subscribe to gesture events via a token-authenticated bus on port 9876
- **Calibration profiles** -- per-user gesture training with KNN classification and sensitivity adjustment
- **Configurable keymaps** -- map gestures to keyboard shortcuts, mouse actions, or program commands
- **Dual data formats** -- load JSON and GraphML graphs, or JSON embedding manifolds
- **Split view** -- toggle between graph, manifold, or side-by-side split view
- **URL import** -- load graph and manifold data directly from a URL
- **Auto-updater** -- automatic update checks and installation via electron-updater
- **One-handed mode** -- accessibility mode mapping all actions to single-hand gestures
- **Themes** -- light, dark, and system-following theme modes

## Architecture

```
+-----------------------------------------------------------------+
|  Renderer Process (Chromium)                                    |
|                                                                 |
|  Webcam --> MediaPipe Hand Landmarker --> Gesture Classifier     |
|                |                              |                 |
|                v                              v                 |
|         HandTracker              Dispatcher (gesture -> command) |
|         (filters, normalize)          |                         |
|                                       v                         |
|  Three.js / React Three Fiber    Zustand Store                  |
|  (ForceGraph, PointCloud, HUD)   (app state, config, profiles)  |
|                                                                 |
+---------+----------------------------+--+--------+--------------+
          |  IPC (Electron)            |           |
          v                            v           v
+---------+----------------------------+-----------+--------------+
|  Main Process                                                   |
|                                                                 |
|  N-API Native Addon        Persistence           Bus Server     |
|  (uinput mouse/keyboard)   (JsonStore)           (ws://9876)    |
|                                                                 |
+----+--------------------------------------------+---------------+
     |                                            |
     v                                            v
  Linux uinput                          External Programs
  (/dev/uinput)                         (any WebSocket client)
```

**Key data flows:**

1. **Tracking pipeline** -- Webcam frames are processed by MediaPipe in the renderer, producing 21 normalized landmarks per hand at 30 FPS.
2. **Gesture recognition** -- A feature extraction + classifier pipeline detects 8 gesture types with onset/hold/release phases.
3. **Command dispatch** -- Recognized gestures map to mouse, keyboard, program, or built-in commands via the Zustand-backed dispatcher.
4. **Native input** -- Mouse and keyboard commands are sent over IPC to the main process, which writes them to `/dev/uinput` through a C++ N-API addon.
5. **Connector bus** -- Gesture events are broadcast over WebSocket to registered external programs, filtered by declared capabilities.

## Prerequisites

- **Linux** (Debian/Ubuntu recommended) -- the native uinput addon is Linux-only
- **Node.js 20+** and npm
- **Webcam** (minimum 720p)
- **C++ build tools** for the native addon: `build-essential`, `python3`

### uinput Permissions

The native addon writes to `/dev/uinput` for mouse and keyboard emulation. Your user must have write access:

```bash
# Option 1: Add a udev rule (persistent, recommended)
sudo tee /etc/udev/rules.d/99-uinput.rules <<< 'KERNEL=="uinput", MODE="0660", GROUP="input"'
sudo udevadm control --reload-rules && sudo udevadm trigger
sudo usermod -aG input $USER
# Log out and back in for group change to take effect

# Option 2: One-time permission (resets on reboot)
sudo chmod 0660 /dev/uinput
```

## Installation

```bash
git clone https://github.com/astoreyai/tracking.git
cd tracking
npm install
npm run native:build
```

The `native:build` step compiles the C++ uinput addon using node-gyp. If it fails, ensure `build-essential` and `python3` are installed.

## Usage

### Development

```bash
npm run dev        # Start Electron with hot reload (electron-vite)
```

### Production Build

```bash
npm run build                # Build renderer + main
npm run package:appimage     # Package as AppImage
npm run package:deb          # Package as .deb
```

### Other Commands

| Command              | Description                          |
|----------------------|--------------------------------------|
| `npm test`           | Run all tests (vitest)               |
| `npm run test:watch` | Run tests in watch mode              |
| `npm run test:coverage` | Run tests with coverage report    |
| `npm run lint`       | Lint source with ESLint              |
| `npm run typecheck`  | Type-check without emitting          |
| `npm run demo`       | Run the gesture demo (colored output)|
| `npm run demo:bus`   | Run the WebSocket bus demo           |

### Gesture Controls

| Gesture            | Action               | Description                                       |
|--------------------|----------------------|---------------------------------------------------|
| **Point**          | Cursor move          | Extend index finger to control the cursor          |
| **Pinch**          | Click / Select       | Touch index finger to thumb for click or selection |
| **Pinch (hold)**   | Drag                 | Hold pinch while moving hand to drag               |
| **Open Palm**      | Release / Deselect   | Open hand to deselect or trigger mapped shortcut   |
| **Twist**          | Rotate               | Twist thumb-to-index to rotate the scene           |
| **Two-Hand Pinch** | Zoom / Scroll        | Pinch with both hands to zoom in or out            |
| **Flat Drag**      | Pan                  | Flat hand drag to pan the scene                    |
| **Fist**           | Cancel / Escape      | Close fist to cancel or press Escape               |
| **L-Shape**        | Custom shortcut      | L-shaped hand triggers a configurable key combo    |

## Configuration

### AppConfig

The application configuration is defined in `src/shared/protocol.ts` and persisted via a custom JSON store (atomic writes with backup rotation):

```typescript
interface AppConfig {
  tracking: {
    enabled: boolean          // Enable/disable hand tracking
    smoothingFactor: number   // 0-1, higher = more smoothing
    minConfidence: number     // Minimum detection confidence (default: 0.7)
  }
  gestures: {
    minHoldDuration: number   // ms before onset transitions to hold (default: 150)
    cooldownDuration: number  // ms after release before re-trigger (default: 200)
    sensitivity: number       // 0-1, higher = more sensitive (default: 0.5)
    oneHandedMode: boolean    // Single-hand mode for accessibility (default: false)
  }
  input: {
    mouseSpeed: number        // Cursor movement multiplier (default: 1.0)
    scrollSpeed: number       // Scroll speed multiplier (default: 1.0)
  }
  bus: {
    port: number              // WebSocket server port (default: 9876)
    enabled: boolean          // Enable/disable connector bus
  }
  visualization: {
    defaultView: 'graph' | 'manifold' | 'split'
    lodEnabled: boolean       // Level-of-detail mesh simplification
    maxFps: number            // Rendering frame rate cap (default: 60)
  }
  theme: 'light' | 'dark' | 'system'  // UI theme (default: 'system')
}
```

### Keymaps

Gesture-to-key mappings are configured in `keymaps/default.json`:

```json
{
  "mappings": {
    "l_shape":   { "action": "combo", "keys": ["ctrl", "shift", "t"], "description": "Open new terminal tab" },
    "fist":      { "action": "press", "key": "escape", "description": "Cancel / Escape" },
    "open_palm": { "action": "combo", "keys": ["super"], "description": "Show activities / app launcher" }
  },
  "mouse": {
    "point":          "move",
    "pinch":          "click",
    "pinch_hold":     "drag",
    "two_hand_pinch": "scroll"
  }
}
```

## Connector Bus

The application runs a WebSocket server on `ws://127.0.0.1:9876` that broadcasts gesture events to connected external programs. Any language with WebSocket support can connect.

**Authentication:** Connections require a token passed as a query parameter (`?token=<hex>`). The token is generated per session using `crypto.randomBytes(16)` and is available via the main process API.

**Rate limiting:** Clients are limited to 100 messages per second. Exceeding the limit disconnects the client.

**Payload limit:** Maximum message size is 64 KB.

For the full protocol specification, client examples in Node.js and Python, and capability filtering details, see [`src/main/connectors/CONNECTORS.md`](src/main/connectors/CONNECTORS.md).

## Data Formats

### Knowledge Graph (JSON)

```json
{
  "nodes": [
    { "id": "n1", "label": "Concept A", "position": { "x": 0, "y": 1, "z": 0 }, "color": "#4a90d9", "size": 1.5 },
    { "id": "n2", "label": "Concept B", "metadata": { "category": "research" } }
  ],
  "edges": [
    { "source": "n1", "target": "n2", "weight": 0.8, "label": "relates to" }
  ],
  "metadata": { "name": "Example Graph" }
}
```

Nodes without an explicit `position` are placed automatically by the d3-force-3d layout engine. GraphML files are also supported.

### Embedding Manifold (JSON)

```json
{
  "points": [
    { "id": "p1", "position": { "x": 1.2, "y": -0.5, "z": 0.3 }, "clusterId": 0, "label": "Sample A" },
    { "id": "p2", "position": { "x": -0.8, "y": 1.1, "z": -0.2 }, "clusterId": 1 }
  ],
  "clusters": [
    { "id": 0, "label": "Cluster Alpha", "color": "#e74c3c", "centroid": { "x": 1.0, "y": -0.3, "z": 0.2 } },
    { "id": 1, "label": "Cluster Beta", "color": "#2ecc71" }
  ],
  "metadata": { "dimensions": 3, "method": "t-SNE" }
}
```

Sample data files are included in `assets/samples/`.

## Testing

```bash
npm test                 # Run all 1040+ tests
npm run test:coverage    # Run with coverage report (text, HTML, lcov)
```

**Coverage thresholds** (enforced in CI):

| Metric     | Threshold |
|------------|-----------|
| Statements | 90%       |
| Branches   | 85%       |
| Functions  | 90%       |
| Lines      | 90%       |

Tests use **Vitest** with **happy-dom** as the simulated browser environment and **@testing-library/react** for component testing.

## Project Structure

```
src/
  main/                         # Electron main process
    bus/                        # WebSocket connector bus
      connections.ts            #   Connection lifecycle management
      fanout.ts                 #   Gesture event fan-out by capability
      registry.ts               #   Program registration
      server.ts                 #   WebSocket server with token auth
    connectors/                 # External program SDK and examples
      example.ts                #   Demo connector client
      sdk.ts                    #   Node.js connector SDK
      CONNECTORS.md             #   Protocol documentation
    input/                      # OS-level input injection
      ipc.ts                    #   IPC handler registration
      keyboard.ts               #   Keyboard emulation via uinput
      macros.ts                 #   Multi-step macro sequences
      mouse.ts                  #   Mouse emulation via uinput
    index.ts                    # Main process entry point
    ipc-validators.ts           # IPC message validation (Zod)
    persistence.ts              # Config and profile persistence
    rate-limiter.ts             # Generic rate limiter
    security.ts                 # Security utilities
    tray.ts                     # System tray integration
  preload/
    index.ts                    # Context bridge (renderer <-> main)
  renderer/                     # Electron renderer process (React)
    components/                 # Shared UI components
      HUD.tsx                   #   Heads-up display overlay
      ModalContainer.tsx        #   Modal dialog system
      SelectionPanel.tsx        #   Node/point selection details
      ToastQueue.tsx            #   Toast notification queue
    controller/                 # Gesture interpretation and dispatch
      a11y.ts                   #   Accessibility utilities
      Calibration.tsx           #   Calibration wizard UI
      dispatcher.ts             #   Gesture-to-command dispatcher
      focus.ts                  #   Focus trap management
      gesture-labels.ts         #   Human-readable gesture labels
      GestureOverlay.tsx        #   Live gesture feedback overlay
      sanitize.ts               #   Input sanitization
      selection-info.ts         #   Selection state helpers
      store.ts                  #   Zustand state store
      ViewSwitcher.tsx          #   Graph/manifold/split view toggle
    data/                       # Data loading and validation
      DataLoader.tsx            #   File open dialog and parser
      validators.ts             #   Schema validation (Zod)
    gestures/                   # Gesture recognition pipeline
      classifier.ts             #   Rule-based gesture classifier
      features.ts               #   Landmark feature extraction
      knn-classifier.ts         #   KNN classifier for calibrated gestures
      mappings.ts               #   Gesture-to-command mapping tables
      state.ts                  #   Gesture state machine (onset/hold/release)
      types.ts                  #   Gesture type definitions
    graph/                      # Knowledge graph visualization
      colors.ts                 #   Color palette and utilities
      Edges.tsx                 #   Edge rendering (lines, curves)
      ForceGraph.tsx            #   Force-directed 3D graph (R3F)
      force-layout.ts           #   d3-force-3d layout wrapper
      lod.ts                    #   Level-of-detail manager
      Nodes.tsx                 #   Node rendering (spheres, labels)
      parsers/                  #   Graph file parsers
        graphml-parser.ts       #     GraphML format parser
        json-parser.ts          #     JSON format parser
    hooks/
      useHandTracker.ts         #   React hook for MediaPipe integration
    manifold/                   # Latent space manifold visualization
      Clusters.tsx              #   Cluster boundary rendering
      generators.ts             #   Synthetic data generators
      HoverCard.tsx             #   Point detail hover card
      navigation.ts             #   Camera navigation for manifolds
      PointCloud.tsx            #   GPU instanced point cloud (R3F)
      spatial-index.ts          #   Spatial index for nearest-neighbor queries
      types.ts                  #   Manifold type definitions
    settings/
      Settings.tsx              #   Settings panel UI
    tracker/                    # Hand tracking core
      filters.ts                #   Landmark smoothing filters
      HandTracker.ts            #   MediaPipe wrapper and frame processing
      normalize.ts              #   Coordinate normalization
    App.tsx                     # Root React component
    main.tsx                    # Renderer entry point
  shared/                       # Types shared across processes
    bus-protocol.ts             # WebSocket bus message types
    ipc-channels.ts             # IPC channel name constants
    protocol.ts                 # Core protocol types and config
native/                         # C++ N-API addon (uinput)
  src/
    addon.cc                    # Node addon entry point
    mouse.cc                    # uinput mouse device
    keyboard.cc                 # uinput keyboard device
  binding.gyp                   # node-gyp build config
keymaps/
  default.json                  # Default gesture-to-key mappings
workers/
  force-layout.worker.ts        # Web Worker for force-directed layout
  layout.worker.ts              # Web Worker for general layout tasks
assets/
  samples/                      # Sample data files
    small-graph.json            #   Small knowledge graph example
    embeddings-5k.json          #   5,000-point embedding dataset
demos/
  index.ts                      # Gesture recognition demo (colored output)
  bus-demo.ts                   # WebSocket connector bus demo
```

## Tech Stack

| Category            | Technology                                    |
|---------------------|-----------------------------------------------|
| Runtime             | Electron 28, Node.js 20+                      |
| Language            | TypeScript 5.3, C++ (native addon)            |
| UI Framework        | React 18                                       |
| 3D Rendering        | Three.js 0.162, React Three Fiber, Drei       |
| Hand Tracking       | MediaPipe Tasks Vision 0.10                    |
| Graph Layout        | d3-force-3d                                    |
| State Management    | Zustand 4.5                                    |
| Schema Validation   | Zod 3.22                                       |
| WebSocket           | ws 8.16                                        |
| Persistence         | Custom JsonStore (atomic file writes)          |
| Auto-Updater        | electron-updater 6.x                           |
| Native Addon        | N-API (node-gyp, node-addon-api)              |
| Build Tool          | electron-vite (Vite)                           |
| Testing             | Vitest 1.3, Testing Library, happy-dom        |
| Packaging           | electron-builder (AppImage, deb)              |
| Linting             | ESLint 8                                       |

## Performance

| Metric                       | Target       |
|------------------------------|--------------|
| End-to-end latency           | < 50 ms      |
| Rendering frame rate         | 60 FPS       |
| Hand tracking frequency      | 30 FPS       |
| Gesture recognition accuracy | >= 95%       |
| Memory (up to 1M nodes)      | < 1 GB       |
| Max graph capacity           | 10M nodes, 50M edges (with LOD and culling) |

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed list of changes per release.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions, coding guidelines, and contribution workflow.

## License

MIT
