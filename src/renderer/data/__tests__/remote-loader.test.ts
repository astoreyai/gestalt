import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  validateUrl,
  detectFormat,
  fetchWithSizeLimit,
  MAX_REMOTE_SIZE
} from '../RemoteLoader'

// ─── validateUrl ─────────────────────────────────────────────────

describe('validateUrl', () => {
  it('should accept a valid https URL', () => {
    const result = validateUrl('https://example.com/data.json')
    expect(result).toBeInstanceOf(URL)
    expect((result as URL).href).toBe('https://example.com/data.json')
  })

  it('should accept a valid http URL', () => {
    const result = validateUrl('http://localhost:3000/graph.graphml')
    expect(result).toBeInstanceOf(URL)
  })

  it('should reject empty string', () => {
    expect(validateUrl('')).toBe('URL cannot be empty')
    expect(validateUrl('   ')).toBe('URL cannot be empty')
  })

  it('should reject malformed URL', () => {
    expect(validateUrl('not-a-url')).toBe('Invalid URL format')
  })

  it('should reject file:// protocol', () => {
    const result = validateUrl('file:///etc/passwd')
    expect(typeof result).toBe('string')
    expect(result).toContain('not allowed')
  })

  it('should reject ftp:// protocol', () => {
    const result = validateUrl('ftp://example.com/data.json')
    expect(typeof result).toBe('string')
    expect(result).toContain('not allowed')
  })

  it('should reject javascript: protocol', () => {
    // eslint-disable-next-line no-script-url
    const result = validateUrl('javascript:alert(1)')
    expect(typeof result).toBe('string')
  })

  it('should trim whitespace from URL', () => {
    const result = validateUrl('  https://example.com/data.json  ')
    expect(result).toBeInstanceOf(URL)
  })
})

// ─── detectFormat ────────────────────────────────────────────────

describe('detectFormat', () => {
  it('should detect .json extension', () => {
    const url = new URL('https://example.com/graph.json')
    expect(detectFormat(url, null)).toBe('json')
  })

  it('should detect .graphml extension', () => {
    const url = new URL('https://example.com/graph.graphml')
    expect(detectFormat(url, null)).toBe('graphml')
  })

  it('should detect .graphml case-insensitively', () => {
    const url = new URL('https://example.com/graph.GRAPHML')
    expect(detectFormat(url, null)).toBe('graphml')
  })

  it('should fall back to Content-Type for application/json', () => {
    const url = new URL('https://example.com/api/data')
    expect(detectFormat(url, 'application/json; charset=utf-8')).toBe('json')
  })

  it('should fall back to Content-Type for application/xml', () => {
    const url = new URL('https://example.com/api/data')
    expect(detectFormat(url, 'application/xml')).toBe('graphml')
  })

  it('should fall back to Content-Type for text/xml', () => {
    const url = new URL('https://example.com/api/data')
    expect(detectFormat(url, 'text/xml')).toBe('graphml')
  })

  it('should default to json when nothing matches', () => {
    const url = new URL('https://example.com/api/data')
    expect(detectFormat(url, 'text/plain')).toBe('json')
  })

  it('should prefer file extension over Content-Type', () => {
    const url = new URL('https://example.com/graph.graphml')
    // Even though Content-Type says json, extension wins
    expect(detectFormat(url, 'application/json')).toBe('graphml')
  })
})

// ─── fetchWithSizeLimit ──────────────────────────────────────────

describe('fetchWithSizeLimit', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should fetch and return text content', async () => {
    const jsonBody = JSON.stringify({ nodes: [{ id: 'a' }], edges: [] })
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String(jsonBody.length)
      }),
      body: createReadableStream(jsonBody)
    })

    const url = new URL('https://example.com/data.json')
    const result = await fetchWithSizeLimit(url)

    expect(result.text).toBe(jsonBody)
    expect(result.contentType).toBe('application/json')
  })

  it('should throw on HTTP error status', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      headers: new Headers()
    })

    const url = new URL('https://example.com/missing.json')
    await expect(fetchWithSizeLimit(url)).rejects.toThrow('HTTP 404')
  })

  it('should reject when Content-Length exceeds limit', async () => {
    const cancelMock = vi.fn()
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-length': String(MAX_REMOTE_SIZE + 1)
      }),
      body: { cancel: cancelMock }
    })

    const url = new URL('https://example.com/huge.json')
    await expect(fetchWithSizeLimit(url)).rejects.toThrow('too large')
    expect(cancelMock).toHaveBeenCalled()
  })

  it('should reject when streamed data exceeds limit', async () => {
    // Create a stream that returns more than MAX_REMOTE_SIZE
    const chunkSize = 1024 * 1024 // 1MB chunks
    const totalChunks = 52 // 52MB > 50MB limit
    let chunksRead = 0
    const cancelMock = vi.fn()

    const mockReader = {
      read: vi.fn().mockImplementation(async () => {
        if (chunksRead >= totalChunks) {
          return { done: true, value: undefined }
        }
        chunksRead++
        return { done: false, value: new Uint8Array(chunkSize) }
      }),
      cancel: cancelMock
    }

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json'
        // No content-length — triggers stream-based check
      }),
      body: { getReader: () => mockReader }
    })

    const url = new URL('https://example.com/huge.json')
    await expect(fetchWithSizeLimit(url)).rejects.toThrow('too large')
    expect(cancelMock).toHaveBeenCalled()
  })

  it('should propagate network errors', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))

    const url = new URL('https://example.com/data.json')
    await expect(fetchWithSizeLimit(url)).rejects.toThrow('Failed to fetch')
  })

  it('should handle AbortController signals', async () => {
    const abortError = new DOMException('The operation was aborted.', 'AbortError')
    globalThis.fetch = vi.fn().mockRejectedValue(abortError)

    const controller = new AbortController()
    controller.abort()

    const url = new URL('https://example.com/data.json')
    await expect(fetchWithSizeLimit(url, controller.signal)).rejects.toThrow('aborted')
  })

  it('should fall back to response.text() when body is null', async () => {
    const jsonBody = '{"nodes":[{"id":"a"}],"edges":[]}'
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json'
      }),
      body: null,
      text: vi.fn().mockResolvedValue(jsonBody)
    })

    const url = new URL('https://example.com/data.json')
    const result = await fetchWithSizeLimit(url)
    expect(result.text).toBe(jsonBody)
  })
})

// ─── Integration: full load flow (mocked fetch) ─────────────────

describe('RemoteLoader integration', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('should load valid JSON graph data end-to-end', async () => {
    const graphJson = JSON.stringify({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', weight: 0.5 }]
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String(graphJson.length)
      }),
      body: createReadableStream(graphJson)
    })

    const url = new URL('https://example.com/graph.json')
    const { text, contentType } = await fetchWithSizeLimit(url)

    expect(contentType).toBe('application/json')
    const parsed = JSON.parse(text)

    // Validate through the same pipeline the component uses
    const { validateData } = await import('../validators')
    const result = validateData(parsed)
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('nodes')
    expect(result.data).toHaveProperty('edges')
  })

  it('should load valid JSON embedding data end-to-end', async () => {
    const embeddingJson = JSON.stringify({
      points: [
        { id: 'p1', position: { x: 1, y: 2, z: 3 }, clusterId: 0 },
        { id: 'p2', position: { x: 4, y: 5, z: 6 }, clusterId: 0 }
      ],
      clusters: [{ id: 0, label: 'Cluster 0' }]
    })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json',
        'content-length': String(embeddingJson.length)
      }),
      body: createReadableStream(embeddingJson)
    })

    const url = new URL('https://example.com/embeddings.json')
    const { text } = await fetchWithSizeLimit(url)
    const parsed = JSON.parse(text)

    const { validateData } = await import('../validators')
    const result = validateData(parsed)
    expect(result.success).toBe(true)
    expect(result.data).toHaveProperty('points')
  })

  it('should load valid GraphML data end-to-end', async () => {
    const graphml = `<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphstruct.org/xmlns">
  <key id="d0" for="node" attr.name="label" attr.type="string"/>
  <graph id="G" edgedefault="undirected">
    <node id="n0"><data key="d0">Node 0</data></node>
    <node id="n1"><data key="d0">Node 1</data></node>
    <edge source="n0" target="n1"/>
  </graph>
</graphml>`

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/xml',
        'content-length': String(graphml.length)
      }),
      body: createReadableStream(graphml)
    })

    const url = new URL('https://example.com/graph.graphml')
    const { text } = await fetchWithSizeLimit(url)

    // Parse through the graph parser
    const { parseGraph } = await import('@renderer/graph/parsers/index')
    const graphData = await parseGraph(text, 'graphml')
    expect(graphData.nodes).toHaveLength(2)
    expect(graphData.edges).toHaveLength(1)
  })

  it('should reject invalid JSON data through validation', async () => {
    const invalidJson = JSON.stringify({ foo: 'bar', baz: 42 })

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json'
      }),
      body: createReadableStream(invalidJson)
    })

    const url = new URL('https://example.com/bad.json')
    const { text } = await fetchWithSizeLimit(url)
    const parsed = JSON.parse(text)

    const { validateData } = await import('../validators')
    const result = validateData(parsed)
    expect(result.success).toBe(false)
    expect(result.errors).toBeDefined()
    expect(result.errors!.length).toBeGreaterThan(0)
  })

  it('should reject non-JSON content when format is json', async () => {
    const notJson = 'this is not json at all'

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({
        'content-type': 'application/json'
      }),
      body: createReadableStream(notJson)
    })

    const url = new URL('https://example.com/bad.json')
    const { text } = await fetchWithSizeLimit(url)

    expect(() => JSON.parse(text)).toThrow()
  })
})

// ─── Helpers ─────────────────────────────────────────────────────

/** Create a simple ReadableStream from a string, for mocking fetch responses. */
function createReadableStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  let read = false

  return {
    getReader() {
      return {
        read: async () => {
          if (read) {
            return { done: true as const, value: undefined }
          }
          read = true
          return { done: false as const, value: data }
        },
        cancel: vi.fn()
      }
    }
  } as unknown as ReadableStream<Uint8Array>
}
