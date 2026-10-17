import { CalendarClock, Play, RotateCcw, SkipForward, Timer, Unlock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { describeExplanation, explainSession, sessionState } from '../engine/insights'
import { examFor, examStartAbs } from '../engine/plan'
import { suggestSlots, validatePlacement, windowsOn } from '../engine/slots'
import { addDays, diffDays, formatClock, formatDateWithWeekday, inputToMinutes, minutesToInput, momentToAbs, relativeWhen, type LocalMoment } from '../engine/time'
import { navigate } from '../state/router'
import { useActions } from '../state/context'
import type { AppData, Session } from '../types'
import { Field } from './ui/Field'
import { Modal } from './ui/Modal'
import { SessionStatusBadge, SubjectChip, pct } from './session-ui'

const LENGTHS = [15, 20, 25, 30, 40, 45, 60, 90]

interface Props {
  data: AppData
  now: LocalMoment
  sessionId: string | null
  mode?: 'view' | 'move'
  onClose: () => void
}

export function SessionDetail({ data, now, sessionId, mode = 'view', onClose }: Props) {
  const session = data.sessions.find((s) => s.id === sessionId) ?? null
  return (
    <Modal
      open={!!session}
      onClose={onClose}
      title={session ? (data.topics.find((t) => t.id === session.topicId)?.name ?? 'Study session') : 'Study session'}
      wide
    >
      {session ? <Body key={session.id} data={data} now={now} session={session} initialMode={mode} onClose={onClose} /> : null}
    </Modal>
  )
}

function Body({ data, now, session, initialMode, onClose }: { data: AppData; now: LocalMoment; session: Session; initialMode: 'view' | 'move'; onClose: () => void }) {
  const store = useActions()
  const topic = data.topics.find((t) => t.id === session.topicId)!
  const subject = data.subjects.find((s) => s.id === topic.subjectId)!
  const exam = examFor(data, topic)
  const state = sessionState(session, now)
  const open = session.status === 'planned'
  const [panel, setPanel] = useState<'none' | 'move' | 'length'>(initialMode === 'move' && open ? 'move' : 'none')

  const exp = useMemo(() => (open ? explainSession(data, session, now) : null), [data, session, now, open])
  const text = exp ? describeExplanation(exp, { topic: topic.name, subject: subject.name }, data.completion, session.durationMin, data.availability.preferredSessionMin) : null
  const quiz = session.quizId ? data.quizzes.find((q) => q.id === session.quizId) : undefined

  const startNow = () => {
    store.startSession(session.id)
    onClose()
    navigate(`/session/${session.id}`)
  }

  return (
    <div className="stack">
      <div className="row row--wrap">
        <SubjectChip subject={subject} />
        <SessionStatusBadge state={state} />
        {session.locked ? <span className="chip chip--blue">Placed by you</span> : null}
      </div>
      <p>
        <strong>{formatDateWithWeekday(session.date)}</strong> · {formatClock(session.startMin)} – {formatClock(session.startMin + session.durationMin)} · {session.durationMin} min
        {exam ? <span className="muted"> · {subject.name} exam in {Math.max(0, diffDays(now.date, exam.date))} days</span> : null}
      </p>

      {open && text ? (
        <div className="reason">
          <p className="eyebrow">Why this session</p>
          <p>{text.headline}</p>
          <details className="disclosure">
            <summary>Show the numbers</summary>
            <ul className="kbd-list small muted" style={{ marginTop: 6, paddingLeft: 4 }}>
              {text.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}

      {!open ? (
        <div className="reason">
          <p className="eyebrow">What happened</p>
          {session.status === 'skipped' ? (
            <p>You skipped this one. That's okay: Zuno updated your plan and your completion estimate for sessions this long.</p>
          ) : (
            <p>
              You studied {session.actual?.minutes ?? session.durationMin} of {session.durationMin} minutes{session.status === 'partial' ? ' (a partial session still counts for part of a completion)' : ''}.
            </p>
          )}
          {quiz ? (
            <p className="small muted">
              Recall check: {quiz.correct}/{quiz.total} · estimated recall {pct(quiz.recallBefore)} → {pct(quiz.recallAfter)}
            </p>
          ) : session.status !== 'skipped' ? (
            <p className="small muted">No recall check was recorded, so your estimate did not change.</p>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <>
          <div className="row row--wrap">
            <button type="button" className="btn btn--primary" onClick={startNow}>
              <Play size={17} aria-hidden="true" /> Start session
            </button>
            <button type="button" className="btn" onClick={() => setPanel(panel === 'move' ? 'none' : 'move')} aria-expanded={panel === 'move'}>
              <CalendarClock size={17} aria-hidden="true" /> Move
            </button>
            <button type="button" className="btn" onClick={() => setPanel(panel === 'length' ? 'none' : 'length')} aria-expanded={panel === 'length'}>
              <Timer size={17} aria-hidden="true" /> Change length
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                store.skipSession(session.id)
                onClose()
              }}
            >
              <SkipForward size={17} aria-hidden="true" /> Skip
            </button>
            {session.locked ? (
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  store.unlockSession(session.id)
                  onClose()
                }}
              >
                <Unlock size={17} aria-hidden="true" /> Let Zuno decide again
              </button>
            ) : null}
          </div>

          {panel === 'move' ? <MovePanel data={data} now={now} session={session} onDone={onClose} /> : null}
          {panel === 'length' ? <LengthPanel data={data} now={now} session={session} onDone={onClose} /> : null}
        </>
      ) : null}
    </div>
  )
}

function MovePanel({ data, now, session, onDone }: { data: AppData; now: LocalMoment; session: Session; onDone: () => void }) {
  const store = useActions()
  const topic = data.topics.find((t) => t.id === session.topicId)!
  const exam = examFor(data, topic)
  const examAbs = examStartAbs(exam)
  const nowAbs = momentToAbs(now)
  const suggestions = useMemo(
    () =>
      suggestSlots({
        availability: data.availability,
        sessions: data.sessions,
        sessionId: session.id,
        durationMin: session.durationMin,
        fromDate: now.date,
        nowAbs,
        examStartAbs: examAbs,
      }).filter((s) => !(s.date === session.date && s.startMin === session.startMin)),
    [data, session, now.date, nowAbs, examAbs],
  )
  const [choice, setChoice] = useState<string>('')
  const [date, setDate] = useState(session.date)
  const [time, setTime] = useState(minutesToInput(session.startMin))
  const [serverError, setServerError] = useState<{ field?: string; message: string } | null>(null)

  const custom = choice === 'custom'
  const startMin = inputToMinutes(time)
  const live = custom
    ? startMin === null
      ? { ok: false as const, field: 'time' as const, message: 'Pick a start time.' }
      : validatePlacement({ availability: data.availability, sessions: data.sessions, sessionId: session.id, date, startMin, durationMin: session.durationMin, examStartAbs: examAbs, nowAbs })
    : { ok: true as const }
  const picked = suggestions.find((s) => `${s.date}|${s.startMin}` === choice)

  const submit = () => {
    const target = custom ? { date, startMin: startMin ?? 0 } : picked
    if (!target) return
    const err = store.moveSession(session.id, target.date, target.startMin)
    if (err) setServerError(err)
    else onDone()
  }

  const maxDate = exam ? exam.date : addDays(now.date, 28)
  const dateErr = live.ok ? undefined : (live as { field?: string; message?: string }).field === 'date' ? (live as { message?: string }).message : undefined
  const timeErr = live.ok ? undefined : (live as { field?: string; message?: string }).field !== 'date' ? (live as { message?: string }).message : undefined

  return (
    <fieldset className="panel panel--tight stack" style={{ border: '1px solid var(--border)', margin: 0 }}>
      <legend className="eyebrow" style={{ padding: '0 6px' }}>Move to…</legend>
      {suggestions.length === 0 ? <p className="muted small">No other free slots fit before the exam. Try a custom time, or add study time in Settings.</p> : null}
      <div className="stack stack--sm" role="radiogroup" aria-label="Suggested times">
        {suggestions.map((s) => {
          const id = `${s.date}|${s.startMin}`
          return (
            <label className="check" key={id}>
              <input type="radio" name="slot" checked={choice === id} onChange={() => { setChoice(id); setServerError(null) }} />
              <span>
                {relativeWhen(s.date, s.startMin, now.date)}
                <span className="muted small"> · {formatDateWithWeekday(s.date)}</span>
              </span>
            </label>
          )
        })}
        <label className="check">
          <input type="radio" name="slot" checked={custom} onChange={() => { setChoice('custom'); setServerError(null) }} />
          <span>Pick a specific time</span>
        </label>
      </div>
      {custom ? (
        <div className="grid-2">
          <Field label="Day" error={dateErr}>
            {(p) => <input {...p} type="date" className="input" value={date} min={now.date} max={maxDate} onChange={(e) => setDate(e.target.value)} />}
          </Field>
          <Field
            label="Start time"
            error={timeErr}
            hint={windowsOn(data.availability, date).length ? `Study windows: ${windowsOn(data.availability, date).map((w) => `${formatClock(w.start)}–${formatClock(w.end)}`).join(', ')}` : 'No study windows on this day.'}
          >
            {(p) => <input {...p} type="time" step={300} className="input" value={time} onChange={(e) => setTime(e.target.value)} />}
          </Field>
        </div>
      ) : null}
      {serverError ? <p className="field__error" role="alert">{serverError.message}</p> : null}
      <div className="row">
        <button type="button" className="btn btn--primary" disabled={!choice || (custom && !live.ok)} onClick={submit}>
          Move session
        </button>
        <span className="muted small">Zuno will keep it exactly there and plan around it.</span>
      </div>
    </fieldset>
  )
}

function LengthPanel({ data, now, session, onDone }: { data: AppData; now: LocalMoment; session: Session; onDone: () => void }) {
  const store = useActions()
  const topic = data.topics.find((t) => t.id === session.topicId)!
  const examAbs = examStartAbs(examFor(data, topic))
  const [len, setLen] = useState(session.durationMin)
  const check = validatePlacement({
    availability: data.availability,
    sessions: data.sessions,
    sessionId: session.id,
    date: session.date,
    startMin: session.startMin,
    durationMin: len,
    examStartAbs: examAbs,
    nowAbs: momentToAbs(now),
  })
  const [err, setErr] = useState<string | null>(null)
  return (
    <fieldset className="panel panel--tight stack" style={{ border: '1px solid var(--border)', margin: 0 }}>
      <legend className="eyebrow" style={{ padding: '0 6px' }}>Change length</legend>
      <Field label="Session length" error={check.ok || len === session.durationMin ? err ?? undefined : check.message}>
        {(p) => (
          <select {...p} className="select" value={len} onChange={(e) => { setLen(Number(e.target.value)); setErr(null) }}>
            {[...new Set([...LENGTHS, session.durationMin])].sort((a, b) => a - b).map((l) => (
              <option key={l} value={l}>{l} minutes</option>
            ))}
          </select>
        )}
      </Field>
      <div className="row">
        <button
          type="button"
          className="btn btn--primary"
          disabled={len === session.durationMin || !check.ok}
          onClick={() => {
            const e = store.moveSession(session.id, session.date, session.startMin, len)
            if (e) setErr(e.message)
            else onDone()
          }}
        >
          <RotateCcw size={16} aria-hidden="true" /> Update length
        </button>
        <span className="muted small">Longer sessions must still fit your study window and avoid other sessions.</span>
      </div>
    </fieldset>
  )
}
