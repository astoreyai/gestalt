import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '@shared/ipc-channels'
import type {
  LandmarkFrame,
  GestureEvent,
  MouseCommand,
  KeyboardCommand,
  AppConfig,
  CalibrationProfile,
  PersistedData
} from '@shared/protocol'

/**
 * Exposes a typed API from main process to renderer via contextBridge.
 * Renderer accesses this as `window.api`.
 */
const api = {
  // ─── Hand Tracking ────────────────────────────────────────────
  sendLandmarkFrame: (frame: LandmarkFrame) =>
    ipcRenderer.send(IPC.LANDMARK_FRAME, frame),

  // ─── Gestures ─────────────────────────────────────────────────
  sendGestureEvent: (event: GestureEvent) =>
    ipcRenderer.send(IPC.GESTURE_EVENT, event),

  // ─── Input Commands ───────────────────────────────────────────
  sendMouseCommand: (cmd: MouseCommand) =>
    ipcRenderer.send(IPC.MOUSE_COMMAND, cmd),

  sendKeyboardCommand: (cmd: KeyboardCommand) =>
    ipcRenderer.send(IPC.KEYBOARD_COMMAND, cmd),

  // ─── Connector Bus ────────────────────────────────────────────
  onBusStatus: (callback: (programs: unknown[]) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, programs: unknown[]) => callback(programs)
    ipcRenderer.on(IPC.BUS_CONNECTED_PROGRAMS, handler)
    return () => ipcRenderer.removeListener(IPC.BUS_CONNECTED_PROGRAMS, handler)
  },

  // ─── Config ───────────────────────────────────────────────────
  getConfig: (): Promise<AppConfig> =>
    ipcRenderer.invoke(IPC.CONFIG_GET),

  setConfig: (config: Partial<AppConfig>): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_SET, config),

  onConfigChanged: (callback: (config: AppConfig) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, config: AppConfig) => callback(config)
    ipcRenderer.on(IPC.CONFIG_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.CONFIG_CHANGED, handler)
  },

  // ─── Data Loading ─────────────────────────────────────────────
  openFileDialog: (filters?: Electron.FileFilter[]): Promise<string | null> =>
    ipcRenderer.invoke(IPC.FILE_OPEN_DIALOG, filters),

  loadFile: (path: string): Promise<string> =>
    ipcRenderer.invoke(IPC.FILE_LOAD, path),

  loadSample: (name: string): Promise<string> =>
    ipcRenderer.invoke(IPC.SAMPLE_LOAD, name),

  // ─── Calibration Profiles ──────────────────────────────────────
  listProfiles: (): Promise<CalibrationProfile[]> =>
    ipcRenderer.invoke(IPC.PROFILE_LIST),

  getProfile: (id: string): Promise<CalibrationProfile | null> =>
    ipcRenderer.invoke(IPC.PROFILE_GET, id),

  createProfile: (profile: CalibrationProfile): Promise<void> =>
    ipcRenderer.invoke(IPC.PROFILE_CREATE, profile),

  updateProfile: (id: string, updates: Partial<CalibrationProfile>): Promise<void> =>
    ipcRenderer.invoke(IPC.PROFILE_UPDATE, id, updates),

  deleteProfile: (id: string): Promise<void> =>
    ipcRenderer.invoke(IPC.PROFILE_DELETE, id),

  setActiveProfile: (id: string | null): Promise<void> =>
    ipcRenderer.invoke(IPC.PROFILE_SET_ACTIVE, id),

  getActiveProfile: (): Promise<string | null> =>
    ipcRenderer.invoke(IPC.PROFILE_GET_ACTIVE),

  // ─── Persistence ───────────────────────────────────────────────
  getAllPersistedData: (): Promise<PersistedData> =>
    ipcRenderer.invoke(IPC.PERSIST_GET_ALL),

  // ─── Auto-Update ──────────────────────────────────────────────
  checkForUpdate: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC.UPDATE_CHECK),

  installUpdate: (): Promise<void> =>
    ipcRenderer.invoke(IPC.UPDATE_INSTALL),

  onUpdateStatus: (callback: (status: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: unknown) => callback(status)
    ipcRenderer.on(IPC.UPDATE_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_STATUS, handler)
  },

  onUpdateProgress: (callback: (progress: unknown) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown) => callback(progress)
    ipcRenderer.on(IPC.UPDATE_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC.UPDATE_PROGRESS, handler)
  },

  // ─── Dev ──────────────────────────────────────────────────────
  echo: (msg: string): Promise<string> =>
    ipcRenderer.invoke(IPC.ECHO, msg)
}

export type TrackingAPI = typeof api

contextBridge.exposeInMainWorld('api', api)
