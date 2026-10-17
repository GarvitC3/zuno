import { CalendarClock, ChevronLeft, ChevronRight, LifeBuoy } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { SessionDetail } from '../components/SessionDetail'
import { SessionStatusBadge, SubjectChip, stateLabel } from '../components/session-ui'
import { ChangeBanner } from '../components/ChangeBanner'
import { sessionsOn, sessionState } from '../engine/insights'
import { commitmentBlocksOn, freeIntervalsOn, sessionSpan, windowsOn } from '../engine/slots'
import { addDays, formatClock, formatDateLong, formatDateShort, formatMinutes, weekdayOf, weekdayShort, type LocalMoment } from '../engine/time'
import { useData, useNow } from '../state/context'
import type { AppData, Session } from '../types'

const HOUR_PX = 54

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

const mondayOf = (date: string) => addDays(date, -((weekdayOf(date) + 6) % 7))

export function Calendar() {
  const data = useData()
  const now = useNow()
  const narrow = useIsNarrow()
  const [weekStart, setWeekStart] = useState(() => mondayOf(now.date))
  const [view, setView] = useState<'week' | 'day'>('week')
  const [day, setDay] = useState(now.date)
  const [detail, setDetail] = useState<string | null>(null)

  const effectiveView = narrow ? 'day' : view
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart])

  const shiftWeek = (n: number) => {
    const ws = addDays(weekStart, n * 7)
    setWeekStart(ws)
    setDay(n > 0 ? ws : addDays(ws, 6))
  }
  const goToday = () => {
    setWeekStart(mondayOf(now.date))
    setDay(now.date)
  }
  const pickDay = (d: string) => {
    setDay(d)
    setWeekStart(mondayOf(d))
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Study calendar</h1>
          <p>Sessions, commitments and free time in one place. Select a session for its reason and options.</p>
        </div>
        <div className="row row--wrap">
          <a href="#/correction" className="btn btn--sm">
            <LifeBuoy size={16} aria-hidden="true" /> Course Correction
          </a>
        </div>
      </header>

      <ChangeBanner />

      <section className="panel panel--flush cal-panel" aria-label="Calendar">
        <div className="cal-bar">
          <div className="row">
            <button type="button" className="icon-btn" aria-label="Previous week" onClick={() => shiftWeek(-1)}><ChevronLeft size={20} /></button>
            <button type="button" className="icon-btn" aria-label="Next week" onClick={() => shiftWeek(1)}><ChevronRight size={20} /></button>
            <h2 className="cal-bar__title">{formatDateShort(days[0])} – {formatDateShort(days[6])}</h2>
            <button type="button" className="btn btn--sm btn--ghost" onClick={goToday}>Today</button>
          </div>
          {!narrow ? (
            <div className="segmented" role="group" aria-label="Calendar view">
              <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>Week</button>
              <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}>Day list</button>
            </div>
          ) : null}
        </div>

        {effectiveView === 'week' ? (
        <ul className="legend cal-legend" aria-label="Calendar key">
          <li><span className="key key--session" aria-hidden="true" /> Study session (colour = subject)</li>
          <li><span className="key key--commit" aria-hidden="true" /> Commitment</li>
          <li><span className="key key--window" aria-hidden="true" /> Study window</li>
          <li><span className="key key--break" aria-hidden="true" /> Break</li>
        </ul>
        ) : null}

        {effectiveView === 'week' ? (
          <WeekGrid data={data} now={now} days={days} onOpen={setDetail} />
        ) : (
          <DayAgenda data={data} now={now} days={days} day={day} onDay={pickDay} onOpen={setDetail} />
        )}
      </section>

      <SessionDetail data={data} now={now} sessionId={detail} onClose={() => setDetail(null)} />
    </>
  )
}

// ---- Week grid ---------------------------------------------------------------------

function blockRange(data: AppData, days: string[]): [number, number] {
  let lo = 8 * 60
  let hi = 21 * 60
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
  return [Math.max(0, Math.floor((lo - 30) / 60)), Math.min(24, Math.ceil((hi + 30) / 60))]
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
  const height = (h1 - h0) * HOUR_PX
  const y = (min: number) => ((min - h0 * 60) / 60) * HOUR_PX
  const hours = Array.from({ length: h1 - h0 }, (_, i) => h0 + i)
  const anyContent = days.some((d) => sessionsOn(data, d).length > 0 || windowsOn(data.availability, d).length > 0)
  const scroller = useRef<HTMLDivElement>(null)

  // Open on the interesting part of the day: now (this week) or the earliest session.
  const weekKey = days[0]
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const hasToday = days.includes(now.date)
    let target = hasToday ? now.minute : 15 * 60
    if (!hasToday) {
      const firsts = days.flatMap((d) => sessionsOn(data, d).filter((s) => s.status === 'planned').map((s) => sessionSpan(s).start))
      if (firsts.length) target = Math.min(...firsts)
    }
    el.scrollTop = Math.max(0, ((target - h0 * 60) / 60) * HOUR_PX - 90)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey])

  return (
    <div className="cal-scroll" ref={scroller}>
      <div className="cal-grid" style={{ ['--hours' as string]: h1 - h0 }}>
        <div className="cal-head">
          <div className="cal-corner" />
          {days.map((d) => {
            const list = sessionsOn(data, d).filter((s) => s.status !== 'skipped')
            const total = list.reduce((sum, s) => sum + (sessionSpan(s).end - sessionSpan(s).start), 0)
            return (
              <div key={d} className="cal-dayhead" data-today={d === now.date}>
                <span className="cal-dayhead__name">{weekdayShort(weekdayOf(d))}</span>
                <span className="cal-dayhead__num">{d.slice(8).replace(/^0/, '')}</span>
                <span className="cal-dayhead__sub">{data.availability.blockedDates.includes(d) ? 'Day off' : total > 0 ? formatMinutes(total) : '–'}</span>
              </div>
            )
          })}
        </div>
        <div className="cal-body" style={{ height }}>
          <div className="cal-axis">
            {hours.map((h) => (
              <div key={h} className="cal-axis__h" style={{ top: (h - h0) * HOUR_PX }}>
                <span>{formatClock(h * 60).replace(':00', '')}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const blocked = data.availability.blockedDates.includes(d)
            return (
              <div key={d} className="cal-col" data-today={d === now.date} data-off={blocked}>
                {hours.map((h) => (
                  <div key={h} className="cal-hourline" style={{ top: (h - h0) * HOUR_PX }} />
                ))}
                {windowsOn(data.availability, d).map((w, i) => (
                  <div key={`w${i}`} className="cal-window" style={{ top: y(w.start), height: y(w.end) - y(w.start) }} aria-hidden="true" />
                ))}
                {commitmentBlocksOn(data.availability, d).map((c, i) => (
                  <div key={`c${c.id}${i}`} className="cal-commit" style={{ top: y(c.start), height: Math.max(14, y(c.end) - y(c.start)) }} title={`${c.label}, ${formatClock(c.start)}–${formatClock(c.end === 1440 ? 1439 : c.end)}`}>
                    <span>{c.label}</span>
                  </div>
                ))}
                {sessionsOn(data, d).map((s) => {
                  const sp = sessionSpan(s)
                  const st = sessionState(s, now)
                  const info = sessionLabel(data, s, now)
                  const h = Math.max(22, y(sp.end) - y(sp.start) - 2)
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="cal-session"
                      data-color={info.subject?.color}
                      data-state={st}
                      style={{ top: y(sp.start) + 1, height: h }}
                      aria-label={info.text}
                      onClick={() => onOpen(s.id)}
                    >
                      <span className="cal-session__title">{info.topic}</span>
                      {h >= 40 ? <span className="cal-session__meta">{formatClock(sp.start).replace(' ', '')} · {sp.end - sp.start}m</span> : null}
                      {h >= 56 ? <span className="cal-session__state">{stateLabel(st)}</span> : null}
                    </button>
                  )
                })}
                {d === now.date && now.minute >= h0 * 60 && now.minute <= h1 * 60 ? <div className="cal-now" style={{ top: y(now.minute) }} aria-hidden="true" /> : null}
              </div>
            )
          })}
        </div>
      </div>
      {!anyContent ? (
        <div className="empty">
          <h3>Nothing on the calendar this week</h3>
          <p>Add study windows in Settings, or move to a week that has sessions planned.</p>
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
    for (const c of commitmentBlocksOn(data.availability, day)) list.push({ kind: 'commit', start: c.start, end: c.end, label: c.label })
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
          <p>{noWindows ? 'You have not set aside any study windows for this day. Add some in Settings.' : 'This day is free. Zuno will fill it if a session becomes worthwhile.'}</p>
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
                  <SessionStatusBadge state={st} />
                </button>
              </li>
            )
          })}
        </ol>
      )}
      <p className="muted small">
        <CalendarClock size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Tap a session to see why it is planned, move it, change its length, or skip it.
      </p>
    </div>
  )
}
