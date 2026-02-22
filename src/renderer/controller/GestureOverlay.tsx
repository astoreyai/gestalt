/**
 * Gesture overlay — renders hand skeleton and active gesture indicator
 * as a 2D canvas overlay on top of the 3D scene.
 */

import React, { useRef, useEffect, useCallback } from 'react'
import type { LandmarkFrame, GestureEvent } from '@shared/protocol'
import { LANDMARK } from '@shared/protocol'
import { getGestureActionLabel } from './gesture-labels'

export interface GestureOverlayProps {
  landmarkFrame: LandmarkFrame | null
  activeGesture: GestureEvent | null
  visible: boolean
  width: number
  height: number
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

export function GestureOverlay({
  landmarkFrame,
  activeGesture,
  visible,
  width,
  height
}: GestureOverlayProps): React.ReactElement | null {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Track last drawn frame ID to skip redundant redraws */
  const lastDrawnFrameRef = useRef<number>(-1)

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

    if (!landmarkFrame || landmarkFrame.hands.length === 0) return

    for (const hand of landmarkFrame.hands) {
      const color = hand.handedness === 'right' ? '#4a9eff' : '#6bcb77'

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
    }

    ctx.globalAlpha = 1.0
  }, [landmarkFrame, width, height])

  useEffect(() => {
    draw()
  }, [draw])

  if (!visible) return null

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}>
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        style={{ position: 'absolute', top: 0, left: 0 }}
      />
      {activeGesture && (
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
            letterSpacing: 1
          }}
        >
          {getGestureActionLabel(activeGesture.type, activeGesture.phase)}
        </div>
      )}
    </div>
  )
}
