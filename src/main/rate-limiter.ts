/**
 * Ring-buffer rate limiter.
 *
 * Uses a fixed-size circular buffer instead of array filtering
 * for O(1) tryAcquire() instead of O(n).
 */
export class RateLimiter {
  private readonly buf: number[]
  private head = 0
  private count = 0

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number
  ) {
    this.buf = new Array(maxRequests + 1).fill(0)
  }

  /** Returns true if the request should be allowed */
  tryAcquire(): boolean {
    const now = Date.now()
    const cutoff = now - this.windowMs

    // Evict expired entries from the front of the ring
    while (this.count > 0 && this.buf[this.head] <= cutoff) {
      this.head = (this.head + 1) % this.buf.length
      this.count--
    }

    if (this.count >= this.maxRequests) return false

    // Push to the tail
    const tail = (this.head + this.count) % this.buf.length
    this.buf[tail] = now
    this.count++
    return true
  }

  reset(): void {
    this.head = 0
    this.count = 0
  }
}
