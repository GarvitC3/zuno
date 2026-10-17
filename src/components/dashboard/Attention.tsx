import { ArrowRight, Flag } from 'lucide-react'
import type { TopicInsight } from '../../engine/insights'
import { RecallMeter, StatusLabel } from '../ui/Meter'
import { pct } from '../session-ui'

export function Attention({ items }: { items: TopicInsight[] }) {
  const shown = items.slice(0, 5)
  return (
    <section className="panel" aria-labelledby="attn-h">
      <div className="panel__head">
        <div>
          <h2 id="attn-h" className="panel__title">Topics needing attention</h2>
          <p className="panel__sub">Ranked by importance and forecast recall on exam day.</p>
        </div>
        <a className="btn btn--sm btn--ghost" href="#/subjects">
          All topics <ArrowRight size={15} aria-hidden="true" />
        </a>
      </div>
      {shown.length === 0 ? (
        <div className="empty empty--compact">
          <h3>Nothing to track yet</h3>
          <p>Once you add topics with an exam date, the ones that need you most will show up here.</p>
        </div>
      ) : (
        <ul className="attn-list">
          {shown.map((i) => (
            <li key={i.topic.id} className="attn" data-color={i.subject.color}>
              <div className="attn__name">
                <strong>
                  {i.topic.name}
                  {i.topic.struggling ? (
                    <span className="status status--fading" style={{ marginLeft: 8 }}>
                      <Flag size={13} aria-hidden="true" /> Flagged
                    </span>
                  ) : null}
                </strong>
                <span className="muted small">
                  <span className="subj-dot" aria-hidden="true" /> {i.subject.name}
                  {i.daysToExam !== null ? ` · exam in ${i.daysToExam} ${i.daysToExam === 1 ? 'day' : 'days'}` : ''}
                </span>
              </div>
              <div className="attn__meter">
                <RecallMeter value={i.recallNow} status={i.status} label={`${i.topic.name} estimated recall`} />
                <div className="row row--between small">
                  <StatusLabel status={i.status} />
                  <span>
                    <strong>{pct(i.recallNow)}</strong> <span className="muted">now</span>
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
