import { describe, it, expect } from 'vitest'
import { computeDataBounds, generateTickValues } from '../axis-helpers'
import type { EmbeddingPoint } from '@shared/protocol'

describe('computeDataBounds', () => {
  it('computes min/max from points', () => {
    const points: EmbeddingPoint[] = [
      { id: 'a', position: { x: -5, y: 0, z: 10 } },
      { id: 'b', position: { x: 3, y: 8, z: -2 } },
      { id: 'c', position: { x: 1, y: -4, z: 5 } }
    ]
    const bounds = computeDataBounds(points)
    expect(bounds.min.x).toBe(-5)
    expect(bounds.max.x).toBe(3)
    expect(bounds.min.y).toBe(-4)
    expect(bounds.max.y).toBe(8)
    expect(bounds.min.z).toBe(-2)
    expect(bounds.max.z).toBe(10)
  })

  it('handles single point', () => {
    const points: EmbeddingPoint[] = [
      { id: 'a', position: { x: 5, y: 5, z: 5 } }
    ]
    const bounds = computeDataBounds(points)
    expect(bounds.min.x).toBe(5)
    expect(bounds.max.x).toBe(5)
  })

  it('handles empty array with default bounds', () => {
    const bounds = computeDataBounds([])
    expect(bounds.min.x).toBe(0)
    expect(bounds.max.x).toBe(0)
  })

  it('handles all identical points', () => {
    const points: EmbeddingPoint[] = [
      { id: 'a', position: { x: 3, y: 3, z: 3 } },
      { id: 'b', position: { x: 3, y: 3, z: 3 } }
    ]
    const bounds = computeDataBounds(points)
    expect(bounds.min.x).toBe(3)
    expect(bounds.max.x).toBe(3)
  })
})

describe('generateTickValues', () => {
  it('generates correct number of ticks', () => {
    const ticks = generateTickValues(0, 10, 5)
    expect(ticks).toHaveLength(5)
  })

  it('includes min and max', () => {
    const ticks = generateTickValues(0, 100, 5)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBe(100)
  })

  it('handles equal min and max', () => {
    const ticks = generateTickValues(5, 5, 3)
    expect(ticks).toHaveLength(1)
    expect(ticks[0]).toBe(5)
  })

  it('handles negative range', () => {
    const ticks = generateTickValues(-10, -2, 3)
    expect(ticks[0]).toBe(-10)
    expect(ticks[ticks.length - 1]).toBe(-2)
  })

  it('returns single value for count of 1', () => {
    const ticks = generateTickValues(0, 10, 1)
    expect(ticks).toHaveLength(1)
  })

  it('evenly spaces values', () => {
    const ticks = generateTickValues(0, 10, 3)
    expect(ticks[0]).toBe(0)
    expect(ticks[1]).toBe(5)
    expect(ticks[2]).toBe(10)
  })

  it('handles count of 0', () => {
    const ticks = generateTickValues(0, 10, 0)
    expect(ticks).toHaveLength(0)
  })
})
