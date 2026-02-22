/**
 * Pure logic for gesture label persistence and fade-out.
 * Extracted from GestureOverlay for testability.
 *
 * When a gesture is active (onset/hold), the label is fully opaque.
 * When the gesture releases or tracking is lost, the label fades out
 * linearly over `fadeDuration` milliseconds before disappearing.
 */

const DEFAULT_FADE_DURATION = 500

export interface LabelState {
  text: string
  opacity: number  // 1.0 when active, fades to 0 over fadeDuration
  expireTime: number  // timestamp when label should disappear; 0 = active (no fade)
}

/**
 * Compute the next label state given the current state and active gesture.
 *
 * @param current   Previous label state (null if no label visible)
 * @param activeGesture  Current gesture event, or null if no gesture
 * @param now       Current timestamp (performance.now())
 * @param fadeDuration  Fade-out duration in ms (default 500)
 * @returns Updated LabelState, or null if label should be hidden
 */
export function updateLabelState(
  current: LabelState | null,
  activeGesture: { type: string; phase: string } | null,
  now: number,
  fadeDuration: number = DEFAULT_FADE_DURATION
): LabelState | null {
  // Active gesture with onset or hold: show label at full opacity
  if (activeGesture && (activeGesture.phase === 'onset' || activeGesture.phase === 'hold')) {
    return { text: activeGesture.type, opacity: 1.0, expireTime: 0 }
  }

  // Gesture transitioning to release: start fade
  if (activeGesture && activeGesture.phase === 'release') {
    return { text: activeGesture.type, opacity: 1.0, expireTime: now + fadeDuration }
  }

  // No active gesture — check if we have a fading label
  if (!activeGesture && current) {
    // Label was active (expireTime === 0) and gesture was just lost: start fade
    if (current.expireTime === 0) {
      return { text: current.text, opacity: 1.0, expireTime: now + fadeDuration }
    }

    // Label is fading: compute remaining opacity
    const remaining = current.expireTime - now
    if (remaining <= 0) {
      return null
    }
    const opacity = Math.max(0, remaining / fadeDuration)
    return { text: current.text, opacity, expireTime: current.expireTime }
  }

  // No gesture, no current state
  return null
}
