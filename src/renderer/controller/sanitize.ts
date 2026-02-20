/**
 * Metadata sanitization utilities.
 * Prevents XSS via metadata values displayed in the UI.
 */

/** Sanitize a string value for display -- prevents XSS via metadata */
export function sanitizeDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  // Truncate very long values
  const truncated = str.length > 500 ? str.slice(0, 500) + '...' : str
  // Escape HTML entities
  return truncated
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Sanitize a metadata record for display */
export function sanitizeMetadata(metadata: Record<string, unknown> | undefined): Array<{ key: string; value: string }> {
  if (!metadata) return []
  return Object.entries(metadata).slice(0, 20).map(([key, value]) => ({
    key: sanitizeDisplayValue(key),
    value: sanitizeDisplayValue(value)
  }))
}
