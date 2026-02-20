import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@main': resolve(__dirname, 'src/main')
    }
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.test.tsx',
        'src/**/*.d.ts',
        'src/renderer/index.html',
        // React/R3F rendering components — tested via integration/E2E, not unit tests
        'src/renderer/App.tsx',
        'src/renderer/main.tsx',
        'src/renderer/graph/ForceGraph.tsx',
        'src/renderer/graph/Nodes.tsx',
        'src/renderer/graph/Edges.tsx',
        'src/renderer/manifold/PointCloud.tsx',
        'src/renderer/manifold/Clusters.tsx',
        'src/renderer/manifold/HoverCard.tsx',
        'src/renderer/controller/GestureOverlay.tsx',
        'src/renderer/controller/ViewSwitcher.tsx',
        'src/renderer/controller/Calibration.tsx',
        'src/renderer/data/DataLoader.tsx',
        'src/renderer/settings/Settings.tsx',
        // Barrel re-exports
        'src/renderer/*/index.ts',
        // Main process entry (Electron-specific)
        'src/main/index.ts',
        'src/main/tray.ts',
        'src/main/input/ipc.ts',
        'src/main/bus/server.ts',
        'src/main/connectors/example.ts',
        'src/main/connectors/sdk.ts',
        'src/preload/index.ts'
      ],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90
      }
    }
  }
})
