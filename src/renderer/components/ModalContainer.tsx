/**
 * ModalContainer — Backdrop + centered container for modal dialogs.
 * Extracted from App.tsx to reduce component size.
 * Adds role="dialog" and aria-labelledby for accessibility.
 */

import React, { useRef } from 'react'
import type { ModalId } from '../controller/store'
import { useFocusTrap } from '../hooks/useFocusTrap'

export interface ModalContainerProps {
  activeModal: ModalId
  onClose: () => void
  children: React.ReactNode
}

/** Modal title IDs for aria-labelledby */
const MODAL_LABELS: Record<string, string> = {
  dataLoader: 'modal-title-data-loader',
  settings: 'modal-title-settings',
  calibration: 'modal-title-calibration'
}

export function ModalContainer({ activeModal, onClose, children }: ModalContainerProps): React.ReactElement | null {
  const dialogRef = useRef<HTMLDivElement>(null)
  useFocusTrap(dialogRef, activeModal !== null, onClose)

  if (activeModal === null) {
    return null
  }

  const labelId = MODAL_LABELS[activeModal] ?? undefined

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 140
        }}
      />

      {/* Dialog container */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-labelledby={labelId}
        aria-modal="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 150,
          width: 'min(500px, 90vw)',
          maxHeight: '85vh',
          overflowY: 'auto'
        }}
      >
        {children}
      </div>
    </>
  )
}
