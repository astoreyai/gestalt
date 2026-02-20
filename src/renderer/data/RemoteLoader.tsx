/**
 * Remote URL loader component — fetches graph/embedding data from HTTP URLs.
 *
 * Security:
 *  - Only http:// and https:// protocols allowed
 *  - Enforces MAX_REMOTE_SIZE (50MB) via Content-Length pre-check and
 *    streaming byte count
 *  - All data validated through existing Zod schemas
 *
 * Format detection:
 *  - URL file extension (.json, .graphml)
 *  - Content-Type header fallback (application/json, application/xml, text/xml)
 */

import React, { useState, useCallback, useRef } from 'react'
import { parseGraph } from '@renderer/graph/parsers/index'
import { validateData } from './validators'
import type { GraphFormat } from '@renderer/graph/parsers/index'
import type { GraphData, EmbeddingData } from '@shared/protocol'

// ─── Constants ───────────────────────────────────────────────────

/** Maximum fetch size in bytes (50 MB, matches main-process FILE_LOAD limit) */
export const MAX_REMOTE_SIZE = 50 * 1024 * 1024

/** Allowed URL protocols */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])

// ─── Types ───────────────────────────────────────────────────────

export interface RemoteLoaderProps {
  onGraphLoaded: (data: GraphData) => void
  onEmbeddingLoaded: (data: EmbeddingData) => void
  onError: (message: string) => void
}

type DetectedFormat = GraphFormat | 'json-embedding'

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Validate that a URL string is well-formed and uses an allowed protocol.
 * Returns a URL object on success, or an error message string on failure.
 */
export function validateUrl(raw: string): URL | string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) {
    return 'URL cannot be empty'
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return 'Invalid URL format'
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return `Protocol "${url.protocol}" is not allowed. Use http:// or https://`
  }

  return url
}

/**
 * Detect the data format from a URL path extension and/or Content-Type header.
 */
export function detectFormat(
  url: URL,
  contentType: string | null
): DetectedFormat {
  // Check file extension first (most reliable)
  const pathname = url.pathname.toLowerCase()
  if (pathname.endsWith('.graphml')) {
    return 'graphml'
  }
  if (pathname.endsWith('.json')) {
    return 'json'
  }

  // Fall back to Content-Type header
  const ct = (contentType ?? '').toLowerCase()
  if (ct.includes('application/xml') || ct.includes('text/xml')) {
    return 'graphml'
  }
  if (ct.includes('application/json') || ct.includes('text/json')) {
    return 'json'
  }

  // Default assumption: JSON (most common for APIs)
  return 'json'
}

/**
 * Fetch content from a URL with size enforcement.
 *
 * Reads the response as text, aborting if the accumulated bytes exceed
 * MAX_REMOTE_SIZE. Uses Content-Length for an early reject when available,
 * but always enforces the limit during streaming for chunked responses.
 */
export async function fetchWithSizeLimit(
  url: URL,
  signal?: AbortSignal
): Promise<{ text: string; contentType: string | null }> {
  const response = await fetch(url.href, { signal })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  // Early reject if Content-Length exceeds limit
  const contentLength = response.headers.get('content-length')
  if (contentLength !== null) {
    const size = parseInt(contentLength, 10)
    if (!isNaN(size) && size > MAX_REMOTE_SIZE) {
      // Abort the body stream to free resources
      await response.body?.cancel()
      throw new Error(
        `Response too large: ${size} bytes exceeds ${MAX_REMOTE_SIZE} byte limit`
      )
    }
  }

  // Stream-read with size enforcement
  const reader = response.body?.getReader()
  if (!reader) {
    // Fallback for environments without ReadableStream
    const text = await response.text()
    if (text.length > MAX_REMOTE_SIZE) {
      throw new Error(
        `Response too large: exceeds ${MAX_REMOTE_SIZE} byte limit`
      )
    }
    return { text, contentType: response.headers.get('content-type') }
  }

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    totalBytes += value.byteLength
    if (totalBytes > MAX_REMOTE_SIZE) {
      await reader.cancel()
      throw new Error(
        `Response too large: exceeds ${MAX_REMOTE_SIZE} byte limit`
      )
    }
    chunks.push(value)
  }

  const decoder = new TextDecoder()
  const text = chunks.map((c) => decoder.decode(c, { stream: true })).join('') +
    decoder.decode() // Flush remaining
  return { text, contentType: response.headers.get('content-type') }
}

// ─── Component ───────────────────────────────────────────────────

export function RemoteLoader({
  onGraphLoaded,
  onEmbeddingLoaded,
  onError
}: RemoteLoaderProps): React.ReactElement {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const handleLoad = useCallback(async () => {
    // Reset state
    setErrorMsg(null)

    // Validate URL
    const validationResult = validateUrl(url)
    if (typeof validationResult === 'string') {
      setErrorMsg(validationResult)
      onError(validationResult)
      return
    }
    const parsedUrl = validationResult

    // Abort any in-flight fetch
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      // Fetch with size limit
      const { text, contentType } = await fetchWithSizeLimit(
        parsedUrl,
        controller.signal
      )

      // Detect format
      const format = detectFormat(parsedUrl, contentType)

      // Yield to event loop before heavy parsing
      await new Promise((resolve) => setTimeout(resolve, 0))

      if (format === 'graphml') {
        // GraphML is always a graph
        const graphData = await parseGraph(text, 'graphml')
        onGraphLoaded(graphData)
      } else {
        // JSON can be either graph data or embedding data.
        // Try parseGraph first (which does its own Zod validation).
        // If it looks like embedding data, fall through to validateData.
        const parsed = JSON.parse(text)

        await new Promise((resolve) => setTimeout(resolve, 0))

        const result = validateData(parsed)
        if (!result.success) {
          const msg = `Validation failed: ${result.errors?.join(', ')}`
          setErrorMsg(msg)
          onError(msg)
          return
        }

        if ('nodes' in result.data! && 'edges' in result.data!) {
          onGraphLoaded(result.data as GraphData)
        } else {
          onEmbeddingLoaded(result.data as EmbeddingData)
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        // User cancelled, ignore
        return
      }
      const msg = `Failed to load URL: ${err instanceof Error ? err.message : 'Unknown error'}`
      setErrorMsg(msg)
      onError(msg)
    } finally {
      setLoading(false)
    }
  }, [url, onGraphLoaded, onEmbeddingLoaded, onError])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !loading) {
        handleLoad()
      }
    },
    [handleLoad, loading]
  )

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            setErrorMsg(null)
          }}
          onKeyDown={handleKeyDown}
          placeholder="https://example.com/data.json"
          disabled={loading}
          aria-label="Remote URL"
          style={{
            flex: 1,
            padding: '8px 12px',
            background: 'var(--input-bg)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--button-text)',
            fontSize: 14,
            outline: 'none'
          }}
        />
        <button
          onClick={handleLoad}
          disabled={loading || url.trim().length === 0}
          aria-label="Load URL"
          style={{
            padding: '8px 16px',
            background: loading ? 'var(--accent-muted)' : 'var(--accent-muted)',
            border: '1px solid var(--accent)',
            borderRadius: 6,
            color: 'var(--accent)',
            cursor: loading ? 'wait' : 'pointer',
            fontSize: 14,
            whiteSpace: 'nowrap',
            opacity: url.trim().length === 0 ? 0.5 : 1
          }}
        >
          {loading ? 'Loading...' : 'Load'}
        </button>
      </div>

      {loading && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: 'var(--text-muted)',
            fontSize: 13
          }}
          role="status"
          aria-live="polite"
        >
          <span
            style={{
              display: 'inline-block',
              width: 14,
              height: 14,
              border: '2px solid var(--border)',
              borderTopColor: 'var(--accent)',
              borderRadius: '50%',
              animation: 'remote-loader-spin 0.8s linear infinite'
            }}
          />
          <span>Fetching data...</span>
          <style>{`
            @keyframes remote-loader-spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {errorMsg && (
        <p
          style={{
            color: 'var(--error)',
            fontSize: 13,
            margin: '8px 0 0 0',
            wordBreak: 'break-word'
          }}
          role="alert"
        >
          {errorMsg}
        </p>
      )}

      {!loading && !errorMsg && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
          Supports JSON (graph or embedding) and GraphML (.graphml)
        </p>
      )}
    </div>
  )
}
