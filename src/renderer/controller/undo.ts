/**
 * Undo stack for reversing scene actions.
 * Stores entries with the original action type and its inverse,
 * enabling gesture-driven undo in the 3D scene.
 *
 * Object-type-agnostic: supports nodes, clusters, embedding points,
 * and future pipeline objects (directories, images, documents).
 */

import type { SelectableObject } from '@shared/protocol'
export type { SelectableObject } from '@shared/protocol'

export interface UndoEntry {
  /** The action that was performed */
  action: string
  /** The inverse action to undo it */
  inverse: UndoInverse
  /** Timestamp when action was performed */
  timestamp: number
}

export type UndoInverse =
  | { type: 'deselect'; target?: SelectableObject }
  | { type: 'select'; target: SelectableObject }
  | { type: 'restore_position'; params: { nodeId: string; x: number; y: number; z: number } }
  | { type: 'zoom'; params: { delta: number } }
  | { type: 'rotate'; params: { angle: number; axis: string } }
  | { type: 'noop' }

/**
 * Fixed-capacity LIFO stack for undo operations.
 *
 * - Evicts oldest entries when capacity is exceeded.
 * - Deduplicates consecutive pushes of the same action type
 *   (prevents flooding from continuous gestures like drag).
 */
export class UndoStack {
  private entries: UndoEntry[]
  private readonly capacity: number

  constructor(capacity: number = 10) {
    this.capacity = capacity
    this.entries = []
  }

  /**
   * Push an action onto the undo stack.
   * Skips push if the most recent entry has the same action type (deduplication).
   * Evicts the oldest entry if the stack is at capacity.
   */
  push(action: string, inverse: UndoInverse, timestamp?: number): void {
    // Deduplicate: skip if top of stack has the same action type
    if (this.entries.length > 0 && this.entries[this.entries.length - 1].action === action) {
      return
    }

    const entry: UndoEntry = {
      action,
      inverse,
      timestamp: timestamp ?? Date.now()
    }

    // Evict oldest if at capacity
    if (this.entries.length >= this.capacity) {
      this.entries.shift()
    }

    this.entries.push(entry)
  }

  /** Pop the most recent entry off the stack, or null if empty. */
  pop(): UndoEntry | null {
    return this.entries.pop() ?? null
  }

  /** Peek at the most recent entry without removing it, or null if empty. */
  peek(): UndoEntry | null {
    if (this.entries.length === 0) return null
    return this.entries[this.entries.length - 1]
  }

  /** Remove all entries from the stack. */
  clear(): void {
    this.entries = []
  }

  /** Whether there are entries available to undo. */
  get canUndo(): boolean {
    return this.entries.length > 0
  }

  /** Number of entries currently in the stack. */
  get length(): number {
    return this.entries.length
  }
}
