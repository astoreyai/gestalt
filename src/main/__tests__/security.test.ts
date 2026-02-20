/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { homedir } from 'os'
import { isAllowedPath } from '../security'

describe('isAllowedPath', () => {
  const home = homedir()

  it('should allow files within home directory', () => {
    expect(isAllowedPath(join(home, 'Documents', 'data.json'))).toBe(true)
    expect(isAllowedPath(join(home, 'graph.graphml'))).toBe(true)
    expect(isAllowedPath(join(home, '.config', 'settings.json'))).toBe(true)
  })

  it('should reject /etc/passwd', () => {
    expect(isAllowedPath('/etc/passwd')).toBe(false)
  })

  it('should reject /etc/shadow', () => {
    expect(isAllowedPath('/etc/shadow')).toBe(false)
  })

  it('should reject path traversal attempts (../../etc/passwd)', () => {
    expect(isAllowedPath(join(home, '..', '..', 'etc', 'passwd'))).toBe(false)
    expect(isAllowedPath(home + '/../../etc/passwd')).toBe(false)
    expect(isAllowedPath(home + '/../../../etc/shadow')).toBe(false)
  })

  it('should reject paths outside allowed directories', () => {
    expect(isAllowedPath('/tmp/secret.txt')).toBe(false)
    expect(isAllowedPath('/var/log/syslog')).toBe(false)
    expect(isAllowedPath('/root/.ssh/id_rsa')).toBe(false)
  })

  it('should allow extra allowed directories', () => {
    const extraDir = '/opt/tracking/samples'
    expect(isAllowedPath('/opt/tracking/samples/demo.json', [extraDir])).toBe(true)
    expect(isAllowedPath('/opt/tracking/samples/sub/nested.json', [extraDir])).toBe(true)
  })

  it('should reject paths outside extra allowed directories', () => {
    const extraDir = '/opt/tracking/samples'
    expect(isAllowedPath('/opt/tracking/config/secret.json', [extraDir])).toBe(false)
  })

  it('should resolve symlinks and relative paths', () => {
    // Relative path that resolves to /etc/passwd should be rejected
    expect(isAllowedPath('../../../etc/passwd')).toBe(false)
    // Relative path with dots that stays within home should be allowed
    expect(isAllowedPath(join(home, 'Documents', '..', 'file.json'))).toBe(true)
  })

  it('should handle empty string path', () => {
    // Empty string resolves to cwd, which is likely not in home
    // Just ensure it doesn't throw
    const result = isAllowedPath('')
    expect(typeof result).toBe('boolean')
  })

  it('should handle paths with double slashes', () => {
    expect(isAllowedPath(home + '//Documents//file.json')).toBe(true)
    expect(isAllowedPath('//etc//passwd')).toBe(false)
  })
})
