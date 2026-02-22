/**
 * Adaptive pinch threshold and tremor compensation utilities.
 *
 * Pure functions that scale gesture detection thresholds based on
 * observed palm size and user-configured tremor compensation level.
 *
 * - computeAdaptivePinchThreshold: scales pinch threshold proportionally
 *   to palm size, so the same gesture feels consistent across different
 *   hand sizes and camera distances.
 *
 * - computeTremorParams: extends hold durations, widens thresholds, and
 *   adds a movement deadzone to accommodate hand tremor (accessibility).
 */

const DEFAULT_REFERENCE_PALM = 0.25
const MIN_PINCH_THRESHOLD = 0.08
const MAX_PINCH_THRESHOLD = 0.30

/**
 * Scale pinch threshold proportionally to observed palm size.
 *
 * A larger palm naturally has a larger distance between thumb and index
 * tips, so the pinch detection threshold should scale accordingly.
 * The result is clamped to [0.08, 0.30] to prevent unusable extremes.
 *
 * @param basePinchThreshold - The base pinch threshold from GestureConfig (e.g. 0.15)
 * @param palmSize - Observed distance from wrist to middle MCP (normalized)
 * @param referencePalmSize - Expected "average" palm size (default 0.25)
 * @returns Scaled pinch threshold, clamped to [MIN_PINCH_THRESHOLD, MAX_PINCH_THRESHOLD]
 */
export function computeAdaptivePinchThreshold(
  basePinchThreshold: number,
  palmSize: number,
  referencePalmSize: number = DEFAULT_REFERENCE_PALM
): number {
  if (referencePalmSize < 0.001 || palmSize < 0.001) return basePinchThreshold
  const scale = palmSize / referencePalmSize
  const adapted = basePinchThreshold * scale
  return Math.max(MIN_PINCH_THRESHOLD, Math.min(MAX_PINCH_THRESHOLD, adapted))
}

// ─── Tremor Compensation ──────────────────────────────────────────

const MAX_TREMOR_HOLD = 200 // ms — maximum extended hold duration
const MAX_TREMOR_PINCH_SCALE = 1.3 // 30% wider pinch threshold at max tremor
const MAX_TREMOR_DEADZONE = 0.02 // maximum movement deadzone (normalized)

/** Tremor-compensated gesture parameters */
export interface TremorCompensation {
  /** Hold duration in ms, extended from base to accommodate tremor */
  minHoldDuration: number
  /** Pinch threshold, widened to reduce false releases during tremor */
  pinchThreshold: number
  /** Minimum movement to register as intentional (normalized units) */
  deadzone: number
}

/**
 * Compute tremor-compensated gesture parameters.
 *
 * Linearly interpolates between base config values (tremorLevel=0) and
 * maximum compensation values (tremorLevel=1). Higher tremor levels
 * extend hold duration, widen the pinch threshold, and add a movement
 * deadzone to filter out unintentional micro-movements.
 *
 * @param baseConfig - Base gesture config with minHoldDuration and pinchThreshold
 * @param tremorLevel - Compensation level [0, 1]. 0 = no compensation, 1 = maximum
 * @returns TremorCompensation with adjusted parameters
 */
export function computeTremorParams(
  baseConfig: { minHoldDuration: number; pinchThreshold: number },
  tremorLevel: number
): TremorCompensation {
  const t = Math.max(0, Math.min(1, tremorLevel))
  return {
    minHoldDuration: baseConfig.minHoldDuration + t * Math.max(0, MAX_TREMOR_HOLD - baseConfig.minHoldDuration),
    pinchThreshold: baseConfig.pinchThreshold * (1 + t * (MAX_TREMOR_PINCH_SCALE - 1)),
    deadzone: t * MAX_TREMOR_DEADZONE
  }
}
