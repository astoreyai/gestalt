/**
 * Proximity-based depth coloring for graph nodes and point clouds.
 * Tints objects based on distance from the user's hand position.
 * Gradient: green (close) → yellow (mid) → red (far).
 */

/** Pre-allocated output object to avoid GC pressure in hot loops */
const _tint = { r: 0, g: 0, b: 0 }
const _blend = { r: 0, g: 0, b: 0 }

/**
 * Compute a proximity tint color based on normalized distance.
 * @param distance - Current distance to hand
 * @param maxDistance - Maximum distance for full red
 * @returns RGB color in [0,1] range. Green at 0, yellow at 0.5, red at 1.0.
 */
export function proximityTint(
  distance: number,
  maxDistance: number
): { r: number; g: number; b: number } {
  if (maxDistance <= 0) {
    _tint.r = 1
    _tint.g = 0
    _tint.b = 0
    return _tint
  }

  // Normalize and clamp to [0, 1]
  const t = Math.max(0, Math.min(1, distance / maxDistance))

  // Green → Yellow → Red gradient
  // At t=0: (0, 1, 0) green
  // At t=0.5: (1, 1, 0) yellow
  // At t=1: (1, 0, 0) red
  _tint.r = t < 0.5 ? t * 2 : 1
  _tint.g = t < 0.5 ? 1 : 1 - (t - 0.5) * 2
  _tint.b = 0

  return _tint
}

/**
 * Blend a base color with a proximity tint.
 * @param base - Original color {r, g, b} in [0,1]
 * @param tint - Proximity tint from proximityTint()
 * @param strength - Blend strength [0,1]. 0 = base only, 1 = tint only. Recommended: 0.3
 */
export function blendWithProximityTint(
  base: { r: number; g: number; b: number },
  tint: { r: number; g: number; b: number },
  strength: number
): { r: number; g: number; b: number } {
  const s = Math.max(0, Math.min(1, strength))
  const inv = 1 - s
  _blend.r = base.r * inv + tint.r * s
  _blend.g = base.g * inv + tint.g * s
  _blend.b = base.b * inv + tint.b * s
  return _blend
}
