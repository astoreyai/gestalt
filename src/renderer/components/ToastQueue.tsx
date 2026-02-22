/**
 * ToastQueue — Renders a stack of dismissible toast notifications.
 * Extracted from App.tsx to reduce component size.
 */

import React from 'react'
import type { Toast } from '../controller/store'
import { COLORS, Z_INDEX } from '../styles/tokens'

/** Severity-based background colors for toast notifications */
const TOAST_COLORS: Record<Toast['severity'], string> = {
  error: COLORS.error,
  warning: COLORS.warning,
  info: COLORS.handRight,
  success: COLORS.success
}

export interface ToastQueueProps {
  toasts: Toast[]
  onDismiss: (id: string) => void
}

export function ToastQueue({ toasts, onDismiss }: ToastQueueProps): React.ReactElement {
  return (
    <div
      aria-live="polite"
      role="alert"
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: Z_INDEX.toast,
        maxWidth: 400
      }}
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          style={{
            padding: '10px 16px',
            background: TOAST_COLORS[toast.severity],
            borderRadius: 8,
            color: toast.severity === 'warning' ? '#1a1a1a' : '#fff',
            fontSize: 13,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12
          }}
        >
          <span>{toast.message}</span>
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss notification"
            style={{
              background: 'none',
              border: 'none',
              color: toast.severity === 'warning' ? '#1a1a1a' : '#fff',
              fontSize: 16,
              cursor: 'pointer',
              padding: '0 2px',
              lineHeight: 1,
              flexShrink: 0
            }}
          >
            {'\u00D7'}
          </button>
        </div>
      ))}
    </div>
  )
}
