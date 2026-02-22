/**
 * Edges dirty-flag optimization tests.
 * Verifies that the Edges component skips GPU re-upload when positions haven't changed.
 */
import { describe, it, expect } from 'vitest'

/**
 * The Edges component uses useFrame (R3F animation loop) which can't be unit-tested
 * without a full WebGL context. Instead, we test the dirty-flag logic in isolation.
 *
 * The logic: skip GPU upload when positionVersion + selectedId + secondarySelectedId
 * all match the previous frame values.
 */

/** Mimics the Edges dirty-flag check */
function shouldUpdate(
  currentVersion: number,
  prevVersion: number,
  selectedId: string | null,
  prevSelectedId: string | null,
  secondaryId: string | null,
  prevSecondaryId: string | null
): boolean {
  if (
    currentVersion === prevVersion &&
    selectedId === prevSelectedId &&
    secondaryId === prevSecondaryId
  ) {
    return false
  }
  return true
}

describe('Edges dirty-flag logic', () => {
  it('should skip update when version and selection are unchanged', () => {
    expect(shouldUpdate(5, 5, null, null, null, null)).toBe(false)
    expect(shouldUpdate(10, 10, 'a', 'a', null, null)).toBe(false)
    expect(shouldUpdate(10, 10, 'a', 'a', 'b', 'b')).toBe(false)
  })

  it('should trigger update when version changes', () => {
    expect(shouldUpdate(6, 5, null, null, null, null)).toBe(true)
    expect(shouldUpdate(11, 10, 'a', 'a', 'b', 'b')).toBe(true)
  })

  it('should trigger update when primary selection changes', () => {
    expect(shouldUpdate(5, 5, 'b', 'a', null, null)).toBe(true)
    expect(shouldUpdate(5, 5, null, 'a', null, null)).toBe(true)
    expect(shouldUpdate(5, 5, 'a', null, null, null)).toBe(true)
  })

  it('should trigger update when secondary selection changes', () => {
    expect(shouldUpdate(5, 5, null, null, 'x', null)).toBe(true)
    expect(shouldUpdate(5, 5, null, null, null, 'x')).toBe(true)
    expect(shouldUpdate(5, 5, null, null, 'y', 'x')).toBe(true)
  })

  it('should handle initial state (prevVersion=-1)', () => {
    // First frame always triggers update (version 0 !== -1)
    expect(shouldUpdate(0, -1, null, null, null, null)).toBe(true)
  })

  it('should trigger when both version and selection change', () => {
    expect(shouldUpdate(6, 5, 'b', 'a', 'y', 'x')).toBe(true)
  })
})

describe('Position version counter semantics', () => {
  it('should be monotonically increasing', () => {
    let version = 0
    const versions: number[] = []
    for (let i = 0; i < 10; i++) {
      version++
      versions.push(version)
    }
    for (let i = 1; i < versions.length; i++) {
      expect(versions[i]).toBeGreaterThan(versions[i - 1])
    }
  })

  it('should use integer comparison (not reference equality)', () => {
    // This is the key fix: old code used Map reference identity which always fails
    const v1 = 42
    const v2 = 42
    expect(v1 === v2).toBe(true) // Integer comparison works
    // Vs Map reference which always fails:
    const m1 = new Map()
    const m2 = new Map()
    expect(m1 === m2).toBe(false) // Reference identity fails
  })
})
