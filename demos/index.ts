/**
 * Live demo script — generates sample data and demonstrates
 * the tracking app's gesture recognition pipeline with colored output.
 *
 * Run with: npm run demo
 */

import {
  GestureType,
  GesturePhase,
  type GestureEvent,
  type LandmarkFrame,
  type Hand,
  type Landmark,
  LANDMARK
} from '../src/shared/protocol'

import {
  DEFAULT_MAPPINGS,
  mapGestureToCommand,
  type GestureMapping
} from '../src/renderer/gestures/mappings'

// ─── ANSI Colors ─────────────────────────────────────────────

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  bgBlack: '\x1b[40m',
}

// ─── ASCII Hand Art ──────────────────────────────────────────

const HAND_ART: Record<string, string[]> = {
  [GestureType.OpenPalm]: [
    '    \\  |  /',
    '     \\ | / ',
    '  ----   ----',
    '  |         |',
    '   \\       / ',
    '    \\_____/  ',
  ],
  [GestureType.Point]: [
    '       |     ',
    '       |     ',
    '  .----\'     ',
    '  |          ',
    '   \\         ',
    '    \\_____   ',
  ],
  [GestureType.Pinch]: [
    '    o--o     ',
    '   /         ',
    '  |          ',
    '  |          ',
    '   \\         ',
    '    \\_____   ',
  ],
  [GestureType.Fist]: [
    '  .-------.  ',
    '  |  ===  |  ',
    '  |  ===  |  ',
    '  |  ===  |  ',
    '   \\     /   ',
    '    \\___/    ',
  ],
  [GestureType.LShape]: [
    '       |     ',
    '       |     ',
    '  -----\'     ',
    '  |          ',
    '  |          ',
    '  |_____     ',
  ],
  [GestureType.Twist]: [
    '    o~~o     ',
    '     \\|      ',
    '  ----\'      ',
    '  |          ',
    '   \\         ',
    '    \\_____   ',
  ],
  [GestureType.TwoHandPinch]: [
    '  o--o  o--o ',
    '  /       \\  ',
    ' |         | ',
    ' |         | ',
    '  \\       /  ',
    '   \\_____/   ',
  ],
  [GestureType.FlatDrag]: [
    '  ---------  ',
    '  |       |  ',
    '  |  >>>  |  ',
    '  |       |  ',
    '   \\     /   ',
    '    \\___/    ',
  ],
}

// ─── Synthetic Hand Generator ──────────────────────────────────

function generateOpenPalmLandmarks(): Landmark[] {
  const landmarks: Landmark[] = []
  landmarks.push({ x: 0.5, y: 0.7, z: 0 })
  landmarks.push({ x: 0.42, y: 0.65, z: -0.01 })
  landmarks.push({ x: 0.38, y: 0.58, z: -0.02 })
  landmarks.push({ x: 0.35, y: 0.52, z: -0.02 })
  landmarks.push({ x: 0.33, y: 0.46, z: -0.02 })
  landmarks.push({ x: 0.44, y: 0.55, z: 0 })
  landmarks.push({ x: 0.43, y: 0.45, z: 0 })
  landmarks.push({ x: 0.43, y: 0.38, z: 0 })
  landmarks.push({ x: 0.43, y: 0.32, z: 0 })
  landmarks.push({ x: 0.50, y: 0.53, z: 0 })
  landmarks.push({ x: 0.50, y: 0.42, z: 0 })
  landmarks.push({ x: 0.50, y: 0.35, z: 0 })
  landmarks.push({ x: 0.50, y: 0.28, z: 0 })
  landmarks.push({ x: 0.56, y: 0.55, z: 0 })
  landmarks.push({ x: 0.56, y: 0.45, z: 0 })
  landmarks.push({ x: 0.56, y: 0.38, z: 0 })
  landmarks.push({ x: 0.56, y: 0.32, z: 0 })
  landmarks.push({ x: 0.62, y: 0.58, z: 0 })
  landmarks.push({ x: 0.62, y: 0.48, z: 0 })
  landmarks.push({ x: 0.62, y: 0.42, z: 0 })
  landmarks.push({ x: 0.62, y: 0.38, z: 0 })
  return landmarks
}

function generatePinchLandmarks(): Landmark[] {
  const lm = generateOpenPalmLandmarks()
  lm[LANDMARK.THUMB_TIP] = { x: 0.44, y: 0.33, z: 0 }
  lm[LANDMARK.INDEX_TIP] = { x: 0.44, y: 0.33, z: 0.01 }
  return lm
}

function generatePointLandmarks(): Landmark[] {
  const lm = generateOpenPalmLandmarks()
  lm[LANDMARK.MIDDLE_DIP] = { x: 0.50, y: 0.50, z: 0.05 }
  lm[LANDMARK.MIDDLE_TIP] = { x: 0.50, y: 0.55, z: 0.07 }
  lm[LANDMARK.RING_DIP] = { x: 0.56, y: 0.52, z: 0.05 }
  lm[LANDMARK.RING_TIP] = { x: 0.56, y: 0.57, z: 0.07 }
  lm[LANDMARK.PINKY_DIP] = { x: 0.62, y: 0.50, z: 0.05 }
  lm[LANDMARK.PINKY_TIP] = { x: 0.62, y: 0.55, z: 0.07 }
  lm[LANDMARK.THUMB_IP] = { x: 0.45, y: 0.55, z: 0.04 }
  lm[LANDMARK.THUMB_TIP] = { x: 0.47, y: 0.52, z: 0.05 }
  return lm
}

// ─── Demo Sequence ─────────────────────────────────────────────

interface DemoStep {
  name: string
  gesture: GestureType
  phase: GesturePhase
  duration: number
  landmarks: () => Landmark[]
}

const DEMO_SEQUENCE: DemoStep[] = [
  { name: 'Open Palm (release)', gesture: GestureType.OpenPalm, phase: GesturePhase.Onset, duration: 1000, landmarks: generateOpenPalmLandmarks },
  { name: 'Point (navigate)', gesture: GestureType.Point, phase: GesturePhase.Hold, duration: 2000, landmarks: generatePointLandmarks },
  { name: 'Pinch (select)', gesture: GestureType.Pinch, phase: GesturePhase.Onset, duration: 500, landmarks: generatePinchLandmarks },
  { name: 'Pinch (hold/drag)', gesture: GestureType.Pinch, phase: GesturePhase.Hold, duration: 1500, landmarks: generatePinchLandmarks },
  { name: 'Pinch (release)', gesture: GestureType.Pinch, phase: GesturePhase.Release, duration: 300, landmarks: generatePinchLandmarks },
  { name: 'Open Palm (deselect)', gesture: GestureType.OpenPalm, phase: GesturePhase.Onset, duration: 1000, landmarks: generateOpenPalmLandmarks },
]

function formatGestureEvent(step: DemoStep, t: number): GestureEvent {
  return {
    type: step.gesture,
    phase: step.phase,
    hand: 'right',
    confidence: 0.95,
    position: { x: 0.5 + Math.sin(t * 0.002) * 0.2, y: 0.5 + Math.cos(t * 0.003) * 0.15, z: 0.1 },
    timestamp: t,
    data: step.gesture === GestureType.Pinch ? { distance: 0.02 } : undefined
  }
}

function formatFrame(step: DemoStep, t: number, frameId: number): LandmarkFrame {
  const lm = step.landmarks()
  const motionX = Math.sin(t * 0.002) * 0.02
  const motionY = Math.cos(t * 0.003) * 0.015
  const movedLandmarks = lm.map(l => ({
    x: l.x + motionX,
    y: l.y + motionY,
    z: l.z
  }))

  const hand: Hand = {
    handedness: 'right',
    landmarks: movedLandmarks,
    worldLandmarks: movedLandmarks,
    score: 0.95
  }

  return {
    hands: [hand],
    timestamp: t,
    frameId
  }
}

function formatCommand(gesture: GestureEvent): string {
  const cmd = mapGestureToCommand(gesture)
  if (!cmd) return `${C.dim}(no mapping)${C.reset}`
  if (cmd.target === 'mouse') return `${C.green}mouse.${cmd.action}${C.reset}`
  if (cmd.target === 'keyboard') {
    const keys = 'keys' in cmd && cmd.keys ? cmd.keys.join('+') : ('key' in cmd ? cmd.key : '?')
    return `${C.magenta}key[${keys}]${C.reset}`
  }
  if (cmd.target === 'builtin') return `${C.yellow}builtin.${cmd.action}${C.reset}`
  return `${C.dim}${cmd.target}.${cmd.action}${C.reset}`
}

// ─── Main ──────────────────────────────────────────────────────

async function runDemo(): Promise<void> {
  console.log(`\n${C.bold}${C.cyan}  ╔══════════════════════════════════════════════╗${C.reset}`)
  console.log(`${C.bold}${C.cyan}  ║     Tracking App — Gesture Recognition Demo  ║${C.reset}`)
  console.log(`${C.bold}${C.cyan}  ╚══════════════════════════════════════════════╝${C.reset}\n`)
  console.log(`${C.dim}  Simulating hand gestures with synthetic landmark data.${C.reset}`)
  console.log(`${C.dim}  Each step shows: gesture type, phase, mapped command, and hand position.${C.reset}\n`)

  let globalTime = 0
  let frameId = 0
  const gestureCounts: Record<string, number> = {}

  for (const step of DEMO_SEQUENCE) {
    // Print ASCII hand art
    const art = HAND_ART[step.gesture] || HAND_ART[GestureType.OpenPalm]
    console.log(`${C.bold}${C.cyan}  ┌─ ${step.name} (${step.duration}ms) ${'─'.repeat(Math.max(0, 30 - step.name.length))}┐${C.reset}`)
    for (const line of art) {
      console.log(`${C.cyan}  │ ${line.padEnd(30)}│${C.reset}`)
    }
    console.log(`${C.cyan}  └${'─'.repeat(32)}┘${C.reset}`)

    gestureCounts[step.gesture] = (gestureCounts[step.gesture] || 0) + 1

    const startTime = globalTime
    let stepFrames = 0
    while (globalTime - startTime < step.duration) {
      const gesture = formatGestureEvent(step, globalTime)
      const frame = formatFrame(step, globalTime, frameId++)
      const cmdStr = formatCommand(gesture)

      if (stepFrames % 5 === 0) { // Print every 5th frame to reduce noise
        console.log(
          `  ${C.dim}[${frameId.toString().padStart(4, '0')}]${C.reset} ` +
          `${C.cyan}${gesture.type.padEnd(15)}${C.reset} ` +
          `${C.green}${gesture.phase.padEnd(8)}${C.reset} ` +
          `${C.yellow}pos=(${gesture.position.x.toFixed(2)}, ${gesture.position.y.toFixed(2)})${C.reset} ` +
          `hands=${frame.hands.length} ` +
          `conf=${C.bold}${gesture.confidence.toFixed(2)}${C.reset} ` +
          `-> ${cmdStr}`
        )
      }

      stepFrames++
      globalTime += 33 // ~30 FPS
      await new Promise(r => setTimeout(r, 33))
    }

    console.log('')
  }

  // Stats summary
  const durationSec = (globalTime / 1000).toFixed(1)
  console.log(`${C.bold}${C.yellow}  ┌─ Summary ${'─'.repeat(22)}┐${C.reset}`)
  console.log(`${C.yellow}  │ Total frames:  ${String(frameId).padStart(6)}          │${C.reset}`)
  console.log(`${C.yellow}  │ Duration:      ${durationSec.padStart(5)}s          │${C.reset}`)
  console.log(`${C.yellow}  │ Avg FPS:       ${(frameId / (globalTime / 1000)).toFixed(1).padStart(6)}          │${C.reset}`)
  console.log(`${C.yellow}  │                                │${C.reset}`)
  console.log(`${C.yellow}  │ Gestures per type:             │${C.reset}`)
  for (const [gesture, count] of Object.entries(gestureCounts)) {
    console.log(`${C.yellow}  │   ${gesture.padEnd(16)} ${String(count).padStart(3)} steps     │${C.reset}`)
  }
  console.log(`${C.yellow}  └${'─'.repeat(32)}┘${C.reset}\n`)
}

runDemo().catch(console.error)
