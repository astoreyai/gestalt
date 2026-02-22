/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { isAllowedPath } from '../security'

describe('Sprint 6h: Security allowlist', () => {
  const projectRoot = join(__dirname, '../../..')

  it('should reference gestalt config path (not old tracking name)', () => {
    const securitySrc = readFileSync(join(projectRoot, 'src/main/security.ts'), 'utf-8')
    // The config dir should use 'gestalt' (new project name)
    expect(securitySrc).toContain('gestalt')
    // Should NOT contain the old 'tracking' config path
    expect(securitySrc).not.toContain("'.config', 'tracking'")
  })

  it('should allow assets/samples path via extraAllowedDirs', () => {
    // The isAllowedPath function supports extraAllowedDirs parameter
    // which is used in index.ts for sample loading
    const securitySrc = readFileSync(join(projectRoot, 'src/main/security.ts'), 'utf-8')
    expect(securitySrc).toContain('extraAllowedDirs')
  })

  it('should reject paths outside allowed directories', () => {
    expect(isAllowedPath('/etc/shadow')).toBe(false)
    expect(isAllowedPath('/etc/passwd')).toBe(false)
    expect(isAllowedPath('/root/.ssh/id_rsa')).toBe(false)
  })
})
