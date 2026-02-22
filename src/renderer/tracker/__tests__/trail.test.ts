import { describe, it, expect, beforeEach } from 'vitest'
import { PositionTrail } from '../trail'

describe('PositionTrail', () => {
  let trail: PositionTrail

  beforeEach(() => {
    trail = new PositionTrail(5)
  })

  it('starts empty', () => {
    expect(trail.length).toBe(0)
    expect(trail.getPoints()).toEqual([])
  })

  it('stores pushed points', () => {
    trail.push(10, 20, 100)
    expect(trail.length).toBe(1)
    const pts = trail.getPoints()
    expect(pts).toHaveLength(1)
    expect(pts[0]).toEqual({ x: 10, y: 20, timestamp: 100 })
  })

  it('returns points in chronological order', () => {
    trail.push(1, 1, 100)
    trail.push(2, 2, 200)
    trail.push(3, 3, 300)
    const pts = trail.getPoints()
    expect(pts[0].timestamp).toBe(100)
    expect(pts[1].timestamp).toBe(200)
    expect(pts[2].timestamp).toBe(300)
  })

  it('evicts oldest when capacity exceeded', () => {
    for (let i = 0; i < 7; i++) {
      trail.push(i, i, i * 100)
    }
    expect(trail.length).toBe(5) // capacity is 5
    const pts = trail.getPoints()
    // Oldest 2 (0, 1) should be evicted
    expect(pts[0].x).toBe(2)
    expect(pts[pts.length - 1].x).toBe(6)
  })

  it('wraps around correctly', () => {
    // Fill exactly to capacity
    for (let i = 0; i < 5; i++) {
      trail.push(i, i, i * 100)
    }
    expect(trail.length).toBe(5)
    // Push one more to wrap
    trail.push(5, 5, 500)
    expect(trail.length).toBe(5)
    const pts = trail.getPoints()
    expect(pts[0].x).toBe(1)
    expect(pts[4].x).toBe(5)
  })

  it('clear resets the trail', () => {
    trail.push(1, 1, 100)
    trail.push(2, 2, 200)
    trail.clear()
    expect(trail.length).toBe(0)
    expect(trail.getPoints()).toEqual([])
  })

  it('works after clear', () => {
    trail.push(1, 1, 100)
    trail.clear()
    trail.push(10, 20, 300)
    expect(trail.length).toBe(1)
    expect(trail.getPoints()[0]).toEqual({ x: 10, y: 20, timestamp: 300 })
  })

  it('handles capacity of 1', () => {
    const tiny = new PositionTrail(1)
    tiny.push(1, 1, 100)
    expect(tiny.length).toBe(1)
    tiny.push(2, 2, 200)
    expect(tiny.length).toBe(1)
    expect(tiny.getPoints()[0].x).toBe(2)
  })

  it('handles capacity of 0 (uses minimum 1)', () => {
    const zero = new PositionTrail(0)
    zero.push(1, 1, 100)
    expect(zero.length).toBe(1)
  })

  it('default capacity is 30', () => {
    const def = new PositionTrail()
    for (let i = 0; i < 35; i++) {
      def.push(i, i, i * 10)
    }
    expect(def.length).toBe(30)
    const pts = def.getPoints()
    expect(pts[0].x).toBe(5)
    expect(pts[29].x).toBe(34)
  })

  it('chronological order after multiple wraps', () => {
    const t = new PositionTrail(3)
    for (let i = 0; i < 10; i++) {
      t.push(i, i, i * 100)
    }
    const pts = t.getPoints()
    expect(pts).toHaveLength(3)
    expect(pts[0].timestamp).toBeLessThan(pts[1].timestamp)
    expect(pts[1].timestamp).toBeLessThan(pts[2].timestamp)
    expect(pts[0].x).toBe(7)
    expect(pts[1].x).toBe(8)
    expect(pts[2].x).toBe(9)
  })

  it('getPoints returns a copy, not internal state', () => {
    trail.push(1, 1, 100)
    const pts1 = trail.getPoints()
    trail.push(2, 2, 200)
    const pts2 = trail.getPoints()
    expect(pts1).toHaveLength(1)
    expect(pts2).toHaveLength(2)
  })
})
