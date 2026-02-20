/**
 * IPC channel name constants for communication between
 * renderer ↔ preload ↔ main processes.
 */

export const IPC = {
  // Hand tracking → main process
  LANDMARK_FRAME: 'tracking:landmark-frame',
  TRACKING_STATUS: 'tracking:status',

  // Gesture events → main process
  GESTURE_EVENT: 'gesture:event',

  // Input commands (renderer → main)
  MOUSE_COMMAND: 'input:mouse',
  KEYBOARD_COMMAND: 'input:keyboard',
  PROGRAM_COMMAND: 'input:program',

  // Connector bus
  BUS_STATUS: 'bus:status',
  BUS_CONNECTED_PROGRAMS: 'bus:programs',
  BUS_SEND: 'bus:send',

  // Config
  CONFIG_GET: 'config:get',
  CONFIG_SET: 'config:set',
  CONFIG_CHANGED: 'config:changed',

  // Data loading
  FILE_OPEN_DIALOG: 'data:open-dialog',
  FILE_LOAD: 'data:load',

  // Calibration profiles
  PROFILE_LIST: 'profile:list',
  PROFILE_GET: 'profile:get',
  PROFILE_CREATE: 'profile:create',
  PROFILE_UPDATE: 'profile:update',
  PROFILE_DELETE: 'profile:delete',
  PROFILE_SET_ACTIVE: 'profile:set-active',
  PROFILE_GET_ACTIVE: 'profile:get-active',

  // Persistence
  PERSIST_GET_ALL: 'persist:get-all',

  // Auto-update
  UPDATE_CHECK: 'update:check',
  UPDATE_STATUS: 'update:status',
  UPDATE_INSTALL: 'update:install',
  UPDATE_PROGRESS: 'update:progress',

  // App lifecycle
  APP_READY: 'app:ready',
  APP_QUIT: 'app:quit',

  // Echo test (dev)
  ECHO: 'dev:echo'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
