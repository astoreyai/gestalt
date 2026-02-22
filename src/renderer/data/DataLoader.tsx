/**
 * Data loading UI component with file picker and drag-and-drop.
 */

import React, { useState, useCallback, useRef } from 'react'
import { validateData } from './validators'
import { directoryToGraph, imagesToGraphNodes } from './pipeline'
import type { DirectoryEntry } from './pipeline'
import type { GraphData, EmbeddingData } from '@shared/protocol'

export interface DataLoaderProps {
  onGraphLoaded: (data: GraphData) => void
  onEmbeddingLoaded: (data: EmbeddingData) => void
  onError: (message: string) => void
}

export function DataLoader({ onGraphLoaded, onEmbeddingLoaded, onError }: DataLoaderProps): React.ReactElement {
  const [loading, setLoading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processContent = useCallback(async (content: string, filename: string) => {
    try {
      // Yield to the event loop before the heavy JSON.parse so the UI
      // stays responsive for large files.
      await new Promise(resolve => setTimeout(resolve, 0))
      const parsed = JSON.parse(content)

      // Yield again before Zod schema validation (also CPU-intensive
      // for large graphs).
      await new Promise(resolve => setTimeout(resolve, 0))
      const result = validateData(parsed)

      if (!result.success) {
        onError(`Validation failed for ${filename}: ${result.errors?.join(', ')}`)
        return
      }

      // Determine type and dispatch
      if ('nodes' in result.data! && 'edges' in result.data!) {
        onGraphLoaded(result.data as GraphData)
      } else {
        onEmbeddingLoaded(result.data as EmbeddingData)
      }
    } catch (err) {
      onError(`Failed to parse ${filename}: ${err instanceof Error ? err.message : 'Unknown error'}`)
    }
    // NOTE: For truly large files (>10MB / >1M nodes), a dedicated Web Worker
    // with streaming JSON parsing (e.g. oboe.js or clarinet) would be the
    // ideal solution to keep the main thread completely free.
  }, [onGraphLoaded, onEmbeddingLoaded, onError])

  const handleFileSelect = useCallback(async () => {
    if (!window.api) {
      // Fallback: use file input
      fileInputRef.current?.click()
      return
    }

    setLoading(true)
    try {
      const path = await window.api.openFileDialog()
      if (path) {
        const content = await window.api.loadFile(path)
        const filename = path.split('/').pop() ?? 'unknown'
        await processContent(content, filename)
      }
    } catch (err) {
      onError(`Failed to load file: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [processContent, onError])

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const content = reader.result
      if (typeof content !== 'string') {
        onError('File content is not text')
        setLoading(false)
        return
      }
      await processContent(content, file.name)
      setLoading(false)
    }
    reader.onerror = () => {
      onError('Failed to read file')
      setLoading(false)
    }
    reader.readAsText(file)
  }, [processContent, onError])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    setLoading(true)
    const reader = new FileReader()
    reader.onload = async () => {
      const content = reader.result
      if (typeof content !== 'string') {
        onError('File content is not text')
        setLoading(false)
        return
      }
      await processContent(content, file.name)
      setLoading(false)
    }
    reader.onerror = () => {
      onError('Failed to read dropped file')
      setLoading(false)
    }
    reader.readAsText(file)
  }, [processContent, onError])

  const handleImportDirectory = useCallback(async () => {
    if (!window.api) return
    setLoading(true)
    try {
      const path = await window.api.openFileDialog([{ name: 'All Files', extensions: ['*'] }])
      if (path) {
        // Use the parent directory of the selected file
        const dirPath = path.split('/').slice(0, -1).join('/')
        const tree = await window.api.scanDirectory(dirPath) as DirectoryEntry
        const graph = directoryToGraph(tree)
        onGraphLoaded(graph)
      }
    } catch (err) {
      onError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [onGraphLoaded, onError])

  const handleImportImages = useCallback(async () => {
    if (!window.api) return
    setLoading(true)
    try {
      const path = await window.api.openFileDialog([
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }
      ])
      if (path) {
        const thumbnail = await window.api.generateThumbnail(path, 128)
        const name = path.split('/').pop() ?? 'image'
        const nodes = imagesToGraphNodes([{ id: path, name, thumbnail }])
        const graph: GraphData = { nodes, edges: [] }
        onGraphLoaded(graph)
      }
    } catch (err) {
      onError(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`)
    } finally {
      setLoading(false)
    }
  }, [onGraphLoaded, onError])

  const importBtnStyle: React.CSSProperties = {
    padding: '6px 14px',
    background: 'var(--button-bg, #1a1a2e)',
    border: '1px solid var(--border, #333)',
    borderRadius: 6,
    color: 'var(--accent, #4a9eff)',
    cursor: 'pointer',
    fontSize: 12
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        style={{
          padding: 24,
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 12,
          textAlign: 'center',
          background: dragOver ? 'rgba(74, 158, 255, 0.05)' : 'transparent',
          transition: 'all 0.2s',
          cursor: 'pointer'
        }}
        onClick={handleFileSelect}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter') handleFileSelect() }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".json,.graphml"
          onChange={handleInputChange}
          style={{ display: 'none' }}
        />
        {loading ? (
          <p>Loading...</p>
        ) : (
          <>
            <p style={{ fontSize: 16, marginBottom: 8 }}>
              Drop a file here or click to open
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Supports JSON (graph or embedding) and GraphML
            </p>
          </>
        )}
      </div>
      {/* Import section for everyday computing data */}
      <div style={{
        borderTop: '1px solid var(--border)',
        marginTop: 12,
        paddingTop: 10
      }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px 0' }}>Import:</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={handleImportDirectory} style={importBtnStyle} disabled={loading}>
            Directory as Graph
          </button>
          <button onClick={handleImportImages} style={importBtnStyle} disabled={loading}>
            Image as Node
          </button>
        </div>
      </div>
    </div>
  )
}
