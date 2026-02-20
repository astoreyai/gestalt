/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { RateLimiter } from '../rate-limiter'

describe('RateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should allow requests under limit', () => {
    const limiter = new RateLimiter(5, 1000)

    for (let i = 0; i < 5; i++) {
      expect(limiter.tryAcquire()).toBe(true)
    }
  })

  it('should reject requests over limit', () => {
    const limiter = new RateLimiter(3, 1000)

    // First 3 should be allowed
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)

    // 4th should be rejected
    expect(limiter.tryAcquire()).toBe(false)
    expect(limiter.tryAcquire()).toBe(false)
  })

  it('should reset after window expires', () => {
    const limiter = new RateLimiter(2, 1000)

    // Fill the limit
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)

    // Advance time past the window
    vi.advanceTimersByTime(1001)

    // Should be allowed again
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)
  })

  it('should reset manually', () => {
    const limiter = new RateLimiter(2, 1000)

    // Fill the limit
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)

    // Manual reset
    limiter.reset()

    // Should be allowed again
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(true)
    expect(limiter.tryAcquire()).toBe(false)
  })
})
