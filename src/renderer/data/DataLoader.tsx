/**
 * Data loading UI component with file picker and drag-and-drop.
 */

import React, { useState, useCallback, useRef } from 'react'
import { validateData } from './validators'
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

  const processContent = useCallback((content: string, filename: string) => {
    try {
      const parsed = JSON.parse(content)
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
        processContent(content, filename)
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
    reader.onload = () => {
      const content = reader.result
      if (typeof content !== 'string') {
        onError('File content is not text')
        setLoading(false)
        return
      }
      processContent(content, file.name)
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
    reader.onload = () => {
      const content = reader.result
      if (typeof content !== 'string') {
        onError('File content is not text')
        setLoading(false)
        return
      }
      processContent(content, file.name)
      setLoading(false)
    }
    reader.onerror = () => {
      onError('Failed to read dropped file')
      setLoading(false)
    }
    reader.readAsText(file)
  }, [processContent, onError])

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      style={{
        padding: 24,
        border: `2px dashed ${dragOver ? '#4a9eff' : '#444'}`,
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
          <p style={{ fontSize: 12, color: '#888' }}>
            Supports JSON (graph or embedding) and GraphML
          </p>
        </>
      )}
    </div>
  )
}
