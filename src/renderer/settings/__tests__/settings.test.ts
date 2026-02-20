import { describe, it, expect } from 'vitest'
import { DEFAULT_CONFIG, type AppConfig } from '@shared/protocol'

describe('Settings Configuration', () => {
  it('should have valid tracking defaults', () => {
    expect(DEFAULT_CONFIG.tracking.enabled).toBe(true)
    expect(DEFAULT_CONFIG.tracking.smoothingFactor).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_CONFIG.tracking.smoothingFactor).toBeLessThanOrEqual(1)
    expect(DEFAULT_CONFIG.tracking.minConfidence).toBeGreaterThanOrEqual(0)
    expect(DEFAULT_CONFIG.tracking.minConfidence).toBeLessThanOrEqual(1)
  })

  it('should have valid gesture defaults', () => {
    expect(DEFAULT_CONFIG.gestures.minHoldDuration).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.gestures.cooldownDuration).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.gestures.sensitivity).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.gestures.sensitivity).toBeLessThanOrEqual(1)
  })

  it('should have valid input defaults', () => {
    expect(DEFAULT_CONFIG.input.mouseSpeed).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.input.scrollSpeed).toBeGreaterThan(0)
  })

  it('should have valid bus defaults', () => {
    expect(DEFAULT_CONFIG.bus.port).toBeGreaterThan(0)
    expect(DEFAULT_CONFIG.bus.port).toBeLessThan(65536)
    expect(DEFAULT_CONFIG.bus.enabled).toBe(true)
  })

  it('should have valid visualization defaults', () => {
    expect(['graph', 'manifold', 'split']).toContain(DEFAULT_CONFIG.visualization.defaultView)
    expect(DEFAULT_CONFIG.visualization.lodEnabled).toBe(true)
    expect(DEFAULT_CONFIG.visualization.maxFps).toBeGreaterThan(0)
  })

  it('should be deeply clonable without reference sharing', () => {
    const clone: AppConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
    clone.tracking.enabled = false
    expect(DEFAULT_CONFIG.tracking.enabled).toBe(true)
  })

  it('should support partial config updates', () => {
    const base = { ...DEFAULT_CONFIG }
    const partial: Partial<AppConfig> = {
      tracking: { ...base.tracking, smoothingFactor: 0.8 }
    }
    const merged = { ...base, ...partial }
    expect(merged.tracking.smoothingFactor).toBe(0.8)
    expect(merged.bus.port).toBe(9876)
  })
})
