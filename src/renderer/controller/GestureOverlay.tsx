/**
 * Gesture overlay — renders hand skeleton, active gesture indicator,
 * motion metrics, and motion trails as a 2D canvas overlay.
 */

import React, { useRef, useEffect, useCallback } from 'react'
import type { LandmarkFrame, GestureEvent } from '@shared/protocol'
import { LANDMARK, GestureType, GesturePhase } from '@shared/protocol'
import { getGestureActionLabel } from './gesture-labels'
import { updateLabelState } from './gesture-label-state'
import type { LabelState } from './gesture-label-state'
import type { HandMotionMetrics } from '../tracker/motion'
import { PositionTrail } from '../tracker/trail'

export interface GestureOverlayProps {
  landmarkFrame: LandmarkFrame | null
  activeGesture: GestureEvent | null
  visible: boolean
  width: number
  height: number
  /** Per-hand motion metrics (velocity, rotation, z-depth) */
  motionMetrics?: HandMotionMetrics[]
  /** Whether to show motion metrics text near hands */
  showMotionMetrics?: boolean
  /** Whether to show fading motion trails */
  showMotionTrail?: boolean
}

// Connections between landmarks for drawing hand skeleton
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

/** Trail colors per hand */
const TRAIL_COLOR_RIGHT = '#4a9eff'
const TRAIL_COLOR_LEFT = '#6bcb77'

const RAD_TO_DEG = 180 / Math.PI

export function GestureOverlay({
  landmarkFrame,
  activeGesture,
  visible,
  width,
  height,
  motionMetrics,
  showMotionMetrics = false,
  showMotionTrail = true
}: GestureOverlayProps): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Track last drawn frame ID to skip redundant redraws */
  const lastDrawnFrameRef = useRef<number>(-1)

  // Motion trails — persistent across renders
  const trailLeftRef = useRef<PositionTrail>(new PositionTrail(30))
  const trailRightRef = useRef<PositionTrail>(new PositionTrail(30))
  /** Track which hands were present last frame to clear trails on hand loss */
  const prevHandsRef = useRef<Set<string>>(new Set())

  // Gesture label persistence & fade
  const labelStateRef = useRef<LabelState | null>(null)
  const fadeRafRef = useRef<number>(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Skip redraw if same frame (frameId hasn't changed)
    const frameId = landmarkFrame?.frameId ?? -1
    if (frameId === lastDrawnFrameRef.current && frameId !== -1) return
    lastDrawnFrameRef.current = frameId

    ctx.clearRect(0, 0, width, height)

    if (!landmarkFrame || landmarkFrame.hands.length === 0) {
      // Clear trails when no hands detected
      if (prevHandsRef.current.size > 0) {
        trailLeftRef.current.clear()
        trailRightRef.current.clear()
        prevHandsRef.current.clear()
      }
      return
    }

    // Track current hands for trail cleanup (reuse flags instead of allocating a Set)
    let hasLeft = false
    let hasRight = false

    for (const hand of landmarkFrame.hands) {
      const color = hand.handedness === 'right' ? '#4a9eff' : '#6bcb77'
      if (hand.handedness === 'left') hasLeft = true; else hasRight = true

      // Update motion trail
      if (showMotionTrail) {
        const wrist = hand.landmarks[LANDMARK.WRIST]
        const trail = hand.handedness === 'left' ? trailLeftRef.current : trailRightRef.current
        trail.push(wrist.x * width, wrist.y * height, landmarkFrame.timestamp)
      }

      // Draw connections
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.6

      for (const [i, j] of HAND_CONNECTIONS) {
        const a = hand.landmarks[i]
        const b = hand.landmarks[j]
        if (!a || !b) continue

        ctx.beginPath()
        ctx.moveTo(a.x * width, a.y * height)
        ctx.lineTo(b.x * width, b.y * height)
        ctx.stroke()
      }

      // Draw landmarks
      ctx.globalAlpha = 0.8
      for (const lm of hand.landmarks) {
        ctx.beginPath()
        ctx.arc(lm.x * width, lm.y * height, 3, 0, Math.PI * 2)
        ctx.fillStyle = color
        ctx.fill()
      }

      // Highlight fingertips
      ctx.globalAlpha = 1.0
      for (const tipIdx of [LANDMARK.THUMB_TIP, LANDMARK.INDEX_TIP, LANDMARK.MIDDLE_TIP, LANDMARK.RING_TIP, LANDMARK.PINKY_TIP]) {
        const tip = hand.landmarks[tipIdx]
        if (!tip) continue
        ctx.beginPath()
        ctx.arc(tip.x * width, tip.y * height, 5, 0, Math.PI * 2)
        ctx.fillStyle = '#fff'
        ctx.fill()
        ctx.strokeStyle = color
        ctx.lineWidth = 2
        ctx.stroke()
      }

      // Draw motion metrics near wrist
      if (showMotionMetrics && motionMetrics) {
        const metrics = motionMetrics.find(m => m.handedness === hand.handedness)
        if (metrics) {
          const wrist = hand.landmarks[LANDMARK.WRIST]
          const mx = wrist.x * width + 15
          const my = wrist.y * height

          ctx.globalAlpha = 0.9
          ctx.font = '10px monospace'
          ctx.fillStyle = '#fff'
          ctx.textBaseline = 'top'

          // Background for readability
          ctx.fillStyle = 'rgba(0,0,0,0.5)'
          ctx.fillRect(mx - 2, my - 2, 90, 38)

          ctx.fillStyle = '#fff'
          ctx.fillText(`vel: ${metrics.velocity.toFixed(2)}`, mx, my)
          ctx.fillText(`rot: ${(metrics.rotationRate * RAD_TO_DEG).toFixed(0)}°/s`, mx, my + 12)
          ctx.fillText(`z: ${metrics.distanceFromOrigin.toFixed(2)}`, mx, my + 24)
        }
      }
    }

    // Clear trails for lost hands
    if (!hasLeft && prevHandsRef.current.has('left')) {
      trailLeftRef.current.clear()
    }
    if (!hasRight && prevHandsRef.current.has('right')) {
      trailRightRef.current.clear()
    }
    prevHandsRef.current.clear()
    if (hasLeft) prevHandsRef.current.add('left')
    if (hasRight) prevHandsRef.current.add('right')

    // Draw motion trails (zero-allocation using forEach)
    if (showMotionTrail) {
      const trails = [trailLeftRef.current, trailRightRef.current]
      const colors = [TRAIL_COLOR_LEFT, TRAIL_COLOR_RIGHT]

      for (let ti = 0; ti < 2; ti++) {
        const trail = trails[ti]
        const trailColor = colors[ti]
        if (trail.length < 2) continue

        let prevPoint: { x: number; y: number } | null = null
        trail.forEach((point, i, total) => {
          if (prevPoint !== null) {
            const t = i / total
            ctx.globalAlpha = t * 0.8
            ctx.strokeStyle = trailColor
            ctx.lineWidth = 1.5 + t * 1.5
            ctx.beginPath()
            ctx.moveTo(prevPoint.x, prevPoint.y)
            ctx.lineTo(point.x, point.y)
            ctx.stroke()
          }
          prevPoint = point
        })
      }
    }

    // Draw hover tolerance circle around index fingertip during Point Hold
    if (
      activeGesture &&
      activeGesture.type === GestureType.Point &&
      activeGesture.phase === GesturePhase.Hold &&
      landmarkFrame
    ) {
      for (const hand of landmarkFrame.hands) {
        if (hand.handedness === activeGesture.hand) {
          const tip = hand.landmarks[LANDMARK.INDEX_TIP]
          if (tip) {
            ctx.globalAlpha = 0.6
            ctx.strokeStyle = '#4a9eff'
            ctx.lineWidth = 1
            ctx.setLineDash([4, 4])
            ctx.beginPath()
            ctx.arc(tip.x * width, tip.y * height, 20, 0, Math.PI * 2)
            ctx.stroke()
            ctx.setLineDash([])
          }
          break
        }
      }
    }

    ctx.globalAlpha = 1.0
  }, [landmarkFrame, activeGesture, width, height, motionMetrics, showMotionMetrics, showMotionTrail])

  // Update label state and schedule fade animation
  useEffect(() => {
    draw()

    const now = performance.now()
    labelStateRef.current = updateLabelState(labelStateRef.current, activeGesture, now)

    // If fading (expireTime > 0), run rAF loop to animate opacity
    if (labelStateRef.current && labelStateRef.current.expireTime > 0) {
      const tick = (): void => {
        const t = performance.now()
        const next = updateLabelState(labelStateRef.current, null, t)
        labelStateRef.current = next
        if (next && next.expireTime > 0) {
          fadeRafRef.current = requestAnimationFrame(tick)
        }
      }
      cancelAnimationFrame(fadeRafRef.current)
      fadeRafRef.current = requestAnimationFrame(tick)
    } else {
      cancelAnimationFrame(fadeRafRef.current)
    }

    return () => {
      cancelAnimationFrame(fadeRafRef.current)
    }
  }, [draw, activeGesture])

  if (!visible) return null

  const label = labelStateRef.current

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
      {label && (
        <div
          style={{
            position: 'absolute',
            bottom: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '6px 16px',
            background: 'rgba(74, 158, 255, 0.8)',
            borderRadius: 20,
            fontSize: 14,
            fontWeight: 'bold',
            color: '#fff',
            textTransform: 'uppercase',
            letterSpacing: 1,
            opacity: label.opacity,
            transition: 'none'
          }}
        >
          {getGestureActionLabel(
            label.text as GestureType,
            activeGesture?.phase ?? GesturePhase.Hold
          )}
        </div>
      )}
    </div>
  )
}
