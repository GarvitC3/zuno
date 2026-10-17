import { Sparkles, Undo2, X } from 'lucide-react'
import { useActions, useUi } from '../state/context'

/** "What changed" after any replan: specific lines, plus Undo when it is safe. */
export function ChangeBanner() {
  const ui = useUi()
  const store = useActions()
  const change = ui.change
  if (!change) return null
  const shown = change.items.slice(0, 5)
  const more = change.items.length - shown.length
  return (
    <section className="banner banner--mint fade-in" aria-label="What changed" key={change.id}>
      <div className="banner__icon">
        <Sparkles size={18} aria-hidden="true" />
      </div>
      <div className="banner__body">
        <p className="banner__title">{change.title}</p>
        {shown.length > 0 ? (
          <ul className="banner__list">
            {shown.map((it, i) => (
              <li key={i}>{it.text}</li>
            ))}
            {more > 0 ? <li>…and {more} more small {more === 1 ? 'change' : 'changes'} on the calendar.</li> : null}
          </ul>
        ) : (
          <p className="muted small">Your schedule stayed the same.</p>
        )}
        {change.note ? <p className="muted small">{change.note}</p> : null}
        <div className="banner__actions">
          {change.canUndo && ui.undo.length > 0 ? (
            <button type="button" className="btn btn--sm" onClick={() => store.undo()}>
              <Undo2 size={15} aria-hidden="true" /> Undo
            </button>
          ) : null}
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => store.dismissChange()}>
            Dismiss
          </button>
        </div>
      </div>
      <button type="button" className="icon-btn" aria-label="Dismiss what changed" onClick={() => store.dismissChange()}>
        <X size={18} />
      </button>
    </section>
  )
}
