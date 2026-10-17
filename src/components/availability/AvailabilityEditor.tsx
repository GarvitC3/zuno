import { Plus, Trash2 } from 'lucide-react'
import type { Availability, Commitment, CommitmentKind, StudyWindow } from '../../types'
import { uid } from '../../engine/ids'
import { inputToMinutes, minutesToInput, weekdayLong, weekdayShort } from '../../engine/time'
import type { FormErrors } from '../../domain/onboarding'
import { ErrorText, Field } from '../ui/Field'

const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]
const KINDS: { value: CommitmentKind; label: string }[] = [
  { value: 'school', label: 'School' },
  { value: 'work', label: 'Work' },
  { value: 'practice', label: 'Practice / activity' },
  { value: 'meals', label: 'Meals' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'other', label: 'Other' },
]

function DayChips({ days, onChange, label }: { days: number[]; onChange: (d: number[]) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="day-chips">
      {MON_FIRST.map((d) => (
        <button
          key={d}
          type="button"
          className="day-chip"
          aria-pressed={days.includes(d)}
          aria-label={weekdayLong(d)}
          onClick={() => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort())}
        >
          {weekdayShort(d)}
        </button>
      ))}
    </div>
  )
}

function TimeField({ label, value, onChange, error }: { label: string; value: number; onChange: (m: number) => void; error?: string }) {
  return (
    <Field label={label} error={error}>
      {(p) => (
        <input
          {...p}
          type="time"
          step={300}
          className="input"
          value={minutesToInput(value)}
          onChange={(e) => {
            const m = inputToMinutes(e.target.value)
            if (m !== null) onChange(m)
          }}
        />
      )}
    </Field>
  )
}

interface Props {
  value: Availability
  onChange: (next: Availability) => void
  errors: FormErrors
  warnings?: FormErrors
}

const SESSION_LENGTHS = [20, 25, 30, 40, 45, 60, 75, 90]
const BREAKS = [0, 5, 10, 15, 20]
const DAILY = [30, 45, 60, 90, 120, 150, 180, 240, 300]

export function AvailabilityEditor({ value, onChange, errors, warnings = {} }: Props) {
  const set = (patch: Partial<Availability>) => onChange({ ...value, ...patch })
  const setWindow = (id: string, patch: Partial<StudyWindow>) => set({ windows: value.windows.map((w) => (w.id === id ? { ...w, ...patch } : w)) })
  const setCommit = (id: string, patch: Partial<Commitment>) => set({ commitments: value.commitments.map((c) => (c.id === id ? { ...c, ...patch } : c)) })

  const addWindow = (days: number[], startMin: number, endMin: number) =>
    set({ windows: [...value.windows, { id: uid('win'), days, startMin, endMin }] })
  const addCommit = (c: Omit<Commitment, 'id'>) => set({ commitments: [...value.commitments, { ...c, id: uid('com') }] })

  const lengths = [...new Set([...SESSION_LENGTHS, value.preferredSessionMin])].sort((a, b) => a - b)
  const dailies = [...new Set([...DAILY, value.maxDailyMin])].sort((a, b) => a - b)

  return (
    <div className="stack stack--lg">
      <section className="stack" aria-labelledby="ae-win">
        <h3 id="ae-win" style={{ fontSize: 'var(--fs-lg)' }}>When could you study?</h3>
        <ErrorText id="ae-win-err">{errors.windows}</ErrorText>
        <ul className="stack">
          {value.windows.map((w, i) => (
            <li key={w.id} className="editor-row">
              <div className="editor-row__head">
                <strong className="small">Study window {i + 1}</strong>
                <button type="button" className="icon-btn" aria-label={`Remove study window ${i + 1}`} onClick={() => set({ windows: value.windows.filter((x) => x.id !== w.id) })}>
                  <Trash2 size={18} />
                </button>
              </div>
              <DayChips days={w.days} onChange={(days) => setWindow(w.id, { days })} label={`Days for study window ${i + 1}`} />
              <div className="grid-2">
                <TimeField label="From" value={w.startMin} onChange={(m) => setWindow(w.id, { startMin: m })} />
                <TimeField label="To" value={w.endMin} onChange={(m) => setWindow(w.id, { endMin: m })} />
              </div>
              <ErrorText>{errors[`window:${w.id}`]}</ErrorText>
              {!errors[`window:${w.id}`] && warnings[`window:${w.id}`] ? <p className="field__warn">{warnings[`window:${w.id}`]}</p> : null}
            </li>
          ))}
        </ul>
        <div className="row row--wrap">
          <button type="button" className="btn btn--sm" onClick={() => addWindow([1, 2, 3, 4, 5], 16 * 60, 18 * 60 + 30)}>
            <Plus size={15} aria-hidden="true" /> Weekdays 4:00–6:30 PM
          </button>
          <button type="button" className="btn btn--sm" onClick={() => addWindow([1, 2, 3, 4, 5], 19 * 60 + 30, 21 * 60)}>
            <Plus size={15} aria-hidden="true" /> Weekday evenings 7:30–9:00 PM
          </button>
          <button type="button" className="btn btn--sm" onClick={() => addWindow([6, 0], 10 * 60, 13 * 60)}>
            <Plus size={15} aria-hidden="true" /> Weekends 10:00 AM–1:00 PM
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => addWindow([1, 2, 3, 4, 5], 16 * 60, 17 * 60)}>
            <Plus size={15} aria-hidden="true" /> Custom window
          </button>
        </div>
      </section>

      <section className="stack" aria-labelledby="ae-com">
        <h3 id="ae-com" style={{ fontSize: 'var(--fs-lg)' }}>What is already taken?</h3>
        <ul className="stack">
          {value.commitments.filter((c) => !c.onDate).map((c) => (
            <li key={c.id} className="editor-row">
              <div className="editor-row__head">
                <strong className="small">{c.label || 'Commitment'}</strong>
                <button type="button" className="icon-btn" aria-label={`Remove ${c.label || 'commitment'}`} onClick={() => set({ commitments: value.commitments.filter((x) => x.id !== c.id) })}>
                  <Trash2 size={18} />
                </button>
              </div>
              <div className="grid-2">
                <Field label="Name">{(p) => <input {...p} className="input" value={c.label} maxLength={40} onChange={(e) => setCommit(c.id, { label: e.target.value })} />}</Field>
                <Field label="Type">
                  {(p) => (
                    <select {...p} className="select" value={c.kind} onChange={(e) => setCommit(c.id, { kind: e.target.value as CommitmentKind })}>
                      {KINDS.map((k) => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                      ))}
                    </select>
                  )}
                </Field>
              </div>
              <DayChips days={c.days} onChange={(days) => setCommit(c.id, { days })} label={`Days for ${c.label || 'commitment'}`} />
              <div className="grid-2">
                <TimeField label="From" value={c.startMin} onChange={(m) => setCommit(c.id, { startMin: m })} />
                <TimeField label="To" value={c.endMin} onChange={(m) => setCommit(c.id, { endMin: m })} />
              </div>
              {c.endMin <= c.startMin && c.endMin !== c.startMin ? <p className="muted small">Ends the next morning.</p> : null}
              <ErrorText>{errors[`commitment:${c.id}`]}</ErrorText>
            </li>
          ))}
        </ul>
        <div className="row row--wrap">
          <button type="button" className="btn btn--sm" onClick={() => addCommit({ label: 'School', kind: 'school', days: [1, 2, 3, 4, 5], startMin: 8 * 60 + 30, endMin: 15 * 60 + 30 })}>
            <Plus size={15} aria-hidden="true" /> School
          </button>
          <button type="button" className="btn btn--sm" onClick={() => addCommit({ label: 'Sleep', kind: 'sleep', days: [0, 1, 2, 3, 4, 5, 6], startMin: 23 * 60, endMin: 7 * 60 })}>
            <Plus size={15} aria-hidden="true" /> Sleep
          </button>
          <button type="button" className="btn btn--sm" onClick={() => addCommit({ label: 'Dinner', kind: 'meals', days: [0, 1, 2, 3, 4, 5, 6], startMin: 18 * 60 + 30, endMin: 19 * 60 + 30 })}>
            <Plus size={15} aria-hidden="true" /> Dinner
          </button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => addCommit({ label: '', kind: 'other', days: [1, 3], startMin: 17 * 60, endMin: 18 * 60 })}>
            <Plus size={15} aria-hidden="true" /> Something else
          </button>
        </div>
      </section>

      <section className="stack" aria-labelledby="ae-pref">
        <h3 id="ae-pref" style={{ fontSize: 'var(--fs-lg)' }}>How you like to study</h3>
        <div className="grid-3">
          <Field label="Preferred session length" error={errors.session}>
            {(p) => (
              <select {...p} className="select" value={value.preferredSessionMin} onChange={(e) => set({ preferredSessionMin: Number(e.target.value) })}>
                {lengths.map((l) => (
                  <option key={l} value={l}>{l} minutes</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Break between sessions" error={errors.break}>
            {(p) => (
              <select {...p} className="select" value={value.breakMin} onChange={(e) => set({ breakMin: Number(e.target.value) })}>
                {BREAKS.map((b) => (
                  <option key={b} value={b}>{b === 0 ? 'No break' : `${b} minutes`}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Daily limit" error={errors.daily}>
            {(p) => (
              <select {...p} className="select" value={value.maxDailyMin} onChange={(e) => set({ maxDailyMin: Number(e.target.value) })}>
                {dailies.map((m) => (
                  <option key={m} value={m}>{m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} minutes`}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <ErrorText>{errors.capacity}</ErrorText>
      </section>
    </div>
  )
}
