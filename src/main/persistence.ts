/**
 * Persistence layer for app configuration and calibration profiles.
 *
 * Uses a simple JSON file store to avoid ESM/CJS issues with electron-store v8.
 * The `createPersistence(filePath)` factory makes the module testable with temp files.
 */

import { app } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, copyFileSync } from 'fs'
import { join, dirname } from 'path'
import { DEFAULT_CONFIG } from '@shared/protocol'
import type { AppConfig, CalibrationProfile, PersistedData } from '@shared/protocol'

// ─── JSON File Store ─────────────────────────────────────────────

interface StoreSchema {
  config: AppConfig
  profiles: CalibrationProfile[]
  activeProfileId: string | null
  calibrated: boolean
}

const STORE_DEFAULTS: StoreSchema = {
  config: { ...DEFAULT_CONFIG },
  profiles: [],
  activeProfileId: null,
  calibrated: false
}

class JsonStore<T extends Record<string, unknown>> {
  private filePath: string
  private data: T

  constructor(filePath: string, defaults: T) {
    this.filePath = filePath
    if (existsSync(this.filePath)) {
      try {
        this.data = JSON.parse(readFileSync(this.filePath, 'utf-8')) as T
      } catch {
        // Backup corrupted file before overwriting
        try {
          const backupPath = `${this.filePath}.backup.${Date.now()}`
          copyFileSync(this.filePath, backupPath)
        } catch { /* ignore backup failure */ }
        this.data = JSON.parse(JSON.stringify(defaults)) as T
        this.save()
      }
    } else {
      const dir = dirname(this.filePath)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      this.data = JSON.parse(JSON.stringify(defaults)) as T
      this.save()
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.data[key]
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.data[key] = value
    this.save()
  }

  getAll(): T {
    return { ...this.data }
  }

  private save(): void {
    const tempPath = `${this.filePath}.tmp`
    writeFileSync(tempPath, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    renameSync(tempPath, this.filePath)
  }
}

// ─── Persistence API ─────────────────────────────────────────────

export interface PersistenceAPI {
  getPersistedConfig(): AppConfig
  setPersistedConfig(config: AppConfig): void
  getProfiles(): CalibrationProfile[]
  getProfile(id: string): CalibrationProfile | null
  createProfile(profile: CalibrationProfile): void
  updateProfile(id: string, updates: Partial<CalibrationProfile>): void
  deleteProfile(id: string): void
  getActiveProfileId(): string | null
  setActiveProfileId(id: string | null): void
  isCalibrated(): boolean
  setCalibrated(value: boolean): void
  getPersistedData(): PersistedData
}

/**
 * Factory function that creates a PersistenceAPI backed by a JSON file.
 * Tests can call this directly with a temp file path.
 */
export function createPersistence(filePath: string): PersistenceAPI {
  const store = new JsonStore<StoreSchema>(filePath, STORE_DEFAULTS)

  return {
    getPersistedConfig(): AppConfig {
      return store.get('config')
    },

    setPersistedConfig(config: AppConfig): void {
      store.set('config', config)
    },

    getProfiles(): CalibrationProfile[] {
      return store.get('profiles')
    },

    getProfile(id: string): CalibrationProfile | null {
      const profiles = store.get('profiles')
      return profiles.find((p) => p.id === id) ?? null
    },

    createProfile(profile: CalibrationProfile): void {
      const profiles = store.get('profiles')
      if (profiles.some(p => p.id === profile.id)) {
        throw new Error(`Profile with ID "${profile.id}" already exists`)
      }
      profiles.push(profile)
      store.set('profiles', profiles)
    },

    updateProfile(id: string, updates: Partial<CalibrationProfile>): void {
      const profiles = store.get('profiles')
      const index = profiles.findIndex((p) => p.id === id)
      if (index === -1) return
      profiles[index] = { ...profiles[index], ...updates, id } // id is immutable
      store.set('profiles', profiles)
    },

    deleteProfile(id: string): void {
      const profiles = store.get('profiles')
      store.set(
        'profiles',
        profiles.filter((p) => p.id !== id)
      )
    },

    getActiveProfileId(): string | null {
      return store.get('activeProfileId')
    },

    setActiveProfileId(id: string | null): void {
      store.set('activeProfileId', id)
    },

    isCalibrated(): boolean {
      return store.get('calibrated')
    },

    setCalibrated(value: boolean): void {
      store.set('calibrated', value)
    },

    getPersistedData(): PersistedData {
      return {
        config: store.get('config'),
        profiles: store.get('profiles'),
        activeProfileId: store.get('activeProfileId'),
        calibrated: store.get('calibrated')
      }
    }
  }
}

// ─── Singleton for Main Process ──────────────────────────────────

let instance: PersistenceAPI | null = null

/**
 * Initialize persistence with the Electron userData directory.
 * Must be called after `app.whenReady()`.
 */
export function initPersistence(): void {
  const userDataPath = app.getPath('userData')
  instance = createPersistence(join(userDataPath, 'tracking-data.json'))
}

/**
 * Get the singleton persistence instance.
 * Throws if `initPersistence()` has not been called.
 */
export function getPersistence(): PersistenceAPI {
  if (!instance) throw new Error('Persistence not initialized. Call initPersistence() first.')
  return instance
}
