import { app, BrowserWindow, ipcMain, dialog, screen } from 'electron'
import { join } from 'path'
import { readFile, stat } from 'fs/promises'
import { IPC } from '@shared/ipc-channels'
import type { AppConfig, CalibrationProfile, GestureEvent, LandmarkFrame } from '@shared/protocol'
import { initPersistence, getPersistence } from './persistence'
import { isAllowedPath } from './security'
import { z } from 'zod'
import { PartialAppConfigSchema, CalibrationProfileSchema, LandmarkFrameSchema, GestureEventSchema } from './ipc-validators'
import { BusServer } from './bus/server'
import { RateLimiter } from './rate-limiter'
import { deepMerge } from './deep-merge'
import { initUpdater } from './updater'
import { createOverlayManager } from './overlay'
import type { OverlayManager } from './overlay'

// ─── Global error handlers ──────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason instanceof Error ? reason.message : String(reason))
})

process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught exception:', error.message)
})

// Force ANGLE GL backend and disable Vulkan to suppress driver warnings
if (app.commandLine) {
  app.commandLine.appendSwitch('use-angle', 'gl')
  app.commandLine.appendSwitch('use-gl', 'angle')
  app.commandLine.appendSwitch('disable-vulkan')
}

let mainWindow: BrowserWindow | null = null
let busServer: BusServer | null = null
let overlayManager: OverlayManager | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    transparent: true,
    frame: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Needed for native addon access via preload
    },
    title: 'Gestalt — Hand-Tracked 3D Explorer'
  })

  // In dev, load the Vite dev server URL
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ─── Rate Limiter for IPC write operations (60 req/sec) ─────────
const ipcWriteLimiter = new RateLimiter(60, 1000)

// ─── Rate Limiter for IPC read operations (200 req/sec) ─────────
const ipcReadLimiter = new RateLimiter(200, 1000)

// ─── Profile ID validation schema ───────────────────────────────
const IdSchema = z.string().min(1).max(100)
const NullableIdSchema = z.string().min(1).max(100).nullable()

/** Maximum file size for FILE_LOAD (50MB) */
const MAX_FILE_SIZE = 50 * 1024 * 1024

// ─── IPC Handlers ───────────────────────────────────────────────

function setupIpcHandlers(): void {
  // Echo test (dev)
  ipcMain.handle(IPC.ECHO, (_event, msg: unknown) => {
    if (typeof msg !== 'string' || msg.length > 1000) {
      return 'Echo: [invalid input]'
    }
    return `Echo: ${msg}`
  })

  // Landmark frames from renderer tracking (gated logging to avoid console spam)
  let landmarkWarnCount = 0
  ipcMain.on(IPC.LANDMARK_FRAME, (_event, frame: LandmarkFrame) => {
    const parsed = LandmarkFrameSchema.safeParse(frame)
    if (!parsed.success) {
      landmarkWarnCount++
      if (landmarkWarnCount <= 3 || landmarkWarnCount % 100 === 0) {
        console.warn(`[Main] Invalid LandmarkFrame (total: ${landmarkWarnCount}):`, parsed.error.message)
      }
      return
    }
    // Forward to bus, input modules when they're ready
    void parsed.data // Placeholder
  })

  // Gesture events from renderer (gated logging to avoid console spam)
  let gestureWarnCount = 0
  ipcMain.on(IPC.GESTURE_EVENT, (_event, gesture: GestureEvent) => {
    const parsed = GestureEventSchema.safeParse(gesture)
    if (!parsed.success) {
      gestureWarnCount++
      if (gestureWarnCount <= 3 || gestureWarnCount % 100 === 0) {
        console.warn(`[Main] Invalid GestureEvent (total: ${gestureWarnCount}):`, parsed.error.message)
      }
      return
    }
    // Forward to input modules and bus when they're ready
    void parsed.data // Placeholder
  })

  // Config management
  ipcMain.handle(IPC.CONFIG_GET, () => {
    if (!ipcReadLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    try {
      return getPersistence().getPersistedConfig()
    } catch (err) {
      throw new Error(`Failed to get config: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.CONFIG_SET, (_event, partial: Partial<AppConfig>) => {
    if (!ipcWriteLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    try {
      const parsed = PartialAppConfigSchema.safeParse(partial)
      if (!parsed.success) {
        throw new Error(`Invalid config: ${parsed.error.message}`)
      }
      const persistence = getPersistence()
      const current = persistence.getPersistedConfig()
      const updated = deepMerge(current, parsed.data as Partial<typeof current>)
      persistence.setPersistedConfig(updated)
      mainWindow?.webContents.send(IPC.CONFIG_CHANGED, updated)
    } catch (err) {
      throw new Error(`Failed to set config: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Calibration profile management
  ipcMain.handle(IPC.PROFILE_LIST, () => {
    if (!ipcReadLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    try {
      return getPersistence().getProfiles()
    } catch (err) {
      throw new Error(`Failed to list profiles: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_GET, (_event, id: string) => {
    if (!ipcReadLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    const parsed = IdSchema.safeParse(id)
    if (!parsed.success) {
      throw new Error(`Invalid profile id: ${parsed.error.message}`)
    }
    try {
      return getPersistence().getProfile(parsed.data)
    } catch (err) {
      throw new Error(`Failed to get profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_CREATE, (_event, profile: CalibrationProfile) => {
    if (!ipcWriteLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    try {
      const parsed = CalibrationProfileSchema.safeParse(profile)
      if (!parsed.success) {
        throw new Error(`Invalid profile: ${parsed.error.message}`)
      }
      getPersistence().createProfile(parsed.data as CalibrationProfile)
    } catch (err) {
      throw new Error(`Failed to create profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_UPDATE, (_event, id: string, updates: Partial<CalibrationProfile>) => {
    if (!ipcWriteLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    try {
      const parsed = CalibrationProfileSchema.partial().safeParse(updates)
      if (!parsed.success) {
        throw new Error(`Invalid profile update: ${parsed.error.message}`)
      }
      getPersistence().updateProfile(id, parsed.data as Partial<CalibrationProfile>)
    } catch (err) {
      throw new Error(`Failed to update profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_DELETE, (_event, id: string) => {
    if (!ipcWriteLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    const parsed = IdSchema.safeParse(id)
    if (!parsed.success) {
      throw new Error(`Invalid profile id: ${parsed.error.message}`)
    }
    try {
      getPersistence().deleteProfile(parsed.data)
    } catch (err) {
      throw new Error(`Failed to delete profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_SET_ACTIVE, (_event, id: string | null) => {
    const parsed = NullableIdSchema.safeParse(id)
    if (!parsed.success) {
      throw new Error(`Invalid profile id: ${parsed.error.message}`)
    }
    try {
      getPersistence().setActiveProfileId(parsed.data)
    } catch (err) {
      throw new Error(`Failed to set active profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_GET_ACTIVE, () => {
    if (!ipcReadLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    try {
      return getPersistence().getActiveProfileId()
    } catch (err) {
      throw new Error(`Failed to get active profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Full persisted state (for initial hydration)
  ipcMain.handle(IPC.PERSIST_GET_ALL, () => {
    if (!ipcReadLimiter.tryAcquire()) {
      throw new Error('Rate limit exceeded')
    }
    try {
      return getPersistence().getPersistedData()
    } catch (err) {
      throw new Error(`Failed to get persisted data: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // File operations
  ipcMain.handle(IPC.FILE_OPEN_DIALOG, async (_event, filters?: Electron.FileFilter[]) => {
    try {
      if (!mainWindow) return null
      const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: filters ?? [
          { name: 'Graph Data', extensions: ['json', 'graphml'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      })
      return result.canceled ? null : result.filePaths[0]
    } catch (err) {
      throw new Error(`Failed to open file dialog: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Load bundled sample files (no path security check — restricted to assets/samples/)
  ipcMain.handle(IPC.SAMPLE_LOAD, async (_event, name: string) => {
    // Only allow alphanumeric, dash, underscore, dot filenames
    if (!/^[\w.-]+$/.test(name)) {
      throw new Error('Invalid sample name')
    }
    const samplesDir = join(app.isPackaged
      ? join(process.resourcesPath, 'assets', 'samples')
      : join(__dirname, '../../assets/samples'))
    const filePath = join(samplesDir, name)
    // Verify resolved path stays within samples dir
    const { resolve } = await import('path')
    const resolved = resolve(filePath)
    if (!resolved.startsWith(resolve(samplesDir))) {
      throw new Error('Invalid sample path')
    }
    return await readFile(resolved, 'utf-8')
  })

  ipcMain.handle(IPC.FILE_LOAD, async (_event, path: string) => {
    try {
      if (!isAllowedPath(path)) {
        throw new Error('Access denied: file path outside allowed directories')
      }
      const info = await stat(path)
      if (info.size > MAX_FILE_SIZE) {
        throw new Error(`File too large: ${info.size} bytes (max ${MAX_FILE_SIZE})`)
      }
      return await readFile(path, 'utf-8')
    } catch (err) {
      if (err instanceof Error && (err.message.startsWith('Access denied') || err.message.startsWith('File too large'))) throw err
      throw new Error(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Overlay mode
  ipcMain.handle(IPC.OVERLAY_TOGGLE, () => {
    return overlayManager?.toggle() ?? false
  })

  ipcMain.handle(IPC.OVERLAY_GET, () => {
    return overlayManager?.isActive() ?? false
  })

  // Window controls (frameless)
  ipcMain.on(IPC.WINDOW_MINIMIZE, () => {
    mainWindow?.minimize()
  })

  ipcMain.on(IPC.WINDOW_MAXIMIZE, () => {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on(IPC.WINDOW_CLOSE, () => {
    mainWindow?.close()
  })
}

// ─── App Lifecycle ──────────────────────────────────────────────

app.whenReady().then(() => {
  initPersistence()
  setupIpcHandlers()
  createWindow()

  // Initialize auto-updater (only in packaged builds, not dev mode)
  if (!process.env.ELECTRON_RENDERER_URL && app.isPackaged) {
    initUpdater()
  }

  // Initialize overlay manager
  const persistence = getPersistence()
  const config = persistence.getPersistedConfig()
  overlayManager = createOverlayManager()
  overlayManager.init(mainWindow!, config.overlay?.hotkey ?? 'Super+G')

  // Start the bus server if enabled
  if (config.bus.enabled) {
    busServer = new BusServer({ port: config.bus.port })
    busServer.start().catch(err => {
      console.error('[Main] Bus server failed to start:', err instanceof Error ? err.message : String(err))
    })
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  if (overlayManager) {
    overlayManager.destroy()
    overlayManager = null
  }
  if (busServer) {
    busServer.stop().catch(() => {})
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
