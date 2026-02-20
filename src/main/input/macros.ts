/**
 * Macro system for gesture-triggered multi-key combos.
 * Loads mappings from keymaps/*.json files.
 */

import { readFile } from 'fs/promises'
import { join } from 'path'
import type { GestureType, KeyboardCommand } from '@shared/protocol'

export interface MacroAction {
  action: 'press' | 'combo'
  key?: string
  keys?: string[]
  description?: string
}

export interface MacroConfig {
  description: string
  mappings: Record<string, MacroAction>
  mouse: Record<string, string>
}

export class MacroEngine {
  private macros: Map<string, MacroAction> = new Map()
  private configPath: string

  constructor(configDir?: string) {
    this.configPath = configDir ?? join(process.cwd(), 'keymaps')
  }

  /** Load macros from the default keymap file */
  async loadDefaults(): Promise<void> {
    await this.loadFromFile(join(this.configPath, 'default.json'))
  }

  /** Load macros from a specific file */
  async loadFromFile(path: string): Promise<void> {
    try {
      const raw = await readFile(path, 'utf-8')
      const config: MacroConfig = JSON.parse(raw)

      for (const [gestureName, action] of Object.entries(config.mappings)) {
        this.macros.set(gestureName, action)
      }
    } catch (err) {
      console.warn(`[MacroEngine] Failed to load macros from ${path}:`, err)
    }
  }

  /** Get the keyboard command for a gesture type */
  getMacro(gestureType: GestureType | string): KeyboardCommand | null {
    const macro = this.macros.get(gestureType)
    if (!macro) return null

    if (macro.action === 'combo' && macro.keys) {
      return { target: 'keyboard', action: 'combo', keys: macro.keys }
    }
    if (macro.action === 'press' && macro.key) {
      return { target: 'keyboard', action: 'press', key: macro.key }
    }
    return null
  }

  /** Set a macro programmatically */
  setMacro(gestureType: string, action: MacroAction): void {
    this.macros.set(gestureType, action)
  }

  /** Remove a macro */
  removeMacro(gestureType: string): boolean {
    return this.macros.delete(gestureType)
  }

  /** List all configured macros */
  listMacros(): Array<{ gesture: string; action: MacroAction }> {
    return Array.from(this.macros.entries()).map(([gesture, action]) => ({
      gesture,
      action
    }))
  }

  /** Clear all macros */
  clear(): void {
    this.macros.clear()
  }
}
