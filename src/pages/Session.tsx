import { ArrowLeft, ArrowRight, Check, CircleCheck, Lightbulb, Pause, Play, SkipForward, Sparkles, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Astronaut } from '../components/brand/Astronaut'
import { Starfield } from '../components/brand/Starfield'
import { RecallMeter } from '../components/ui/Meter'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { Field } from '../components/ui/Field'
import { SubjectChip, pct } from '../components/session-ui'
import { hasQuestionBank, pickQuestions, type BankQuestion } from '../data/questions'
import type { FinishOutput } from '../domain/ops'
import { explainSession, upNext } from '../engine/insights'
import { recallStatus } from '../engine/memory'
import { examFor } from '../engine/plan'
import { diffDays, formatClock, momentToAbs, relativeDay } from '../engine/time'
import { useActions, useData, useNow } from '../state/context'
import { formatElapsed, useElapsedMs } from '../state/useElapsed'
import { navigate } from '../state/router'
import type { AppData, Session as SessionT } from '../types'

type Phase = 'study' | 'check' | 'quiz' | 'manual' | 'result'

const mmss = formatElapsed

export function Session({ id }: { id: string }) {
  const data = useData()
  const session = data.sessions.find((s) => s.id === id)
  const [result, setResult] = useState<FinishOutput | null>(null)

  if (!session) {
    return (
      <Shell>
        <div className="panel stack" style={{ textAlign: 'center', justifyItems: 'center' }}>
          <Astronaut mood="think" size={96} />
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>That session is no longer on your plan</h1>
          <p className="muted">Plans change. We can work with that. Your next session is waiting on Mission Control.</p>
          <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>Back to Mission Control</button>
        </div>
      </Shell>
    )
  }
  if (session.status !== 'planned' && !result) {
    return (
      <Shell>
        <div className="panel stack" style={{ textAlign: 'center', justifyItems: 'center' }}>
          <Astronaut mood="idle" size={96} />
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>This session is already recorded</h1>
          <p className="muted">Open the calendar to see what happened, or head back to your next session.</p>
          <div className="row row--wrap" style={{ justifyContent: 'center' }}>
            <button type="button" className="btn btn--primary" onClick={() => navigate('/')}>Back to Mission Control</button>
            <button type="button" className="btn" onClick={() => navigate('/calendar')}>Open calendar</button>
          </div>
        </div>
      </Shell>
    )
  }
  return <Flow key={session.id} data={data} session={session} result={result} setResult={setResult} />
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-root session">
      <Starfield />
      <main className="session__inner fade-in" id="main">{children}</main>
    </div>
  )
}

function objectiveFor(data: AppData, session: SessionT, now: ReturnType<typeof useNow>): string {
  const topic = data.topics.find((t) => t.id === session.topicId)!
  const exp = explainSession(data, session, now)
  switch (exp?.primary) {
    case 'weak_check':
      return `Rebuild ${topic.name}: go back to what tripped you up (your last check was ${exp.lastCheck!.correct}/${exp.lastCheck!.total}), then explain it in your own words.`
    case 'flagged':
      return `Take a slower pass at ${topic.name}. Work one example step by step and note exactly where it gets confusing.`
    case 'first_look':
      return `Get a first solid pass at ${topic.name}: skim your notes, then try a couple of examples without looking.`
    default:
      return `Refresh ${topic.name} from memory: try to recall the key ideas first, then check your notes for the gaps.`
  }
}

function Flow({ data, session, result, setResult }: { data: AppData; session: SessionT; result: FinishOutput | null; setResult: (r: FinishOutput) => void }) {
  const store = useActions()
  const now = useNow()
  const topic = data.topics.find((t) => t.id === session.topicId)!
  const subject = data.subjects.find((s) => s.id === topic.subjectId)!
  const exam = examFor(data, topic)
  const [phase, setPhase] = useState<Phase>(result ? 'result' : 'study')
  const [minutes, setMinutes] = useState<number | null>(null)
  const [manualMin, setManualMin] = useState(String(session.durationMin))
  const [confirmExit, setConfirmExit] = useState(false)
  const [finishEarly, setFinishEarly] = useState(false)
  const headRef = useRef<HTMLHeadingElement>(null)

  // Begin (or resume) the timer for this session.
  useEffect(() => {
    if (session.status === 'planned' && data.activeTimer?.sessionId !== session.id) store.startSession(session.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id])

  useEffect(() => {
    headRef.current?.focus()
  }, [phase])

  const timer = data.activeTimer?.sessionId === session.id ? data.activeTimer : null
  const elapsed = useElapsedMs(timer)
  const timerOn = timer?.useTimer ?? data.settings.timerByDefault
  const plannedMs = session.durationMin * 60_000
  const objective = useMemo(() => objectiveFor(data, session, now), [data, session, now])

  const bankKey = topic.bankKey
  const bank = hasQuestionBank(bankKey)
  const priorBankChecks = data.quizzes.filter((q) => q.topicId === topic.id && q.source === 'bank').length

  const minutesStudied = (): number => {
    if (timerOn && timer) return Math.max(1, Math.round(elapsed / 60_000))
    const m = Math.round(Number(manualMin))
    return Number.isFinite(m) && m > 0 ? Math.min(m, 300) : session.durationMin
  }
  const startAbsFor = (mins: number) => momentToAbs(store.now()) - mins

  const done = () => {
    // A quick "done" on a long timer: confirm what to record instead of guessing.
    if (timerOn && timer && elapsed < plannedMs * 0.8) {
      setFinishEarly(true)
      return
    }
    const m = minutesStudied()
    setMinutes(m)
    setPhase('check')
  }

  const finish = (quiz?: { correct: number; total: number; source: 'bank' | 'manual' }, mins = minutes ?? session.durationMin) => {
    const out = store.finishSession({ sessionId: session.id, actualMin: mins, startAbs: startAbsFor(mins), quiz })
    if (out.error) return out
    setResult(out)
    setPhase('result')
    return out
  }

  const exitNow = () => navigate('/')

  if (phase === 'result' && result) {
    return <Result data={data} session={session} result={result} minutes={minutes ?? session.durationMin} />
  }

  return (
    <Shell>
      <div className="session__top">
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => (phase === 'study' ? setConfirmExit(true) : exitNow())}>
          <ArrowLeft size={16} aria-hidden="true" /> {phase === 'study' ? 'Exit' : 'Back to Mission Control'}
        </button>
        <div className="row row--wrap">
          <SubjectChip subject={subject} />
          {exam ? <span className="chip chip--peach">Exam {diffDays(now.date, exam.date) === 0 ? 'today' : `in ${diffDays(now.date, exam.date)} days`}</span> : null}
        </div>
      </div>

      {phase === 'study' ? (
        <section className="panel panel--glow session__card stack stack--lg" aria-labelledby="sess-h">
          <div>
            <p className="eyebrow">Study session · {session.durationMin} min · planned {relativeDay(session.date, now.date)} at {formatClock(session.startMin)}</p>
            <h1 id="sess-h" ref={headRef} tabIndex={-1} style={{ fontSize: 'var(--fs-3xl)' }}>{topic.name}</h1>
          </div>
          <div className="reason">
            <p className="eyebrow">Your objective</p>
            <p className="reason__headline">{objective}</p>
          </div>

          <div className="timer" aria-label="Study timer">
            {timerOn ? (
              <>
                <TimerRing elapsed={elapsed} planned={plannedMs} />
                <div className="timer__controls">
                  {timer?.runningSince !== null ? (
                    <button type="button" className="btn btn--lg" onClick={() => store.pauseTimer()}>
                      <Pause size={19} aria-hidden="true" /> Pause
                    </button>
                  ) : (
                    <button type="button" className="btn btn--lg btn--primary" onClick={() => store.resumeTimer()}>
                      <Play size={19} aria-hidden="true" /> Resume
                    </button>
                  )}
                  <button type="button" className="link-btn small" onClick={() => store.setTimerEnabled(false)}>Turn the timer off</button>
                </div>
              </>
            ) : (
              <div className="stack" style={{ maxWidth: 360 }}>
                <p className="muted">The timer is off. Study at your own pace, then tell Zuno how long you spent.</p>
                <Field label="Minutes studied" hint={`Planned: ${session.durationMin} minutes`}>
                  {(p) => <input {...p} className="input" type="number" min={1} max={300} inputMode="numeric" value={manualMin} onChange={(e) => setManualMin(e.target.value)} />}
                </Field>
                <div>
                  <button type="button" className="link-btn small" onClick={() => store.setTimerEnabled(true)}>Use the timer instead</button>
                </div>
              </div>
            )}
          </div>

          <div className="stack stack--sm">
            <div className="row row--wrap">
              <button type="button" className="btn btn--primary btn--lg" onClick={done}>
                <Check size={19} aria-hidden="true" /> I'm done: start my recall check
              </button>
              <button type="button" className="btn" onClick={() => setFinishEarly(true)}>Finish early</button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  store.skipSession(session.id)
                  navigate('/')
                }}
              >
                <SkipForward size={16} aria-hidden="true" /> Skip this session
              </button>
            </div>
            <p className="muted small">
              <Lightbulb size={14} aria-hidden="true" style={{ verticalAlign: '-2px' }} /> Finishing a timer doesn't prove you've learned it. A short recall check shows what actually stuck.
            </p>
          </div>
        </section>
      ) : null}

      {phase === 'check' ? (
        <section className="panel panel--glow session__card stack stack--lg" aria-labelledby="chk-h">
          <div>
            <p className="eyebrow">Recall check</p>
            <h1 id="chk-h" ref={headRef} tabIndex={-1} style={{ fontSize: 'var(--fs-2xl)' }}>How much stuck?</h1>
            <p className="muted">You studied {minutes} {minutes === 1 ? 'minute' : 'minutes'}. A quick check, done from memory, updates Zuno's estimate for {topic.name}.</p>
          </div>
          {bank ? (
            <div className="stack">
              <button type="button" className="btn btn--primary btn--lg" onClick={() => setPhase('quiz')}>
                <Sparkles size={18} aria-hidden="true" /> Start a {Math.min(5, pickQuestions(bankKey!, 0).length)}-question check
              </button>
              <button type="button" className="link-btn small" style={{ justifySelf: 'start' }} onClick={() => setPhase('manual')}>
                I tested myself somewhere else: enter my score
              </button>
            </div>
          ) : (
            <ManualScore topicName={topic.name} noBank onSave={(q) => finish({ ...q, source: 'manual' })} onSkip={() => finish(undefined)} />
          )}
          {bank ? (
            <div>
              <button type="button" className="link-btn small" onClick={() => finish(undefined)}>Skip the recall check for now</button>
              <p className="small muted" style={{ marginTop: 4 }}>Zuno will keep your last estimate for this topic.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {phase === 'manual' ? (
        <section className="panel panel--glow session__card stack stack--lg" aria-labelledby="man-h">
          <div>
            <p className="eyebrow">Recall check</p>
            <h1 id="man-h" ref={headRef} tabIndex={-1} style={{ fontSize: 'var(--fs-2xl)' }}>Enter your score</h1>
          </div>
          <ManualScore topicName={topic.name} onSave={(q) => finish({ ...q, source: 'manual' })} onSkip={() => finish(undefined)} onBack={bank ? () => setPhase('check') : undefined} />
        </section>
      ) : null}

      {phase === 'quiz' && bankKey ? (
        <Quiz
          title={topic.name}
          questions={pickQuestions(bankKey, priorBankChecks)}
          headRef={headRef}
          onFinish={(correct, total) => finish({ correct, total, source: 'bank' })}
        />
      ) : null}

      <ConfirmDialog
        open={confirmExit}
        title="Leave this session?"
        message="Your timer keeps its place, so you can come back from Mission Control and pick up where you left off."
        confirmLabel="Leave for now"
        cancelLabel="Keep studying"
        onConfirm={exitNow}
        onCancel={() => setConfirmExit(false)}
      />
      <FinishEarlyDialog
        open={finishEarly}
        planned={session.durationMin}
        timerMin={timerOn && timer ? Math.max(1, Math.round(elapsed / 60_000)) : null}
        initial={timerOn && timer ? Math.max(1, Math.round(elapsed / 60_000)) : Math.round(Number(manualMin)) || 1}
        onCancel={() => setFinishEarly(false)}
        onSave={(mins, withCheck) => {
          setFinishEarly(false)
          setMinutes(mins)
          if (withCheck) setPhase('check')
          else finish(undefined, mins)
        }}
      />
    </Shell>
  )
}

function TimerRing({ elapsed, planned }: { elapsed: number; planned: number }) {
  const r = 86
  const c = 2 * Math.PI * r
  const frac = Math.min(1, elapsed / planned)
  const over = elapsed > planned
  const remaining = planned - elapsed
  return (
    <div className="timer__ring" role="timer" aria-label={over ? `${mmss(elapsed - planned)} over the planned time` : `${mmss(remaining)} remaining`}>
      <svg viewBox="0 0 200 200" width="220" height="220" aria-hidden="true">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#212C3F" strokeWidth="10" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={over ? '#92D6BD' : '#89AFFF'}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`}
          transform="rotate(-90 100 100)"
        />
      </svg>
      <div className="timer__readout">
        <strong>{over ? `+${mmss(elapsed - planned)}` : mmss(remaining)}</strong>
        <span className="muted small">{over ? 'past your plan, nicely done' : `of ${Math.round(planned / 60000)} min`}</span>
      </div>
    </div>
  )
}

function FinishEarlyDialog({ open, planned, timerMin, initial, onCancel, onSave }: { open: boolean; planned: number; timerMin: number | null; initial: number; onCancel: () => void; onSave: (mins: number, withCheck: boolean) => void }) {
  const [val, setVal] = useState(String(initial))
  useEffect(() => {
    if (open) setVal(String(initial))
  }, [open, initial])
  const n = Math.round(Number(val))
  const err = !val || !Number.isFinite(n) || n < 1 ? 'Enter at least 1 minute.' : n > 300 ? 'That is more than five hours. Enter a smaller number.' : undefined
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="How long did you study?"
      description={timerMin !== null && timerMin < planned ? `The timer shows ${timerMin} of ${planned} minutes. Zuno records what really happened, and stopping early is fine.` : 'Stopping early is fine. Zuno counts the part you did.'}
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onCancel}>Keep studying</button>
          <button type="button" className="btn" disabled={!!err} onClick={() => onSave(n, false)}>Save without a check</button>
          <button type="button" className="btn btn--primary" disabled={!!err} onClick={() => onSave(n, true)}>Continue to recall check</button>
        </>
      }
    >
      <Field label="Minutes studied" error={err} hint={`Planned: ${planned} minutes. Doing most of it counts as complete; less counts as a partial session.`}>
        {(p) => <input {...p} autoFocus className="input" type="number" min={1} max={300} inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} />}
      </Field>
      <div className="row row--wrap">
        <button type="button" className="btn btn--sm" onClick={() => setVal(String(planned))}>I studied the full {planned} min</button>
        {timerMin !== null && timerMin !== planned ? <button type="button" className="btn btn--sm btn--ghost" onClick={() => setVal(String(timerMin))}>Use the timer ({timerMin} min)</button> : null}
      </div>
    </Modal>
  )
}

function ManualScore({ topicName, noBank, onSave, onSkip, onBack }: { topicName: string; noBank?: boolean; onSave: (q: { correct: number; total: number }) => FinishOutput | void; onSkip: () => void; onBack?: () => void }) {
  const [correct, setCorrect] = useState('')
  const [total, setTotal] = useState('5')
  const [touched, setTouched] = useState(false)
  const k = Number(correct)
  const n = Number(total)
  const totalErr = !Number.isInteger(n) || n < 1 || n > 20 ? 'Enter how many questions you answered (1 to 20).' : undefined
  const correctErr = correct === '' ? 'Enter how many you got right.' : !Number.isInteger(k) || k < 0 ? 'Enter a whole number, 0 or more.' : !totalErr && k > n ? `You can't get more than ${n} right out of ${n}.` : undefined
  const [serverErr, setServerErr] = useState<string | null>(null)
  return (
    <div className="stack">
      {noBank ? (
        <div className="banner banner--plain" style={{ display: 'block' }}>
          <p className="small"><strong>No built-in questions for {topicName} yet.</strong> Zuno doesn't make up subject questions it can't check.</p>
          <p className="small muted">Test yourself instead: try 3 to 5 practice questions from your notes, textbook or a past paper, without looking anything up. Then enter how many you got right.</p>
        </div>
      ) : null}
      <div className="grid-2">
        <Field label="Correct answers" error={touched ? correctErr : undefined}>
          {(p) => <input {...p} className="input" type="number" min={0} inputMode="numeric" value={correct} onChange={(e) => { setCorrect(e.target.value); setServerErr(null) }} placeholder="e.g. 3" />}
        </Field>
        <Field label="Out of" error={touched ? totalErr : undefined}>
          {(p) => <input {...p} className="input" type="number" min={1} max={20} inputMode="numeric" value={total} onChange={(e) => { setTotal(e.target.value); setServerErr(null) }} />}
        </Field>
      </div>
      {serverErr ? <p className="field__error" role="alert">{serverErr}</p> : null}
      <div className="row row--wrap">
        <button
          type="button"
          className="btn btn--primary btn--lg"
          onClick={() => {
            setTouched(true)
            if (correctErr || totalErr) return
            const r = onSave({ correct: k, total: n })
            if (r && r.error) setServerErr(r.error.message)
          }}
        >
          Save my result
        </button>
        {onBack ? <button type="button" className="btn btn--ghost" onClick={onBack}>Back</button> : null}
        {noBank ? (
          <button type="button" className="link-btn small" onClick={onSkip}>Skip the check for now</button>
        ) : null}
      </div>
      {noBank ? <p className="small muted">Skipping keeps your last estimate. Finishing a timer on its own isn't evidence of mastery.</p> : null}
    </div>
  )
}

function Quiz({ title, questions, headRef, onFinish }: { title: string; questions: BankQuestion[]; headRef: React.RefObject<HTMLHeadingElement | null>; onFinish: (correct: number, total: number) => void }) {
  const [i, setI] = useState(0)
  const [pick, setPick] = useState<number | null>(null)
  const [checked, setChecked] = useState(false)
  const [score, setScore] = useState(0)
  const q = questions[i]
  const last = i === questions.length - 1
  const feedbackRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (checked) feedbackRef.current?.focus()
  }, [checked])

  const check = () => {
    if (pick === null) return
    if (pick === q.answer) setScore((s) => s + 1)
    setChecked(true)
  }
  const next = () => {
    if (last) {
      onFinish(score, questions.length)
      return
    }
    setI(i + 1)
    setPick(null)
    setChecked(false)
    headRef.current?.focus()
  }
  const correct = pick === q.answer

  return (
    <section className="panel panel--glow session__card stack stack--lg" aria-labelledby="quiz-h">
      <div>
        <p className="eyebrow">Recall check · {title}</p>
        <h1 id="quiz-h" ref={headRef} tabIndex={-1} style={{ fontSize: 'var(--fs-xl)' }}>
          Question {i + 1} of {questions.length}
        </h1>
        <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={i + (checked ? 1 : 0)} aria-label="Check progress">
          <span style={{ width: `${((i + (checked ? 1 : 0)) / questions.length) * 100}%` }} />
        </div>
      </div>
      <fieldset className="stack" style={{ border: 0, margin: 0, padding: 0 }}>
        <legend className="reason__headline" style={{ padding: 0, marginBottom: 'var(--s-3)' }}>{q.prompt}</legend>
        {q.options.map((o, idx) => {
          const state = !checked ? '' : idx === q.answer ? 'right' : idx === pick ? 'wrong' : ''
          return (
            <label key={o} className="check quiz-opt" data-state={state}>
              <input type="radio" name={`q-${q.id}`} disabled={checked} checked={pick === idx} onChange={() => setPick(idx)} />
              <span>
                {o}
                {state === 'right' ? <span className="sr-only"> (correct answer)</span> : null}
                {state === 'wrong' ? <span className="sr-only"> (your answer, not correct)</span> : null}
              </span>
              {state === 'right' ? <CircleCheck size={18} aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--mint)' }} /> : null}
              {state === 'wrong' ? <TriangleAlert size={18} aria-hidden="true" style={{ marginLeft: 'auto', color: 'var(--peach)' }} /> : null}
            </label>
          )
        })}
      </fieldset>
      <div ref={feedbackRef} tabIndex={-1} aria-live="polite">
        {checked ? (
          <div className="reason" data-tone={correct ? 'good' : 'gentle'}>
            <p className="eyebrow">{correct ? 'Nice work' : 'Not quite, and that is useful'}</p>
            <p>{q.explanation}</p>
          </div>
        ) : null}
      </div>
      <div className="row row--wrap">
        {!checked ? (
          <button type="button" className="btn btn--primary btn--lg" disabled={pick === null} onClick={check}>Check my answer</button>
        ) : (
          <button type="button" className="btn btn--primary btn--lg" onClick={next}>
            {last ? 'See my results' : 'Next question'} <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </section>
  )
}

function Result({ data, session, result, minutes }: { data: AppData; session: SessionT; result: FinishOutput; minutes: number }) {
  const now = useNow()
  const topic = data.topics.find((t) => t.id === session.topicId)!
  const q = result.quiz
  const ratio = q ? q.correct / q.total : null
  const mood = ratio === null ? 'idle' : ratio >= 0.6 ? 'cheer' : 'wave'
  const heading =
    ratio === null
      ? 'Session saved'
      : ratio >= 0.8
        ? 'Strong recall!'
        : ratio >= 0.4
          ? 'A solid start'
          : 'Useful information, not a verdict'
  const line =
    ratio === null
      ? 'No recall check this time, so your estimate stays as it was. A little progress. A clearer path.'
      : ratio >= 0.8
        ? 'That is exactly what the plan was hoping for. Zuno can space this topic out a little more.'
        : ratio >= 0.4
          ? 'Some ideas stuck and some need another look. Zuno has lined up what to revisit.'
          : 'Plans change. We can work with that. Zuno will give this topic more attention and space it sensibly.'
  const nextSession = upNext(result.data, now)
  const nextTopic = nextSession ? result.data.topics.find((t) => t.id === nextSession.topicId) : null

  return (
    <Shell>
      <section className="panel panel--glow session__card stack stack--lg" aria-labelledby="res-h">
        <div className="result__hero">
          <div className="burst" aria-hidden="true">
            {Array.from({ length: 10 }, (_, i) => (
              <span key={i} style={{ ['--a' as string]: `${i * 36}deg` }} />
            ))}
            <Astronaut mood={mood} size={112} />
          </div>
          <div>
            <p className="eyebrow">{topic.name} · {minutes} min studied</p>
            <h1 id="res-h" tabIndex={-1} ref={(el) => el?.focus()} style={{ fontSize: 'var(--fs-2xl)' }}>{heading}</h1>
            <p className="muted">{line}</p>
          </div>
        </div>

        {q && ratio !== null && Math.abs(q.recallAfter - q.recallBefore) >= 0.005 ? (
          <p className="muted small">
            {q.recallAfter > q.recallBefore && ratio < 0.5
              ? `Your score (${pct(ratio)}) was a little above what the model expected (${pct(q.recallBefore)}), so the estimate nudged up. It is still low, and Zuno keeps this topic in focus.`
              : q.recallAfter < q.recallBefore
                ? `Your score (${pct(ratio)}) was below what the model expected (${pct(q.recallBefore)}), so the estimate came down and reviews will be spaced closer together.`
                : `Your score (${pct(ratio)}) was above what the model expected (${pct(q.recallBefore)}), so the estimate went up.`}
          </p>
        ) : null}
        {q ? (
          <div className="result__nums">
            <div>
              <p className="eyebrow">Observed score</p>
              <p className="result__big">{q.correct} of {q.total}</p>
            </div>
            <div>
              <p className="eyebrow">Estimated recall (model)</p>
              <p className="result__big">{pct(q.recallBefore)} → {pct(q.recallAfter)}</p>
              <RecallMeter value={q.recallAfter} status={recallStatus(q.recallAfter)} label={`${topic.name} estimated recall after this check`} />
            </div>
          </div>
        ) : null}

        <div className="stack stack--sm">
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>What changed</h2>
          {result.change?.note ? <p>{result.change.note}</p> : null}
          {result.change && result.change.items.length > 0 ? (
            <ul className="banner__list">
              {result.change.items.slice(0, 3).map((it, i) => (
                <li key={i}>{it.text}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">Your upcoming sessions stay where they are.</p>
          )}
        </div>

        {nextSession && nextTopic ? (
          <p className="reason">
            <span className="eyebrow">Next up</span>
            <span><strong>{nextTopic.name}</strong> · {relativeDay(nextSession.date, now.date)} at {formatClock(nextSession.startMin)}</span>
          </p>
        ) : null}

        <div className="row row--wrap">
          <button type="button" className="btn btn--primary btn--lg" onClick={() => navigate('/')}>Back to Mission Control</button>
          <button type="button" className="btn" onClick={() => navigate('/forecast')}>See the forecast</button>
        </div>
      </section>
    </Shell>
  )
}
