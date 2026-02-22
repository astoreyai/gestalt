/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('platform', () => {
  const originalEnv = process.env
  const originalPlatform = process.platform

  beforeEach(() => {
    process.env = { ...originalEnv }
    // Clear relevant env vars for a clean slate
    delete process.env.XDG_SESSION_TYPE
    delete process.env.WAYLAND_DISPLAY
    // Reset module cache so each test gets fresh imports
    vi.resetModules()
  })

  afterEach(() => {
    process.env = originalEnv
    Object.defineProperty(process, 'platform', { value: originalPlatform })
  })

  describe('detectDisplayServer', () => {
    it('should return wayland when XDG_SESSION_TYPE=wayland', async () => {
      process.env.XDG_SESSION_TYPE = 'wayland'
      const { detectDisplayServer } = await import('../platform')
      expect(detectDisplayServer()).toBe('wayland')
    })

    it('should return x11 when XDG_SESSION_TYPE=x11', async () => {
      process.env.XDG_SESSION_TYPE = 'x11'
      const { detectDisplayServer } = await import('../platform')
      expect(detectDisplayServer()).toBe('x11')
    })

    it('should be case-insensitive for XDG_SESSION_TYPE', async () => {
      process.env.XDG_SESSION_TYPE = 'Wayland'
      const { detectDisplayServer } = await import('../platform')
      expect(detectDisplayServer()).toBe('wayland')
    })

    it('should return wayland when WAYLAND_DISPLAY is set (fallback)', async () => {
      delete process.env.XDG_SESSION_TYPE
      process.env.WAYLAND_DISPLAY = 'wayland-0'
      const { detectDisplayServer } = await import('../platform')
      expect(detectDisplayServer()).toBe('wayland')
    })

    it('should return unknown when no env vars are set', async () => {
      delete process.env.XDG_SESSION_TYPE
      delete process.env.WAYLAND_DISPLAY
      const { detectDisplayServer } = await import('../platform')
      expect(detectDisplayServer()).toBe('unknown')
    })

    it('should prioritize XDG_SESSION_TYPE over WAYLAND_DISPLAY', async () => {
      process.env.XDG_SESSION_TYPE = 'x11'
      process.env.WAYLAND_DISPLAY = 'wayland-0'
      const { detectDisplayServer } = await import('../platform')
      expect(detectDisplayServer()).toBe('x11')
    })
  })

  describe('getElectronFlags', () => {
    it('should return ozone flag on wayland+linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      process.env.XDG_SESSION_TYPE = 'wayland'
      const { getElectronFlags } = await import('../platform')
      expect(getElectronFlags()).toEqual(['--ozone-platform-hint=auto'])
    })

    it('should return empty array on x11', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      process.env.XDG_SESSION_TYPE = 'x11'
      const { getElectronFlags } = await import('../platform')
      expect(getElectronFlags()).toEqual([])
    })

    it('should return empty array on unknown display server', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      delete process.env.XDG_SESSION_TYPE
      delete process.env.WAYLAND_DISPLAY
      const { getElectronFlags } = await import('../platform')
      expect(getElectronFlags()).toEqual([])
    })

    it('should return empty array on non-linux platform', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      process.env.XDG_SESSION_TYPE = 'wayland'
      const { getElectronFlags } = await import('../platform')
      expect(getElectronFlags()).toEqual([])
    })
  })

  describe('isLinux', () => {
    it('should return true when platform is linux', async () => {
      Object.defineProperty(process, 'platform', { value: 'linux', configurable: true })
      const { isLinux } = await import('../platform')
      expect(isLinux()).toBe(true)
    })

    it('should return false when platform is darwin', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
      const { isLinux } = await import('../platform')
      expect(isLinux()).toBe(false)
    })

    it('should return false when platform is win32', async () => {
      Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
      const { isLinux } = await import('../platform')
      expect(isLinux()).toBe(false)
    })
  })
})
