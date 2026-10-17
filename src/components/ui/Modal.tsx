import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}

/**
 * Accessible modal built on the native <dialog>: focus is trapped, Esc closes,
 * focus returns to the opener, and clicking the backdrop dismisses.
 * Children mount only while open, so each opening starts with fresh form state.
 */
export function Modal({ open, onClose, title, description, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descId = useId()

  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal--wide' : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      onClose={onClose}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      {open ? (
        <>
          <div className="modal__head">
            <div>
              <h2 id={titleId} style={{ fontSize: 'var(--fs-xl)' }}>
                {title}
              </h2>
              {description ? (
                <p id={descId} className="muted small" style={{ marginTop: 4 }}>
                  {description}
                </p>
              ) : null}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">
              <X size={20} />
            </button>
          </div>
          <div className="modal__body">{children}</div>
          {footer ? <div className="modal__foot">{footer}</div> : null}
        </>
      ) : null}
    </dialog>
  )
}

interface ConfirmProps {
  open: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, message, confirmLabel, cancelLabel = 'Cancel', destructive, onConfirm, onCancel }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn ${destructive ? 'btn--danger' : 'btn--primary'}`}
            onClick={() => {
              onConfirm()
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="muted">{message}</div>
    </Modal>
  )
}
