import { ArrowLeft, ArrowRight, Check, Plus, Rocket, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AvailabilityEditor } from '../components/availability/AvailabilityEditor'
import { Astronaut } from '../components/brand/Astronaut'
import { Wordmark } from '../components/brand/Logo'
import { Starfield } from '../components/brand/Starfield'
import { Field, ErrorText } from '../components/ui/Field'
import {
  MAX_SUBJECTS,
  MAX_TOPICS_PER_SUBJECT,
  availabilityWarnings,
  draftToData,
  emptyDraft,
  newDraftSubject,
  newDraftTopic,
  proposalSummary,
  validateAvailability,
  validateSubjects,
  type DraftSubject,
  type DraftTopic,
  type OnboardingDraft,
} from '../domain/onboarding'
import { IMPORTANCE_LABEL } from '../engine/insights'
import { addDays, formatClock, formatDateWithWeekday, formatMinutes, nowMoment } from '../engine/time'
import { useActions } from '../state/context'
import { navigate } from '../state/router'
import type { Familiarity, Importance } from '../types'
import { SubjectChip } from '../components/session-ui'

const DRAFT_KEY = 'zuno:draft'
// Matches the order subjects are coloured in when the plan is built.
const PALETTE = ['blue', 'peach', 'mint', 'lilac', 'rose', 'sky', 'gold'] as const
const STEPS = ['Your subjects', 'Your week', 'Your starting point']
const IMPORTANCE_HELP: Record<number, string> = {
  1: 'Nice to know. Rarely tested.',
  2: 'Small part of the exam.',
  3: 'A normal topic.',
  4: 'Counts for a lot.',
  5: 'Must not slip. A core topic.',
}
const FAMILIARITY: { value: Familiarity; label: string; help: string }[] = [
  { value: 1, label: 'New to me', help: 'I have barely seen it' },
  { value: 2, label: 'Heard of it', help: 'I could recognise some of it' },
  { value: 3, label: 'Getting there', help: 'I know about half' },
  { value: 4, label: 'Pretty solid', help: 'I know most of it' },
  { value: 5, label: 'Confident', help: 'I could explain it' },
]

function loadDraft(): OnboardingDraft {
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (raw) {
      const d = JSON.parse(raw) as OnboardingDraft
      if (d && Array.isArray(d.subjects) && d.availability && Array.isArray(d.availability.windows)) return d
    }
  } catch {
    /* fall through */
  }
  return emptyDraft()
}

export function Onboarding() {
  const store = useActions()
  const [draft, setDraft] = useState<OnboardingDraft>(loadDraft)
  const [step, setStep] = useState(0)
  const [attempted, setAttempted] = useState<Record<number, boolean>>({})
  const [proposal, setProposal] = useState<ReturnType<typeof draftToData> | null>(null)
  const now = nowMoment()

  useEffect(() => {
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    } catch {
      /* ignore */
    }
  }, [draft])

  const subjectErrors = useMemo(() => validateSubjects(draft, now.date), [draft, now.date])
  const weekErrors = useMemo(() => validateAvailability(draft.availability), [draft.availability])
  const weekWarnings = useMemo(() => availabilityWarnings(draft.availability), [draft.availability])

  const stepErrors = step === 0 ? subjectErrors : step === 1 ? weekErrors : {}
  const showAll = !!attempted[step]
  // Field-level errors in the week step show live; list-level ones wait for "Continue".
  const visibleWeekErrors = Object.fromEntries(
    Object.entries(weekErrors).filter(([k]) => showAll || k.startsWith('window:') || k.startsWith('commitment:') || k === 'daily'),
  )
  const visibleSubjectErrors = showAll ? subjectErrors : {}

  const next = () => {
    if (Object.keys(stepErrors).length > 0) {
      setAttempted((a) => ({ ...a, [step]: true }))
      const el = document.querySelector('[role="alert"]') as HTMLElement | null
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return
    }
    if (step < 2) setStep(step + 1)
    else setProposal(draftToData(draft, nowMoment()))
    window.scrollTo({ top: 0 })
  }

  const accept = () => {
    if (!proposal) return
    store.commitOnboarding(proposal)
    try {
      window.sessionStorage.removeItem(DRAFT_KEY)
    } catch {
      /* ignore */
    }
    navigate('/')
  }

  if (proposal) return <Proposal draftName={draft.name} data={proposal} onBack={() => setProposal(null)} onAccept={accept} />

  return (
    <div className="app-root onboard">
      <Starfield />
      <main className="onboard__inner" id="main">
        <header className="onboard__top">
          <a href="#/" className="onboard__brand" aria-label="Zuno, back to welcome"><Wordmark size={30} label={false} /></a>
          <p className="muted small">Setup takes about two minutes. You can change everything later.</p>
        </header>

        <ol className="stepper" aria-label="Setup progress">
          {STEPS.map((s, i) => (
            <li key={s} className="stepper__item" aria-current={i === step ? 'step' : undefined} data-done={i < step}>
              <span className="stepper__dot" aria-hidden="true">{i < step ? <Check size={14} /> : i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <div className="onboard__card panel fade-in" key={step}>
          <div className="onboard__intro">
            <Astronaut mood={step === 0 ? 'wave' : step === 1 ? 'think' : 'idle'} size={84} />
            <div>
              <h1 style={{ fontSize: 'var(--fs-2xl)' }}>
                {step === 0 ? 'What are you studying?' : step === 1 ? 'What does your week look like?' : 'Where are you starting from?'}
              </h1>
              <p className="muted">
                {step === 0
                  ? 'Add each subject, its exam date, and the topics inside it.'
                  : step === 1
                    ? 'Tell Zuno when you can study and what is already taken. It plans inside the gaps.'
                    : 'A rough guess is plenty. These are starting estimates and will improve with recall checks.'}
              </p>
            </div>
          </div>

          {step === 0 ? (
            <SubjectsStep draft={draft} setDraft={setDraft} errors={visibleSubjectErrors} today={now.date} />
          ) : step === 1 ? (
            <AvailabilityEditor value={draft.availability} onChange={(availability) => setDraft({ ...draft, availability })} errors={visibleWeekErrors} warnings={weekWarnings} />
          ) : (
            <StartingStep draft={draft} setDraft={setDraft} />
          )}

          {showAll && Object.keys(stepErrors).length > 0 ? (
            <p className="field__error" role="alert">
              <span>Almost there. Fix the highlighted fields above to continue.</span>
            </p>
          ) : null}

          <div className="row row--between row--wrap onboard__nav">
            <button type="button" className="btn btn--ghost" onClick={() => (step === 0 ? navigate('/') : setStep(step - 1))}>
              <ArrowLeft size={17} aria-hidden="true" /> {step === 0 ? 'Back to welcome' : 'Back'}
            </button>
            <button type="button" className="btn btn--primary btn--lg" onClick={next}>
              {step < 2 ? (
                <>Continue <ArrowRight size={18} aria-hidden="true" /></>
              ) : (
                <><Rocket size={18} aria-hidden="true" /> Build my study plan</>
              )}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}

// ---- Step 1 --------------------------------------------------------------------------

function SubjectsStep({ draft, setDraft, errors, today }: { draft: OnboardingDraft; setDraft: (d: OnboardingDraft) => void; errors: Record<string, string>; today: string }) {
  const setSubject = (id: string, patch: Partial<DraftSubject>) => setDraft({ ...draft, subjects: draft.subjects.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  const setTopic = (sid: string, tid: string, patch: Partial<DraftTopic>) =>
    setSubject(sid, { topics: draft.subjects.find((s) => s.id === sid)!.topics.map((t) => (t.id === tid ? { ...t, ...patch } : t)) })

  return (
    <div className="stack stack--lg">
      <Field label="What should we call you? (optional)">
        {(p) => <input {...p} className="input" style={{ maxWidth: 340 }} value={draft.name} maxLength={30} placeholder="Your first name" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />}
      </Field>

      <div className="banner banner--plain" style={{ display: 'block' }}>
        <p className="small"><strong>How important is a topic?</strong> Zuno gives more study time to topics you rate higher.</p>
        <p className="small muted">
          {[1, 2, 3, 4, 5].map((n) => `${n} ${IMPORTANCE_LABEL[n]} (${IMPORTANCE_HELP[n].replace(/\.$/, '')})`).join(' · ')}
        </p>
      </div>

      <ErrorText>{errors.subjects}</ErrorText>
      <ul className="stack stack--lg">
        {draft.subjects.map((s, si) => (
          <li key={s.id} className="subject-card" data-color={PALETTE[si % PALETTE.length]}>
            <div className="subject-card__head">
              <h2 style={{ fontSize: 'var(--fs-lg)' }}>Subject {si + 1}</h2>
              {draft.subjects.length > 1 ? (
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => setDraft({ ...draft, subjects: draft.subjects.filter((x) => x.id !== s.id) })}>
                  <Trash2 size={15} aria-hidden="true" /> Remove subject
                </button>
              ) : null}
            </div>
            <div className="grid-2">
              <Field label="Subject name" error={errors[`subject:${s.id}:name`]}>
                {(p) => <input {...p} className="input" value={s.name} maxLength={40} placeholder="e.g. Physics" onChange={(e) => setSubject(s.id, { name: e.target.value })} />}
              </Field>
              <Field label="Exam date" error={errors[`subject:${s.id}:exam`]} hint="Study sessions are planned before this day.">
                {(p) => <input {...p} type="date" className="input" value={s.examDate} min={addDays(today, 1)} onChange={(e) => setSubject(s.id, { examDate: e.target.value })} />}
              </Field>
            </div>
            <div className="stack stack--sm">
              <p className="field__label">Topics</p>
              <ErrorText>{errors[`subject:${s.id}:topics`]}</ErrorText>
              <ul className="stack stack--sm">
                {s.topics.map((t, ti) => (
                  <li key={t.id} className="topic-row">
                    <Field label={`Topic ${ti + 1}`} error={errors[`topic:${t.id}:name`]} hideLabel>
                      {(p) => <input {...p} className="input" aria-label={`${s.name || 'Subject'} topic ${ti + 1} name`} value={t.name} maxLength={50} placeholder="e.g. Newton's laws" onChange={(e) => setTopic(s.id, t.id, { name: e.target.value })} />}
                    </Field>
                    <Field label="Importance" hideLabel>
                      {(p) => (
                        <select {...p} aria-label={`Importance of ${t.name || `topic ${ti + 1}`}`} className="select" value={t.importance} onChange={(e) => setTopic(s.id, t.id, { importance: Number(e.target.value) as Importance })}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>{n} · {IMPORTANCE_LABEL[n]}</option>
                          ))}
                        </select>
                      )}
                    </Field>
                    <button type="button" className="icon-btn" aria-label={`Remove topic ${t.name || ti + 1}`} disabled={s.topics.length === 1} onClick={() => setSubject(s.id, { topics: s.topics.filter((x) => x.id !== t.id) })}>
                      <Trash2 size={18} />
                    </button>
                  </li>
                ))}
              </ul>
              <div>
                <button type="button" className="btn btn--sm" disabled={s.topics.length >= MAX_TOPICS_PER_SUBJECT} onClick={() => setSubject(s.id, { topics: [...s.topics, newDraftTopic()] })}>
                  <Plus size={15} aria-hidden="true" /> Add topic
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div>
        <button type="button" className="btn" disabled={draft.subjects.length >= MAX_SUBJECTS} onClick={() => setDraft({ ...draft, subjects: [...draft.subjects, newDraftSubject()] })}>
          <Plus size={16} aria-hidden="true" /> Add another subject
        </button>
      </div>
    </div>
  )
}

// ---- Step 3 --------------------------------------------------------------------------

function StartingStep({ draft, setDraft }: { draft: OnboardingDraft; setDraft: (d: OnboardingDraft) => void }) {
  const setFam = (sid: string, tid: string, f: Familiarity | null) =>
    setDraft({
      ...draft,
      subjects: draft.subjects.map((s) => (s.id === sid ? { ...s, topics: s.topics.map((t) => (t.id === tid ? { ...t, familiarity: f } : t)) } : s)),
    })
  return (
    <div className="stack stack--lg">
      {draft.subjects.map((s) => (
        <section key={s.id} className="stack stack--sm" aria-label={s.name}>
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>{s.name}</h2>
          <ul className="stack">
            {s.topics.map((t) => (
              <li key={t.id} className="start-row">
                <p><strong>{t.name}</strong></p>
                <div role="radiogroup" aria-label={`How well do you know ${t.name}?`} className="segmented segmented--wide">
                  <button type="button" role="radio" aria-checked={t.familiarity === null} onClick={() => setFam(s.id, t.id, null)}>
                    I'm not sure yet
                  </button>
                  {FAMILIARITY.map((f) => (
                    <button key={f.value} type="button" role="radio" aria-checked={t.familiarity === f.value} title={f.help} onClick={() => setFam(s.id, t.id, f.value)}>
                      {f.value} · {f.label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="muted small">
        1 = I have barely seen it, 5 = I could explain it to someone. "I'm not sure yet" is perfectly fine: Zuno starts neutral and your first recall check settles it fast.
      </p>
    </div>
  )
}

// ---- Proposal ------------------------------------------------------------------------

function Proposal({ draftName, data, onBack, onAccept }: { draftName: string; data: ReturnType<typeof draftToData>; onBack: () => void; onAccept: () => void }) {
  const now = nowMoment()
  const summary = useMemo(() => proposalSummary(data, now), [data, now.date, now.minute]) // eslint-disable-line react-hooks/exhaustive-deps
  const planned = data.sessions.filter((s) => s.status === 'planned')
  const days = useMemo(() => {
    const map = new Map<string, typeof planned>()
    for (const s of planned) {
      if (map.size >= 7 && !map.has(s.date)) break
      map.set(s.date, [...(map.get(s.date) ?? []), s])
    }
    return [...map.entries()].slice(0, 7)
  }, [planned])

  return (
    <div className="app-root onboard">
      <Starfield />
      <main className="onboard__inner" id="main">
        <header className="onboard__top">
          <Wordmark size={30} label={false} />
        </header>
        <div className="panel panel--glow stack stack--lg fade-in">
          <div className="onboard__intro">
            <Astronaut mood="cheer" size={96} />
            <div>
              <p className="eyebrow">Your first plan</p>
              <h1 style={{ fontSize: 'var(--fs-2xl)' }}>{draftName.trim() ? `${draftName.trim()}, here's your plan.` : "Here's your plan."}</h1>
              <p className="muted">{summary.headline}</p>
            </div>
          </div>

          <ul className="banner__list" style={{ fontSize: 'var(--fs-md)' }}>
            {summary.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          {days.length === 0 ? (
            <div className="empty empty--compact">
              <h3>There is no room for sessions yet</h3>
              <p>Go back and add study windows, or check that your exam dates leave time to study.</p>
            </div>
          ) : (
            <div className="stack stack--sm">
              <h2 style={{ fontSize: 'var(--fs-lg)' }}>The first few days</h2>
              <ul className="proposal-days">
                {days.map(([date, list]) => (
                  <li key={date} className="proposal-day">
                    <p className="proposal-day__date">{formatDateWithWeekday(date)}<span className="muted small"> · {formatMinutes(list.reduce((s, x) => s + x.durationMin, 0))}</span></p>
                    <ul className="stack stack--sm">
                      {list.map((s) => {
                        const t = data.topics.find((x) => x.id === s.topicId)!
                        const sub = data.subjects.find((x) => x.id === t.subjectId)!
                        return (
                          <li key={s.id} className="row row--wrap small">
                            <span className="muted" style={{ minWidth: 70 }}>{formatClock(s.startMin)}</span>
                            <strong>{t.name}</strong>
                            <SubjectChip subject={sub} />
                            <span className="muted">{s.durationMin} min</span>
                          </li>
                        )
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
              <p className="muted small">Every number is an estimate. Zuno re-plans after each recall check or skipped session.</p>
            </div>
          )}

          <div className="row row--between row--wrap">
            <button type="button" className="btn btn--ghost" onClick={onBack}>
              <ArrowLeft size={17} aria-hidden="true" /> Adjust my answers
            </button>
            <button type="button" className="btn btn--primary btn--lg" onClick={onAccept}>
              <Check size={18} aria-hidden="true" /> {planned.length === 0 ? 'Continue anyway' : 'Accept this plan'}
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
