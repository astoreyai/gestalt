/**
 * Live integration test — exercises the full gesture pipeline
 * outside of the test framework.
 *
 * Run with: npx tsx demos/pipeline-test.ts
 */
import { GestureType, GesturePhase, LANDMARK, type Hand, type Landmark } from '../src/shared/protocol'
import { classifyGesture } from '../src/renderer/gestures/classifier'
import { GestureStateMachine } from '../src/renderer/gestures/state'
import { mapGestureToCommand } from '../src/renderer/gestures/mappings'
import { OneEuroFilter } from '../src/renderer/tracker/filters'
import { normalizeLandmarks } from '../src/renderer/tracker/normalize'

let passed = 0
let failed = 0

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  \u2713 ${label}`)
    passed++
  } else {
    console.error(`  \u2717 ${label}`)
    failed++
  }
}

// ─── Landmark Helpers (same patterns as unit tests) ──────────

function lm(x: number, y: number, z: number = 0): Landmark {
  return { x, y, z }
}

function createLandmarks(overrides: Record<number, Landmark> = {}): Landmark[] {
  const landmarks = Array.from({ length: 21 }, () => lm(0.5, 0.5, 0))
  for (const [index, value] of Object.entries(overrides)) {
    landmarks[Number(index)] = value
  }
  return landmarks
}

function toHand(landmarks: Landmark[]): Hand {
  return { handedness: 'right', landmarks, worldLandmarks: landmarks, score: 0.95 }
}

const FINGER_IDX: Record<string, { mcp: number; pip: number; dip: number; tip: number }> = {
  thumb: { mcp: LANDMARK.THUMB_CMC, pip: LANDMARK.THUMB_MCP, dip: LANDMARK.THUMB_IP, tip: LANDMARK.THUMB_TIP },
  index: { mcp: LANDMARK.INDEX_MCP, pip: LANDMARK.INDEX_PIP, dip: LANDMARK.INDEX_DIP, tip: LANDMARK.INDEX_TIP },
  middle: { mcp: LANDMARK.MIDDLE_MCP, pip: LANDMARK.MIDDLE_PIP, dip: LANDMARK.MIDDLE_DIP, tip: LANDMARK.MIDDLE_TIP },
  ring: { mcp: LANDMARK.RING_MCP, pip: LANDMARK.RING_PIP, dip: LANDMARK.RING_DIP, tip: LANDMARK.RING_TIP },
  pinky: { mcp: LANDMARK.PINKY_MCP, pip: LANDMARK.PINKY_PIP, dip: LANDMARK.PINKY_DIP, tip: LANDMARK.PINKY_TIP },
}

/** Extended finger: straight line going up (MCP→PIP→DIP→TIP with decreasing y) */
function extendedFinger(name: string, baseX: number, baseY: number): Record<number, Landmark> {
  const idx = FINGER_IDX[name]
  return {
    [idx.mcp]: lm(baseX, baseY),
    [idx.pip]: lm(baseX, baseY - 0.05),
    [idx.dip]: lm(baseX, baseY - 0.10),
    [idx.tip]: lm(baseX, baseY - 0.15),
  }
}

/** Curled finger: folds back toward palm */
function curledFinger(name: string, baseX: number, baseY: number): Record<number, Landmark> {
  const idx = FINGER_IDX[name]
  return {
    [idx.mcp]: lm(baseX, baseY),
    [idx.pip]: lm(baseX, baseY - 0.03),
    [idx.dip]: lm(baseX + 0.01, baseY + 0.01),
    [idx.tip]: lm(baseX, baseY + 0.02),
  }
}

function makeOpenPalm(): Hand {
  // Add z variation so it's not detected as flat_drag (flatness <= 0.7)
  const landmarks = createLandmarks({
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...extendedFinger('thumb', 0.35, 0.6),
    ...extendedFinger('index', 0.42, 0.55),
    ...extendedFinger('middle', 0.50, 0.53),
    ...extendedFinger('ring', 0.58, 0.55),
    ...extendedFinger('pinky', 0.65, 0.6),
  })
  // Add z variation to fingertips so hand is NOT flat
  landmarks[LANDMARK.THUMB_TIP] = lm(0.35, 0.45, -0.08)
  landmarks[LANDMARK.INDEX_TIP] = lm(0.42, 0.40, 0.05)
  landmarks[LANDMARK.MIDDLE_TIP] = lm(0.50, 0.38, -0.04)
  landmarks[LANDMARK.RING_TIP] = lm(0.58, 0.40, 0.06)
  landmarks[LANDMARK.PINKY_TIP] = lm(0.65, 0.45, -0.05)
  return toHand(landmarks)
}

function makeFist(): Hand {
  return toHand(createLandmarks({
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...curledFinger('thumb', 0.4, 0.6),
    ...curledFinger('index', 0.42, 0.55),
    ...curledFinger('middle', 0.50, 0.53),
    ...curledFinger('ring', 0.58, 0.55),
    ...curledFinger('pinky', 0.65, 0.6),
  }))
}

function makePoint(): Hand {
  return toHand(createLandmarks({
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...curledFinger('thumb', 0.4, 0.6),
    ...extendedFinger('index', 0.42, 0.55),
    ...curledFinger('middle', 0.50, 0.53),
    ...curledFinger('ring', 0.58, 0.55),
    ...curledFinger('pinky', 0.65, 0.6),
  }))
}

function makePinch(): Hand {
  const landmarks = createLandmarks({
    [LANDMARK.WRIST]: lm(0.5, 0.8, 0),
    ...extendedFinger('thumb', 0.35, 0.6),
    ...extendedFinger('index', 0.42, 0.55),
    ...curledFinger('middle', 0.50, 0.53),
    ...curledFinger('ring', 0.58, 0.55),
    ...curledFinger('pinky', 0.65, 0.6),
  })
  // Move thumb tip and index tip very close together
  landmarks[LANDMARK.THUMB_TIP] = lm(0.42, 0.41, 0)
  landmarks[LANDMARK.INDEX_TIP] = lm(0.42, 0.40, 0)
  return toHand(landmarks)
}

// ═══════════════════════════════════════════════════════════════
console.log('=== Gesture Pipeline — Live Integration Test ===\n')

// 1. Classifier
console.log('1. Gesture Classifier')
const pointResult = classifyGesture(makePoint())
assert(pointResult?.type === GestureType.Point, `Point gesture recognized (got ${pointResult?.type ?? 'null'})`)
const pinchResult = classifyGesture(makePinch())
assert(pinchResult?.type === GestureType.Pinch, `Pinch gesture recognized (got ${pinchResult?.type ?? 'null'})`)
const palmResult = classifyGesture(makeOpenPalm())
assert(palmResult?.type === GestureType.OpenPalm, `Open palm recognized (got ${palmResult?.type ?? 'null'})`)
const fistResult = classifyGesture(makeFist())
assert(fistResult?.type === GestureType.Fist, `Fist gesture recognized (got ${fistResult?.type ?? 'null'})`)

// 2. State Machine (takes boolean detected + timestamp, returns GesturePhase | null)
// Needs minOnsetFrames (3) consecutive detections AND minHoldDuration (150ms) to transition to hold
console.log('\n2. Gesture State Machine')
const sm = new GestureStateMachine()
const r1 = sm.update(true, 0)
assert(r1 === GesturePhase.Onset, `Point onset detected (got ${r1})`)
sm.update(true, 50)   // Frame 2 — still onset (< 3 frames)
sm.update(true, 100)  // Frame 3 — still onset (< 150ms)
const r2 = sm.update(true, 200) // Frame 4 — now >= 3 frames AND >= 150ms
assert(r2 === GesturePhase.Hold, `Point hold after debounce (got ${r2})`)
const r3 = sm.update(false, 400)
assert(r3 === GesturePhase.Release, `Point release detected (got ${r3})`)
const r4 = sm.update(false, 450)
assert(r4 === null, 'Cooldown — no event during cooldown')

// 3. Command Mapping
console.log('\n3. Command Mapping')
const cmd1 = mapGestureToCommand({
  type: GestureType.Point,
  phase: GesturePhase.Hold,
  hand: 'right',
  confidence: 0.95,
  position: { x: 0.5, y: 0.5, z: 0 },
  timestamp: 100
})
assert(cmd1 !== null, 'Point hold maps to a command')
assert(cmd1?.target === 'mouse', `Point hold maps to mouse (got ${cmd1?.target ?? 'null'})`)

const cmd2 = mapGestureToCommand({
  type: GestureType.Pinch,
  phase: GesturePhase.Onset,
  hand: 'right',
  confidence: 0.95,
  position: { x: 0.5, y: 0.5, z: 0 },
  timestamp: 100
})
assert(cmd2 !== null, 'Pinch onset maps to a command')
assert(cmd2?.target === 'mouse', `Pinch onset maps to mouse click (got ${cmd2?.target ?? 'null'})`)

const cmd3 = mapGestureToCommand({
  type: GestureType.Fist,
  phase: GesturePhase.Onset,
  hand: 'right',
  confidence: 0.95,
  position: { x: 0.5, y: 0.5, z: 0 },
  timestamp: 100
})
assert(cmd3?.target === 'keyboard', `Fist maps to keyboard Escape (got ${cmd3?.target ?? 'null'})`)

// 4. One-Euro Filter
console.log('\n4. One-Euro Filter (smoothing)')
const filter = new OneEuroFilter(30, 1.0, 0.007, 1.0)
const values = [0.5, 0.52, 0.48, 0.55, 0.45, 0.53, 0.47]
const filtered = values.map((v, i) => filter.filter(v, i / 30))
assert(filtered.length === values.length, 'Filter produces output for each input')
const variance = (arr: number[]) => {
  const mean = arr.reduce((a, b) => a + b) / arr.length
  return arr.reduce((s, v) => s + (v - mean) ** 2, 0) / arr.length
}
assert(variance(filtered) < variance(values), 'Filter reduces variance (smooths jitter)')

// 5. Landmark Normalization
console.log('\n5. Landmark Normalization')
const rawLandmarks = makePoint().landmarks
const normalized = normalizeLandmarks(rawLandmarks, 1280, 720)
assert(normalized.length === 21, 'Normalization preserves landmark count')
assert(normalized.every(l => l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1), 'Coordinates in [0,1] range')

// 6. Full pipeline: landmarks → classify → state → command
console.log('\n6. Full Pipeline (landmarks → classify → state → command)')
const sm2 = new GestureStateMachine()
const pointHand = makePoint()
const fullResult = classifyGesture(pointHand)
assert(fullResult !== null, 'Classifier produces result')
const gestureType = fullResult?.type ?? GestureType.None
const detected = fullResult !== null
const phase = sm2.update(detected, 0)
assert(phase !== null, 'State machine produces phase')
if (phase) {
  const command = mapGestureToCommand({
    type: gestureType,
    phase,
    hand: 'right',
    confidence: fullResult?.confidence ?? 0,
    position: { x: pointHand.landmarks[8].x, y: pointHand.landmarks[8].y, z: pointHand.landmarks[8].z },
    timestamp: 0
  })
  assert(command !== null, 'Full pipeline: landmarks → gesture → state → command')
  console.log(`  Pipeline result: ${gestureType} → ${phase} → ${command?.target}:${(command as any)?.action}`)
}

// Summary
console.log(`\n${'='.repeat(50)}`)
console.log(`Results: ${passed} passed, ${failed} failed`)
if (failed === 0) {
  console.log('=== ALL TESTS PASSED ===')
} else {
  console.log('=== SOME TESTS FAILED ===')
  process.exit(1)
}
