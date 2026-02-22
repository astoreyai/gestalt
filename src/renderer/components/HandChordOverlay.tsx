/**
 * Hand chord overlay — renders miniature hand skeletons with inter-finger
 * chord lines and curl bars for each detected hand. Left hand appears in
 * the bottom-left corner, right hand in the bottom-right.
 */

import React, { useRef, useEffect, useCallback } from 'react'
import type { LandmarkFrame, Landmark, Hand } from '@shared/protocol'
import { LANDMARK } from '@shared/protocol'
import { fingerCurl } from '../gestures/classifier'
import type { FingerName } from '../gestures/types'
import { COLORS } from '../styles/tokens'

export interface HandChordOverlayProps {
  landmarkFrame: LandmarkFrame | null
  visible: boolean
}

// Panel dimensions
const PANEL_W = 160
const PANEL_H = 200
const SKEL_PAD = 10
const SKEL_SIZE = 140 // PANEL_W - 2*SKEL_PAD
const CURL_BAR_TOP = SKEL_SIZE + SKEL_PAD + 4
const CURL_BAR_W = 8
const CURL_BAR_H = 30
const CURL_BAR_GAP = 16

// Hand skeleton connections (same as GestureOverlay)
const HAND_CONNECTIONS: [number, number][] = [
  [LANDMARK.WRIST, LANDMARK.THUMB_CMC],
  [LANDMARK.THUMB_CMC, LANDMARK.THUMB_MCP],
  [LANDMARK.THUMB_MCP, LANDMARK.THUMB_IP],
  [LANDMARK.THUMB_IP, LANDMARK.THUMB_TIP],
  [LANDMARK.WRIST, LANDMARK.INDEX_MCP],
  [LANDMARK.INDEX_MCP, LANDMARK.INDEX_PIP],
  [LANDMARK.INDEX_PIP, LANDMARK.INDEX_DIP],
  [LANDMARK.INDEX_DIP, LANDMARK.INDEX_TIP],
  [LANDMARK.WRIST, LANDMARK.MIDDLE_MCP],
  [LANDMARK.MIDDLE_MCP, LANDMARK.MIDDLE_PIP],
  [LANDMARK.MIDDLE_PIP, LANDMARK.MIDDLE_DIP],
  [LANDMARK.MIDDLE_DIP, LANDMARK.MIDDLE_TIP],
  [LANDMARK.WRIST, LANDMARK.RING_MCP],
  [LANDMARK.RING_MCP, LANDMARK.RING_PIP],
  [LANDMARK.RING_PIP, LANDMARK.RING_DIP],
  [LANDMARK.RING_DIP, LANDMARK.RING_TIP],
  [LANDMARK.WRIST, LANDMARK.PINKY_MCP],
  [LANDMARK.PINKY_MCP, LANDMARK.PINKY_PIP],
  [LANDMARK.PINKY_PIP, LANDMARK.PINKY_DIP],
  [LANDMARK.PINKY_DIP, LANDMARK.PINKY_TIP],
  [LANDMARK.INDEX_MCP, LANDMARK.MIDDLE_MCP],
  [LANDMARK.MIDDLE_MCP, LANDMARK.RING_MCP],
  [LANDMARK.RING_MCP, LANDMARK.PINKY_MCP]
]

// All 10 fingertip pairs for chord lines
const FINGERTIP_INDICES = [
  LANDMARK.THUMB_TIP,
  LANDMARK.INDEX_TIP,
  LANDMARK.MIDDLE_TIP,
  LANDMARK.RING_TIP,
  LANDMARK.PINKY_TIP
]

const CHORD_PAIRS: [number, number][] = []
for (let i = 0; i < FINGERTIP_INDICES.length; i++) {
  for (let j = i + 1; j < FINGERTIP_INDICES.length; j++) {
    CHORD_PAIRS.push([FINGERTIP_INDICES[i], FINGERTIP_INDICES[j]])
  }
}

const FINGER_NAMES: FingerName[] = ['thumb', 'index', 'middle', 'ring', 'pinky']

// Color interpolation: green (close) → yellow → red (far)
function chordColor(normalizedDist: number): string {
  const t = Math.max(0, Math.min(1, normalizedDist))
  if (t < 0.5) {
    // green → yellow
    const s = t * 2
    const r = Math.round(s * 255)
    const g = 255
    return `rgb(${r},${g},0)`
  }
  // yellow → red
  const s = (t - 0.5) * 2
  const r = 255
  const g = Math.round((1 - s) * 255)
  return `rgb(${r},${g},0)`
}

// Curl bar color: green (extended/0) → orange (half) → red (curled/1)
function curlColor(curl: number): string {
  const t = Math.max(0, Math.min(1, curl))
  if (t < 0.5) {
    const s = t * 2
    const r = Math.round(s * 255)
    const g = Math.round(200 - s * 50)
    return `rgb(${r},${g},0)`
  }
  const s = (t - 0.5) * 2
  const r = 255
  const g = Math.round(150 * (1 - s))
  return `rgb(${r},${g},0)`
}

/**
 * Scale 21 landmarks into a bounding box of SKEL_SIZE × SKEL_SIZE with SKEL_PAD offset.
 * Returns scaled [x, y] for each landmark index.
 */
function scaleLandmarks(landmarks: Landmark[]): Array<[number, number]> {
  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x
    if (lm.x > maxX) maxX = lm.x
    if (lm.y < minY) minY = lm.y
    if (lm.y > maxY) maxY = lm.y
  }
  const rangeX = maxX - minX || 0.001
  const rangeY = maxY - minY || 0.001
  // Uniform scale to fit in square, centered
  const scale = SKEL_SIZE / Math.max(rangeX, rangeY)
  const offsetX = SKEL_PAD + (SKEL_SIZE - rangeX * scale) / 2
  const offsetY = SKEL_PAD + (SKEL_SIZE - rangeY * scale) / 2

  return landmarks.map(lm => [
    (lm.x - minX) * scale + offsetX,
    (lm.y - minY) * scale + offsetY
  ])
}

/** Euclidean distance between two 3D landmarks */
function dist3d(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

function drawHand(ctx: CanvasRenderingContext2D, hand: Hand): void {
  const lm = hand.landmarks
  const pts = scaleLandmarks(lm)

  // 1. Draw skeleton bones
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'
  ctx.lineWidth = 1
  for (const [i, j] of HAND_CONNECTIONS) {
    const a = pts[i]
    const b = pts[j]
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }

  // 2. Draw chord arcs between all 10 fingertip pairs
  // Compute max possible distance for normalization (palm diagonal)
  const palmDist = dist3d(lm[LANDMARK.WRIST], lm[LANDMARK.MIDDLE_TIP])
  const maxDist = Math.max(palmDist, 0.001)

  for (const [i, j] of CHORD_PAIRS) {
    const d = dist3d(lm[i], lm[j])
    const norm = Math.min(d / maxDist, 1)
    ctx.strokeStyle = chordColor(norm)
    ctx.lineWidth = 1 + (1 - norm) * 2 // 1-3px: thicker when close
    ctx.globalAlpha = 0.7
    ctx.beginPath()
    ctx.moveTo(pts[i][0], pts[i][1])
    ctx.lineTo(pts[j][0], pts[j][1])
    ctx.stroke()
  }
  ctx.globalAlpha = 1.0

  // 3. Draw landmark dots
  ctx.fillStyle = 'rgba(255,255,255,0.5)'
  for (const pt of pts) {
    ctx.beginPath()
    ctx.arc(pt[0], pt[1], 2, 0, Math.PI * 2)
    ctx.fill()
  }

  // Highlight fingertips
  for (const tipIdx of FINGERTIP_INDICES) {
    const pt = pts[tipIdx]
    ctx.beginPath()
    ctx.arc(pt[0], pt[1], 3, 0, Math.PI * 2)
    ctx.fillStyle = '#fff'
    ctx.fill()
  }

  // 4. Draw curl bars
  const curls = FINGER_NAMES.map(name => fingerCurl(lm, name))
  const totalBarWidth = FINGER_NAMES.length * CURL_BAR_W + (FINGER_NAMES.length - 1) * (CURL_BAR_GAP - CURL_BAR_W)
  const barStartX = (PANEL_W - totalBarWidth) / 2

  for (let i = 0; i < FINGER_NAMES.length; i++) {
    const x = barStartX + i * CURL_BAR_GAP
    const curl = curls[i]
    const fillH = curl * CURL_BAR_H

    // Bar background
    ctx.fillStyle = 'rgba(255,255,255,0.1)'
    ctx.fillRect(x, CURL_BAR_TOP, CURL_BAR_W, CURL_BAR_H)

    // Bar fill (bottom-up)
    ctx.fillStyle = curlColor(curl)
    ctx.fillRect(x, CURL_BAR_TOP + CURL_BAR_H - fillH, CURL_BAR_W, fillH)

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.font = '7px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(FINGER_NAMES[i][0].toUpperCase(), x + CURL_BAR_W / 2, CURL_BAR_TOP + CURL_BAR_H + 9)
  }
}

export function HandChordOverlay({
  landmarkFrame,
  visible
}: HandChordOverlayProps): React.ReactElement | null {
  const leftCanvasRef = useRef<HTMLCanvasElement>(null)
  const rightCanvasRef = useRef<HTMLCanvasElement>(null)
  const lastFrameRef = useRef<number>(-1)

  const draw = useCallback(() => {
    const frameId = landmarkFrame?.frameId ?? -1
    if (frameId === lastFrameRef.current && frameId !== -1) return
    lastFrameRef.current = frameId

    const leftCtx = leftCanvasRef.current?.getContext('2d')
    const rightCtx = rightCanvasRef.current?.getContext('2d')

    // Clear both
    leftCtx?.clearRect(0, 0, PANEL_W, PANEL_H)
    rightCtx?.clearRect(0, 0, PANEL_W, PANEL_H)

    if (!landmarkFrame || landmarkFrame.hands.length === 0) return

    for (const hand of landmarkFrame.hands) {
      const ctx = hand.handedness === 'left' ? leftCtx : rightCtx
      if (!ctx) continue

      // Panel background
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.beginPath()
      ctx.roundRect(0, 0, PANEL_W, PANEL_H, 8)
      ctx.fill()

      // Border matching hand color
      ctx.strokeStyle = hand.handedness === 'right' ? COLORS.handRight : COLORS.handLeft
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.roundRect(0, 0, PANEL_W, PANEL_H, 8)
      ctx.stroke()

      drawHand(ctx, hand)
    }
  }, [landmarkFrame])

  useEffect(() => {
    draw()
  }, [draw])

  if (!visible) return null

  return (
    <>
      {/* Left hand — above ClusterLegend to avoid layout collision */}
      <canvas
        ref={leftCanvasRef}
        width={PANEL_W}
        height={PANEL_H}
        style={{
          position: 'absolute',
          bottom: 230,
          left: 16,
          pointerEvents: 'none',
          width: PANEL_W,
          height: PANEL_H
        }}
      />
      {/* Right hand — bottom-right */}
      <canvas
        ref={rightCanvasRef}
        width={PANEL_W}
        height={PANEL_H}
        style={{
          position: 'absolute',
          bottom: 16,
          right: 16,
          pointerEvents: 'none',
          width: PANEL_W,
          height: PANEL_H
        }}
      />
    </>
  )
}
