/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { existsSync, readFileSync } from 'fs'

/**
 * Replicates the sample path resolution logic from main/index.ts.
 * In dev: resolve from project root `assets/samples/`
 * In packaged builds: resolve from `process.resourcesPath + '/samples/'`
 * (electron-builder extraResources maps assets/samples → samples)
 */
function resolveSamplePath(isPackaged: boolean, resourcesPath: string, dirname: string): string {
  if (isPackaged) {
    return join(resourcesPath, 'samples')
  }
  return join(dirname, '../../assets/samples')
}

describe('Sprint 6d: Resource paths', () => {
  const projectRoot = join(__dirname, '../../..')

  it('should resolve dev sample path to assets/samples', () => {
    const path = resolveSamplePath(false, '/app/resources', '/some/dist/main')
    expect(path).toContain('assets/samples')
  })

  it('should resolve packaged sample path to resourcesPath/samples', () => {
    const path = resolveSamplePath(true, '/app/resources', '/app/dist/main')
    expect(path).toBe('/app/resources/samples')
    // Must NOT include 'assets' prefix — electron-builder extraResources strips it
    expect(path).not.toContain('assets')
  })

  it('should have samples directory in dev mode', () => {
    expect(existsSync(join(projectRoot, 'assets', 'samples'))).toBe(true)
    expect(existsSync(join(projectRoot, 'assets', 'samples', 'small-graph.json'))).toBe(true)
  })

  it('electron-builder config should map assets/samples to samples', () => {
    const pkgJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf-8'))
    const extraResources = pkgJson.build?.extraResources
    expect(extraResources).toBeDefined()
    const samplesMapping = extraResources.find(
      (r: { from: string; to: string }) => r.from === 'assets/samples'
    )
    expect(samplesMapping).toBeDefined()
    expect(samplesMapping.to).toBe('samples')
  })
})
