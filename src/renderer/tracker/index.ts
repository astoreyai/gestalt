/**
 * Hand Tracker module — public API surface.
 */

export { HandTracker } from './HandTracker'
export type { HandTrackerConfig, FrameCallback, ErrorCallback } from './HandTracker'

export { normalizeLandmarks, clamp } from './normalize'

export { OneEuroFilter, LandmarkSmoother } from './filters'
export type { OneEuroFilterConfig } from './filters'

export { fuseFrames, DEFAULT_STEREO_CONFIG } from './stereo-fuser'
export type { StereoConfig } from './stereo-fuser'
