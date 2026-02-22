import { describe, it, expect, beforeEach } from 'vitest'
import { UndoStack, type UndoInverse, type SelectableObject } from '../undo'

describe('UndoStack', () => {
  let stack: UndoStack

  beforeEach(() => {
    stack = new UndoStack()
  })

  it('new UndoStack has length 0', () => {
    expect(stack.length).toBe(0)
  })

  it('push adds an entry', () => {
    stack.push('select', { type: 'deselect' })
    expect(stack.length).toBe(1)
  })

  it('pop returns most recent entry', () => {
    stack.push('select', { type: 'deselect' }, 1000)
    stack.push('zoom', { type: 'zoom', params: { delta: -5 } }, 2000)

    const entry = stack.pop()
    expect(entry).not.toBeNull()
    expect(entry!.action).toBe('zoom')
    expect(entry!.inverse).toEqual({ type: 'zoom', params: { delta: -5 } })
    expect(entry!.timestamp).toBe(2000)
  })

  it('pop returns null when empty', () => {
    expect(stack.pop()).toBeNull()
  })

  it('multiple pushes maintain LIFO order', () => {
    stack.push('select', { type: 'deselect' }, 100)
    stack.push('rotate', { type: 'rotate', params: { angle: -45, axis: 'y' } }, 200)
    stack.push('zoom', { type: 'zoom', params: { delta: -3 } }, 300)

    expect(stack.pop()!.action).toBe('zoom')
    expect(stack.pop()!.action).toBe('rotate')
    expect(stack.pop()!.action).toBe('select')
    expect(stack.pop()).toBeNull()
  })

  it('respects max capacity — oldest entries evicted', () => {
    const small = new UndoStack(3)
    small.push('select', { type: 'deselect' }, 1)
    small.push('rotate', { type: 'noop' }, 2)
    small.push('zoom', { type: 'noop' }, 3)
    small.push('pan', { type: 'noop' }, 4) // This should evict 'select'

    expect(small.length).toBe(3)
    expect(small.pop()!.action).toBe('pan')
    expect(small.pop()!.action).toBe('zoom')
    expect(small.pop()!.action).toBe('rotate')
    expect(small.pop()).toBeNull()
  })

  it('clear empties the stack', () => {
    stack.push('select', { type: 'deselect' })
    stack.push('zoom', { type: 'noop' })
    expect(stack.length).toBe(2)

    stack.clear()
    expect(stack.length).toBe(0)
    expect(stack.pop()).toBeNull()
  })

  it('peek returns top without removing', () => {
    stack.push('select', { type: 'deselect' }, 500)
    stack.push('drag', { type: 'restore_position', params: { nodeId: 'n1', x: 1, y: 2, z: 3 } }, 600)

    const top = stack.peek()
    expect(top).not.toBeNull()
    expect(top!.action).toBe('drag')
    expect(top!.inverse).toEqual({ type: 'restore_position', params: { nodeId: 'n1', x: 1, y: 2, z: 3 } })

    // Peek should not remove
    expect(stack.length).toBe(2)
  })

  it('supports cluster selection undo', () => {
    const target: SelectableObject = { kind: 'cluster', id: 3 }
    stack.push('select_cluster', { type: 'select', target })
    const entry = stack.pop()
    expect(entry!.inverse).toEqual({ type: 'select', target: { kind: 'cluster', id: 3 } })
  })

  it('supports embedding point selection undo', () => {
    const target: SelectableObject = { kind: 'point', id: 'emb-42' }
    stack.push('select_point', { type: 'select', target })
    const entry = stack.pop()
    expect(entry!.inverse.type).toBe('select')
    if (entry!.inverse.type === 'select') {
      expect(entry!.inverse.target.kind).toBe('point')
    }
  })

  it('supports deselect with target context', () => {
    const target: SelectableObject = { kind: 'node', id: 'abc' }
    stack.push('deselect', { type: 'deselect', target })
    const entry = stack.pop()
    expect(entry!.inverse.type).toBe('deselect')
    if (entry!.inverse.type === 'deselect') {
      expect(entry!.inverse.target).toEqual({ kind: 'node', id: 'abc' })
    }
  })

  it('supports directory object undo', () => {
    const target: SelectableObject = { kind: 'directory', id: 'dir-1', path: '/home/docs' }
    stack.push('select_dir', { type: 'select', target })
    const entry = stack.pop()
    if (entry!.inverse.type === 'select') {
      expect(entry!.inverse.target.kind).toBe('directory')
      if (entry!.inverse.target.kind === 'directory') {
        expect(entry!.inverse.target.path).toBe('/home/docs')
      }
    }
  })

  it('supports image and document object undo', () => {
    stack.push('select_image', { type: 'select', target: { kind: 'image', id: 'img-1' } })
    stack.push('select_doc', { type: 'select', target: { kind: 'document', id: 'doc-1' } })
    expect(stack.length).toBe(2)
    const doc = stack.pop()!
    const img = stack.pop()!
    if (doc.inverse.type === 'select') expect(doc.inverse.target.kind).toBe('document')
    if (img.inverse.type === 'select') expect(img.inverse.target.kind).toBe('image')
  })

  it('canUndo returns true when entries exist', () => {
    stack.push('select', { type: 'deselect' })
    expect(stack.canUndo).toBe(true)
  })

  it('canUndo returns false when empty', () => {
    expect(stack.canUndo).toBe(false)
  })

  it('push with same consecutive action type deduplicates', () => {
    stack.push('select', { type: 'deselect' }, 100)
    stack.push('select', { type: 'deselect' }, 200) // Duplicate — should be skipped

    expect(stack.length).toBe(1)
    // The first entry is kept (not replaced)
    expect(stack.peek()!.timestamp).toBe(100)
  })

  it('tracks the inverse action for each push', () => {
    // select → deselect
    stack.push('select', { type: 'deselect' })
    expect(stack.peek()!.inverse).toEqual({ type: 'deselect' })
    stack.clear()

    // drag → restore_position
    const restoreInverse: UndoInverse = {
      type: 'restore_position',
      params: { nodeId: 'node-42', x: 10, y: 20, z: 30 }
    }
    stack.push('drag', restoreInverse)
    expect(stack.peek()!.inverse).toEqual(restoreInverse)
    stack.clear()

    // zoom → inverse zoom
    const zoomInverse: UndoInverse = { type: 'zoom', params: { delta: -5 } }
    stack.push('zoom', zoomInverse)
    expect(stack.peek()!.inverse).toEqual(zoomInverse)
    stack.clear()

    // rotate → inverse rotate
    const rotateInverse: UndoInverse = { type: 'rotate', params: { angle: -90, axis: 'y' } }
    stack.push('rotate', rotateInverse)
    expect(stack.peek()!.inverse).toEqual(rotateInverse)
    stack.clear()

    // deselect → re-select with node id
    const selectInverse: UndoInverse = { type: 'select', target: { kind: 'node', id: 'abc' } }
    stack.push('deselect', selectInverse)
    expect(stack.peek()!.inverse).toEqual(selectInverse)
  })

  it('defaults capacity to 10', () => {
    // Push 12 entries, only 10 should remain
    for (let i = 0; i < 12; i++) {
      stack.push(`action-${i}`, { type: 'noop' }, i)
    }
    expect(stack.length).toBe(10)

    // Oldest two (action-0, action-1) should have been evicted
    // Most recent should be action-11
    expect(stack.pop()!.action).toBe('action-11')
    // Oldest remaining should be action-2
    // Pop all remaining to verify
    const remaining: string[] = []
    let entry = stack.pop()
    while (entry) {
      remaining.push(entry.action)
      entry = stack.pop()
    }
    expect(remaining[remaining.length - 1]).toBe('action-2')
  })
})
