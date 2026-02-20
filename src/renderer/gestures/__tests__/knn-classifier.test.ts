import { describe, it, expect, beforeEach } from 'vitest'
import { GestureType } from '@shared/protocol'
import type { GestureSample, Landmark } from '@shared/protocol'
import { KnnClassifier, extractSimpleFeatures } from '../knn-classifier'

// ─── Test Utilities: Synthetic Landmark Data ────────────────────────

/** Create a landmark at a position */
function lm(x: number, y: number, z: number = 0): Landmark {
  return { x, y, z }
}

/**
 * Create a full 21-landmark array for a hand pose.
 * MediaPipe landmark indices:
 *   0: Wrist
 *   1-4: Thumb (CMC, MCP, IP, TIP)
 *   5-8: Index (MCP, PIP, DIP, TIP)
 *   9-12: Middle (MCP, PIP, DIP, TIP)
 *   13-16: Ring (MCP, PIP, DIP, TIP)
 *   17-20: Pinky (MCP, PIP, DIP, TIP)
 */
function createOpenPalmLandmarks(): Landmark[] {
  return [
    lm(0.5, 0.8, 0),     // 0: Wrist
    lm(0.38, 0.7, 0),    // 1: Thumb CMC
    lm(0.32, 0.6, 0),    // 2: Thumb MCP
    lm(0.28, 0.5, 0),    // 3: Thumb IP
    lm(0.25, 0.4, 0),    // 4: Thumb TIP — extended far from wrist
    lm(0.42, 0.55, 0),   // 5: Index MCP
    lm(0.42, 0.45, 0),   // 6: Index PIP
    lm(0.42, 0.38, 0),   // 7: Index DIP
    lm(0.42, 0.3, 0),    // 8: Index TIP — extended
    lm(0.50, 0.53, 0),   // 9: Middle MCP
    lm(0.50, 0.43, 0),   // 10: Middle PIP
    lm(0.50, 0.35, 0),   // 11: Middle DIP
    lm(0.50, 0.28, 0),   // 12: Middle TIP — extended
    lm(0.58, 0.55, 0),   // 13: Ring MCP
    lm(0.58, 0.45, 0),   // 14: Ring PIP
    lm(0.58, 0.38, 0),   // 15: Ring DIP
    lm(0.58, 0.3, 0),    // 16: Ring TIP — extended
    lm(0.65, 0.6, 0),    // 17: Pinky MCP
    lm(0.65, 0.5, 0),    // 18: Pinky PIP
    lm(0.65, 0.43, 0),   // 19: Pinky DIP
    lm(0.65, 0.35, 0),   // 20: Pinky TIP — extended
  ]
}

function createFistLandmarks(): Landmark[] {
  return [
    lm(0.5, 0.8, 0),     // 0: Wrist
    lm(0.4, 0.72, 0),    // 1: Thumb CMC
    lm(0.38, 0.68, 0),   // 2: Thumb MCP
    lm(0.40, 0.72, 0),   // 3: Thumb IP — curled back
    lm(0.43, 0.74, 0),   // 4: Thumb TIP — close to wrist
    lm(0.42, 0.6, 0),    // 5: Index MCP
    lm(0.42, 0.62, 0),   // 6: Index PIP
    lm(0.43, 0.67, 0),   // 7: Index DIP — curled
    lm(0.44, 0.7, 0),    // 8: Index TIP — close to wrist
    lm(0.50, 0.58, 0),   // 9: Middle MCP
    lm(0.50, 0.62, 0),   // 10: Middle PIP
    lm(0.50, 0.67, 0),   // 11: Middle DIP — curled
    lm(0.50, 0.7, 0),    // 12: Middle TIP — close to wrist
    lm(0.58, 0.6, 0),    // 13: Ring MCP
    lm(0.58, 0.63, 0),   // 14: Ring PIP
    lm(0.58, 0.68, 0),   // 15: Ring DIP — curled
    lm(0.58, 0.72, 0),   // 16: Ring TIP — close to wrist
    lm(0.65, 0.63, 0),   // 17: Pinky MCP
    lm(0.65, 0.66, 0),   // 18: Pinky PIP
    lm(0.65, 0.7, 0),    // 19: Pinky DIP — curled
    lm(0.65, 0.73, 0),   // 20: Pinky TIP — close to wrist
  ]
}

function createPinchLandmarks(): Landmark[] {
  return [
    lm(0.5, 0.8, 0),     // 0: Wrist
    lm(0.38, 0.7, 0),    // 1: Thumb CMC
    lm(0.35, 0.6, 0),    // 2: Thumb MCP
    lm(0.38, 0.5, 0),    // 3: Thumb IP
    lm(0.42, 0.42, 0),   // 4: Thumb TIP — close to index tip
    lm(0.42, 0.55, 0),   // 5: Index MCP
    lm(0.42, 0.48, 0),   // 6: Index PIP
    lm(0.43, 0.44, 0),   // 7: Index DIP
    lm(0.43, 0.42, 0),   // 8: Index TIP — close to thumb tip
    lm(0.50, 0.58, 0),   // 9: Middle MCP
    lm(0.50, 0.45, 0),   // 10: Middle PIP
    lm(0.50, 0.38, 0),   // 11: Middle DIP
    lm(0.50, 0.32, 0),   // 12: Middle TIP — extended
    lm(0.58, 0.6, 0),    // 13: Ring MCP
    lm(0.58, 0.48, 0),   // 14: Ring PIP
    lm(0.58, 0.40, 0),   // 15: Ring DIP
    lm(0.58, 0.34, 0),   // 16: Ring TIP — extended
    lm(0.65, 0.63, 0),   // 17: Pinky MCP
    lm(0.65, 0.52, 0),   // 18: Pinky PIP
    lm(0.65, 0.44, 0),   // 19: Pinky DIP
    lm(0.65, 0.38, 0),   // 20: Pinky TIP — extended
  ]
}

function createPointLandmarks(): Landmark[] {
  return [
    lm(0.5, 0.8, 0),     // 0: Wrist
    lm(0.4, 0.72, 0),    // 1: Thumb CMC
    lm(0.38, 0.68, 0),   // 2: Thumb MCP
    lm(0.40, 0.72, 0),   // 3: Thumb IP — curled
    lm(0.43, 0.74, 0),   // 4: Thumb TIP — curled
    lm(0.42, 0.55, 0),   // 5: Index MCP
    lm(0.42, 0.45, 0),   // 6: Index PIP
    lm(0.42, 0.38, 0),   // 7: Index DIP
    lm(0.42, 0.3, 0),    // 8: Index TIP — extended
    lm(0.50, 0.58, 0),   // 9: Middle MCP
    lm(0.50, 0.62, 0),   // 10: Middle PIP
    lm(0.50, 0.67, 0),   // 11: Middle DIP — curled
    lm(0.50, 0.7, 0),    // 12: Middle TIP — curled
    lm(0.58, 0.6, 0),    // 13: Ring MCP
    lm(0.58, 0.63, 0),   // 14: Ring PIP
    lm(0.58, 0.68, 0),   // 15: Ring DIP — curled
    lm(0.58, 0.72, 0),   // 16: Ring TIP — curled
    lm(0.65, 0.63, 0),   // 17: Pinky MCP
    lm(0.65, 0.66, 0),   // 18: Pinky PIP
    lm(0.65, 0.7, 0),    // 19: Pinky DIP — curled
    lm(0.65, 0.73, 0),   // 20: Pinky TIP — curled
  ]
}

/**
 * Add slight random perturbation to create varied samples of the same gesture.
 * This simulates natural hand variation across calibration samples.
 */
function perturbLandmarks(landmarks: Landmark[], seed: number): Landmark[] {
  // Simple deterministic pseudo-random based on seed
  const noise = (i: number): number => {
    const val = Math.sin(seed * 9301 + i * 4919) * 10000
    return (val - Math.floor(val) - 0.5) * 0.02 // +/- 0.01
  }

  return landmarks.map((l, i) => ({
    x: l.x + noise(i * 3),
    y: l.y + noise(i * 3 + 1),
    z: l.z + noise(i * 3 + 2)
  }))
}

/** Create a GestureSample from landmarks and a gesture type */
function createSample(
  gestureType: GestureType,
  landmarks: Landmark[],
  seed: number = 0
): GestureSample {
  const perturbedLandmarks = seed === 0 ? landmarks : perturbLandmarks(landmarks, seed)
  return {
    gestureType,
    landmarks: perturbedLandmarks,
    features: extractSimpleFeatures(perturbedLandmarks),
    timestamp: Date.now()
  }
}

/** Generate N training samples for a gesture type with varied perturbation */
function generateTrainingSamples(
  gestureType: GestureType,
  baseLandmarks: Landmark[],
  count: number
): GestureSample[] {
  return Array.from({ length: count }, (_, i) =>
    createSample(gestureType, baseLandmarks, i + 1)
  )
}

// ─── KnnClassifier Tests ────────────────────────────────────────────

describe('KnnClassifier', () => {
  let classifier: KnnClassifier

  beforeEach(() => {
    classifier = new KnnClassifier()
  })

  it('should start untrained with no samples', () => {
    expect(classifier.isTrained()).toBe(false)
    expect(classifier.sampleCount()).toBe(0)
  })

  it('should accept training samples', () => {
    const samples = generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5)
    classifier.train(samples)
    expect(classifier.sampleCount()).toBe(5)
  })

  it('should report sample counts by type', () => {
    const openPalmSamples = generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5)
    const fistSamples = generateTrainingSamples(GestureType.Fist, createFistLandmarks(), 3)

    classifier.train(openPalmSamples)
    classifier.train(fistSamples)

    const counts = classifier.sampleCountsByType()
    expect(counts.get(GestureType.OpenPalm)).toBe(5)
    expect(counts.get(GestureType.Fist)).toBe(3)
    expect(counts.has(GestureType.Point)).toBe(false)
  })

  it('should classify features matching a known gesture', () => {
    // Train with 5 samples of each gesture
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Fist, createFistLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Pinch, createPinchLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Point, createPointLandmarks(), 5))

    // Classify a new open palm sample
    const testFeatures = extractSimpleFeatures(createOpenPalmLandmarks())
    const result = classifier.classify(testFeatures)

    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.OpenPalm)
  })

  it('should return highest confidence for closest gesture type', () => {
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Fist, createFistLandmarks(), 5))

    // Test with an open palm -- should have high confidence for open palm
    const testFeatures = extractSimpleFeatures(createOpenPalmLandmarks())
    const result = classifier.classify(testFeatures)

    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.OpenPalm)
    expect(result!.confidence).toBeGreaterThan(0.5)
  })

  it('should return null when not trained', () => {
    const testFeatures = extractSimpleFeatures(createOpenPalmLandmarks())
    const result = classifier.classify(testFeatures)
    expect(result).toBeNull()
  })

  it('should return null when distance exceeds maxDistance', () => {
    // Use a very small maxDistance so everything is "too far"
    const strictClassifier = new KnnClassifier({ maxDistance: 0.0001 })
    strictClassifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))

    // Test with fist features -- should be far from open palm training data
    const testFeatures = extractSimpleFeatures(createFistLandmarks())
    const result = strictClassifier.classify(testFeatures)
    expect(result).toBeNull()
  })

  it('should use k=5 by default', () => {
    // Train with exactly 5 samples so isTrained() returns true
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))
    expect(classifier.isTrained()).toBe(true)

    // With only 4 samples, isTrained() should return false
    const smallClassifier = new KnnClassifier()
    smallClassifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 4))
    expect(smallClassifier.isTrained()).toBe(false)
  })

  it('should support custom k value', () => {
    const k3Classifier = new KnnClassifier({ k: 3 })
    k3Classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 3))
    expect(k3Classifier.isTrained()).toBe(true)

    // With k=3, 2 samples should not be enough
    const tooFew = new KnnClassifier({ k: 3 })
    tooFew.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 2))
    expect(tooFew.isTrained()).toBe(false)
  })

  it('should handle tie-breaking (pick closest)', () => {
    // Create a classifier with k=4 and equal samples of two types
    const tieClassifier = new KnnClassifier({ k: 4, maxDistance: 100 })

    // 2 open palm + 2 fist samples
    tieClassifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 2))
    tieClassifier.train(generateTrainingSamples(GestureType.Fist, createFistLandmarks(), 2))

    // Classify with open palm features -- should pick open palm because closer
    const testFeatures = extractSimpleFeatures(createOpenPalmLandmarks())
    const result = tieClassifier.classify(testFeatures)

    expect(result).not.toBeNull()
    // With equal votes, tie-breaking selects the type with closer average distance.
    // Open palm test features are closest to open palm training data.
    expect(result!.type).toBe(GestureType.OpenPalm)
  })

  it('should clear all training data', () => {
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))
    expect(classifier.sampleCount()).toBe(5)
    expect(classifier.isTrained()).toBe(true)

    classifier.clear()
    expect(classifier.sampleCount()).toBe(0)
    expect(classifier.isTrained()).toBe(false)
  })

  it('should classify landmarks using feature extraction', () => {
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Fist, createFistLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Pinch, createPinchLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Point, createPointLandmarks(), 5))

    // classifyLandmarks should extract features internally and classify
    const result = classifier.classifyLandmarks(createFistLandmarks())

    expect(result).not.toBeNull()
    expect(result!.type).toBe(GestureType.Fist)
    expect(result!.confidence).toBeGreaterThan(0)
    expect(result!.distance).toBeGreaterThanOrEqual(0)
  })

  it('should correctly classify all four gesture types', () => {
    // Train with all four types
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Fist, createFistLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Pinch, createPinchLandmarks(), 5))
    classifier.train(generateTrainingSamples(GestureType.Point, createPointLandmarks(), 5))

    // Test each gesture type
    const openPalmResult = classifier.classifyLandmarks(createOpenPalmLandmarks())
    expect(openPalmResult).not.toBeNull()
    expect(openPalmResult!.type).toBe(GestureType.OpenPalm)

    const fistResult = classifier.classifyLandmarks(createFistLandmarks())
    expect(fistResult).not.toBeNull()
    expect(fistResult!.type).toBe(GestureType.Fist)

    const pinchResult = classifier.classifyLandmarks(createPinchLandmarks())
    expect(pinchResult).not.toBeNull()
    expect(pinchResult!.type).toBe(GestureType.Pinch)

    const pointResult = classifier.classifyLandmarks(createPointLandmarks())
    expect(pointResult).not.toBeNull()
    expect(pointResult!.type).toBe(GestureType.Point)
  })

  it('should accumulate samples across multiple train() calls', () => {
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 3))
    classifier.train(generateTrainingSamples(GestureType.Fist, createFistLandmarks(), 4))

    expect(classifier.sampleCount()).toBe(7)

    const counts = classifier.sampleCountsByType()
    expect(counts.get(GestureType.OpenPalm)).toBe(3)
    expect(counts.get(GestureType.Fist)).toBe(4)
  })

  it('should return confidence as vote proportion', () => {
    // Train with 5 open palm samples and k=5
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))

    // When all 5 neighbors are open palm, confidence should be 1.0
    const result = classifier.classify(extractSimpleFeatures(createOpenPalmLandmarks()))
    expect(result).not.toBeNull()
    expect(result!.confidence).toBe(1.0)
  })

  it('should return distance as average to k nearest neighbors', () => {
    classifier.train(generateTrainingSamples(GestureType.OpenPalm, createOpenPalmLandmarks(), 5))

    const result = classifier.classify(extractSimpleFeatures(createOpenPalmLandmarks()))
    expect(result).not.toBeNull()
    expect(result!.distance).toBeGreaterThanOrEqual(0)
    expect(typeof result!.distance).toBe('number')
    expect(Number.isFinite(result!.distance)).toBe(true)
  })
})

// ─── Feature Extraction Tests ───────────────────────────────────────

describe('Feature Extraction', () => {
  it('should produce consistent feature vectors for same landmarks', () => {
    const landmarks = createOpenPalmLandmarks()
    const features1 = extractSimpleFeatures(landmarks)
    const features2 = extractSimpleFeatures(landmarks)

    expect(features1).toEqual(features2)
  })

  it('should produce different features for different hand poses', () => {
    const openPalmFeatures = extractSimpleFeatures(createOpenPalmLandmarks())
    const fistFeatures = extractSimpleFeatures(createFistLandmarks())

    // At least one feature should differ
    const allSame = openPalmFeatures.every((f, i) => Math.abs(f - fistFeatures[i]) < 0.001)
    expect(allSame).toBe(false)
  })

  it('should produce 9-element feature vectors', () => {
    const features = extractSimpleFeatures(createOpenPalmLandmarks())
    expect(features).toHaveLength(9)
  })

  it('should produce all finite numeric values', () => {
    const features = extractSimpleFeatures(createOpenPalmLandmarks())
    for (const f of features) {
      expect(typeof f).toBe('number')
      expect(Number.isFinite(f)).toBe(true)
    }
  })

  it('should normalize features by palm size', () => {
    // Create two hands at different scales but same pose
    const landmarks1 = createOpenPalmLandmarks()
    const landmarks2 = landmarks1.map((l) => ({
      x: l.x * 2,
      y: l.y * 2,
      z: l.z * 2
    }))

    const features1 = extractSimpleFeatures(landmarks1)
    const features2 = extractSimpleFeatures(landmarks2)

    // Features should be similar because they are normalized by palm size
    for (let i = 0; i < features1.length; i++) {
      expect(features1[i]).toBeCloseTo(features2[i], 3)
    }
  })

  it('should produce distinct features for each gesture type', () => {
    const openPalm = extractSimpleFeatures(createOpenPalmLandmarks())
    const fist = extractSimpleFeatures(createFistLandmarks())
    const pinch = extractSimpleFeatures(createPinchLandmarks())
    const point = extractSimpleFeatures(createPointLandmarks())

    // Verify euclidean distances between different gestures are non-trivial
    const eucDist = (a: number[], b: number[]): number => {
      return Math.sqrt(a.reduce((sum, val, i) => sum + (val - b[i]) ** 2, 0))
    }

    expect(eucDist(openPalm, fist)).toBeGreaterThan(0.1)
    expect(eucDist(openPalm, pinch)).toBeGreaterThan(0.1)
    expect(eucDist(fist, point)).toBeGreaterThan(0.1)
    expect(eucDist(pinch, point)).toBeGreaterThan(0.1)
  })
})
