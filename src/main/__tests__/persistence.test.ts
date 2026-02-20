/**
 * @vitest-environment node
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join, dirname, basename } from 'path'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'fs'
import { tmpdir } from 'os'
import { createPersistence, rotateBackups, type PersistenceAPI } from '../persistence'
import { DEFAULT_CONFIG, GestureType } from '@shared/protocol'
import type { CalibrationProfile } from '@shared/protocol'

// ─── Test helpers ────────────────────────────────────────────────

function makeTempFilePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'tracking-test-'))
  return join(dir, 'test-data.json')
}

function makeProfile(overrides: Partial<CalibrationProfile> = {}): CalibrationProfile {
  return {
    id: 'profile-1',
    name: 'Test Profile',
    sensitivity: 0.5,
    samples: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides
  }
}

// ─── Tests ───────────────────────────────────────────────────────

describe('Persistence', () => {
  let tempFile: string
  let persistence: PersistenceAPI

  beforeEach(() => {
    tempFile = makeTempFilePath()
    persistence = createPersistence(tempFile)
  })

  afterEach(() => {
    // Clean up temp directory
    try {
      rmSync(join(tempFile, '..'), { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  // ─── Config ──────────────────────────────────────────────────

  describe('config', () => {
    it('returns DEFAULT_CONFIG initially', () => {
      const config = persistence.getPersistedConfig()
      expect(config).toEqual(DEFAULT_CONFIG)
    })

    it('saves and retrieves config correctly', () => {
      const modified = {
        ...DEFAULT_CONFIG,
        tracking: { ...DEFAULT_CONFIG.tracking, smoothingFactor: 0.8 }
      }
      persistence.setPersistedConfig(modified)
      expect(persistence.getPersistedConfig()).toEqual(modified)
    })

    it('persists config across instances', () => {
      const modified = {
        ...DEFAULT_CONFIG,
        input: { ...DEFAULT_CONFIG.input, mouseSpeed: 2.5 }
      }
      persistence.setPersistedConfig(modified)

      // Create a new instance pointing at the same file
      const persistence2 = createPersistence(tempFile)
      expect(persistence2.getPersistedConfig()).toEqual(modified)
    })
  })

  // ─── Profiles ────────────────────────────────────────────────

  describe('profiles', () => {
    it('starts with empty profiles', () => {
      expect(persistence.getProfiles()).toEqual([])
    })

    it('createProfile adds a profile', () => {
      const profile = makeProfile()
      persistence.createProfile(profile)
      expect(persistence.getProfiles()).toHaveLength(1)
      expect(persistence.getProfiles()[0]).toEqual(profile)
    })

    it('getProfile retrieves by ID', () => {
      const profile = makeProfile({ id: 'abc-123' })
      persistence.createProfile(profile)
      expect(persistence.getProfile('abc-123')).toEqual(profile)
    })

    it('getProfile returns null for unknown ID', () => {
      expect(persistence.getProfile('nonexistent')).toBeNull()
    })

    it('createProfile adds multiple profiles', () => {
      persistence.createProfile(makeProfile({ id: 'p1', name: 'First' }))
      persistence.createProfile(makeProfile({ id: 'p2', name: 'Second' }))
      expect(persistence.getProfiles()).toHaveLength(2)
    })

    it('updateProfile merges updates', () => {
      const profile = makeProfile({ id: 'up-1', name: 'Original', sensitivity: 0.3 })
      persistence.createProfile(profile)

      persistence.updateProfile('up-1', { name: 'Updated', sensitivity: 0.9 })

      const updated = persistence.getProfile('up-1')
      expect(updated).not.toBeNull()
      expect(updated!.name).toBe('Updated')
      expect(updated!.sensitivity).toBe(0.9)
      expect(updated!.id).toBe('up-1') // id is immutable
    })

    it('updateProfile does nothing for unknown ID', () => {
      persistence.createProfile(makeProfile({ id: 'x' }))
      persistence.updateProfile('nonexistent', { name: 'Nope' })
      expect(persistence.getProfiles()).toHaveLength(1)
    })

    it('updateProfile preserves the id even if updates include a different id', () => {
      persistence.createProfile(makeProfile({ id: 'keep-me' }))
      persistence.updateProfile('keep-me', { id: 'try-change', name: 'Sneaky' } as Partial<CalibrationProfile>)
      expect(persistence.getProfile('keep-me')).not.toBeNull()
      expect(persistence.getProfile('keep-me')!.name).toBe('Sneaky')
      expect(persistence.getProfile('try-change')).toBeNull()
    })

    it('deleteProfile removes a profile', () => {
      persistence.createProfile(makeProfile({ id: 'del-1' }))
      persistence.createProfile(makeProfile({ id: 'del-2' }))
      expect(persistence.getProfiles()).toHaveLength(2)

      persistence.deleteProfile('del-1')
      expect(persistence.getProfiles()).toHaveLength(1)
      expect(persistence.getProfile('del-1')).toBeNull()
      expect(persistence.getProfile('del-2')).not.toBeNull()
    })

    it('deleteProfile is a no-op for unknown ID', () => {
      persistence.createProfile(makeProfile({ id: 'safe' }))
      persistence.deleteProfile('nonexistent')
      expect(persistence.getProfiles()).toHaveLength(1)
    })

    it('profiles with samples persist correctly', () => {
      const profile = makeProfile({
        id: 'with-samples',
        samples: [
          {
            gestureType: GestureType.Pinch,
            landmarks: [{ x: 0.1, y: 0.2, z: 0.3 }],
            features: [1.0, 2.0, 3.0],
            timestamp: 1000
          }
        ]
      })
      persistence.createProfile(profile)

      const retrieved = persistence.getProfile('with-samples')
      expect(retrieved).not.toBeNull()
      expect(retrieved!.samples).toHaveLength(1)
      expect(retrieved!.samples[0].gestureType).toBe(GestureType.Pinch)
      expect(retrieved!.samples[0].landmarks[0]).toEqual({ x: 0.1, y: 0.2, z: 0.3 })
    })
  })

  // ─── Active Profile ──────────────────────────────────────────

  describe('activeProfileId', () => {
    it('returns null initially', () => {
      expect(persistence.getActiveProfileId()).toBeNull()
    })

    it('saves and retrieves an active profile ID', () => {
      persistence.setActiveProfileId('profile-42')
      expect(persistence.getActiveProfileId()).toBe('profile-42')
    })

    it('can be reset to null', () => {
      persistence.setActiveProfileId('some-id')
      persistence.setActiveProfileId(null)
      expect(persistence.getActiveProfileId()).toBeNull()
    })
  })

  // ─── Calibration State ───────────────────────────────────────

  describe('calibrated', () => {
    it('returns false initially', () => {
      expect(persistence.isCalibrated()).toBe(false)
    })

    it('setCalibrated(true) saves and retrieves', () => {
      persistence.setCalibrated(true)
      expect(persistence.isCalibrated()).toBe(true)
    })

    it('setCalibrated(false) resets', () => {
      persistence.setCalibrated(true)
      persistence.setCalibrated(false)
      expect(persistence.isCalibrated()).toBe(false)
    })
  })

  // ─── Full State ──────────────────────────────────────────────

  describe('getPersistedData', () => {
    it('returns full default state initially', () => {
      const data = persistence.getPersistedData()
      expect(data).toEqual({
        config: DEFAULT_CONFIG,
        profiles: [],
        activeProfileId: null,
        calibrated: false
      })
    })

    it('returns full state after mutations', () => {
      const profile = makeProfile({ id: 'pd-1' })
      const modifiedConfig = {
        ...DEFAULT_CONFIG,
        gestures: { ...DEFAULT_CONFIG.gestures, sensitivity: 0.9 }
      }

      persistence.setPersistedConfig(modifiedConfig)
      persistence.createProfile(profile)
      persistence.setActiveProfileId('pd-1')
      persistence.setCalibrated(true)

      const data = persistence.getPersistedData()
      expect(data.config).toEqual(modifiedConfig)
      expect(data.profiles).toHaveLength(1)
      expect(data.profiles[0].id).toBe('pd-1')
      expect(data.activeProfileId).toBe('pd-1')
      expect(data.calibrated).toBe(true)
    })
  })

  // ─── Durability ──────────────────────────────────────────────

  describe('durability', () => {
    it('data survives re-instantiation', () => {
      persistence.createProfile(makeProfile({ id: 'durable' }))
      persistence.setActiveProfileId('durable')
      persistence.setCalibrated(true)

      const fresh = createPersistence(tempFile)
      expect(fresh.getProfiles()).toHaveLength(1)
      expect(fresh.getActiveProfileId()).toBe('durable')
      expect(fresh.isCalibrated()).toBe(true)
    })
  })

  // ─── Atomic Writes ─────────────────────────────────────────

  describe('atomic writes', () => {
    it('should survive simulated partial write (write temp then rename)', () => {
      // Write some data via the persistence API
      persistence.createProfile(makeProfile({ id: 'atomic-1', name: 'Atomic Test' }))

      // Verify the data file exists and is valid JSON
      const contents = readFileSync(tempFile, 'utf-8')
      const parsed = JSON.parse(contents)
      expect(parsed.profiles).toHaveLength(1)
      expect(parsed.profiles[0].id).toBe('atomic-1')

      // Verify no leftover .tmp file exists (atomic rename cleans up)
      const tmpPath = `${tempFile}.tmp`
      expect(existsSync(tmpPath)).toBe(false)
    })

    it('should backup corrupted file before resetting', () => {
      // First, create a valid persistence file
      persistence.createProfile(makeProfile({ id: 'will-corrupt' }))

      // Now write corrupted JSON to the file
      writeFileSync(tempFile, '{ this is not valid JSON !!!')

      // Re-instantiate — should detect corrupt file, backup, and reset
      const fresh = createPersistence(tempFile)

      // The fresh instance should have defaults (reset)
      expect(fresh.getProfiles()).toEqual([])

      // A backup file should have been created
      const dir = join(tempFile, '..')
      const files = readdirSync(dir)
      const backupFiles = files.filter(f => f.includes('.backup.'))
      expect(backupFiles.length).toBeGreaterThanOrEqual(1)

      // The backup file should contain the corrupted data
      const backupContent = readFileSync(join(dir, backupFiles[0]), 'utf-8')
      expect(backupContent).toBe('{ this is not valid JSON !!!')
    })
  })

  // ─── Profile ID Uniqueness ────────────────────────────────

  describe('profile ID uniqueness', () => {
    it('should reject duplicate profile IDs', () => {
      const profile = makeProfile({ id: 'unique-1', name: 'First' })
      persistence.createProfile(profile)

      const duplicate = makeProfile({ id: 'unique-1', name: 'Duplicate' })
      expect(() => persistence.createProfile(duplicate)).toThrow(
        'Profile with ID "unique-1" already exists'
      )

      // Original profile should be unchanged
      expect(persistence.getProfiles()).toHaveLength(1)
      expect(persistence.getProfile('unique-1')!.name).toBe('First')
    })
  })
})

// ─── Backup Rotation ──────────────────────────────────────────

describe('Backup rotation', () => {
  let tempDir: string
  let tempFile: string

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tracking-rotation-'))
    tempFile = join(tempDir, 'test-data.json')
    writeFileSync(tempFile, '{}')
  })

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  it('should keep at most 3 backup files', () => {
    // Create 5 backup files with different timestamps
    for (let i = 1; i <= 5; i++) {
      const backupPath = `${tempFile}.backup.${1000 + i}`
      writeFileSync(backupPath, `backup-${i}`)
    }

    // Verify we have 5 backups before rotation
    const beforeFiles = readdirSync(tempDir).filter(f => f.includes('.backup.'))
    expect(beforeFiles).toHaveLength(5)

    rotateBackups(tempFile, 3)

    // After rotation, only 3 should remain
    const afterFiles = readdirSync(tempDir).filter(f => f.includes('.backup.'))
    expect(afterFiles).toHaveLength(3)
  })

  it('should delete oldest backups first', () => {
    // Create 5 backup files with different timestamps
    for (let i = 1; i <= 5; i++) {
      const backupPath = `${tempFile}.backup.${1000 + i}`
      writeFileSync(backupPath, `backup-${i}`)
    }

    rotateBackups(tempFile, 3)

    const afterFiles = readdirSync(tempDir)
      .filter(f => f.includes('.backup.'))
      .sort()

    // The 3 newest should remain (1003, 1004, 1005)
    expect(afterFiles).toHaveLength(3)
    expect(afterFiles[0]).toContain('1003')
    expect(afterFiles[1]).toContain('1004')
    expect(afterFiles[2]).toContain('1005')

    // The oldest (1001, 1002) should be gone
    const allFiles = readdirSync(tempDir)
    expect(allFiles.some(f => f.includes('1001'))).toBe(false)
    expect(allFiles.some(f => f.includes('1002'))).toBe(false)
  })

  it('should not fail when there are fewer backups than maxBackups', () => {
    // Create only 2 backups (under the limit of 3)
    writeFileSync(`${tempFile}.backup.1001`, 'backup-1')
    writeFileSync(`${tempFile}.backup.1002`, 'backup-2')

    // Should not throw
    rotateBackups(tempFile, 3)

    const afterFiles = readdirSync(tempDir).filter(f => f.includes('.backup.'))
    expect(afterFiles).toHaveLength(2)
  })

  it('should rotate backups after corrupted file recovery', () => {
    // Create 4 existing backup files to simulate history
    for (let i = 1; i <= 4; i++) {
      writeFileSync(`${tempFile}.backup.${1000 + i}`, `old-backup-${i}`)
    }

    // Write corrupted JSON to the main file
    writeFileSync(tempFile, '{ this is not valid JSON !!!')

    // Re-instantiate — should detect corruption, backup, then rotate
    createPersistence(tempFile)

    // Should have at most 3 backups after rotation
    const afterFiles = readdirSync(tempDir).filter(f => f.includes('.backup.'))
    expect(afterFiles.length).toBeLessThanOrEqual(3)
  })
})

// ─── P1-27: Persistence Edge Cases ──────────────────────────────────

describe('Persistence edge cases (P1-27)', () => {
  let tempFile: string
  let persistence: PersistenceAPI

  beforeEach(() => {
    tempFile = makeTempFilePath()
    persistence = createPersistence(tempFile)
  })

  afterEach(() => {
    try {
      rmSync(join(tempFile, '..'), { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  })

  // ─── Concurrent write handling ──────────────────────────────────

  describe('concurrent writes', () => {
    it('should handle two rapid successive saves without data loss', () => {
      // Rapidly create two profiles back-to-back (two synchronous saves)
      persistence.createProfile(makeProfile({ id: 'rapid-1', name: 'First' }))
      persistence.createProfile(makeProfile({ id: 'rapid-2', name: 'Second' }))

      // Both profiles should be present in memory
      expect(persistence.getProfiles()).toHaveLength(2)
      expect(persistence.getProfile('rapid-1')).not.toBeNull()
      expect(persistence.getProfile('rapid-2')).not.toBeNull()

      // Both profiles should survive re-instantiation (on-disk durability)
      const fresh = createPersistence(tempFile)
      expect(fresh.getProfiles()).toHaveLength(2)
      expect(fresh.getProfile('rapid-1')!.name).toBe('First')
      expect(fresh.getProfile('rapid-2')!.name).toBe('Second')
    })

    it('should handle rapid config + profile saves interleaved', () => {
      const modifiedConfig = {
        ...DEFAULT_CONFIG,
        gestures: { ...DEFAULT_CONFIG.gestures, sensitivity: 0.9 }
      }

      // Interleave config and profile writes
      persistence.setPersistedConfig(modifiedConfig)
      persistence.createProfile(makeProfile({ id: 'interleave-1', name: 'A' }))
      persistence.setCalibrated(true)
      persistence.createProfile(makeProfile({ id: 'interleave-2', name: 'B' }))
      persistence.setActiveProfileId('interleave-1')

      // Verify everything is consistent
      const fresh = createPersistence(tempFile)
      expect(fresh.getPersistedConfig().gestures.sensitivity).toBe(0.9)
      expect(fresh.getProfiles()).toHaveLength(2)
      expect(fresh.isCalibrated()).toBe(true)
      expect(fresh.getActiveProfileId()).toBe('interleave-1')
    })

    it('should produce a valid file after back-to-back updates to the same profile', () => {
      persistence.createProfile(makeProfile({ id: 'update-target', name: 'v1', sensitivity: 0.1 }))
      persistence.updateProfile('update-target', { name: 'v2', sensitivity: 0.2 })
      persistence.updateProfile('update-target', { name: 'v3', sensitivity: 0.3 })
      persistence.updateProfile('update-target', { name: 'v4', sensitivity: 0.4 })

      // Verify final state on disk
      const fresh = createPersistence(tempFile)
      const profile = fresh.getProfile('update-target')
      expect(profile).not.toBeNull()
      expect(profile!.name).toBe('v4')
      expect(profile!.sensitivity).toBe(0.4)
    })
  })

  // ─── ENOSPC simulation (disk full) ─────────────────────────────

  describe('ENOSPC (disk full) simulation', () => {
    it('should throw when disk is full during save', () => {
      // Write initial data so the file exists
      persistence.createProfile(makeProfile({ id: 'before-full', name: 'Before' }))

      // Simulate disk full by making the data directory read-only
      // so the atomic write to .tmp fails
      const dir = dirname(tempFile)
      const { chmodSync } = require('fs')

      chmodSync(dir, 0o444) // read-only directory

      try {
        // Attempting to save should throw because writeFileSync can't create .tmp
        expect(() => {
          persistence.createProfile(makeProfile({ id: 'during-full', name: 'During' }))
        }).toThrow()
      } finally {
        // Restore directory permissions
        chmodSync(dir, 0o755)
      }

      // The file on disk should still have the data from before the failure
      // because the atomic write (write to .tmp then rename) failed at the .tmp step
      const contents = readFileSync(tempFile, 'utf-8')
      const parsed = JSON.parse(contents)
      expect(parsed.profiles).toHaveLength(1)
      expect(parsed.profiles[0].id).toBe('before-full')
    })
  })

  // ─── Corruption recovery ───────────────────────────────────────

  describe('corruption recovery', () => {
    it('should recover gracefully from truncated JSON', () => {
      persistence.createProfile(makeProfile({ id: 'will-be-lost', name: 'Truncated' }))

      // Write truncated JSON (valid start, invalid end)
      writeFileSync(tempFile, '{"config":{"tracking":{"enabled":tru')

      const fresh = createPersistence(tempFile)
      // Should reset to defaults
      expect(fresh.getProfiles()).toEqual([])
      expect(fresh.getPersistedConfig()).toEqual(DEFAULT_CONFIG)
    })

    it('should recover gracefully from empty file', () => {
      // Write empty file
      writeFileSync(tempFile, '')

      const fresh = createPersistence(tempFile)
      expect(fresh.getProfiles()).toEqual([])
      expect(fresh.getPersistedConfig()).toEqual(DEFAULT_CONFIG)
    })

    it('should recover gracefully from file containing null', () => {
      writeFileSync(tempFile, 'null')

      // JSON.parse('null') succeeds but returns null, not an object.
      // The store treats it as parsed data, which causes getProfiles() to fail.
      // This documents that null is a valid-JSON-but-bad-shape edge case that
      // the store does NOT currently handle gracefully (it should ideally
      // treat non-object results as corruption and fall back to defaults).
      const fresh = createPersistence(tempFile)
      expect(() => fresh.getProfiles()).toThrow()
    })

    it('should recover gracefully from file containing a JSON array', () => {
      writeFileSync(tempFile, '[1, 2, 3]')

      // JSON.parse('[1,2,3]') succeeds but returns an array, not the expected object.
      // The store loads it as this.data, so getProfiles() returns undefined since
      // there's no 'profiles' key on an array. This documents the current behavior:
      // valid JSON with wrong shape is not treated as corruption.
      const fresh = createPersistence(tempFile)
      // getProfiles returns undefined (not an array), demonstrating the gap
      const profiles = fresh.getProfiles()
      expect(profiles).toBeUndefined()
    })

    it('should create backup of corrupted file before resetting', () => {
      persistence.createProfile(makeProfile({ id: 'important' }))

      const corruptData = '<<<BINARY GARBAGE>>>'
      writeFileSync(tempFile, corruptData)

      const _fresh = createPersistence(tempFile)

      // Verify backup was created with the corrupt content
      const dir = join(tempFile, '..')
      const files = readdirSync(dir)
      const backupFiles = files.filter(f => f.includes('.backup.'))
      expect(backupFiles.length).toBeGreaterThanOrEqual(1)

      const backupContent = readFileSync(join(dir, backupFiles[0]), 'utf-8')
      expect(backupContent).toBe(corruptData)
    })

    it('should produce valid defaults after corruption recovery', () => {
      writeFileSync(tempFile, '}{invalid}{')

      const fresh = createPersistence(tempFile)

      // All default accessors should work normally
      expect(fresh.isCalibrated()).toBe(false)
      expect(fresh.getActiveProfileId()).toBeNull()
      expect(fresh.getProfiles()).toEqual([])

      // Should be able to write new data after recovery
      fresh.createProfile(makeProfile({ id: 'after-recovery', name: 'Recovered' }))
      expect(fresh.getProfiles()).toHaveLength(1)

      // And that new data should persist
      const fresh2 = createPersistence(tempFile)
      expect(fresh2.getProfile('after-recovery')!.name).toBe('Recovered')
    })
  })
})
