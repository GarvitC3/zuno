import { ChevronDown, ClipboardCheck, Flag, Pencil, Plus, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Astronaut } from '../components/brand/Astronaut'
import { Planet } from '../components/brand/Planet'
import { ChangeBanner } from '../components/ChangeBanner'
import { Field } from '../components/ui/Field'
import { RecallMeter, StatusLabel } from '../components/ui/Meter'
import { ConfirmDialog, Modal } from '../components/ui/Modal'
import { pct } from '../components/session-ui'
import { IMPORTANCE_LABEL, type TopicInsight } from '../engine/insights'
import { addDays, diffDays, formatClock, formatDateShort, formatDateWithWeekday, fromAbs, isValidDateKey, relativeDay, type LocalMoment } from '../engine/time'
import { useActions, useData, useDerived, useNow } from '../state/context'
import type { AppData, Familiarity, Importance, Subject, Topic } from '../types'

type Dialog =
  | { kind: 'subject'; subject?: Subject }
  | { kind: 'topic'; subjectId: string; topic?: Topic }
  | { kind: 'check'; topic: Topic }
  | { kind: 'delete-subject'; subject: Subject }
  | { kind: 'delete-topic'; topic: Topic }
  | null

export function Subjects() {
  const data = useData()
  const now = useNow()
  const d = useDerived(data, now)
  const store = useActions()
  const [dialog, setDialog] = useState<Dialog>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const insightsBySubject = useMemo(() => {
    const m = new Map<string, TopicInsight[]>()
    for (const i of d.insights) m.set(i.subject.id, [...(m.get(i.subject.id) ?? []), i])
    return m
  }, [d.insights])

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Subjects</h1>
          <p>Every subject, its exam, and how each topic is holding up.</p>
        </div>
        <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'subject' })}>
          <Plus size={18} aria-hidden="true" /> Add subject
        </button>
      </header>

      <ChangeBanner />

      {data.subjects.length === 0 ? (
        <section className="panel empty">
          <Astronaut mood="wave" size={110} />
          <h3>No subjects yet</h3>
          <p>Add a subject, its exam date and its topics. Zuno will plan study time around them.</p>
          <button type="button" className="btn btn--primary" onClick={() => setDialog({ kind: 'subject' })}>
            <Plus size={18} aria-hidden="true" /> Add your first subject
          </button>
        </section>
      ) : null}

      <div className="stack stack--lg">
        {data.subjects.map((s) => {
          const list = insightsBySubject.get(s.id) ?? []
          const exam = data.exams.find((e) => e.subjectId === s.id)
          const daysLeft = exam ? diffDays(now.date, exam.date) : null
          const wsum = list.reduce((a, i) => a + i.topic.importance, 0)
          const avg = wsum ? list.reduce((a, i) => a + i.topic.importance * i.recallNow, 0) / wsum : null
          const open = !collapsed[s.id]
          return (
            <section key={s.id} className="panel panel--flush subject" data-color={s.color} aria-labelledby={`sub-${s.id}`}>
              <div className="subject__head">
                <button
                  type="button"
                  className="subject__toggle"
                  aria-expanded={open}
                  aria-controls={`topics-${s.id}`}
                  onClick={() => setCollapsed((c) => ({ ...c, [s.id]: open }))}
                >
                  <Planet color={s.color} size={44} ring={s.color === 'peach'} />
                  <span className="subject__title">
                    <h2 id={`sub-${s.id}`} style={{ fontSize: 'var(--fs-xl)' }}>{s.name}</h2>
                    <span className="muted small">
                      {list.length} {list.length === 1 ? 'topic' : 'topics'}
                      {avg !== null ? ` · average recall ${pct(avg)}` : ''}
                    </span>
                  </span>
                  <ChevronDown size={20} aria-hidden="true" className="subject__chev" />
                </button>
                <div className="row row--wrap subject__meta">
                  {exam ? (
                    <span className={`chip ${daysLeft !== null && daysLeft >= 0 ? 'chip--peach' : ''}`}>
                      {daysLeft !== null && daysLeft < 0 ? 'Exam finished' : `Exam ${formatDateWithWeekday(exam.date)}`}
                      {daysLeft !== null && daysLeft >= 0 ? ` · ${daysLeft === 0 ? 'today' : `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`}` : ''}
                    </span>
                  ) : null}
                  <button type="button" className="icon-btn" aria-label={`Edit ${s.name}`} onClick={() => setDialog({ kind: 'subject', subject: s })}><Pencil size={18} /></button>
                  <button type="button" className="icon-btn" aria-label={`Delete ${s.name}`} onClick={() => setDialog({ kind: 'delete-subject', subject: s })}><Trash2 size={18} /></button>
                </div>
              </div>

              {open ? (
                <div id={`topics-${s.id}`} className="subject__body">
                  {list.length === 0 ? (
                    <div className="empty empty--compact">
                      <h3>No topics in {s.name} yet</h3>
                      <p>Add the topics you need to learn. Each one gets its own recall estimate and review plan.</p>
                    </div>
                  ) : (
                    <>
                      <div className="thead" aria-hidden="true">
                        <span>Topic</span><span>Importance</span><span>Estimated recall</span><span>Last review</span><span>Next review</span><span>Recent checks</span><span />
                      </div>
                      <ul className="topics">
                        {list.map((i) => (
                          <TopicRow key={i.topic.id} i={i} data={data} now={now} onCheck={() => setDialog({ kind: 'check', topic: i.topic })} onEdit={() => setDialog({ kind: 'topic', subjectId: s.id, topic: i.topic })} onDelete={() => setDialog({ kind: 'delete-topic', topic: i.topic })} onFlag={() => store.toggleStruggle(i.topic.id)} />
                        ))}
                      </ul>
                    </>
                  )}
                  <div className="subject__foot">
                    <button type="button" className="btn btn--sm" onClick={() => setDialog({ kind: 'topic', subjectId: s.id })}>
                      <Plus size={15} aria-hidden="true" /> Add topic
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          )
        })}
      </div>

      <SubjectDialog open={dialog?.kind === 'subject'} subject={dialog?.kind === 'subject' ? dialog.subject : undefined} data={data} now={now} onClose={() => setDialog(null)} />
      <TopicDialog open={dialog?.kind === 'topic'} subjectId={dialog?.kind === 'topic' ? dialog.subjectId : ''} topic={dialog?.kind === 'topic' ? dialog.topic : undefined} data={data} onClose={() => setDialog(null)} />
      <CheckDialog open={dialog?.kind === 'check'} topic={dialog?.kind === 'check' ? dialog.topic : undefined} onClose={() => setDialog(null)} />
      <ConfirmDialog
        open={dialog?.kind === 'delete-subject'}
        destructive
        title={dialog?.kind === 'delete-subject' ? `Delete ${dialog.subject.name}?` : ''}
        message={
          dialog?.kind === 'delete-subject' ? (
            <DeleteSubjectNote data={data} subject={dialog.subject} />
          ) : null
        }
        confirmLabel="Delete subject"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete-subject') store.deleteSubject(dialog.subject.id)
          setDialog(null)
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'delete-topic'}
        destructive
        title={dialog?.kind === 'delete-topic' ? `Delete ${dialog.topic.name}?` : ''}
        message={dialog?.kind === 'delete-topic' ? <DeleteTopicNote data={data} topic={dialog.topic} /> : null}
        confirmLabel="Delete topic"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'delete-topic') store.deleteTopic(dialog.topic.id)
          setDialog(null)
        }}
      />
    </>
  )
}

function DeleteSubjectNote({ data, subject }: { data: AppData; subject: Subject }) {
  const ids = data.topics.filter((t) => t.subjectId === subject.id).map((t) => t.id)
  const sessions = data.sessions.filter((s) => ids.includes(s.topicId) && s.status === 'planned').length
  const quizzes = data.quizzes.filter((q) => ids.includes(q.topicId)).length
  return (
    <p>
      This removes {subject.name}, its {ids.length} {ids.length === 1 ? 'topic' : 'topics'}, {sessions} planned {sessions === 1 ? 'session' : 'sessions'}, and {quizzes} recall-check {quizzes === 1 ? 'result' : 'results'} from your history. You can undo right after, but not once you leave this page.
    </p>
  )
}
function DeleteTopicNote({ data, topic }: { data: AppData; topic: Topic }) {
  const sessions = data.sessions.filter((s) => s.topicId === topic.id && s.status === 'planned').length
  const quizzes = data.quizzes.filter((q) => q.topicId === topic.id).length
  return (
    <p>
      This removes {topic.name}, its {sessions} planned {sessions === 1 ? 'session' : 'sessions'}, and {quizzes} recall-check {quizzes === 1 ? 'result' : 'results'}. You can undo right after.
    </p>
  )
}

function TopicRow({ i, now, onCheck, onEdit, onDelete, onFlag }: { i: TopicInsight; data: AppData; now: LocalMoment; onCheck: () => void; onEdit: () => void; onDelete: () => void; onFlag: () => void }) {
  const t = i.topic
  const last = i.lastReviewAbs !== null ? fromAbs(i.lastReviewAbs) : null
  const lastDays = last ? diffDays(last.date, now.date) : null
  return (
    <li className="trow" data-color={i.subject.color}>
      <div className="trow__name">
        <strong>{t.name}</strong>
        {t.struggling ? <span className="status status--fading"><Flag size={13} aria-hidden="true" /> Flagged as a struggle</span> : null}
        {i.examPassed ? <span className="muted small">Exam finished</span> : null}
      </div>
      <dl className="trow__facts">
        <div>
          <dt>Importance</dt>
          <dd>
            <span className="dots" role="img" aria-label={`Importance ${t.importance} of 5`}>
              {[1, 2, 3, 4, 5].map((n) => <span key={n} className="dots__dot" data-on={n <= t.importance} />)}
            </span>
            <span className="small">{IMPORTANCE_LABEL[t.importance]}</span>
          </dd>
        </div>
        <div>
          <dt>Estimated recall</dt>
          <dd className="recall-cell">
            <RecallMeter value={i.recallNow} status={i.status} label={`${t.name} estimated recall`} />
            <span className="row row--between small"><StatusLabel status={i.status} /><strong>{pct(i.recallNow)}</strong></span>
          </dd>
        </div>
        <div>
          <dt>Last review</dt>
          <dd className="small">
            {last ? <>{formatDateShort(last.date)}<span className="muted"> · {lastDays === 0 ? 'today' : lastDays === 1 ? 'yesterday' : `${lastDays} days ago`}</span></> : <span className="muted">Not yet</span>}
          </dd>
        </div>
        <div>
          <dt>Next planned review</dt>
          <dd className="small">
            {i.nextSession ? <>{relativeDay(i.nextSession.date, now.date)[0].toUpperCase() + relativeDay(i.nextSession.date, now.date).slice(1)}<span className="muted"> · {formatClock(i.nextSession.startMin)}</span></> : <span className="muted">{i.examPassed ? 'None' : 'None planned'}</span>}
          </dd>
        </div>
        <div>
          <dt>Recent recall checks</dt>
          <dd className="row row--wrap">
            {i.recentQuizzes.length === 0 ? <span className="muted small">No checks yet</span> : i.recentQuizzes.map((q) => (
              <span key={q.id} className="chip" title={`${formatDateShort(fromAbs(q.atAbs).date)}`}>{q.correct}/{q.total} <span className="muted">· {formatDateShort(fromAbs(q.atAbs).date)}</span></span>
            ))}
          </dd>
        </div>
      </dl>
      <div className="trow__actions">
        <button type="button" className="btn btn--sm" aria-pressed={t.struggling} onClick={onFlag} title="Tell Zuno this topic is hard for you">
          <Flag size={15} aria-hidden="true" /> {t.struggling ? 'Struggling' : "I'm struggling"}
        </button>
        <button type="button" className="btn btn--sm" onClick={onCheck}><ClipboardCheck size={15} aria-hidden="true" /> Log a check</button>
        <button type="button" className="icon-btn" aria-label={`Edit ${t.name}`} onClick={onEdit}><Pencil size={18} /></button>
        <button type="button" className="icon-btn" aria-label={`Delete ${t.name}`} onClick={onDelete}><Trash2 size={18} /></button>
      </div>
    </li>
  )
}

// ---- Dialogs ---------------------------------------------------------------------------

function SubjectDialog({ open, subject, data, now, onClose }: { open: boolean; subject?: Subject; data: AppData; now: LocalMoment; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={subject ? `Edit ${subject.name}` : 'Add a subject'}>
      {open ? <SubjectForm subject={subject} data={data} now={now} onClose={onClose} /> : null}
    </Modal>
  )
}

function SubjectForm({ subject, data, now, onClose }: { subject?: Subject; data: AppData; now: LocalMoment; onClose: () => void }) {
  const store = useActions()
  const exam = subject ? data.exams.find((e) => e.subjectId === subject.id) : undefined
  const [name, setName] = useState(subject?.name ?? '')
  const [date, setDate] = useState(exam?.date ?? '')
  const [touched, setTouched] = useState(false)
  const trimmed = name.trim()
  const nameErr = !trimmed ? 'Give this subject a name.' : data.subjects.some((s) => s.id !== subject?.id && s.name.toLowerCase() === trimmed.toLowerCase()) ? `You already have a subject called ${trimmed}.` : undefined
  const dateErr = !date ? 'Pick the exam date.' : !isValidDateKey(date) ? 'That date does not look right.' : !subject && diffDays(now.date, date) < 1 ? 'Pick a date after today so there is time to study.' : diffDays(now.date, date) > 365 ? 'That is more than a year away.' : undefined
  const passed = !!date && isValidDateKey(date) && diffDays(now.date, date) < 0
  const submit = () => {
    setTouched(true)
    if (nameErr || dateErr) return
    const err = store.saveSubject({ id: subject?.id, name: trimmed, examDate: date })
    if (!err) onClose()
  }
  return (
    <form
      className="stack"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Field label="Subject name" error={touched ? nameErr : undefined}>
        {(p) => <input {...p} autoFocus className="input" value={name} maxLength={40} placeholder="e.g. Biology" onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Exam date" error={touched ? dateErr : undefined} warn={passed ? 'This date has passed. Zuno will stop planning sessions for this subject.' : undefined}>
        {(p) => <input {...p} type="date" className="input" value={date} min={subject ? undefined : addDays(now.date, 1)} onChange={(e) => setDate(e.target.value)} />}
      </Field>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--primary">{subject ? 'Save changes' : 'Add subject'}</button>
      </div>
    </form>
  )
}

function TopicDialog({ open, subjectId, topic, data, onClose }: { open: boolean; subjectId: string; topic?: Topic; data: AppData; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={topic ? `Edit ${topic.name}` : 'Add a topic'}>
      {open ? <TopicForm subjectId={subjectId} topic={topic} data={data} onClose={onClose} /> : null}
    </Modal>
  )
}

const FAM_LABEL: Record<number, string> = { 1: 'New to me', 2: 'Heard of it', 3: 'Getting there', 4: 'Pretty solid', 5: 'Confident' }

function TopicForm({ subjectId, topic, data, onClose }: { subjectId: string; topic?: Topic; data: AppData; onClose: () => void }) {
  const store = useActions()
  const [name, setName] = useState(topic?.name ?? '')
  const [importance, setImportance] = useState<Importance>(topic?.importance ?? 3)
  const [fam, setFam] = useState<string>('')
  const [touched, setTouched] = useState(false)
  const trimmed = name.trim()
  const dup = data.topics.some((t) => t.id !== topic?.id && t.subjectId === subjectId && t.name.toLowerCase() === trimmed.toLowerCase())
  const nameErr = !trimmed ? 'Name this topic.' : dup ? `"${trimmed}" is already in this subject.` : undefined
  const submit = () => {
    setTouched(true)
    if (nameErr) return
    const err = store.saveTopic({ id: topic?.id, subjectId, name: trimmed, importance, familiarity: fam === '' ? null : (Number(fam) as Familiarity) })
    if (!err) onClose()
  }
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <Field label="Topic name" error={touched ? nameErr : undefined}>
        {(p) => <input {...p} autoFocus className="input" value={name} maxLength={50} placeholder="e.g. Photosynthesis" onChange={(e) => setName(e.target.value)} />}
      </Field>
      <Field label="Importance" hint="How much this topic matters for the exam. Zuno gives more time to higher ratings.">
        {(p) => (
          <select {...p} className="select" value={importance} onChange={(e) => setImportance(Number(e.target.value) as Importance)}>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {IMPORTANCE_LABEL[n]}</option>)}
          </select>
        )}
      </Field>
      {!topic ? (
        <Field label="How well do you know it today?" hint="A rough starting estimate. Recall checks will refine it.">
          {(p) => (
            <select {...p} className="select" value={fam} onChange={(e) => setFam(e.target.value)}>
              <option value="">I'm not sure yet</option>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {FAM_LABEL[n]}</option>)}
            </select>
          )}
        </Field>
      ) : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--primary">{topic ? 'Save changes' : 'Add topic'}</button>
      </div>
    </form>
  )
}

function CheckDialog({ open, topic, onClose }: { open: boolean; topic?: Topic; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={topic ? `Log a recall check: ${topic.name}` : 'Log a recall check'} description="Test yourself without looking, then record how it went.">
      {open && topic ? <CheckForm topic={topic} onClose={onClose} /> : null}
    </Modal>
  )
}

function CheckForm({ topic, onClose }: { topic: Topic; onClose: () => void }) {
  const store = useActions()
  const [correct, setCorrect] = useState('')
  const [total, setTotal] = useState('5')
  const [touched, setTouched] = useState(false)
  const [serverErr, setServerErr] = useState<string | null>(null)
  const k = Number(correct)
  const n = Number(total)
  const totalErr = !Number.isInteger(n) || n < 1 || n > 20 ? 'Enter how many questions you answered (1 to 20).' : undefined
  const correctErr = correct === '' ? 'Enter how many you got right.' : !Number.isInteger(k) || k < 0 ? 'Enter a whole number, 0 or more.' : !totalErr && k > n ? `You can't get more than ${n} right out of ${n}.` : undefined
  const submit = () => {
    setTouched(true)
    if (correctErr || totalErr) return
    const out = store.recordManualQuiz({ topicId: topic.id, correct: k, total: n })
    if (out.error) setServerErr(out.error.message)
    else onClose()
  }
  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); submit() }}>
      <p className="muted small">
        Try 3 to 5 practice questions from your notes, textbook or a past paper. Don't look anything up. Then enter how many you got right. Zuno uses the result to update its estimate and re-plan.
      </p>
      <div className="grid-2">
        <Field label="Correct answers" error={touched ? correctErr : undefined}>
          {(p) => <input {...p} autoFocus className="input" type="number" min={0} inputMode="numeric" value={correct} onChange={(e) => { setCorrect(e.target.value); setServerErr(null) }} />}
        </Field>
        <Field label="Out of" error={touched ? totalErr : undefined}>
          {(p) => <input {...p} className="input" type="number" min={1} max={20} inputMode="numeric" value={total} onChange={(e) => { setTotal(e.target.value); setServerErr(null) }} />}
        </Field>
      </div>
      {serverErr ? <p className="field__error" role="alert">{serverErr}</p> : null}
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
        <button type="submit" className="btn btn--primary">Save result</button>
      </div>
      <p className="muted small">Zuno weighs your score against what it already believed about this topic, so one result nudges the estimate rather than replacing it.</p>
    </form>
  )
}

