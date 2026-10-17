import { Undo2, X } from 'lucide-react'
import { useEffect } from 'react'
import { useActions, useUi } from '../../state/context'

/** Polite live-region toast. Auto-dismisses; Undo stays reachable with the keyboard. */
export function Toaster() {
  const ui = useUi()
  const store = useActions()
  const toast = ui.toast

  useEffect(() => {
    if (!toast) return
    const id = window.setTimeout(() => store.dismissToast(), toast.undoable ? 9000 : 5000)
    return () => window.clearTimeout(id)
  }, [toast, store])

  return (
    <div className="toast-region" role="status" aria-live="polite">
      {toast ? (
        <div className="toast fade-in" key={toast.id}>
          <p className="toast__msg">{toast.message}</p>
          {toast.undoable && ui.undo.length > 0 ? (
            <button type="button" className="btn btn--sm btn--primary" onClick={() => store.undo()}>
              <Undo2 size={15} aria-hidden="true" /> Undo
            </button>
          ) : null}
          <button type="button" className="icon-btn" aria-label="Dismiss message" onClick={() => store.dismissToast()}>
            <X size={18} />
          </button>
        </div>
      ) : null}
    </div>
  )
}
