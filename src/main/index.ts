import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFile } from 'fs/promises'
import { IPC } from '@shared/ipc-channels'
import type { AppConfig, CalibrationProfile, GestureEvent, LandmarkFrame } from '@shared/protocol'
import { initPersistence, getPersistence } from './persistence'
import { isAllowedPath } from './security'
import { PartialAppConfigSchema, CalibrationProfileSchema } from './ipc-validators'
import { BusServer } from './bus/server'

let mainWindow: BrowserWindow | null = null
let busServer: BusServer | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false // Needed for native addon access via preload
    },
    title: 'Tracking — Hand-Tracked 3D Explorer'
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

// ─── IPC Handlers ───────────────────────────────────────────────

function setupIpcHandlers(): void {
  // Echo test (dev)
  ipcMain.handle(IPC.ECHO, (_event, msg: string) => {
    console.log(`[IPC Echo] ${msg}`)
    return `Echo: ${msg}`
  })

  // Landmark frames from renderer tracking
  ipcMain.on(IPC.LANDMARK_FRAME, (_event, frame: LandmarkFrame) => {
    // Forward to bus, input modules when they're ready
    void frame // Placeholder
  })

  // Gesture events from renderer
  ipcMain.on(IPC.GESTURE_EVENT, (_event, gesture: GestureEvent) => {
    // Forward to input modules and bus when they're ready
    void gesture // Placeholder
  })

  // Config management
  ipcMain.handle(IPC.CONFIG_GET, () => {
    try {
      return getPersistence().getPersistedConfig()
    } catch (err) {
      throw new Error(`Failed to get config: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.CONFIG_SET, (_event, partial: Partial<AppConfig>) => {
    try {
      const parsed = PartialAppConfigSchema.safeParse(partial)
      if (!parsed.success) {
        throw new Error(`Invalid config: ${parsed.error.message}`)
      }
      const persistence = getPersistence()
      const current = persistence.getPersistedConfig()
      const updated = { ...current, ...parsed.data }
      persistence.setPersistedConfig(updated)
      mainWindow?.webContents.send(IPC.CONFIG_CHANGED, updated)
    } catch (err) {
      throw new Error(`Failed to set config: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Calibration profile management
  ipcMain.handle(IPC.PROFILE_LIST, () => {
    try {
      return getPersistence().getProfiles()
    } catch (err) {
      throw new Error(`Failed to list profiles: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_GET, (_event, id: string) => {
    try {
      return getPersistence().getProfile(id)
    } catch (err) {
      throw new Error(`Failed to get profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_CREATE, (_event, profile: CalibrationProfile) => {
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
    try {
      getPersistence().deleteProfile(id)
    } catch (err) {
      throw new Error(`Failed to delete profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_SET_ACTIVE, (_event, id: string | null) => {
    try {
      getPersistence().setActiveProfileId(id)
    } catch (err) {
      throw new Error(`Failed to set active profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  ipcMain.handle(IPC.PROFILE_GET_ACTIVE, () => {
    try {
      return getPersistence().getActiveProfileId()
    } catch (err) {
      throw new Error(`Failed to get active profile: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  // Full persisted state (for initial hydration)
  ipcMain.handle(IPC.PERSIST_GET_ALL, () => {
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

  ipcMain.handle(IPC.FILE_LOAD, async (_event, path: string) => {
    try {
      if (!isAllowedPath(path)) {
        throw new Error('Access denied: file path outside allowed directories')
      }
      return await readFile(path, 'utf-8')
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Access denied')) throw err
      throw new Error(`Failed to load file: ${err instanceof Error ? err.message : String(err)}`)
    }
  })
}

// ─── App Lifecycle ──────────────────────────────────────────────

app.whenReady().then(() => {
  initPersistence()
  setupIpcHandlers()
  createWindow()

  // Start the bus server if enabled
  const persistence = getPersistence()
  const config = persistence.getPersistedConfig()
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
  if (busServer) {
    busServer.stop().catch(() => {})
  }
})

app.on('window-all-closed', () => {
  app.quit()
})
