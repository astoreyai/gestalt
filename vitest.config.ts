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
        // R3F/Three.js rendering components — require WebGL context, tested via E2E not unit tests
        'src/renderer/App.tsx',
        'src/renderer/main.tsx',
        'src/renderer/graph/ForceGraph.tsx',
        'src/renderer/graph/Nodes.tsx',
        'src/renderer/graph/Edges.tsx',
        'src/renderer/manifold/PointCloud.tsx',
        'src/renderer/manifold/Clusters.tsx',
        'src/renderer/manifold/HoverCard.tsx',
        // React components that depend on R3F Canvas context or complex Electron APIs
        'src/renderer/controller/GestureOverlay.tsx',
        'src/renderer/controller/ViewSwitcher.tsx',
        'src/renderer/controller/Calibration.tsx',
        'src/renderer/data/DataLoader.tsx',
        'src/renderer/settings/Settings.tsx',
        // ThemeProvider — applies DOM attributes, tested via integration / E2E
        'src/renderer/theme/ThemeProvider.tsx',
        // Barrel re-exports — no logic to test
        'src/renderer/*/index.ts',
        // Electron main-process entry point — requires Electron runtime (app, BrowserWindow)
        'src/main/index.ts',
        // System tray — requires Electron Tray/Menu APIs unavailable in unit tests
        'src/main/tray.ts',
        // Example connector — sample code, not production logic
        'src/main/connectors/example.ts',
        // Preload bridge — requires Electron contextBridge/ipcRenderer APIs
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
