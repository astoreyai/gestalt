/**
 * AxisLabels — R3F component rendering 3D axis lines with tick marks and value labels.
 * Auto-scaled from data bounds. Colors: Red=X, Green=Y, Blue=Z.
 */

import React, { useMemo } from 'react'
import { Line, Text } from '@react-three/drei'
import type { Bounds } from './axis-helpers'
import { generateTickValues } from './axis-helpers'

export interface AxisLabelsProps {
  bounds: Bounds
  /** Number of tick marks per axis (default 5) */
  tickCount?: number
  /** Whether the component is visible */
  visible?: boolean
}

const AXIS_COLORS = {
  x: '#ff4444',
  y: '#44ff44',
  z: '#4488ff'
} as const

const TICK_LENGTH = 0.3
const LABEL_SIZE = 0.6
const AXIS_LABEL_SIZE = 0.9

export function AxisLabels({
  bounds,
  tickCount = 5,
  visible = true
}: AxisLabelsProps): React.ReactElement | null {
  const axes = useMemo(() => {
    const pad = 2 // padding beyond data bounds
    return {
      x: {
        start: [bounds.min.x - pad, bounds.min.y - pad, bounds.min.z - pad] as [number, number, number],
        end: [bounds.max.x + pad, bounds.min.y - pad, bounds.min.z - pad] as [number, number, number],
        ticks: generateTickValues(bounds.min.x, bounds.max.x, tickCount),
        color: AXIS_COLORS.x,
        label: 'X'
      },
      y: {
        start: [bounds.min.x - pad, bounds.min.y - pad, bounds.min.z - pad] as [number, number, number],
        end: [bounds.min.x - pad, bounds.max.y + pad, bounds.min.z - pad] as [number, number, number],
        ticks: generateTickValues(bounds.min.y, bounds.max.y, tickCount),
        color: AXIS_COLORS.y,
        label: 'Y'
      },
      z: {
        start: [bounds.min.x - pad, bounds.min.y - pad, bounds.min.z - pad] as [number, number, number],
        end: [bounds.min.x - pad, bounds.min.y - pad, bounds.max.z + pad] as [number, number, number],
        ticks: generateTickValues(bounds.min.z, bounds.max.z, tickCount),
        color: AXIS_COLORS.z,
        label: 'Z'
      }
    }
  }, [bounds, tickCount])

  if (!visible) return null

  const baseX = bounds.min.x - 2
  const baseY = bounds.min.y - 2
  const baseZ = bounds.min.z - 2

  return (
    <group>
      {/* X axis */}
      <Line points={[axes.x.start, axes.x.end]} color={axes.x.color} lineWidth={1.5} />
      <Text
        position={[bounds.max.x + 3, baseY, baseZ]}
        fontSize={AXIS_LABEL_SIZE}
        color={axes.x.color}
        anchorX="center"
        anchorY="middle"
      >
        X
      </Text>
      {axes.x.ticks.map((v, i) => (
        <group key={`x-${i}`}>
          <Line
            points={[
              [v, baseY, baseZ],
              [v, baseY - TICK_LENGTH, baseZ]
            ]}
            color={axes.x.color}
            lineWidth={1}
          />
          <Text
            position={[v, baseY - TICK_LENGTH - 0.5, baseZ]}
            fontSize={LABEL_SIZE}
            color={axes.x.color}
            anchorX="center"
            anchorY="top"
          >
            {v.toFixed(1)}
          </Text>
        </group>
      ))}

      {/* Y axis */}
      <Line points={[axes.y.start, axes.y.end]} color={axes.y.color} lineWidth={1.5} />
      <Text
        position={[baseX, bounds.max.y + 3, baseZ]}
        fontSize={AXIS_LABEL_SIZE}
        color={axes.y.color}
        anchorX="center"
        anchorY="middle"
      >
        Y
      </Text>
      {axes.y.ticks.map((v, i) => (
        <group key={`y-${i}`}>
          <Line
            points={[
              [baseX, v, baseZ],
              [baseX - TICK_LENGTH, v, baseZ]
            ]}
            color={axes.y.color}
            lineWidth={1}
          />
          <Text
            position={[baseX - TICK_LENGTH - 0.5, v, baseZ]}
            fontSize={LABEL_SIZE}
            color={axes.y.color}
            anchorX="right"
            anchorY="middle"
          >
            {v.toFixed(1)}
          </Text>
        </group>
      ))}

      {/* Z axis */}
      <Line points={[axes.z.start, axes.z.end]} color={axes.z.color} lineWidth={1.5} />
      <Text
        position={[baseX, baseY, bounds.max.z + 3]}
        fontSize={AXIS_LABEL_SIZE}
        color={axes.z.color}
        anchorX="center"
        anchorY="middle"
      >
        Z
      </Text>
      {axes.z.ticks.map((v, i) => (
        <group key={`z-${i}`}>
          <Line
            points={[
              [baseX, baseY, v],
              [baseX, baseY - TICK_LENGTH, v]
            ]}
            color={axes.z.color}
            lineWidth={1}
          />
          <Text
            position={[baseX, baseY - TICK_LENGTH - 0.5, v]}
            fontSize={LABEL_SIZE}
            color={axes.z.color}
            anchorX="center"
            anchorY="top"
          >
            {v.toFixed(1)}
          </Text>
        </group>
      ))}
    </group>
  )
}
