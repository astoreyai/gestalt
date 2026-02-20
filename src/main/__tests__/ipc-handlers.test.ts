/**
 * @vitest-environment node
 *
 * Tests for the IPC handlers registered in src/main/index.ts.
 *
 * Strategy: We mock ipcMain.handle/on, then import the module to trigger
 * setupIpcHandlers() (called from app.whenReady), and finally invoke the
 * captured handlers directly to verify behaviour.
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { IPC } from '@shared/ipc-channels'

// ─── Captured handlers ───────────────────────────────────────────
// Maps channel name -> handler function
const handleMap = new Map<string, (...args: unknown[]) => unknown>()
const onMap = new Map<string, (...args: unknown[]) => unknown>()

// ─── Mock persistence ────────────────────────────────────────────
const mockPersistence = {
  getPersistedConfig: vi.fn().mockReturnValue({
    tracking: { enabled: true, smoothingFactor: 0.5, minConfidence: 0.7 },
    gestures: { minHoldDuration: 300, cooldownDuration: 200, sensitivity: 0.5 },
    input: { mouseSpeed: 1, scrollSpeed: 1 },
    bus: { port: 9100, enabled: false },
    visualization: { defaultView: 'graph', lodEnabled: true, maxFps: 60 }
  }),
  setPersistedConfig: vi.fn(),
  getProfiles: vi.fn().mockReturnValue([]),
  getProfile: vi.fn().mockReturnValue(null),
  createProfile: vi.fn(),
  updateProfile: vi.fn(),
  deleteProfile: vi.fn(),
  getActiveProfileId: vi.fn().mockReturnValue(null),
  setActiveProfileId: vi.fn(),
  getPersistedData: vi.fn().mockReturnValue({
    config: {},
    profiles: [],
    activeProfileId: null,
    calibrated: false
  })
}

// ─── Mock webContents for CONFIG_CHANGED broadcasts ──────────────
const mockWebContentsSend = vi.fn()

// ─── Mock electron ───────────────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    whenReady: () => Promise.resolve(),
    on: vi.fn(),
    getPath: vi.fn().mockReturnValue('/tmp/tracking-test'),
    quit: vi.fn()
  },
  BrowserWindow: class {
    static getAllWindows() { return [] }
    webPreferences = {}
    loadURL = vi.fn()
    loadFile = vi.fn()
    on = vi.fn()
    webContents = { send: mockWebContentsSend }
  },
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handleMap.set(channel, handler)
    }),
    on: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      onMap.set(channel, handler)
    })
  },
  dialog: {
    showOpenDialog: vi.fn()
  }
}))

// ─── Mock internal dependencies ──────────────────────────────────
vi.mock('../persistence', () => ({
  initPersistence: vi.fn(),
  getPersistence: () => mockPersistence
}))

vi.mock('../security', () => ({
  isAllowedPath: vi.fn((p: string) => {
    // Allow paths under /home/user/Documents, block everything else
    return p.startsWith('/home/user/Documents')
  })
}))

vi.mock('../bus/server', () => ({
  BusServer: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined)
  }))
}))

vi.mock('../rate-limiter', () => ({
  RateLimiter: vi.fn().mockImplementation(() => ({
    tryAcquire: vi.fn().mockReturnValue(true)
  }))
}))

vi.mock('../deep-merge', () => ({
  deepMerge: vi.fn((target: object, source: object) => ({ ...target, ...source }))
}))

vi.mock('fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue('file content here'),
  stat: vi.fn().mockResolvedValue({ size: 1024 })
}))

// ─── Setup ───────────────────────────────────────────────────────

beforeAll(async () => {
  // Importing main/index.ts triggers app.whenReady().then(setupIpcHandlers)
  // Because we mocked app.whenReady to return Promise.resolve(),
  // the handlers register immediately after the microtask
  await import('../index')
  // Allow the .then() callback to execute
  await new Promise(resolve => setTimeout(resolve, 50))
})

beforeEach(() => {
  vi.clearAllMocks()
  // Re-apply default mock return values after clearAllMocks
  mockPersistence.getPersistedConfig.mockReturnValue({
    tracking: { enabled: true, smoothingFactor: 0.5, minConfidence: 0.7 },
    gestures: { minHoldDuration: 300, cooldownDuration: 200, sensitivity: 0.5 },
    input: { mouseSpeed: 1, scrollSpeed: 1 },
    bus: { port: 9100, enabled: false },
    visualization: { defaultView: 'graph', lodEnabled: true, maxFps: 60 }
  })
  mockPersistence.getProfiles.mockReturnValue([])
  mockPersistence.getProfile.mockReturnValue(null)
  mockPersistence.getActiveProfileId.mockReturnValue(null)
  mockPersistence.getPersistedData.mockReturnValue({
    config: {},
    profiles: [],
    activeProfileId: null,
    calibrated: false
  })
})

// ─── Helper to invoke a handler ──────────────────────────────────
function invokeHandler(channel: string, ...args: unknown[]): unknown {
  const handler = handleMap.get(channel)
  if (!handler) throw new Error(`No handler registered for channel: ${channel}`)
  // First arg to handler is the IPC event object
  return handler({} /* mock event */, ...args)
}

function triggerOnHandler(channel: string, ...args: unknown[]): void {
  const handler = onMap.get(channel)
  if (!handler) throw new Error(`No on-handler registered for channel: ${channel}`)
  handler({} /* mock event */, ...args)
}

// ─── Tests ───────────────────────────────────────────────────────

describe('IPC handler registration', () => {
  it('should register handle for all expected channels', () => {
    const expectedHandleChannels = [
      IPC.ECHO,
      IPC.CONFIG_GET,
      IPC.CONFIG_SET,
      IPC.PROFILE_LIST,
      IPC.PROFILE_GET,
      IPC.PROFILE_CREATE,
      IPC.PROFILE_UPDATE,
      IPC.PROFILE_DELETE,
      IPC.PROFILE_SET_ACTIVE,
      IPC.PROFILE_GET_ACTIVE,
      IPC.PERSIST_GET_ALL,
      IPC.FILE_OPEN_DIALOG,
      IPC.FILE_LOAD
    ]
    for (const channel of expectedHandleChannels) {
      expect(handleMap.has(channel)).toBe(true)
    }
  })

  it('should register on-listeners for expected channels', () => {
    const expectedOnChannels = [
      IPC.LANDMARK_FRAME,
      IPC.GESTURE_EVENT
    ]
    for (const channel of expectedOnChannels) {
      expect(onMap.has(channel)).toBe(true)
    }
  })
})

describe('ECHO handler', () => {
  it('should return "Echo: <msg>"', () => {
    const result = invokeHandler(IPC.ECHO, 'hello')
    expect(result).toBe('Echo: hello')
  })

  it('should echo back arbitrary strings', () => {
    expect(invokeHandler(IPC.ECHO, 'test 123')).toBe('Echo: test 123')
    expect(invokeHandler(IPC.ECHO, '')).toBe('Echo: ')
  })
})

describe('CONFIG_GET handler', () => {
  it('should return the persisted config', () => {
    const result = invokeHandler(IPC.CONFIG_GET)
    expect(mockPersistence.getPersistedConfig).toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      tracking: expect.any(Object),
      bus: expect.any(Object)
    }))
  })
})

describe('CONFIG_SET handler', () => {
  it('should accept valid partial config and persist it', () => {
    const partial = { tracking: { enabled: false } }
    expect(() => invokeHandler(IPC.CONFIG_SET, partial)).not.toThrow()
    expect(mockPersistence.setPersistedConfig).toHaveBeenCalled()
  })

  it('should accept valid nested partial config', () => {
    const partial = {
      gestures: { sensitivity: 0.8 },
      visualization: { maxFps: 120 }
    }
    expect(() => invokeHandler(IPC.CONFIG_SET, partial)).not.toThrow()
    expect(mockPersistence.setPersistedConfig).toHaveBeenCalled()
  })

  it('should reject config with invalid smoothingFactor (> 1)', () => {
    const invalid = { tracking: { smoothingFactor: 5 } }
    expect(() => invokeHandler(IPC.CONFIG_SET, invalid)).toThrow(/Invalid config/)
  })

  it('should reject config with invalid smoothingFactor (< 0)', () => {
    const invalid = { tracking: { smoothingFactor: -1 } }
    expect(() => invokeHandler(IPC.CONFIG_SET, invalid)).toThrow(/Invalid config/)
  })

  it('should reject config with invalid bus port (too low)', () => {
    const invalid = { bus: { port: 80 } }
    expect(() => invokeHandler(IPC.CONFIG_SET, invalid)).toThrow(/Invalid config/)
  })

  it('should reject config with invalid bus port (too high)', () => {
    const invalid = { bus: { port: 99999 } }
    expect(() => invokeHandler(IPC.CONFIG_SET, invalid)).toThrow(/Invalid config/)
  })

  it('should reject config with invalid visualization defaultView', () => {
    const invalid = { visualization: { defaultView: 'invalid_view' } }
    expect(() => invokeHandler(IPC.CONFIG_SET, invalid)).toThrow(/Invalid config/)
  })

  it('should reject config with invalid maxFps (0)', () => {
    const invalid = { visualization: { maxFps: 0 } }
    expect(() => invokeHandler(IPC.CONFIG_SET, invalid)).toThrow(/Invalid config/)
  })

  it('should reject config with invalid maxFps (> 240)', () => {
    const invalid = { visualization: { maxFps: 300 } }
    expect(() => invokeHandler(IPC.CONFIG_SET, invalid)).toThrow(/Invalid config/)
  })

  it('should reject config with string where number expected', () => {
    const invalid = { tracking: { smoothingFactor: 'high' } }
    expect(() => invokeHandler(IPC.CONFIG_SET, invalid)).toThrow(/Invalid config/)
  })

  it('should accept an empty partial config', () => {
    expect(() => invokeHandler(IPC.CONFIG_SET, {})).not.toThrow()
  })
})

describe('FILE_LOAD handler', () => {
  it('should load a file from an allowed path', async () => {
    const { readFile, stat } = await import('fs/promises')
    const mockStat = vi.mocked(stat)
    const mockReadFile = vi.mocked(readFile)
    mockStat.mockResolvedValueOnce({ size: 1024 } as any)
    mockReadFile.mockResolvedValueOnce('file content here')

    const result = await invokeHandler(IPC.FILE_LOAD, '/home/user/Documents/test.json')
    expect(result).toBe('file content here')
  })

  it('should reject a file outside allowed directories', async () => {
    await expect(
      invokeHandler(IPC.FILE_LOAD, '/etc/passwd')
    ).rejects.toThrow(/Access denied/)
  })

  it('should reject a file that exceeds MAX_FILE_SIZE (50MB)', async () => {
    const { stat } = await import('fs/promises')
    const mockStat = vi.mocked(stat)
    // 51MB
    mockStat.mockResolvedValueOnce({ size: 51 * 1024 * 1024 } as any)

    await expect(
      invokeHandler(IPC.FILE_LOAD, '/home/user/Documents/huge.bin')
    ).rejects.toThrow(/File too large/)
  })

  it('should reject a file at exactly the MAX_FILE_SIZE boundary + 1', async () => {
    const { stat } = await import('fs/promises')
    const mockStat = vi.mocked(stat)
    mockStat.mockResolvedValueOnce({ size: 50 * 1024 * 1024 + 1 } as any)

    await expect(
      invokeHandler(IPC.FILE_LOAD, '/home/user/Documents/boundary.bin')
    ).rejects.toThrow(/File too large/)
  })

  it('should allow a file at exactly MAX_FILE_SIZE', async () => {
    const { stat, readFile } = await import('fs/promises')
    const mockStat = vi.mocked(stat)
    const mockReadFile = vi.mocked(readFile)
    mockStat.mockResolvedValueOnce({ size: 50 * 1024 * 1024 } as any)
    mockReadFile.mockResolvedValueOnce('content')

    const result = await invokeHandler(IPC.FILE_LOAD, '/home/user/Documents/exact.bin')
    expect(result).toBe('content')
  })
})

describe('LANDMARK_FRAME on-handler (Zod validation)', () => {
  it('should accept a valid landmark frame', () => {
    const validFrame = {
      hands: [{
        handedness: 'left',
        landmarks: Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0.0 })),
        worldLandmarks: Array.from({ length: 21 }, () => ({ x: 0.1, y: 0.2, z: 0.3 })),
        score: 0.95
      }],
      timestamp: 12345,
      frameId: 1
    }
    // Should not throw -- invalid frames are logged and dropped, not thrown
    expect(() => triggerOnHandler(IPC.LANDMARK_FRAME, validFrame)).not.toThrow()
  })

  it('should drop an invalid landmark frame (wrong landmark count)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalidFrame = {
      hands: [{
        handedness: 'left',
        landmarks: [{ x: 0, y: 0, z: 0 }], // only 1, need exactly 21
        worldLandmarks: [{ x: 0, y: 0, z: 0 }],
        score: 0.5
      }],
      timestamp: 100,
      frameId: 0
    }
    triggerOnHandler(IPC.LANDMARK_FRAME, invalidFrame)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid LandmarkFrame'),
      expect.any(String)
    )
    warnSpy.mockRestore()
  })
})

describe('GESTURE_EVENT on-handler (Zod validation)', () => {
  it('should accept a valid gesture event', () => {
    const validGesture = {
      type: 'pinch',
      phase: 'onset',
      hand: 'right',
      confidence: 0.9,
      position: { x: 1, y: 2, z: 3 },
      timestamp: 999
    }
    expect(() => triggerOnHandler(IPC.GESTURE_EVENT, validGesture)).not.toThrow()
  })

  it('should drop a gesture event with invalid type', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalid = {
      type: 'unknown_gesture',
      phase: 'onset',
      hand: 'right',
      confidence: 0.9,
      position: { x: 1, y: 2, z: 3 },
      timestamp: 999
    }
    triggerOnHandler(IPC.GESTURE_EVENT, invalid)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid GestureEvent'),
      expect.any(String)
    )
    warnSpy.mockRestore()
  })

  it('should drop a gesture event with invalid phase', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const invalid = {
      type: 'pinch',
      phase: 'invalid_phase',
      hand: 'left',
      confidence: 0.5,
      position: { x: 0, y: 0, z: 0 },
      timestamp: 0
    }
    triggerOnHandler(IPC.GESTURE_EVENT, invalid)
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid GestureEvent'),
      expect.any(String)
    )
    warnSpy.mockRestore()
  })
})

describe('PROFILE_GET handler (id validation)', () => {
  it('should accept a valid profile id', () => {
    mockPersistence.getProfile.mockReturnValueOnce({ id: 'abc', name: 'Test' })
    const result = invokeHandler(IPC.PROFILE_GET, 'abc')
    expect(result).toEqual({ id: 'abc', name: 'Test' })
    expect(mockPersistence.getProfile).toHaveBeenCalledWith('abc')
  })

  it('should reject an empty string id', () => {
    expect(() => invokeHandler(IPC.PROFILE_GET, '')).toThrow(/Invalid profile id/)
  })

  it('should reject a non-string id', () => {
    expect(() => invokeHandler(IPC.PROFILE_GET, 12345)).toThrow(/Invalid profile id/)
  })
})

describe('PROFILE_CREATE handler (CalibrationProfileSchema validation)', () => {
  const validProfile = {
    id: 'test-profile',
    name: 'Test Profile',
    sensitivity: 0.5,
    samples: [],
    createdAt: Date.now(),
    updatedAt: Date.now()
  }

  it('should accept a valid profile', () => {
    expect(() => invokeHandler(IPC.PROFILE_CREATE, validProfile)).not.toThrow()
    expect(mockPersistence.createProfile).toHaveBeenCalled()
  })

  it('should reject a profile missing required fields', () => {
    const invalid = { id: 'test' } // Missing name, sensitivity, samples, etc.
    expect(() => invokeHandler(IPC.PROFILE_CREATE, invalid)).toThrow(/Invalid profile/)
  })

  it('should reject a profile with sensitivity out of range', () => {
    const invalid = { ...validProfile, sensitivity: 5 }
    expect(() => invokeHandler(IPC.PROFILE_CREATE, invalid)).toThrow(/Invalid profile/)
  })
})

describe('PROFILE_DELETE handler', () => {
  it('should accept a valid id', () => {
    expect(() => invokeHandler(IPC.PROFILE_DELETE, 'valid-id')).not.toThrow()
    expect(mockPersistence.deleteProfile).toHaveBeenCalledWith('valid-id')
  })

  it('should reject an empty string id', () => {
    expect(() => invokeHandler(IPC.PROFILE_DELETE, '')).toThrow(/Invalid profile id/)
  })
})

describe('PROFILE_SET_ACTIVE handler', () => {
  it('should accept a valid string id', () => {
    expect(() => invokeHandler(IPC.PROFILE_SET_ACTIVE, 'p1')).not.toThrow()
    expect(mockPersistence.setActiveProfileId).toHaveBeenCalledWith('p1')
  })

  it('should accept null to clear active profile', () => {
    expect(() => invokeHandler(IPC.PROFILE_SET_ACTIVE, null)).not.toThrow()
    expect(mockPersistence.setActiveProfileId).toHaveBeenCalledWith(null)
  })

  it('should reject an empty string id', () => {
    expect(() => invokeHandler(IPC.PROFILE_SET_ACTIVE, '')).toThrow(/Invalid profile id/)
  })
})

describe('PERSIST_GET_ALL handler', () => {
  it('should return all persisted data', () => {
    const result = invokeHandler(IPC.PERSIST_GET_ALL)
    expect(mockPersistence.getPersistedData).toHaveBeenCalled()
    expect(result).toEqual(expect.objectContaining({
      config: expect.any(Object),
      profiles: expect.any(Array)
    }))
  })
})
