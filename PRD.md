# Product Requirements Document (PRD): Gestalt — Hand-Tracked 3D Knowledge Graph & Latent Space Explorer

> **Implementation Note (2026-02-20):** This PRD was written before development began. The
> application was built as an all-TypeScript Electron app -- not the Python/REST/OAuth stack
> described in some sections below. Stale sections are annotated with `[NOT IMPLEMENTED]`
> and notes on what was built instead. The document is preserved as-is for reference.

## 1. Executive Summary
The goal of this project is to develop a high-performance, real-time hand-tracking application that enables users to interact with 3D knowledge graphs and latent space manifolds using natural hand gestures. By leveraging computer vision and advanced 3D rendering, the system provides an intuitive interface for exploring complex data structures without traditional input devices.

## 2. Objectives
- Enable seamless navigation of high-dimensional data (latent spaces) and relational data (knowledge graphs).
- Provide a "hands-on" experience for data discovery, selection, and manipulation.
- Achieve sub-50ms latency to ensure a fluid user experience.

## 3. Functional Requirements

### 3.1 Gesture Recognition & Interaction
- **Hand Tracking:** Supports both **one-hand** (for cursor/pointing) and **two-hand** tracking (for complex 3D manipulations like zoom/rotate).
- **Accuracy:** Minimum 95% recognition rate for defined gestures.
- **Latency:** End-to-end latency (capture to render) < 50ms.
- **Interaction Modes:**
    - **Selection:** Pinch-to-select (index-thumb close), Open-palm-release to deselect.
    - **Rotation:** Thumb-to-index-finger twist (clockwise for right, counter-clockwise for left).
    - **Zoom:** Two-finger pinch-out (expand) to zoom in, pinch-in (contract) to zoom out.
    - **Pan:** Flat-hand drag (move the entire scene relative to hand movement).

### 3.2 Desktop Cursor Control (Hand Tracking Module)
- **Input:** 1-2 webcams.
- **Output:** Real-time desktop cursor control (OS-level mouse emulation).
- **Gestures:**
    - **Point:** Index finger extended; mapping 2D/3D hand coordinates to screen space.
    - **Click:** Rapid pinch (index + thumb) or "air tap" gesture.
    - **Drag:** Pinch and hold while moving the hand.
- **Performance:** 30 FPS minimum tracking frequency, 95% accuracy.

### 3.3 3D Rendering & Visualization
- **Fidelity:** Support for high-quality node/edge rendering with PBR (Physically Based Rendering) and optional toon-shading for clarity.
- **Latent Space Manifolds:** Specialized shaders for visualizing vector embeddings and cluster densities.
- **Scene Graph API:** Ability to programmatically add, remove, and transform nodes/edges in real-time.
- **Level of Detail (LOD):** Distance-based mesh simplification to maintain performance.

### 3.4 Data Ingestion
- **Formats:** Support for `JSON` and `GraphML`.
- **Manifold Schema:** Define standard schemas for vector embeddings and associated metadata (e.g., cluster IDs).
- **Validation:** Strict schema enforcement and robust error handling for malformed data.

### 3.5 User Interface (UI)
- **Visual Feedback:** Highlight nodes/edges on hover/selection; visual cues (emojis/icons) for recognized gestures.
- **Calibration:** User-guided routine for hand-pose alignment and sensitivity adjustment.

## 4. Non-Functional Requirements

### 4.1 Performance
- **Frame Rate:** Target 60 FPS for rendering; 30 FPS for tracking module processing.
- **Memory Footprint:** < 1GB for graphs up to 1M nodes.

### 4.2 Scalability
- **Capacity:** Acceptance of up to 10M nodes and 50M edges.
- **Graceful Degradation:** Implementation of LOD and culling to handle massive datasets.

### 4.3 Usability
- **Intuitive Controls:** Adherence to Nielsen's heuristics for gesture-based interfaces.
- **Accessibility:** Support for one-handed operation and adjustable sensitivity.

### 4.4 Environmental Requirements
- **Background:** Minimal visual clutter to prevent false positives in hand detection.
- **Lighting:** Consistent, non-flickering lighting (optimal 300-500 lux).
- **Surfaces:** Avoid highly reflective surfaces (mirrors, glass desks) that cause "ghost" hand detections via reflections.

### 4.5 Security
- **Data Privacy:** Local processing of webcam feed (no video data sent to cloud).
- **Encryption:** TLS 1.3 for data in transit; AES-256 for data at rest. `[NOT IMPLEMENTED]` -- The app runs locally on a single machine. The WebSocket bus uses token-based authentication (`crypto.randomBytes`) and is bound to `127.0.0.1`. There is no network data transit requiring TLS and no encrypted-at-rest storage; config files are plain JSON with atomic writes and backup rotation.
- **Access Control:** Role-Based Access Control (RBAC) for sensitive graph datasets. `[NOT IMPLEMENTED]` -- The app is single-user. Access control is handled at the OS level (file permissions, uinput group membership). The bus uses per-session token auth and rate limiting rather than RBAC.

## 5. Technical Specifications

### 5.1 Technology Stack
`[NOT IMPLEMENTED — as originally specified]` The application is built entirely in TypeScript running in Electron. There is no Python backend, no Unity integration, and no VR/AR headset support. The actual stack: Electron 28 + React 18 + Three.js/React Three Fiber (renderer), MediaPipe WASM (tracking), N-API C++ addon for Linux uinput (native input), Zustand (state), Zod (validation), ws (WebSocket bus).

- **Hand Tracking:** MediaPipe (Hand Landmarker/Gesture Recognizer).
- **3D Engine:** Three.js (Web-based) or Unity (Native/VR/AR).
- **Language:** Python (Back-end/Processing), TypeScript/JavaScript (Front-end).
- **Hardware:**
    - **Sensor Configuration:** 1-2 standard Webcams (minimum 720p).
    - **Stereo Vision:** Dual camera configuration for enhanced depth perception and gesture accuracy (triangulation of 21 hand landmarks).
    - **Optional:** VR/AR Headset support.

### 5.2 API Specification
`[NOT IMPLEMENTED]` There is no REST API or OAuth/JWT. The app is a standalone desktop application. External integration uses a WebSocket connector bus (`ws://127.0.0.1:9876`) with a binary token auth scheme and JSON message protocol (register, gesture, data, ping/pong). See `src/main/connectors/CONNECTORS.md` for the actual protocol specification.

- **Architecture:** RESTful API with OpenAPI 3.0 specification.
- **Endpoints:**
    - `GET /graph/{id}`: Fetch graph structure.
    - `POST /nodes`: Add new data points.
    - `GET /manifold/embeddings`: Retrieve latent space coordinates.
- **Auth:** OAuth 2.0 / JWT.

## 6. Testing & Quality Assurance
- **Unit Testing:** Accuracy benchmarks for gesture recognition.
- **Integration Testing:** Validation of API-to-Engine data flow.
- **Performance Profiling:** Stress tests using synthetic datasets up to 10M nodes.
- **Usability Studies:** Conducted with 10-15 target users; Success criteria: >90% task completion.

## 7. Success Metrics
- **Task Completion Time:** Reduction in time to find specific nodes compared to mouse/keyboard.
- **User Error Rate:** < 5% unintended gesture triggers.
- **User Satisfaction:** Average score > 4.5/5 in usability surveys.
