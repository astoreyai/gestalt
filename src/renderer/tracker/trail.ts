/**
 * Position trail — ring buffer for hand position history.
 * Used to render fading motion trails in the gesture overlay.
 */

export interface TrailPoint {
  x: number
  y: number
  timestamp: number
}

export class PositionTrail {
  private readonly buffer: TrailPoint[]
  private readonly capacity: number
  private writeIndex = 0
  private count = 0

  constructor(capacity: number = 30) {
    this.capacity = Math.max(1, capacity)
    this.buffer = new Array(this.capacity)
    for (let i = 0; i < this.capacity; i++) {
      this.buffer[i] = { x: 0, y: 0, timestamp: 0 }
    }
  }

  push(x: number, y: number, timestamp: number): void {
    this.buffer[this.writeIndex].x = x
    this.buffer[this.writeIndex].y = y
    this.buffer[this.writeIndex].timestamp = timestamp
    this.writeIndex = (this.writeIndex + 1) % this.capacity
    if (this.count < this.capacity) this.count++
  }

  /** Return points in chronological order (oldest first) */
  getPoints(): TrailPoint[] {
    if (this.count === 0) return []

    const result: TrailPoint[] = new Array(this.count)
    // Start reading from the oldest entry
    const start = this.count < this.capacity ? 0 : this.writeIndex

    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity
      const src = this.buffer[idx]
      result[i] = { x: src.x, y: src.y, timestamp: src.timestamp }
    }

    return result
  }

  /**
   * Iterate points in chronological order without allocating a new array.
   * Calls `fn(point, index, total)` for each point from oldest to newest.
   */
  forEach(fn: (point: TrailPoint, index: number, total: number) => void): void {
    if (this.count === 0) return
    const start = this.count < this.capacity ? 0 : this.writeIndex
    for (let i = 0; i < this.count; i++) {
      fn(this.buffer[(start + i) % this.capacity], i, this.count)
    }
  }

  get length(): number {
    return this.count
  }

  clear(): void {
    this.writeIndex = 0
    this.count = 0
  }
}
