/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { deepMerge } from '../deep-merge'

describe('deepMerge', () => {
  it('should merge flat objects like Object.assign', () => {
    const target = { a: 1, b: 2 }
    const source = { b: 3, c: 4 }
    const result = deepMerge(target, source)
    expect(result).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('should recursively merge nested objects', () => {
    const target = {
      tracking: { enabled: true, smoothingFactor: 0.5, minConfidence: 0.7 },
      input: { mouseSpeed: 1.0 }
    }
    const source = {
      tracking: { enabled: false }
    }
    const result = deepMerge(target, source as Partial<typeof target>)
    expect(result).toEqual({
      tracking: { enabled: false, smoothingFactor: 0.5, minConfidence: 0.7 },
      input: { mouseSpeed: 1.0 }
    })
  })

  it('should NOT merge arrays — replace them entirely', () => {
    const target = { tags: ['a', 'b', 'c'], name: 'test' }
    const source = { tags: ['x'] }
    const result = deepMerge(target, source)
    expect(result).toEqual({ tags: ['x'], name: 'test' })
  })

  it('should handle deeply nested merges (3+ levels)', () => {
    const target = {
      level1: {
        level2: {
          level3: { value: 'original', keep: true }
        }
      }
    }
    const source = {
      level1: {
        level2: {
          level3: { value: 'updated' }
        }
      }
    }
    const result = deepMerge(target, source as Partial<typeof target>)
    expect(result.level1.level2.level3.value).toBe('updated')
    expect(result.level1.level2.level3.keep).toBe(true)
  })

  it('should not mutate the target object', () => {
    const target = { a: 1, nested: { b: 2 } }
    const source = { nested: { b: 99 } }
    const result = deepMerge(target, source as Partial<typeof target>)
    expect(result.nested.b).toBe(99)
    expect(target.nested.b).toBe(2) // unchanged
  })

  it('should skip undefined values in source', () => {
    const target = { a: 1, b: 2 }
    const source = { a: undefined, b: 3 }
    const result = deepMerge(target, source)
    expect(result).toEqual({ a: 1, b: 3 })
  })

  it('should allow overwriting a value with null', () => {
    const target = { a: 1, b: { nested: true } } as Record<string, unknown>
    const source = { b: null }
    const result = deepMerge(target, source)
    expect(result.b).toBeNull()
  })

  it('should handle an empty source object', () => {
    const target = { a: 1, b: { c: 2 } }
    const result = deepMerge(target, {})
    expect(result).toEqual({ a: 1, b: { c: 2 } })
  })

  it('should handle replacing a nested object with a primitive', () => {
    const target = { setting: { deep: true } } as Record<string, unknown>
    const source = { setting: 'flat' }
    const result = deepMerge(target, source)
    expect(result.setting).toBe('flat')
  })

  it('should handle replacing a primitive with a nested object', () => {
    const target = { setting: 'flat' } as Record<string, unknown>
    const source = { setting: { deep: true } }
    const result = deepMerge(target, source)
    expect(result.setting).toEqual({ deep: true })
  })
})
