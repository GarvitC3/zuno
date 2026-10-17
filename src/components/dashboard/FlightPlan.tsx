import { sessionState, type TodaySummary } from '../../engine/insights'
import { sessionSpan } from '../../engine/slots'
import { formatClock, formatMinutes, type LocalMoment } from '../../engine/time'
import type { AppData } from '../../types'
import { Astronaut } from '../brand/Astronaut'
import { SessionStatusBadge } from '../session-ui'

export function FlightPlan({ data, now, summary, onOpen }: { data: AppData; now: LocalMoment; summary: TodaySummary; onOpen: (id: string) => void }) {
  const { sessions, plannedMinutes, remainingMinutes, doneCount, totalCount } = summary
  const rows: ({ kind: 'session'; id: string } | { kind: 'break'; min: number; key: string })[] = []
  sessions.forEach((s, i) => {
    rows.push({ kind: 'session', id: s.id })
    const next = sessions[i + 1]
    if (next) {
      const gap = sessionSpan(next).start - sessionSpan(s).end
      if (gap > 0 && gap <= 30) rows.push({ kind: 'break', min: gap, key: `${s.id}-b` })
    }
  })

  return (
    <section className="panel flight" aria-labelledby="flight-h">
      <div className="panel__head">
        <div>
          <h2 id="flight-h" className="panel__title">Today's flight plan</h2>
          {totalCount > 0 ? (
            <p className="panel__sub">{doneCount} of {totalCount} done · {formatMinutes(remainingMinutes)} left of {formatMinutes(plannedMinutes)}</p>
          ) : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="empty empty--compact">
          <Astronaut mood="rest" size={72} />
          <h3>A quiet day</h3>
          <p>Rest is part of the plan.</p>
        </div>
      ) : (
        <ol className="plan-list">
          {rows.map((r) => {
            if (r.kind === 'break') {
              return (
                <li key={r.key} className="plan-break" aria-label={`Break, ${r.min} minutes`}>
                  <span>Break · {r.min} min</span>
                </li>
              )
            }
            const s = sessions.find((x) => x.id === r.id)!
            const topic = data.topics.find((t) => t.id === s.topicId)
            const subject = data.subjects.find((x) => x.id === topic?.subjectId)
            const span = sessionSpan(s)
            const st = sessionState(s, now)
            return (
              <li key={s.id}>
                <button type="button" className="plan-item" data-state={st} data-color={subject?.color} onClick={() => onOpen(s.id)}>
                  <span className="plan-item__time">{formatClock(span.start)}</span>
                  <span className="plan-item__main">
                    <strong>{topic?.name ?? 'Topic'}</strong>
                    <span className="muted small">
                      <span className="subj-dot" aria-hidden="true" /> {subject?.name} · {s.status === 'completed' || s.status === 'partial' ? (s.actual?.minutes ?? s.durationMin) : s.durationMin} min
                    </span>
                  </span>
                  {st !== 'upcoming' ? <SessionStatusBadge state={st} /> : <span />}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
