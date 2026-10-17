import { ArrowLeft, Check, LifeBuoy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Astronaut } from '../components/brand/Astronaut'
import { SubjectChip, pct } from '../components/session-ui'
import { Field } from '../components/ui/Field'
import { currentPlanMinutes, runCorrection, type CorrectionRow, type Verdict } from '../engine/correction'
import { behindStatus } from '../engine/insights'
import { diffDays, formatDateShort, formatMinutes } from '../engine/time'
import { useActions, useData, useNow } from '../state/context'
import { navigate } from '../state/router'

const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  prioritized: { label: 'Prioritized', tone: 'blue' },
  kept: { label: 'Kept', tone: 'mint' },
  reduced: { label: 'Reduced', tone: 'peach' },
  omitted: { label: 'Left out for now', tone: 'coral' },
  nothing: { label: 'No review needed', tone: 'mint' },
}

export function Correction() {
  const data = useData()
  const now = useNow()
  const store = useActions()
  const upcoming = useMemo(
    () =>
      data.subjects
        .map((s) => ({ s, exam: data.exams.find((e) => e.subjectId === s.id) }))
        .filter((x) => x.exam && diffDays(now.date, x.exam.date) >= 0)
        .sort((a, b) => a.exam!.date.localeCompare(b.exam!.date)),
    [data, now.date],
  )
  const planMin = currentPlanMinutes(data, now)
  const behind = behindStatus(data, now)
  const [priority, setPriority] = useState<string[]>(() => upcoming.slice(0, 1).map((x) => x.s.id))
  const [hours, setHours] = useState<string>(() => String(Math.max(1, Math.round((planMin * 0.5) / 30) / 2)))
  const hoursNum = Number(hours)
  const hoursErr = hours === '' || !Number.isFinite(hoursNum) || hoursNum <= 0 ? 'Enter how many hours you can really give, like 4 or 7.5.' : hoursNum > 200 ? 'That is more than any plan can use. Try a smaller number.' : undefined

  const result = useMemo(
    () => (hoursErr || upcoming.length === 0 ? null : runCorrection(data, now, { prioritySubjectIds: priority, budgetMin: Math.round(hoursNum * 60) })),
    [data, now, priority, hoursNum, hoursErr, upcoming.length],
  )

  if (upcoming.length === 0) {
    return (
      <>
        <header className="page-head"><div><h1>Course Correction</h1></div></header>
        <section className="panel empty">
          <Astronaut mood="idle" size={100} />
          <h3>No upcoming exams to plan for</h3>
          <p>Add a subject with an exam date and Zuno can rebuild a plan from the time you have.</p>
          <a className="btn btn--primary" href="#/subjects">Open subjects</a>
        </section>
      </>
    )
  }

  const groups: Verdict[] = ['prioritized', 'kept', 'reduced', 'omitted', 'nothing']

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Course Correction</h1>
          <p>Let's work with the time you have.</p>
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => navigate('/')}><ArrowLeft size={16} aria-hidden="true" /> Back</button>
      </header>

      <section className="panel stack stack--lg">
        <div className="onboard__intro" style={{ marginBottom: 0 }}>
          <Astronaut mood="think" size={84} />
          <div>
            <h2 style={{ fontSize: 'var(--fs-xl)' }}>Plans change. We can work with that.</h2>
            <p className="muted">
              Tell Zuno what matters most and how much time you can really give from now on. It will rebuild the plan around that, and show you exactly what is prioritized, reduced or left out, and why. Nothing changes until you apply it.
            </p>
            {behind.missed.length > 0 ? (
              <p className="small muted" style={{ marginTop: 6 }}>
                {behind.missed.length} earlier {behind.missed.length === 1 ? 'session was' : 'sessions were'} not recorded. If you apply this plan, they are marked as skipped so Zuno can learn from them. That is okay.
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid-2" style={{ alignItems: 'start' }}>
          <fieldset className="stack stack--sm" style={{ border: 0, margin: 0, padding: 0 }}>
            <legend className="field__label">Which exams matter most right now?</legend>
            <p className="muted small">Pick one or more. Everything else gets the time that is left.</p>
            {upcoming.map(({ s, exam }) => (
              <label key={s.id} className="check">
                <input type="checkbox" checked={priority.includes(s.id)} onChange={(e) => setPriority(e.target.checked ? [...priority, s.id] : priority.filter((x) => x !== s.id))} />
                <span>
                  <strong>{s.name}</strong>
                  <span className="muted small"> · exam {formatDateShort(exam!.date)} ({diffDays(now.date, exam!.date)} {diffDays(now.date, exam!.date) === 1 ? 'day' : 'days'})</span>
                </span>
              </label>
            ))}
            {priority.length === 0 ? <p className="muted small">With nothing selected, Zuno treats every subject equally.</p> : null}
          </fieldset>

          <div className="stack">
            <Field label="Hours you can realistically study from now until your exams" error={hoursErr} hint={`Your current plan has ${formatMinutes(planMin)}. Be honest: a smaller number you will keep is better than a bigger one you will not.`}>
              {(p) => <input {...p} className="input" type="number" min={0.5} step={0.5} inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} style={{ maxWidth: 180 }} />}
            </Field>
          </div>
        </div>
      </section>

      {result ? (
        <section className="panel stack stack--lg" aria-labelledby="cc-res">
          <div>
            <h2 id="cc-res" className="panel__title">Your revised plan</h2>
            {result.summary.map((l) => <p key={l} className="muted" style={{ marginTop: 4 }}>{l}</p>)}
          </div>

          <div className="cc-compare" role="group" aria-label="Forecast before and after">
            <div>
              <p className="eyebrow">Time</p>
              <p className="stat">{formatMinutes(result.beforeMinutes)} <span className="muted">→</span> {formatMinutes(result.afterMinutes)}</p>
            </div>
            <div>
              <p className="eyebrow">Expected exam-day recall (estimate)</p>
              <p className="stat">{pct(result.meanBefore)} <span className="muted">→</span> <span style={{ color: 'var(--blue)' }}>{pct(result.meanAfter)}</span></p>
            </div>
          </div>

          {groups.map((g) => {
            const rows = result.rows.filter((r) => r.verdict === g)
            if (rows.length === 0) return null
            return (
              <div key={g} className="stack stack--sm">
                <h3 style={{ fontSize: 'var(--fs-md)' }}><span className={`chip chip--${VERDICT[g].tone}`}>{VERDICT[g].label}</span> <span className="muted small">{rows.length} {rows.length === 1 ? 'topic' : 'topics'}</span></h3>
                <ul className="cc-rows">
                  {rows.map((r) => <Row key={r.topicId} r={r} data={data} />)}
                </ul>
              </div>
            )
          })}

          <div className="row row--wrap">
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => {
                store.applyCorrection(result.data, result.summary[0])
                navigate('/')
              }}
            >
              <Check size={18} aria-hidden="true" /> Apply this plan
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => navigate('/')}>Not now</button>
          </div>
          <p className="small muted"><LifeBuoy size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> You can undo right after applying. All forecasts are estimates.</p>
        </section>
      ) : null}
    </>
  )
}

function Row({ r, data }: { r: CorrectionRow; data: ReturnType<typeof useData> }) {
  const subject = data.subjects.find((s) => s.id === r.subjectId)
  return (
    <li className="cc-row">
      <div className="stack stack--sm">
        <div className="row row--wrap">
          <strong>{r.topicName}</strong>
          {subject ? <SubjectChip subject={subject} /> : null}
        </div>
        <p className="muted small">{r.reason}</p>
      </div>
      <dl className="cc-nums">
        <div><dt>Minutes</dt><dd>{r.beforeMinutes} → <strong>{r.afterMinutes}</strong></dd></div>
        <div><dt>Exam-day recall</dt><dd>{pct(r.beforeProjected)} → <strong>{pct(r.afterProjected)}</strong></dd></div>
      </dl>
    </li>
  )
}
