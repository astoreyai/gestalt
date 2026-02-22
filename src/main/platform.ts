/**
 * Wayland / X11 display server detection and Electron flag utilities.
 *
 * Used at startup to apply platform-specific Electron flags (e.g. Ozone on Wayland)
 * before the BrowserWindow is created.
 */

export type DisplayServer = 'x11' | 'wayland' | 'unknown'

/**
 * Detect the active display server.
 *
 * Priority:
 *  1. `$XDG_SESSION_TYPE` (canonical, set by most session managers)
 *  2. `$WAYLAND_DISPLAY` (fallback — present when a Wayland compositor is running)
 *  3. `'unknown'`
 */
export function detectDisplayServer(): DisplayServer {
  const sessionType = process.env.XDG_SESSION_TYPE?.toLowerCase()
  if (sessionType === 'wayland') return 'wayland'
  if (sessionType === 'x11') return 'x11'
  if (process.env.WAYLAND_DISPLAY) return 'wayland'
  return 'unknown'
}

/**
 * Return Electron command-line flags for the current platform/display server.
 *
 * On Wayland-based Linux sessions this returns `['--ozone-platform-hint=auto']`
 * so Electron uses the native Wayland backend instead of XWayland.
 */
export function getElectronFlags(): string[] {
  if (!isLinux()) return []
  const ds = detectDisplayServer()
  if (ds === 'wayland') return ['--ozone-platform-hint=auto']
  return []
}

/** Returns `true` when the host OS is Linux. */
export function isLinux(): boolean {
  return process.platform === 'linux'
}
