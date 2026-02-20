/**
 * Live demo script — generates sample data and demonstrates
 * the tracking app's capabilities without a webcam.
 *
 * Run with: npx tsx demos/index.ts
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

// ─── Synthetic Hand Generator ──────────────────────────────────

function generateOpenPalmLandmarks(): Landmark[] {
  const landmarks: Landmark[] = []
  // Wrist
  landmarks.push({ x: 0.5, y: 0.7, z: 0 })
  // Thumb (4 joints + tip)
  landmarks.push({ x: 0.42, y: 0.65, z: -0.01 })
  landmarks.push({ x: 0.38, y: 0.58, z: -0.02 })
  landmarks.push({ x: 0.35, y: 0.52, z: -0.02 })
  landmarks.push({ x: 0.33, y: 0.46, z: -0.02 })
  // Index (4 points)
  landmarks.push({ x: 0.44, y: 0.55, z: 0 })
  landmarks.push({ x: 0.43, y: 0.45, z: 0 })
  landmarks.push({ x: 0.43, y: 0.38, z: 0 })
  landmarks.push({ x: 0.43, y: 0.32, z: 0 })
  // Middle
  landmarks.push({ x: 0.50, y: 0.53, z: 0 })
  landmarks.push({ x: 0.50, y: 0.42, z: 0 })
  landmarks.push({ x: 0.50, y: 0.35, z: 0 })
  landmarks.push({ x: 0.50, y: 0.28, z: 0 })
  // Ring
  landmarks.push({ x: 0.56, y: 0.55, z: 0 })
  landmarks.push({ x: 0.56, y: 0.45, z: 0 })
  landmarks.push({ x: 0.56, y: 0.38, z: 0 })
  landmarks.push({ x: 0.56, y: 0.32, z: 0 })
  // Pinky
  landmarks.push({ x: 0.62, y: 0.58, z: 0 })
  landmarks.push({ x: 0.62, y: 0.48, z: 0 })
  landmarks.push({ x: 0.62, y: 0.42, z: 0 })
  landmarks.push({ x: 0.62, y: 0.38, z: 0 })
  return landmarks
}

function generatePinchLandmarks(): Landmark[] {
  const lm = generateOpenPalmLandmarks()
  // Move thumb tip close to index tip
  lm[LANDMARK.THUMB_TIP] = { x: 0.44, y: 0.33, z: 0 }
  lm[LANDMARK.INDEX_TIP] = { x: 0.44, y: 0.33, z: 0.01 }
  return lm
}

function generatePointLandmarks(): Landmark[] {
  const lm = generateOpenPalmLandmarks()
  // Curl all fingers except index
  // Middle - curl
  lm[LANDMARK.MIDDLE_DIP] = { x: 0.50, y: 0.50, z: 0.05 }
  lm[LANDMARK.MIDDLE_TIP] = { x: 0.50, y: 0.55, z: 0.07 }
  // Ring - curl
  lm[LANDMARK.RING_DIP] = { x: 0.56, y: 0.52, z: 0.05 }
  lm[LANDMARK.RING_TIP] = { x: 0.56, y: 0.57, z: 0.07 }
  // Pinky - curl
  lm[LANDMARK.PINKY_DIP] = { x: 0.62, y: 0.50, z: 0.05 }
  lm[LANDMARK.PINKY_TIP] = { x: 0.62, y: 0.55, z: 0.07 }
  // Thumb - tuck
  lm[LANDMARK.THUMB_IP] = { x: 0.45, y: 0.55, z: 0.04 }
  lm[LANDMARK.THUMB_TIP] = { x: 0.47, y: 0.52, z: 0.05 }
  return lm
}

// ─── Demo Sequence ─────────────────────────────────────────────

interface DemoStep {
  name: string
  gesture: GestureType
  phase: GesturePhase
  duration: number // ms
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
  // Add subtle motion
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

// ─── Main ──────────────────────────────────────────────────────

async function runDemo(): Promise<void> {
  console.log('=== Tracking App — Live Demo ===\n')
  console.log('This demo shows synthetic gesture sequences.\n')

  let globalTime = 0
  let frameId = 0

  for (const step of DEMO_SEQUENCE) {
    console.log(`--- ${step.name} (${step.duration}ms) ---`)

    const startTime = globalTime
    while (globalTime - startTime < step.duration) {
      const gesture = formatGestureEvent(step, globalTime)
      const frame = formatFrame(step, globalTime, frameId++)

      console.log(
        `  [${frameId.toString().padStart(4, '0')}] ` +
        `${gesture.type.padEnd(15)} ${gesture.phase.padEnd(8)} ` +
        `pos=(${gesture.position.x.toFixed(2)}, ${gesture.position.y.toFixed(2)}) ` +
        `hands=${frame.hands.length} ` +
        `conf=${gesture.confidence.toFixed(2)}`
      )

      globalTime += 33 // ~30 FPS
      await new Promise(r => setTimeout(r, 33))
    }
  }

  console.log('\n=== Demo Complete ===')
  console.log(`Total frames: ${frameId}`)
  console.log(`Duration: ${(globalTime / 1000).toFixed(1)}s`)
}

runDemo().catch(console.error)
