/**
 * Security utilities for file path validation.
 * Prevents path traversal attacks by restricting file access
 * to allowed directories only.
 */

import { resolve, join } from 'path'
import { homedir, tmpdir } from 'os'
import { realpathSync } from 'fs'

/** Directories from which file loading is allowed */
const ALLOWED_DIRS = [
  join(homedir(), 'Documents'),
  join(homedir(), 'Downloads'),
  join(homedir(), 'Desktop'),
  join(homedir(), '.config', 'gestalt'),
  tmpdir()
]

/**
 * Validate that a file path is within allowed directories.
 * Resolves the path to an absolute form before checking,
 * which neutralises ".." traversal and symlink tricks.
 *
 * @param filePath  - The path to validate
 * @param extraAllowedDirs - Additional directories to allow (e.g. app samples dir)
 * @returns true if the resolved path falls under an allowed directory
 */
export function isAllowedPath(filePath: string, extraAllowedDirs: string[] = []): boolean {
  let resolved: string
  try {
    // Prefer realpathSync to follow symlinks (prevents symlink-based traversal)
    resolved = realpathSync(filePath)
  } catch {
    // File doesn't exist yet — fall back to resolve() for path validation.
    // This is safe because readFile will fail anyway if the path is invalid,
    // and we still validate the resolved path against allowed directories.
    resolved = resolve(filePath)
  }
  const allDirs = [...ALLOWED_DIRS, ...extraAllowedDirs]
  return allDirs.some(dir => {
    const resolvedDir = resolve(dir)
    // Ensure the path starts with the directory followed by a separator
    // (or is the directory itself) to prevent prefix-matching attacks
    // e.g. /home/user2 should not match /home/user
    return resolved === resolvedDir || resolved.startsWith(resolvedDir + '/')
  })
}
