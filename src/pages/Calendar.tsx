import { ChevronLeft, ChevronRight, LifeBuoy } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { SessionDetail } from '../components/SessionDetail'
import { SessionStatusBadge, SubjectChip, stateLabel } from '../components/session-ui'
import { ChangeBanner } from '../components/ChangeBanner'
import { sessionsOn, sessionState } from '../engine/insights'
import { commitmentBlocksOn, freeIntervalsOn, sessionSpan, windowsOn } from '../engine/slots'
import { addDays, formatClock, formatDateLong, formatDateShort, formatMinutes, weekdayOf, weekdayShort, type LocalMoment } from '../engine/time'
import { useData, useNow } from '../state/context'
import type { AppData, Session } from '../types'

const HOUR_PX = 52

function useIsNarrow() {
  const q = '(max-width: 900px)'
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(q).matches : false))
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setNarrow(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  return narrow
}

export function Calendar() {
  const data = useData()
  const now = useNow()
  const narrow = useIsNarrow()
  // A rolling week that starts today, so what is coming up is always on screen.
  const [start, setStart] = useState(now.date)
  const [view, setView] = useState<'week' | 'day'>('week')
  const [day, setDay] = useState(now.date)
  const [detail, setDetail] = useState<string | null>(null)

  const effectiveView = narrow ? 'day' : view
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start])
  const isCurrent = start === now.date

  const shift = (n: number) => {
    const next = addDays(start, n * 7)
    setStart(next)
    setDay(next)
  }
  const goToday = () => {
    setStart(now.date)
    setDay(now.date)
  }

  return (
    <>
      <header className="page-head">
        <h1>Study calendar</h1>
        <a href="#/correction" className="btn btn--sm">
          <LifeBuoy size={16} aria-hidden="true" /> Course Correction
        </a>
      </header>

      <ChangeBanner />

      <section className="panel panel--flush cal-panel" aria-label="Calendar">
        <div className="cal-bar">
          <div className="cal-bar__nav">
            <button type="button" className="icon-btn" aria-label="Previous 7 days" onClick={() => shift(-1)}><ChevronLeft size={20} /></button>
            <button type="button" className="icon-btn" aria-label="Next 7 days" onClick={() => shift(1)}><ChevronRight size={20} /></button>
            <h2 className="cal-bar__title">{formatDateShort(days[0])} – {formatDateShort(days[6])}</h2>
            {!isCurrent ? <button type="button" className="btn btn--sm" onClick={goToday}>Today</button> : null}
          </div>
          {effectiveView === 'week' ? (
            <ul className="cal-legend" aria-label="Key">
              <li><span className="key key--session" aria-hidden="true" /> Session</li>
              <li><span className="key key--commit" aria-hidden="true" /> Commitment</li>
              <li><span className="key key--window" aria-hidden="true" /> Study window</li>
            </ul>
          ) : null}
          {!narrow ? (
            <div className="segmented" role="group" aria-label="Calendar view">
              <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>Week</button>
              <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}>Day list</button>
            </div>
          ) : null}
        </div>

        {effectiveView === 'week' ? (
          <WeekGrid data={data} now={now} days={days} onOpen={setDetail} />
        ) : (
          <DayAgenda data={data} now={now} days={days} day={day} onDay={setDay} onOpen={setDetail} />
        )}
      </section>

      <SessionDetail data={data} now={now} sessionId={detail} onClose={() => setDetail(null)} />
    </>
  )
}

// ---- Week grid ---------------------------------------------------------------------

function blockRange(data: AppData, days: string[]): [number, number] {
  let lo = Infinity
  let hi = -Infinity
  for (const d of days) {
    for (const w of windowsOn(data.availability, d)) {
      lo = Math.min(lo, w.start)
      hi = Math.max(hi, w.end)
    }
    for (const s of sessionsOn(data, d)) {
      const sp = sessionSpan(s)
      lo = Math.min(lo, sp.start)
      hi = Math.max(hi, sp.end)
    }
  }
  if (!Number.isFinite(lo)) return [9, 21]
  let a = Math.max(0, Math.floor((lo - 30) / 60))
  let b = Math.min(24, Math.ceil((hi + 30) / 60))
  if (b - a < 8) b = Math.min(24, a + 8)
  if (b - a < 8) a = Math.max(0, b - 8)
  return [a, b]
}

function sessionLabel(data: AppData, s: Session, now: LocalMoment) {
  const t = data.topics.find((x) => x.id === s.topicId)
  const sub = data.subjects.find((x) => x.id === t?.subjectId)
  const sp = sessionSpan(s)
  return {
    topic: t?.name ?? 'Topic',
    subject: sub,
    text: `${t?.name ?? 'Topic'}, ${sub?.name ?? ''}, ${formatDateLong(sp.date)}, ${formatClock(sp.start)} to ${formatClock(sp.end)}, ${sp.end - sp.start} ${sp.end - sp.start === 1 ? 'minute' : 'minutes'}, ${stateLabel(sessionState(s, now)).toLowerCase()}`,
  }
}

function WeekGrid({ data, now, days, onOpen }: { data: AppData; now: LocalMoment; days: string[]; onOpen: (id: string) => void }) {
  const [h0, h1] = useMemo(() => blockRange(data, days), [data, days])
  const lo = h0 * 60
  const hi = h1 * 60
  const height = (h1 - h0) * HOUR_PX
  const y = (min: number) => ((Math.min(hi, Math.max(lo, min)) - lo) / 60) * HOUR_PX
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i)
  const anyContent = days.some((d) => sessionsOn(data, d).length > 0 || windowsOn(data.availability, d).length > 0)

  return (
    <div className="cal-scroll">
      <div className="cal-grid">
        <div className="cal-head">
          <div className="cal-corner" />
          {days.map((d) => {
            const list = sessionsOn(data, d).filter((s) => s.status !== 'skipped')
            const total = list.reduce((sum, s) => sum + (sessionSpan(s).end - sessionSpan(s).start), 0)
            return (
              <div key={d} className="cal-dayhead" data-today={d === now.date} data-past={d < now.date}>
                <span className="cal-dayhead__name">{weekdayShort(weekdayOf(d))}</span>
                <span className="cal-dayhead__num">{d.slice(8).replace(/^0/, '')}</span>
                <span className="cal-dayhead__sub">{data.availability.blockedDates.includes(d) ? 'Day off' : total > 0 ? formatMinutes(total) : '\u00a0'}</span>
              </div>
            )
          })}
        </div>
        <div className="cal-body" style={{ height }}>
          <div className="cal-axis" aria-hidden="true">
            {hours.map((h) => (
              <div key={h} className="cal-axis__h" style={{ top: (h - h0) * HOUR_PX }}>
                <span>{formatClock(h * 60).replace(':00', '')}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const blocked = data.availability.blockedDates.includes(d)
            const commits = commitmentBlocksOn(data.availability, d)
              .map((c) => ({ ...c, from: Math.max(c.start, lo), to: Math.min(c.end, hi) }))
              .filter((c) => c.to - c.from >= 20)
            return (
              <div key={d} className="cal-col" data-today={d === now.date} data-past={d < now.date} data-off={blocked}>
                {hours.map((h) => (
                  <div key={h} className="cal-hourline" style={{ top: (h - h0) * HOUR_PX }} />
                ))}
                {windowsOn(data.availability, d).map((w, i) => (
                  <div key={`w${i}`} className="cal-window" style={{ top: y(w.start), height: y(w.end) - y(w.start) }} aria-hidden="true" />
                ))}
                {commits.map((c, i) => (
                  <div key={`c${c.id}${i}`} className="cal-commit" style={{ top: y(c.from), height: y(c.to) - y(c.from) }} title={`${c.label}, ${formatClock(c.start)}\u2013${formatClock(c.end === 1440 ? 1439 : c.end)}`}>
                    <span>{c.label}</span>
                  </div>
                ))}
                {sessionsOn(data, d).map((s) => {
                  const sp = sessionSpan(s)
                  const st = sessionState(s, now)
                  const info = sessionLabel(data, s, now)
                  const h = Math.max(26, y(sp.end) - y(sp.start) - 3)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="cal-session"
                      data-color={info.subject?.color}
                      data-state={st}
                      style={{ top: y(sp.start) + 1.5, height: h }}
                      aria-label={info.text}
                      onClick={() => onOpen(s.id)}
                    >
                      <span className="cal-session__title">{info.topic}</span>
                      {h >= 44 ? <span className="cal-session__meta">{formatClock(sp.start).replace(' ', '')} · {sp.end - sp.start}m</span> : null}
                    </button>
                  )
                })}
                {d === now.date && now.minute >= lo && now.minute <= hi ? (
                  <div className="cal-now" style={{ top: y(now.minute) }} aria-hidden="true"><span>Now</span></div>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
      {!anyContent ? (
        <div className="empty">
          <h3>Nothing on the calendar yet</h3>
          <p>Add study windows in Settings to see sessions here.</p>
          <a className="btn btn--primary" href="#/settings">Set study times</a>
        </div>
      ) : null}
    </div>
  )
}

// ---- Day agenda (mobile and "Day list") -------------------------------------------------

type Entry =
  | { kind: 'session'; start: number; end: number; session: Session }
  | { kind: 'commit'; start: number; end: number; label: string }
  | { kind: 'free'; start: number; end: number }

function DayAgenda({ data, now, days, day, onDay, onOpen }: { data: AppData; now: LocalMoment; days: string[]; day: string; onDay: (d: string) => void; onOpen: (id: string) => void }) {
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = []
    const ses = sessionsOn(data, day)
    for (const s of ses) {
      const sp = sessionSpan(s)
      list.push({ kind: 'session', start: sp.start, end: sp.end, session: s })
    }
    // Sleep is noise in a study agenda, and so is anything that has already finished today.
    for (const c of commitmentBlocksOn(data.availability, day)) {
      if (c.kind === 'sleep' || (day === now.date && c.end <= now.minute)) continue
      list.push({ kind: 'commit', start: c.start, end: c.end, label: c.label })
    }
    // For today, only show free time that is still ahead.
    const earliest = day === now.date ? now.minute : 0
    for (const f of freeIntervalsOn(data.availability, day, ses.filter((s) => s.status !== 'skipped'), earliest)) list.push({ kind: 'free', start: f.start, end: f.end })
    return list.sort((a, b) => a.start - b.start || (a.kind === 'session' ? -1 : 1))
  }, [data, day, now.date, now.minute])
  const off = data.availability.blockedDates.includes(day)
  const noWindows = windowsOn(data.availability, day).length === 0

  return (
    <div className="agenda">
      <div className="agenda__strip" role="tablist" aria-label="Days of this week">
        {days.map((d) => (
          <button key={d} type="button" role="tab" aria-selected={d === day} className="agenda__day" data-today={d === now.date} onClick={() => onDay(d)}>
            <span>{weekdayShort(weekdayOf(d))}</span>
            <strong>{d.slice(8).replace(/^0/, '')}</strong>
          </button>
        ))}
      </div>
      <h3 className="agenda__title">{formatDateLong(day)}{day === now.date ? ' · today' : ''}</h3>
      {off ? <p className="chip chip--peach" style={{ justifySelf: 'start' }}>Day off: no study planned</p> : null}
      {entries.length === 0 ? (
        <div className="empty empty--compact">
          <h3>{noWindows ? 'No study time on this day' : 'Nothing planned'}</h3>
          <p>{noWindows ? 'No study windows set for this day.' : 'This day is free.'}</p>
          {noWindows ? <a className="btn btn--sm btn--primary" href="#/settings">Set study times</a> : null}
        </div>
      ) : (
        <ol className="agenda__list">
          {entries.map((e, i) => {
            if (e.kind === 'commit') {
              return (
                <li key={i} className="agenda__item agenda__item--commit">
                  <span className="agenda__time">{formatClock(e.start)}</span>
                  <span>{e.label} <span className="muted small">· until {formatClock(e.end === 1440 ? 1439 : e.end)}</span></span>
                </li>
              )
            }
            if (e.kind === 'free') {
              return (
                <li key={i} className="agenda__item agenda__item--free">
                  <span className="agenda__time">{formatClock(e.start)}</span>
                  <span>Available · {formatMinutes(e.end - e.start)} free</span>
                </li>
              )
            }
            const s = e.session
            const t = data.topics.find((x) => x.id === s.topicId)
            const sub = data.subjects.find((x) => x.id === t?.subjectId)
            const st = sessionState(s, now)
            return (
              <li key={s.id}>
                <button type="button" className="agenda__item agenda__item--session plan-item" data-color={sub?.color} data-state={st} onClick={() => onOpen(s.id)}>
                  <span className="plan-item__time">{formatClock(e.start)}</span>
                  <span className="plan-item__main">
                    <strong>{t?.name}</strong>
                    <span className="small muted">{sub ? <SubjectChip subject={sub} /> : null} {e.end - e.start} min</span>
                  </span>
                  {st !== 'upcoming' ? <SessionStatusBadge state={st} /> : null}
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
