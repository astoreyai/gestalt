/**
 * Onset feedback: expanding ring animation + audio cue on gesture onset.
 */

export interface OnsetRing {
  x: number
  y: number
  startTime: number
  duration: number
}

export function createOnsetRing(x: number, y: number, now: number): OnsetRing {
  return { x, y, startTime: now, duration: 200 }
}

export function getRingProgress(ring: OnsetRing, now: number): { radius: number; alpha: number; expired: boolean } {
  const elapsed = now - ring.startTime
  if (elapsed >= ring.duration) {
    return { radius: 30, alpha: 0, expired: true }
  }
  const t = elapsed / ring.duration
  return {
    radius: t * 30,
    alpha: 0.8 * (1 - t),
    expired: false
  }
}

export function shouldPlayOnsetSound(phase: string, soundEnabled: boolean): boolean {
  return phase === 'onset' && soundEnabled
}

/** Lazy AudioContext singleton for onset click sound */
let audioCtx: AudioContext | null = null

export function playOnsetClick(): void {
  if (!audioCtx) {
    audioCtx = new AudioContext()
  }
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.type = 'sine'
  osc.frequency.value = 880
  gain.gain.value = 0.1
  osc.connect(gain)
  gain.connect(audioCtx.destination)
  osc.start()
  gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05)
  osc.stop(audioCtx.currentTime + 0.05)
}
