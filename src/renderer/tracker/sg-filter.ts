/**
 * 5-point quadratic Savitzky-Golay smoothing filter.
 * Coefficients: [-3, 12, 17, 12, -3] / 35 (symmetric)
 * O(1) per sample using a ring buffer.
 *
 * Used to smooth velocity and rotation rate signals from HandMotionTracker
 * before EMA, reducing high-frequency noise from finite-difference derivatives.
 */
export class SavitzkyGolayFilter {
  private readonly buffer: number[] = [0, 0, 0, 0, 0]
  private count = 0
  private writeIndex = 0

  // SG coefficients for 5-point quadratic smoothing
  private static readonly COEFFS = [-3, 12, 17, 12, -3] as const
  private static readonly NORM = 35

  filter(value: number): number {
    this.buffer[this.writeIndex] = value
    this.writeIndex = (this.writeIndex + 1) % 5
    this.count = Math.min(this.count + 1, 5)

    if (this.count < 5) return value // Not enough data yet

    let sum = 0
    for (let i = 0; i < 5; i++) {
      const idx = (this.writeIndex + i) % 5
      sum += SavitzkyGolayFilter.COEFFS[i] * this.buffer[idx]
    }
    return sum / SavitzkyGolayFilter.NORM
  }

  reset(): void {
    this.buffer.fill(0)
    this.count = 0
    this.writeIndex = 0
  }
}
