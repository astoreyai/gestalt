/**
 * Gorilla Arm fatigue detector.
 * Tracks continuous hand elevation duration and emits fatigue levels.
 * In gesture-based interfaces, sustained arm elevation causes fatigue
 * within 60-90 seconds (Gorilla Arm syndrome).
 */

export enum FatigueLevel {
  None = 'none',
  Warning = 'warning',    // 60s continuous elevation
  Critical = 'critical'   // 90s continuous elevation
}

export interface FatigueState {
  level: FatigueLevel
  durationMs: number      // How long the hand has been elevated
  handedness: 'left' | 'right'
}

/** Threshold: hand is "elevated" if wrist y-position is in the top 1/3 of frame */
const ELEVATION_THRESHOLD = 0.33
const WARNING_MS = 60_000
const CRITICAL_MS = 90_000

interface HandFatigueState {
  elevatedSince: number | null  // timestamp when elevation started, null if not elevated
  lastUpdate: number
}

export class FatigueDetector {
  private states: Map<string, HandFatigueState> = new Map()

  /**
   * Update fatigue state for a hand.
   * @param handedness Which hand
   * @param wristY Normalized wrist y-position [0, 1] where 0 = top of frame
   * @param timestamp Current timestamp in ms
   */
  update(handedness: 'left' | 'right', wristY: number, timestamp: number): FatigueState {
    let state = this.states.get(handedness)
    if (!state) {
      state = { elevatedSince: null, lastUpdate: timestamp }
      this.states.set(handedness, state)
    }

    const isElevated = wristY < ELEVATION_THRESHOLD

    if (isElevated) {
      if (state.elevatedSince === null) {
        state.elevatedSince = timestamp
      }
      const duration = timestamp - state.elevatedSince
      state.lastUpdate = timestamp

      let level = FatigueLevel.None
      if (duration >= CRITICAL_MS) {
        level = FatigueLevel.Critical
      } else if (duration >= WARNING_MS) {
        level = FatigueLevel.Warning
      }

      return { level, durationMs: duration, handedness }
    } else {
      // Arm dropped — reset
      state.elevatedSince = null
      state.lastUpdate = timestamp
      return { level: FatigueLevel.None, durationMs: 0, handedness }
    }
  }

  /** Reset fatigue tracking for one or both hands */
  reset(handedness?: 'left' | 'right'): void {
    if (handedness) {
      this.states.delete(handedness)
    } else {
      this.states.clear()
    }
  }
}
