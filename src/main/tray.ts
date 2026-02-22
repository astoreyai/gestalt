/**
 * System tray icon with quick toggles for tracking, bus, and view modes.
 */

import { Tray, Menu, nativeImage } from 'electron'

export interface TrayState {
  trackingEnabled: boolean
  busEnabled: boolean
  connectedPrograms: number
  overlayActive: boolean
}

export class SystemTray {
  private tray: Tray | null = null
  private state: TrayState = {
    trackingEnabled: true,
    busEnabled: true,
    connectedPrograms: 0,
    overlayActive: false
  }
  private onToggleTracking: ((enabled: boolean) => void) | null = null
  private onToggleBus: ((enabled: boolean) => void) | null = null
  private onToggleOverlay: (() => void) | null = null
  private onShowWindow: (() => void) | null = null
  private onQuit: (() => void) | null = null

  /** Initialize the system tray */
  init(options: {
    onToggleTracking: (enabled: boolean) => void
    onToggleBus: (enabled: boolean) => void
    onToggleOverlay: () => void
    onShowWindow: () => void
    onQuit: () => void
  }): void {
    this.onToggleTracking = options.onToggleTracking
    this.onToggleBus = options.onToggleBus
    this.onToggleOverlay = options.onToggleOverlay
    this.onShowWindow = options.onShowWindow
    this.onQuit = options.onQuit

    // Create a simple 16x16 tray icon
    const icon = nativeImage.createEmpty()
    this.tray = new Tray(icon)
    this.tray.setToolTip('Tracking — Hand-Tracked 3D Explorer')

    this.tray.on('click', () => {
      this.onShowWindow?.()
    })

    this.updateMenu()
  }

  /** Update the tray state and rebuild menu */
  updateState(state: Partial<TrayState>): void {
    this.state = { ...this.state, ...state }
    this.updateMenu()
  }

  private updateMenu(): void {
    if (!this.tray) return

    const menu = Menu.buildFromTemplate([
      {
        label: 'Show Window',
        click: () => this.onShowWindow?.()
      },
      { type: 'separator' },
      {
        label: `Tracking: ${this.state.trackingEnabled ? 'ON' : 'OFF'}`,
        type: 'checkbox',
        checked: this.state.trackingEnabled,
        click: () => {
          this.state.trackingEnabled = !this.state.trackingEnabled
          this.onToggleTracking?.(this.state.trackingEnabled)
          this.updateMenu()
        }
      },
      {
        label: `Connector Bus: ${this.state.busEnabled ? 'ON' : 'OFF'}`,
        type: 'checkbox',
        checked: this.state.busEnabled,
        click: () => {
          this.state.busEnabled = !this.state.busEnabled
          this.onToggleBus?.(this.state.busEnabled)
          this.updateMenu()
        }
      },
      {
        label: `Overlay: ${this.state.overlayActive ? 'ON' : 'OFF'}`,
        type: 'checkbox',
        checked: this.state.overlayActive,
        click: () => {
          this.onToggleOverlay?.()
        }
      },
      {
        label: `Connected Programs: ${this.state.connectedPrograms}`,
        enabled: false
      },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => this.onQuit?.()
      }
    ])

    this.tray.setContextMenu(menu)
    this.tray.setToolTip(
      `Tracking${this.state.trackingEnabled ? '' : ' (paused)'} — ` +
      `${this.state.connectedPrograms} programs connected`
    )
  }

  /** Destroy the tray icon */
  destroy(): void {
    this.tray?.destroy()
    this.tray = null
  }
}
