/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'

describe('Sprint 6c: udev rules', () => {
  const projectRoot = join(__dirname, '../../..')
  const rulesPath = join(projectRoot, 'assets/99-gestalt-uinput.rules')

  it('should have udev rules file', () => {
    expect(existsSync(rulesPath)).toBe(true)
  })

  it('should grant input group access to uinput', () => {
    const content = readFileSync(rulesPath, 'utf-8')
    expect(content).toContain('KERNEL=="uinput"')
    expect(content).toContain('GROUP="input"')
  })

  it('should set correct permissions (0660)', () => {
    const content = readFileSync(rulesPath, 'utf-8')
    expect(content).toContain('MODE="0660"')
    expect(content).toContain('TAG+="uaccess"')
  })
})
