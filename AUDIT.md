# Adversarial Codebase Audit — Consolidated Findings

**Date**: 2026-02-20
**Auditors**: 5-agent parallel swarm (Security, Robustness, Architecture, Performance, QA)
**Codebase**: `/mnt/projects/tracking/` — 100 source files, 19,826 LOC, 817 tests

---

## Executive Summary

| Severity | Count | Description |
|----------|-------|-------------|
| **P0 CRITICAL** | 10 | Broken features, exploitable vulns, will crash in production |
| **P1 HIGH** | 18 | Security gaps, memory leaks, missing tests for core flows |
| **P2 MEDIUM** | 25 | Defense-in-depth, optimization, test quality |
| **P3 LOW** | 8 | Best practices, minor dead code |
| **TOTAL** | **61** | |

---

## P0 CRITICAL — Fix Before Release

### P0-1. Twist gesture rotation is completely broken
- **File**: `src/renderer/controller/dispatcher.ts:63,146`
- **Issue**: Dispatcher reads `gesture.data?.angle` but engine emits `data.rotation`. The rotation value is always `0`.
- **Fix**: Change `gesture.data?.angle` to `gesture.data?.rotation`

### P0-2. Two-hand pinch zoom is completely broken
- **File**: `src/renderer/controller/dispatcher.ts:87,137`
- **Issue**: Dispatcher reads `gesture.data?.distance` but engine emits `data.handDistance`. Zoom delta is always `0`.
- **Fix**: Change `gesture.data?.distance` to `gesture.data?.handDistance`

### P0-3. Symlink-based path traversal in isAllowedPath
- **File**: `src/main/security.ts:25`
- **Issue**: `resolve()` does not follow symlinks. A symlink `~/escape -> /` allows reading `/etc/shadow` via `~/escape/etc/shadow`.
- **Fix**: Use `realpathSync(filePath)` instead of `resolve(filePath)`

### P0-4. Native addon: unchecked ioctl() and write() return values
- **File**: `native/src/mouse.cc:21,39-58`, `native/src/keyboard.cc:49,72-87`
- **Issue**: All `ioctl()` and `write()` calls ignore return values. Failed writes cause phantom stuck keys (press succeeds, release fails = key held permanently).
- **Fix**: Check every return value, retry on `EINTR`, throw on persistent failure

### P0-5. Three.js geometries/materials never disposed — GPU memory leak
- **File**: `src/renderer/graph/Nodes.tsx`, `Edges.tsx`, `src/renderer/manifold/PointCloud.tsx`, `Clusters.tsx`
- **Issue**: Zero `.dispose()` calls in the entire codebase. Switching views or loading new data leaks GPU memory without bound.
- **Fix**: Add `useEffect` cleanup calling `.dispose()` on geometry and material refs

### P0-6. Force layout is O(n^2) — 10M node target unreachable
- **File**: `src/renderer/graph/force-layout.ts:72`
- **Issue**: `forceManyBody()` uses naive all-pairs without Barnes-Hut. At 1M nodes: >10s per tick.
- **Fix**: Remove `distanceMax`, rely on Barnes-Hut theta. For >100K nodes, use GPU/WASM layout.

### P0-7. Force worker serializes full position map every tick
- **File**: `workers/force-layout.worker.ts:49-60`
- **Issue**: Each tick creates an array of `{id, x, y, z}` for ALL nodes and transfers via structured clone. 1M nodes = 64MB per tick.
- **Fix**: Use `SharedArrayBuffer` + `Float64Array` for zero-copy position transfer

### P0-8. Entire file loaded into RAM and parsed synchronously
- **File**: `src/renderer/data/DataLoader.tsx:20-38`, `src/renderer/graph/parsers/json-parser.ts:48-81`
- **Issue**: `JSON.parse(content)` on main thread. 10M nodes (~1GB file) = 3GB RAM + 5-10s freeze.
- **Fix**: Stream JSON in a Web Worker, parse in chunks, use binary format for large graphs

### P0-9. Integration test silently passes with zero assertions
- **File**: `src/__tests__/integration.test.ts:725`
- **Issue**: `if (fistEvent) { expect(...) }` — if fist detection breaks, test passes with 0 assertions.
- **Fix**: Replace `if` guard with `expect(fistEvent).toBeDefined()`

### P0-10. Coverage exclusions hide true coverage (17 production files excluded)
- **File**: `vitest.config.ts:21-48`
- **Issue**: 93.85% coverage excludes `App.tsx`, all R3F components, `main/index.ts`, `bus/server.ts`, `preload/index.ts`, `input/ipc.ts`, etc.
- **Fix**: Remove exclusions, report true coverage, add tests for excluded files

---

## P1 HIGH — Fix This Sprint

### Security

**P1-11. Timing attack on WebSocket token comparison**
- `src/main/bus/server.ts:97` — Use `crypto.timingSafeEqual()` instead of `!==`

**P1-12. No file size limit on FILE_LOAD — OOM crash**
- `src/main/index.ts:213-218` — `stat()` file before `readFile()`, enforce 50MB max

**P1-13. Allowed path scope is entire home directory**
- `src/main/security.ts:11-13` — Restrict to `~/Documents`, `~/Downloads`, `app.getPath('userData')`

**P1-14. CSP connect-src allows broad CDN domains**
- `src/renderer/index.html:6` — Pin to `https://cdn.jsdelivr.net/npm/@mediapipe/` only

### Architecture

**P1-15. Duplicate IPC handlers for GESTURE_EVENT and LANDMARK_FRAME**
- `src/main/index.ts:64,75` vs `src/main/input/ipc.ts:80` — Remove placeholder handlers in `main/index.ts`

**P1-16. Store updateConfig does shallow merge vs main process deepMerge**
- `src/renderer/controller/store.ts:114-116` — Use `deepMerge` in the store, matching main process

**P1-17. d3-force-3d type declarations return `any` everywhere**
- `src/renderer/graph/d3-force-3d.d.ts` — Write proper typed declarations for methods used

**P1-18. `as Type` assertions after Zod safeParse bypass validation types**
- `src/main/index.ts:92,105,139,154` — Remove `as` casts, let Zod inferred types flow

### Performance

**P1-19. LOD computed but never applied to geometry**
- `src/renderer/graph/Nodes.tsx:82-85,97-104` — Geometry stays full-detail (16x12) regardless of distance. Create 3 geometry LODs and swap based on `calculateLOD()`.

**P1-20. MediaPipe runs on main thread via requestAnimationFrame**
- `src/renderer/tracker/HandTracker.ts:219-252` — Blocks render loop 15-30ms/frame. Move to Web Worker with OffscreenCanvas.

**P1-21. useAppStore() triggers full-tree re-render on any store change**
- `src/renderer/controller/store.ts:202-225` — Spreads 5 stores into one object. Every gesture event (30 FPS) re-renders App + all children. Use individual slice selectors.

**P1-22. `new THREE.Color` allocated every frame for hovered nodes**
- `src/renderer/graph/Nodes.tsx:130` — Hoist to module-scope constant

**P1-23. Old graph data not released when loading new graph**
- `src/renderer/controller/store.ts:90-95` — Null out old simulation refs before creating new ones

### Test Gaps

**P1-24. Preload bridge has zero test coverage**
- No test verifies 14 preload methods map to correct IPC channels

**P1-25. main/index.ts IPC handler logic untested**
- 259 lines of IPC wiring, rate limiting, validation — all untested

**P1-26. No end-to-end dispatcher + gesture engine test**
- The two P0 data-key bugs went undetected because these modules are only tested in isolation

**P1-27. Persistence: no concurrent write, disk full, or migration tests**
- Race conditions, ENOSPC, and schema migration untested

**P1-28. Bus: no binary message, post-shutdown, or large input tests**
- Edge cases in WebSocket handling untested

---

## P2 MEDIUM — Fix Next Sprint

### Security
- **P2-29**: Profile ID params not Zod-validated (`index.ts:122,160,171`)
- **P2-30**: No rate limiting on read-only IPC handlers
- **P2-31**: Token in URL query parameter (visible in logs, `/proc`)
- **P2-32**: No WebSocket connection count limit (only program registration limit)
- **P2-33**: Program name spoofing allows data interception
- **P2-34**: Keyboard command schema allows unbounded key arrays

### Architecture
- **P2-35**: `PartialCalibrationProfileSchema` exported but never imported
- **P2-36**: `idToIndex` map computed but never used in `Nodes.tsx`
- **P2-37**: `spatialIndex` computed but unused in `PointCloud.tsx`
- **P2-38**: `sizeByDensity` prop accepted but never implemented
- **P2-39**: `bus-protocol.ts` uses `string` for typed enum fields
- **P2-40**: `CalibrationProfileSchema` uses `z.string()` for gestureType (should use `z.nativeEnum`)
- **P2-41**: Duplicate `GraphEdgeSchema` with different weight constraints
- **P2-42**: `GestureState` name collision (store interface vs state machine enum)
- **P2-43**: Graph module depends on manifold module for colors

### Performance
- **P2-44**: `computeBoundingSphere()` called every frame for edges (frustumCulled is false)
- **P2-45**: InstancedMesh recreated on node count change (no pre-allocation)
- **P2-46**: `LandmarkSmoother.smooth()` allocates new array every frame
- **P2-47**: `_buildFrame` copies landmarks twice
- **P2-48**: `classifyGesture` recomputes fingerCurl multiple times per call
- **P2-49**: Renderer bundle 2.4MB — Three.js not tree-shaken (`import * as THREE`)
- **P2-50**: MediaPipe loaded eagerly even when tracking disabled

### Test Quality
- **P2-51**: Components test only asserts `typeof === 'function'`
- **P2-52**: Protocol test validates incorrect data key `angle` vs `rotation`
- **P2-53**: `as any` type bypass in 6 test mocks

---

## P3 LOW

- **P3-54**: Sandbox disabled for renderer (`index.ts:35`)
- **P3-55**: ECHO handler has no input validation
- **P3-56**: HoverCard renders unsanitized metadata (no truncation)
- **P3-57**: No max size on graph node/edge arrays in Zod schema
- **P3-58**: CSP allows `unsafe-inline` for styles
- **P3-59**: Electron 28.x is outdated
- **P3-60**: `ManifoldViewState`/`DensityConfig` types exported but never imported
- **P3-61**: `FOCUS_RING_STYLE`/`withFocusRing` only used in tests

---

## Remediation Priority Matrix

```
         IMPACT
         HIGH ──────────────────────────────
         |  P0-1,2  P0-3   P0-4          |
         |  (broken (path  (stuck         |
         |   twist/ trav)   keys)         |
         |   zoom)                        |
         |                                |
         |  P0-5    P0-6,7,8  P1-20      |
         |  (GPU    (perf     (MediaPipe  |
         |   leak)   walls)    blocking)  |
         |                                |
         |  P1-16   P1-21   P0-9,10      |
         |  (merge  (re-    (test         |
         |   bug)    render) coverage)    |
         |                                |
         LOW ──────────────────────────────
              EASY ───── EFFORT ───── HARD
```

### Recommended Fix Order

**Day 1 — Two-Line Fixes (P0-1, P0-2, P0-9)**
1. Fix `data?.angle` → `data?.rotation` in dispatcher.ts
2. Fix `data?.distance` → `data?.handDistance` in dispatcher.ts
3. Fix conditional test guard in integration.test.ts

**Day 2 — Security (P0-3, P1-11, P1-12, P1-13, P1-14)**
4. Use `realpathSync` in security.ts
5. Use `timingSafeEqual` for token comparison
6. Add file size limit before readFile
7. Narrow allowed path scope
8. Pin CSP connect-src to MediaPipe paths

**Day 3 — Native Addon (P0-4)**
9. Check all ioctl/write return values in mouse.cc/keyboard.cc

**Week 1 — Memory & Architecture (P0-5, P1-15, P1-16, P1-21, P1-22)**
10. Add Three.js dispose() on unmount
11. Remove duplicate IPC handlers
12. Fix shallow vs deep merge in store
13. Replace useAppStore() with slice selectors
14. Hoist Color allocations

**Week 2 — Performance (P0-6, P0-7, P0-8, P1-19, P1-20)**
15. Fix force layout scaling (Barnes-Hut)
16. SharedArrayBuffer for worker positions
17. Streaming JSON parser in Worker
18. Apply LOD geometry swapping
19. Move MediaPipe to Web Worker

**Week 3 — Test Coverage (P1-24 through P1-28)**
20. Add preload bridge tests
21. Add main/index.ts IPC tests
22. Add dispatcher+engine integration test
23. Add persistence edge case tests
24. Add bus edge case tests
