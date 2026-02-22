import { describe, it, expect } from 'vitest'

/** Subtract palm centroid z from all landmarks, reducing correlated noise */
function normalizeZ(landmarks: { x: number; y: number; z: number }[]): { normalized: typeof landmarks; centroid: number } {
  // Palm centroid from wrist (0), index_mcp (5), middle_mcp (9), ring_mcp (13), pinky_mcp (17)
  const palmIndices = [0, 5, 9, 13, 17]
  let sum = 0
  for (const idx of palmIndices) {
    if (idx < landmarks.length) sum += landmarks[idx].z
  }
  const centroid = sum / palmIndices.length

  const normalized = landmarks.map(lm => ({
    x: lm.x,
    y: lm.y,
    z: lm.z - centroid
  }))

  return { normalized, centroid }
}

function denormalizeZ(landmarks: { x: number; y: number; z: number }[], centroid: number) {
  return landmarks.map(lm => ({
    x: lm.x,
    y: lm.y,
    z: lm.z + centroid
  }))
}

describe('Sprint 7c: Z-normalization with palm centroid', () => {
  it('should center z values around zero after normalization', () => {
    // 21 landmarks with z offset of 0.5
    const landmarks = Array.from({ length: 21 }, (_, i) => ({
      x: i * 0.05, y: i * 0.05, z: 0.5 + Math.random() * 0.01
    }))
    const { normalized } = normalizeZ(landmarks)

    // Palm landmarks should be near zero
    const palmZ = [0, 5, 9, 13, 17].map(i => normalized[i].z)
    const avgPalmZ = palmZ.reduce((a, b) => a + b, 0) / palmZ.length
    expect(Math.abs(avgPalmZ)).toBeLessThan(0.01)
  })

  it('should preserve relative z-differences', () => {
    const landmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0, y: 0, z: i * 0.01 + 0.5
    }))
    const { normalized } = normalizeZ(landmarks)

    // Relative difference between landmark 0 and 20 should be preserved
    const origDiff = landmarks[20].z - landmarks[0].z
    const normDiff = normalized[20].z - normalized[0].z
    expect(normDiff).toBeCloseTo(origDiff, 10)
  })

  it('should reconstruct original z after denormalization', () => {
    const landmarks = Array.from({ length: 21 }, (_, i) => ({
      x: 0, y: 0, z: 0.3 + i * 0.02
    }))
    const { normalized, centroid } = normalizeZ(landmarks)
    const restored = denormalizeZ(normalized, centroid)

    for (let i = 0; i < 21; i++) {
      expect(restored[i].z).toBeCloseTo(landmarks[i].z, 10)
    }
  })

  it('should not modify x and y coordinates', () => {
    const landmarks = Array.from({ length: 21 }, (_, i) => ({
      x: i * 0.05, y: i * 0.03, z: 0.5
    }))
    const { normalized } = normalizeZ(landmarks)

    for (let i = 0; i < 21; i++) {
      expect(normalized[i].x).toBe(landmarks[i].x)
      expect(normalized[i].y).toBe(landmarks[i].y)
    }
  })
})
