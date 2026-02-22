import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const isProd = process.env.NODE_ENV === 'production'

export default defineConfig({
  main: {
    // Only externalize electron and Node builtins — bundle everything else (zod, ws, etc.)
    // to eliminate the 1.3GB node_modules from the AppImage
    plugins: [externalizeDepsPlugin({ exclude: ['zod', 'ws', 'd3-force-3d', 'electron-updater'] })],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@main': resolve(__dirname, 'src/main')
      }
    },
    build: {
      outDir: 'dist/main',
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        },
        // ws optional native deps — not installed, mark external to avoid build error
        external: ['bufferutil', 'utf-8-validate'],
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      outDir: 'dist/preload',
      minify: 'esbuild',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared'),
        '@renderer': resolve(__dirname, 'src/renderer')
      }
    },
    worker: {
      format: 'es'
    },
    root: resolve(__dirname, 'src/renderer'),
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
      minify: 'esbuild',
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        },
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three/')) return 'three-core'
            if (id.includes('node_modules/@react-three/')) return 'r3f'
            if (id.includes('node_modules/react-dom/') || id.includes('node_modules/react/')) return 'react-vendor'
            if (id.includes('node_modules/zustand/')) return 'react-vendor'
          }
        }
      }
    },
    esbuild: {
      drop: isProd ? ['console', 'debugger'] : []
    }
  }
})
