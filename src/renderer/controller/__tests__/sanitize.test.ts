import { describe, it, expect } from 'vitest'
import { sanitizeDisplayValue, sanitizeMetadata } from '../sanitize'

describe('sanitizeDisplayValue', () => {
  it('should escape HTML entities', () => {
    expect(sanitizeDisplayValue('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    )
  })

  it('should truncate long strings', () => {
    const longStr = 'a'.repeat(600)
    const result = sanitizeDisplayValue(longStr)
    expect(result.length).toBeLessThanOrEqual(503) // 500 + '...'
    expect(result).toMatch(/\.\.\.$/);
  })

  it('should handle null and undefined', () => {
    expect(sanitizeDisplayValue(null)).toBe('')
    expect(sanitizeDisplayValue(undefined)).toBe('')
  })

  it('should handle numbers and booleans', () => {
    expect(sanitizeDisplayValue(42)).toBe('42')
    expect(sanitizeDisplayValue(true)).toBe('true')
    expect(sanitizeDisplayValue(false)).toBe('false')
  })

  it('should prevent script injection', () => {
    const malicious = '<img src=x onerror=alert(1)>'
    const result = sanitizeDisplayValue(malicious)
    expect(result).not.toContain('<')
    expect(result).not.toContain('>')
    expect(result).toContain('&lt;')
    expect(result).toContain('&gt;')
  })

  it('should escape ampersands', () => {
    expect(sanitizeDisplayValue('foo & bar')).toBe('foo &amp; bar')
  })

  it('should escape single quotes', () => {
    expect(sanitizeDisplayValue("it's")).toBe("it&#039;s")
  })

  it('should not truncate strings at 500 or under', () => {
    const exact500 = 'b'.repeat(500)
    expect(sanitizeDisplayValue(exact500)).toBe(exact500)
  })
})

describe('sanitizeMetadata', () => {
  it('should sanitize all keys and values', () => {
    const metadata = {
      '<key>': '<value>',
      normal: 'safe'
    }
    const result = sanitizeMetadata(metadata)
    expect(result).toHaveLength(2)
    expect(result[0].key).toBe('&lt;key&gt;')
    expect(result[0].value).toBe('&lt;value&gt;')
    expect(result[1].key).toBe('normal')
    expect(result[1].value).toBe('safe')
  })

  it('should limit to 20 entries', () => {
    const metadata: Record<string, unknown> = {}
    for (let i = 0; i < 25; i++) {
      metadata[`key${i}`] = `value${i}`
    }
    const result = sanitizeMetadata(metadata)
    expect(result).toHaveLength(20)
  })

  it('should return empty array for undefined', () => {
    expect(sanitizeMetadata(undefined)).toEqual([])
  })

  it('should handle mixed value types', () => {
    const metadata = {
      count: 42,
      active: true,
      label: 'test'
    }
    const result = sanitizeMetadata(metadata)
    expect(result).toHaveLength(3)
    expect(result[0].value).toBe('42')
    expect(result[1].value).toBe('true')
    expect(result[2].value).toBe('test')
  })
})
