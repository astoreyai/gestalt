/**
 * Simple sliding-window rate limiter.
 *
 * Used to throttle IPC write operations and prevent DoS via rapid calls.
 */
export class RateLimiter {
  private timestamps: number[] = []

  constructor(
    private maxRequests: number,
    private windowMs: number
  ) {}

  /** Returns true if the request should be allowed */
  tryAcquire(): boolean {
    const now = Date.now()
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs)
    if (this.timestamps.length >= this.maxRequests) return false
    this.timestamps.push(now)
    return true
  }

  reset(): void {
    this.timestamps = []
  }
}
