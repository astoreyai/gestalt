/// <reference types="vite/client" />

import type { TrackingAPI } from '../preload/index'

declare global {
  interface Window {
    api: TrackingAPI
  }
}
