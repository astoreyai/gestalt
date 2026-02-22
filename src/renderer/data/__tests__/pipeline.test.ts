import { describe, it, expect } from 'vitest'
import {
  directoryToGraph,
  bookmarksToGraph,
  documentsToEmbedding,
  imagesToGraphNodes,
  clipboardToGraph,
  type DirectoryEntry,
  type BookmarkEntry,
  type DocumentChunk,
  type ImageEntry,
  type ClipboardEntry
} from '../pipeline'

describe('directoryToGraph', () => {
  it('creates nodes for folders and files', () => {
    const root: DirectoryEntry = {
      name: 'root',
      path: '/root',
      isDirectory: true,
      size: 0,
      children: [
        { name: 'file.txt', path: '/root/file.txt', isDirectory: false, size: 100 },
        { name: 'sub', path: '/root/sub', isDirectory: true, size: 0, children: [
          { name: 'inner.md', path: '/root/sub/inner.md', isDirectory: false, size: 50 }
        ]}
      ]
    }
    const graph = directoryToGraph(root)
    expect(graph.nodes.length).toBe(4) // root, file.txt, sub, inner.md
    expect(graph.edges.length).toBe(3) // root->file, root->sub, sub->inner
  })

  it('sets metadata with path and size', () => {
    const root: DirectoryEntry = {
      name: 'root', path: '/root', isDirectory: true, size: 0,
      children: [{ name: 'a.txt', path: '/root/a.txt', isDirectory: false, size: 42 }]
    }
    const graph = directoryToGraph(root)
    const fileNode = graph.nodes.find(n => n.label === 'a.txt')!
    expect(fileNode.metadata?.path).toBe('/root/a.txt')
    expect(fileNode.metadata?.size).toBe(42)
  })

  it('handles empty directory', () => {
    const root: DirectoryEntry = { name: 'empty', path: '/empty', isDirectory: true, size: 0, children: [] }
    const graph = directoryToGraph(root)
    expect(graph.nodes.length).toBe(1)
    expect(graph.edges.length).toBe(0)
  })

  it('sets color based on isDirectory', () => {
    const root: DirectoryEntry = {
      name: 'root', path: '/root', isDirectory: true, size: 0,
      children: [{ name: 'f.txt', path: '/root/f.txt', isDirectory: false, size: 10 }]
    }
    const graph = directoryToGraph(root)
    const dir = graph.nodes.find(n => n.label === 'root')!
    const file = graph.nodes.find(n => n.label === 'f.txt')!
    expect(dir.color).not.toBe(file.color)
  })

  it('handles deeply nested directories', () => {
    const root: DirectoryEntry = {
      name: 'a', path: '/a', isDirectory: true, size: 0,
      children: [{
        name: 'b', path: '/a/b', isDirectory: true, size: 0,
        children: [{
          name: 'c', path: '/a/b/c', isDirectory: true, size: 0,
          children: [{ name: 'd.txt', path: '/a/b/c/d.txt', isDirectory: false, size: 1 }]
        }]
      }]
    }
    const graph = directoryToGraph(root)
    expect(graph.nodes.length).toBe(4)
    expect(graph.edges.length).toBe(3)
  })
})

describe('bookmarksToGraph', () => {
  it('creates nodes per bookmark', () => {
    const bookmarks: BookmarkEntry[] = [
      { url: 'https://a.com', title: 'A', tags: ['dev'] },
      { url: 'https://b.com', title: 'B', tags: ['dev'] }
    ]
    const graph = bookmarksToGraph(bookmarks)
    expect(graph.nodes.length).toBe(2)
  })

  it('creates edges from shared tags', () => {
    const bookmarks: BookmarkEntry[] = [
      { url: 'https://a.com', title: 'A', tags: ['dev', 'js'] },
      { url: 'https://b.com', title: 'B', tags: ['dev'] },
      { url: 'https://c.com', title: 'C', tags: ['python'] }
    ]
    const graph = bookmarksToGraph(bookmarks)
    // A-B share 'dev' tag, C has no shared tags
    const abEdge = graph.edges.find(e =>
      (e.source === 'https://a.com' && e.target === 'https://b.com') ||
      (e.source === 'https://b.com' && e.target === 'https://a.com')
    )
    expect(abEdge).toBeDefined()
    // No edge between A and C or B and C
    const acEdge = graph.edges.find(e =>
      (e.source === 'https://a.com' && e.target === 'https://c.com') ||
      (e.source === 'https://c.com' && e.target === 'https://a.com')
    )
    expect(acEdge).toBeUndefined()
  })

  it('handles bookmarks with no tags', () => {
    const bookmarks: BookmarkEntry[] = [
      { url: 'https://a.com', title: 'A' },
      { url: 'https://b.com', title: 'B' }
    ]
    const graph = bookmarksToGraph(bookmarks)
    expect(graph.nodes.length).toBe(2)
    expect(graph.edges.length).toBe(0)
  })

  it('handles empty input', () => {
    const graph = bookmarksToGraph([])
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
  })

  it('stores URL in metadata', () => {
    const bookmarks: BookmarkEntry[] = [
      { url: 'https://example.com', title: 'Ex', tags: [] }
    ]
    const graph = bookmarksToGraph(bookmarks)
    expect(graph.nodes[0].metadata?.url).toBe('https://example.com')
  })
})

describe('documentsToEmbedding', () => {
  it('converts chunks to embedding points', () => {
    const chunks: DocumentChunk[] = [
      { id: 'c1', text: 'hello', position: { x: 1, y: 2, z: 3 }, source: 'doc.md' },
      { id: 'c2', text: 'world', position: { x: 4, y: 5, z: 6 }, source: 'doc.md', clusterId: 1 }
    ]
    const data = documentsToEmbedding(chunks)
    expect(data.points.length).toBe(2)
    expect(data.points[0].position).toEqual({ x: 1, y: 2, z: 3 })
    expect(data.points[1].clusterId).toBe(1)
  })

  it('stores text and source in metadata', () => {
    const chunks: DocumentChunk[] = [
      { id: 'c1', text: 'hello world', position: { x: 0, y: 0, z: 0 }, source: 'readme.md' }
    ]
    const data = documentsToEmbedding(chunks)
    expect(data.points[0].metadata?.text).toBe('hello world')
    expect(data.points[0].metadata?.source).toBe('readme.md')
  })

  it('handles empty input', () => {
    const data = documentsToEmbedding([])
    expect(data.points).toEqual([])
  })

  it('preserves cluster IDs', () => {
    const chunks: DocumentChunk[] = [
      { id: 'a', text: 'a', position: { x: 0, y: 0, z: 0 }, source: 'a', clusterId: 5 }
    ]
    const data = documentsToEmbedding(chunks)
    expect(data.points[0].clusterId).toBe(5)
  })
})

describe('imagesToGraphNodes', () => {
  it('creates nodes from images', () => {
    const images: ImageEntry[] = [
      { id: 'img1', name: 'photo.jpg', thumbnail: 'data:image/jpeg;base64,abc' },
      { id: 'img2', name: 'pic.png', thumbnail: 'data:image/png;base64,xyz', position: { x: 1, y: 2, z: 3 } }
    ]
    const nodes = imagesToGraphNodes(images)
    expect(nodes.length).toBe(2)
    expect(nodes[0].label).toBe('photo.jpg')
    expect(nodes[0].metadata?.thumbnail).toBe('data:image/jpeg;base64,abc')
  })

  it('uses provided positions', () => {
    const images: ImageEntry[] = [
      { id: 'img1', name: 'a.jpg', thumbnail: '', position: { x: 10, y: 20, z: 30 } }
    ]
    const nodes = imagesToGraphNodes(images)
    expect(nodes[0].position).toEqual({ x: 10, y: 20, z: 30 })
  })

  it('handles empty input', () => {
    expect(imagesToGraphNodes([])).toEqual([])
  })
})

describe('clipboardToGraph', () => {
  it('creates nodes from entries', () => {
    const entries: ClipboardEntry[] = [
      { id: 'c1', content: 'hello', timestamp: 100, type: 'text' },
      { id: 'c2', content: 'world', timestamp: 200, type: 'text' }
    ]
    const graph = clipboardToGraph(entries)
    expect(graph.nodes.length).toBe(2)
  })

  it('creates temporal edges between sequential entries', () => {
    const entries: ClipboardEntry[] = [
      { id: 'c1', content: 'a', timestamp: 100, type: 'text' },
      { id: 'c2', content: 'b', timestamp: 200, type: 'text' },
      { id: 'c3', content: 'c', timestamp: 300, type: 'text' }
    ]
    const graph = clipboardToGraph(entries)
    expect(graph.edges.length).toBe(2)
    expect(graph.edges[0].source).toBe('c1')
    expect(graph.edges[0].target).toBe('c2')
    expect(graph.edges[1].source).toBe('c2')
    expect(graph.edges[1].target).toBe('c3')
  })

  it('handles single entry (no edges)', () => {
    const entries: ClipboardEntry[] = [
      { id: 'c1', content: 'solo', timestamp: 100, type: 'text' }
    ]
    const graph = clipboardToGraph(entries)
    expect(graph.nodes.length).toBe(1)
    expect(graph.edges.length).toBe(0)
  })

  it('handles empty input', () => {
    const graph = clipboardToGraph([])
    expect(graph.nodes).toEqual([])
    expect(graph.edges).toEqual([])
  })

  it('stores content and type in metadata', () => {
    const entries: ClipboardEntry[] = [
      { id: 'c1', content: 'hello', timestamp: 100, type: 'image' }
    ]
    const graph = clipboardToGraph(entries)
    expect(graph.nodes[0].metadata?.content).toBe('hello')
    expect(graph.nodes[0].metadata?.type).toBe('image')
  })

  it('truncates long content in labels', () => {
    const entries: ClipboardEntry[] = [
      { id: 'c1', content: 'a'.repeat(100), timestamp: 100, type: 'text' }
    ]
    const graph = clipboardToGraph(entries)
    expect(graph.nodes[0].label!.length).toBeLessThanOrEqual(53) // 50 + '...'
  })
})
