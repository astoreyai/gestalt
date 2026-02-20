import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { IPC } from '@shared/ipc-channels'

// ─── Update status types ────────────────────────────────────────

export type UpdateStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; info: UpdateInfo }
  | { state: 'not-available'; info: UpdateInfo }
  | { state: 'downloading'; progress: ProgressInfo }
  | { state: 'downloaded'; info: UpdateInfo }
  | { state: 'error'; error: string }

// ─── Module state ───────────────────────────────────────────────

let currentStatus: UpdateStatus = { state: 'idle' }

function getMainWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows()
  return windows.length > 0 ? windows[0] : null
}

function sendStatusToRenderer(status: UpdateStatus): void {
  currentStatus = status
  const win = getMainWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send(IPC.UPDATE_STATUS, status)
  }
}

// ─── Configure and start the auto-updater ───────────────────────

export interface UpdaterOptions {
  /** Override the update provider. Defaults to 'github'. */
  provider?: 'github' | 'generic' | 's3' | 'spaces'
  /** GitHub owner/repo (e.g. 'astoreyai/tracking'). Only used with 'github' provider. */
  repo?: string
  /** GitHub owner. Only used with 'github' provider. */
  owner?: string
  /** Generic update server URL. Only used with 'generic' provider. */
  url?: string
}

export function initUpdater(options: UpdaterOptions = {}): void {
  const { provider = 'github', repo, owner, url } = options

  // Reset status on (re)initialization
  currentStatus = { state: 'idle' }

  // Configure the update source
  if (provider === 'github') {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: owner ?? 'astoreyai',
      repo: repo ?? 'tracking'
    })
  } else if (provider === 'generic' && url) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url
    })
  }

  // Disable auto-download so the user can control when to install
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // ─── Event handlers ─────────────────────────────────────────

  autoUpdater.on('checking-for-update', () => {
    console.log('[Updater] Checking for update...')
    sendStatusToRenderer({ state: 'checking' })
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    console.log(`[Updater] Update available: v${info.version}`)
    sendStatusToRenderer({ state: 'available', info })
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    console.log(`[Updater] No update available (current: v${info.version})`)
    sendStatusToRenderer({ state: 'not-available', info })
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    console.log(`[Updater] Download progress: ${progress.percent.toFixed(1)}%`)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send(IPC.UPDATE_PROGRESS, progress)
    }
    sendStatusToRenderer({ state: 'downloading', progress })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    console.log(`[Updater] Update downloaded: v${info.version}`)
    sendStatusToRenderer({ state: 'downloaded', info })
  })

  autoUpdater.on('error', (err: Error) => {
    console.error('[Updater] Error:', err.message)
    sendStatusToRenderer({ state: 'error', error: err.message })
  })

  // ─── IPC handlers ──────────────────────────────────────────

  ipcMain.handle(IPC.UPDATE_CHECK, async () => {
    console.log('[Updater] Manual update check requested')
    try {
      const result = await autoUpdater.checkForUpdates()
      if (result?.updateInfo) {
        // Also trigger download if update is available
        await autoUpdater.downloadUpdate()
      }
      return result?.updateInfo ?? null
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error('[Updater] Check failed:', message)
      sendStatusToRenderer({ state: 'error', error: message })
      return null
    }
  })

  ipcMain.handle(IPC.UPDATE_STATUS, () => {
    return currentStatus
  })

  ipcMain.handle(IPC.UPDATE_INSTALL, () => {
    console.log('[Updater] Installing update and restarting...')
    autoUpdater.quitAndInstall(false, true)
  })

  console.log('[Updater] Initialized with provider:', provider)
}
