/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { IPC } from '@shared/ipc-channels'

// ─── Mock electron APIs ──────────────────────────────────────────
const mockSend = vi.fn()
const mockInvoke = vi.fn()
const mockOn = vi.fn()
const mockRemoveListener = vi.fn()
const mockExposeInMainWorld = vi.fn()

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (...args: unknown[]) => mockExposeInMainWorld(...args)
  },
  ipcRenderer: {
    send: (...args: unknown[]) => mockSend(...args),
    invoke: (...args: unknown[]) => mockInvoke(...args),
    on: (...args: unknown[]) => mockOn(...args),
    removeListener: (...args: unknown[]) => mockRemoveListener(...args)
  }
}))

// ─── Import the preload module (triggers exposeInMainWorld) ──────
// We must import after mocking
let api: Record<string, (...args: unknown[]) => unknown>

beforeEach(() => {
  vi.clearAllMocks()
  mockInvoke.mockResolvedValue(undefined)
})

/**
 * Helper: import the preload module and extract the API object
 * that was passed to contextBridge.exposeInMainWorld.
 */
async function getExposedApi(): Promise<Record<string, (...args: unknown[]) => unknown>> {
  // Re-import each time so exposeInMainWorld is called fresh
  await import('../index')
  expect(mockExposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object))
  return mockExposeInMainWorld.mock.calls[0][1] as Record<string, (...args: unknown[]) => unknown>
}

describe('preload/index.ts', () => {
  // Load the API once before all tests in this describe block
  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    mockInvoke.mockResolvedValue(undefined)
    api = await getExposedApi()
  })

  describe('contextBridge.exposeInMainWorld', () => {
    it('should expose the API as "api"', () => {
      expect(mockExposeInMainWorld).toHaveBeenCalledWith('api', expect.any(Object))
    })
  })

  // ─── ipcRenderer.send methods ──────────────────────────────────

  describe('send-based methods (fire-and-forget)', () => {
    it('sendLandmarkFrame should send on IPC.LANDMARK_FRAME channel', () => {
      const frame = { hands: [], timestamp: 1, frameId: 0 }
      api.sendLandmarkFrame(frame)
      expect(mockSend).toHaveBeenCalledWith(IPC.LANDMARK_FRAME, frame)
      expect(mockSend).toHaveBeenCalledWith('tracking:landmark-frame', frame)
    })

    it('sendGestureEvent should send on IPC.GESTURE_EVENT channel', () => {
      const event = { type: 'pinch', phase: 'onset', hand: 'left' }
      api.sendGestureEvent(event)
      expect(mockSend).toHaveBeenCalledWith(IPC.GESTURE_EVENT, event)
      expect(mockSend).toHaveBeenCalledWith('gesture:event', event)
    })

    it('sendMouseCommand should send on IPC.MOUSE_COMMAND channel', () => {
      const cmd = { target: 'mouse', action: 'click', x: 100, y: 200 }
      api.sendMouseCommand(cmd)
      expect(mockSend).toHaveBeenCalledWith(IPC.MOUSE_COMMAND, cmd)
      expect(mockSend).toHaveBeenCalledWith('input:mouse', cmd)
    })

    it('sendKeyboardCommand should send on IPC.KEYBOARD_COMMAND channel', () => {
      const cmd = { target: 'keyboard', action: 'press', key: 'a' }
      api.sendKeyboardCommand(cmd)
      expect(mockSend).toHaveBeenCalledWith(IPC.KEYBOARD_COMMAND, cmd)
      expect(mockSend).toHaveBeenCalledWith('input:keyboard', cmd)
    })
  })

  // ─── ipcRenderer.invoke methods ────────────────────────────────

  describe('invoke-based methods (request/response)', () => {
    it('getConfig should invoke IPC.CONFIG_GET', async () => {
      const mockConfig = { tracking: { enabled: true } }
      mockInvoke.mockResolvedValueOnce(mockConfig)
      const result = await api.getConfig()
      expect(mockInvoke).toHaveBeenCalledWith(IPC.CONFIG_GET)
      expect(mockInvoke).toHaveBeenCalledWith('config:get')
      expect(result).toEqual(mockConfig)
    })

    it('setConfig should invoke IPC.CONFIG_SET with partial config', async () => {
      const partial = { tracking: { enabled: false } }
      await api.setConfig(partial)
      expect(mockInvoke).toHaveBeenCalledWith(IPC.CONFIG_SET, partial)
      expect(mockInvoke).toHaveBeenCalledWith('config:set', partial)
    })

    it('openFileDialog should invoke IPC.FILE_OPEN_DIALOG with filters', async () => {
      const filters = [{ name: 'JSON', extensions: ['json'] }]
      mockInvoke.mockResolvedValueOnce('/some/file.json')
      const result = await api.openFileDialog(filters)
      expect(mockInvoke).toHaveBeenCalledWith(IPC.FILE_OPEN_DIALOG, filters)
      expect(mockInvoke).toHaveBeenCalledWith('data:open-dialog', filters)
      expect(result).toBe('/some/file.json')
    })

    it('loadFile should invoke IPC.FILE_LOAD with path', async () => {
      mockInvoke.mockResolvedValueOnce('file contents')
      const result = await api.loadFile('/some/file.json')
      expect(mockInvoke).toHaveBeenCalledWith(IPC.FILE_LOAD, '/some/file.json')
      expect(mockInvoke).toHaveBeenCalledWith('data:load', '/some/file.json')
      expect(result).toBe('file contents')
    })

    it('echo should invoke IPC.ECHO with message', async () => {
      mockInvoke.mockResolvedValueOnce('Echo: hello')
      const result = await api.echo('hello')
      expect(mockInvoke).toHaveBeenCalledWith(IPC.ECHO, 'hello')
      expect(mockInvoke).toHaveBeenCalledWith('dev:echo', 'hello')
      expect(result).toBe('Echo: hello')
    })
  })

  // ─── Calibration profile methods ───────────────────────────────

  describe('calibration profile methods', () => {
    it('listProfiles should invoke IPC.PROFILE_LIST', async () => {
      mockInvoke.mockResolvedValueOnce([])
      const result = await api.listProfiles()
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PROFILE_LIST)
      expect(mockInvoke).toHaveBeenCalledWith('profile:list')
      expect(result).toEqual([])
    })

    it('getProfile should invoke IPC.PROFILE_GET with id', async () => {
      mockInvoke.mockResolvedValueOnce({ id: 'p1', name: 'Test' })
      const result = await api.getProfile('p1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PROFILE_GET, 'p1')
      expect(mockInvoke).toHaveBeenCalledWith('profile:get', 'p1')
      expect(result).toEqual({ id: 'p1', name: 'Test' })
    })

    it('createProfile should invoke IPC.PROFILE_CREATE', async () => {
      const profile = { id: 'p1', name: 'Test' }
      await api.createProfile(profile)
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PROFILE_CREATE, profile)
      expect(mockInvoke).toHaveBeenCalledWith('profile:create', profile)
    })

    it('updateProfile should invoke IPC.PROFILE_UPDATE with id and updates', async () => {
      const updates = { name: 'Updated' }
      await api.updateProfile('p1', updates)
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PROFILE_UPDATE, 'p1', updates)
      expect(mockInvoke).toHaveBeenCalledWith('profile:update', 'p1', updates)
    })

    it('deleteProfile should invoke IPC.PROFILE_DELETE with id', async () => {
      await api.deleteProfile('p1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PROFILE_DELETE, 'p1')
      expect(mockInvoke).toHaveBeenCalledWith('profile:delete', 'p1')
    })

    it('setActiveProfile should invoke IPC.PROFILE_SET_ACTIVE', async () => {
      await api.setActiveProfile('p1')
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PROFILE_SET_ACTIVE, 'p1')
      expect(mockInvoke).toHaveBeenCalledWith('profile:set-active', 'p1')
    })

    it('setActiveProfile should handle null id', async () => {
      await api.setActiveProfile(null)
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PROFILE_SET_ACTIVE, null)
    })

    it('getActiveProfile should invoke IPC.PROFILE_GET_ACTIVE', async () => {
      mockInvoke.mockResolvedValueOnce('p1')
      const result = await api.getActiveProfile()
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PROFILE_GET_ACTIVE)
      expect(mockInvoke).toHaveBeenCalledWith('profile:get-active')
      expect(result).toBe('p1')
    })
  })

  // ─── Persistence ───────────────────────────────────────────────

  describe('persistence methods', () => {
    it('getAllPersistedData should invoke IPC.PERSIST_GET_ALL', async () => {
      const mockData = { config: {}, profiles: [], activeProfileId: null, calibrated: false }
      mockInvoke.mockResolvedValueOnce(mockData)
      const result = await api.getAllPersistedData()
      expect(mockInvoke).toHaveBeenCalledWith(IPC.PERSIST_GET_ALL)
      expect(mockInvoke).toHaveBeenCalledWith('persist:get-all')
      expect(result).toEqual(mockData)
    })
  })

  // ─── ipcRenderer.on listener methods ───────────────────────────

  describe('listener-based methods (event subscriptions)', () => {
    it('onBusStatus should register listener on IPC.BUS_CONNECTED_PROGRAMS', () => {
      const callback = vi.fn()
      api.onBusStatus(callback)
      expect(mockOn).toHaveBeenCalledWith(IPC.BUS_CONNECTED_PROGRAMS, expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('bus:programs', expect.any(Function))
    })

    it('onBusStatus should return an unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = api.onBusStatus(callback) as () => void
      expect(typeof unsubscribe).toBe('function')

      unsubscribe()
      expect(mockRemoveListener).toHaveBeenCalledWith(
        IPC.BUS_CONNECTED_PROGRAMS,
        expect.any(Function)
      )
    })

    it('onBusStatus handler should forward programs to callback', () => {
      const callback = vi.fn()
      api.onBusStatus(callback)

      // Extract the handler passed to ipcRenderer.on
      const handler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === IPC.BUS_CONNECTED_PROGRAMS
      )![1] as (event: unknown, programs: unknown[]) => void

      const mockPrograms = [{ name: 'program1' }]
      handler({} /* mock event */, mockPrograms)
      expect(callback).toHaveBeenCalledWith(mockPrograms)
    })

    it('onConfigChanged should register listener on IPC.CONFIG_CHANGED', () => {
      const callback = vi.fn()
      api.onConfigChanged(callback)
      expect(mockOn).toHaveBeenCalledWith(IPC.CONFIG_CHANGED, expect.any(Function))
      expect(mockOn).toHaveBeenCalledWith('config:changed', expect.any(Function))
    })

    it('onConfigChanged should return an unsubscribe function', () => {
      const callback = vi.fn()
      const unsubscribe = api.onConfigChanged(callback) as () => void
      expect(typeof unsubscribe).toBe('function')

      unsubscribe()
      expect(mockRemoveListener).toHaveBeenCalledWith(
        IPC.CONFIG_CHANGED,
        expect.any(Function)
      )
    })

    it('onConfigChanged handler should forward config to callback', () => {
      const callback = vi.fn()
      api.onConfigChanged(callback)

      const handler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === IPC.CONFIG_CHANGED
      )![1] as (event: unknown, config: unknown) => void

      const mockConfig = { tracking: { enabled: true } }
      handler({}, mockConfig)
      expect(callback).toHaveBeenCalledWith(mockConfig)
    })
  })

  // ─── Channel name verification ─────────────────────────────────

  describe('channel name constants match IPC object', () => {
    it('all channel strings should match the IPC constant values', () => {
      // Ensure the IPC channels used in preload match the shared constants exactly
      expect(IPC.LANDMARK_FRAME).toBe('tracking:landmark-frame')
      expect(IPC.GESTURE_EVENT).toBe('gesture:event')
      expect(IPC.MOUSE_COMMAND).toBe('input:mouse')
      expect(IPC.KEYBOARD_COMMAND).toBe('input:keyboard')
      expect(IPC.BUS_CONNECTED_PROGRAMS).toBe('bus:programs')
      expect(IPC.CONFIG_GET).toBe('config:get')
      expect(IPC.CONFIG_SET).toBe('config:set')
      expect(IPC.CONFIG_CHANGED).toBe('config:changed')
      expect(IPC.FILE_OPEN_DIALOG).toBe('data:open-dialog')
      expect(IPC.FILE_LOAD).toBe('data:load')
      expect(IPC.PROFILE_LIST).toBe('profile:list')
      expect(IPC.PROFILE_GET).toBe('profile:get')
      expect(IPC.PROFILE_CREATE).toBe('profile:create')
      expect(IPC.PROFILE_UPDATE).toBe('profile:update')
      expect(IPC.PROFILE_DELETE).toBe('profile:delete')
      expect(IPC.PROFILE_SET_ACTIVE).toBe('profile:set-active')
      expect(IPC.PROFILE_GET_ACTIVE).toBe('profile:get-active')
      expect(IPC.PERSIST_GET_ALL).toBe('persist:get-all')
      expect(IPC.ECHO).toBe('dev:echo')
    })
  })
})
