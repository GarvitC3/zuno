import { Lightbulb, RotateCcw, Save, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AvailabilityEditor } from '../components/availability/AvailabilityEditor'
import { ChangeBanner } from '../components/ChangeBanner'
import { HowItWorks } from '../components/HowItWorks'
import { Field } from '../components/ui/Field'
import { ConfirmDialog } from '../components/ui/Modal'
import { availabilityWarnings, validateAvailability } from '../domain/onboarding'
import { formatClock, formatDateWithWeekday } from '../engine/time'
import { useActions, useData, useNow, useStorageOk } from '../state/context'
import { navigate } from '../state/router'
import type { Availability } from '../types'

export function Settings() {
  const data = useData()
  const now = useNow()
  const store = useActions()
  const storageOk = useStorageOk()
  const [av, setAv] = useState<Availability>(data.availability)
  const [name, setName] = useState(data.profile.name)
  const [how, setHow] = useState(false)
  const [confirm, setConfirm] = useState<'demo' | 'reset' | 'fresh' | null>(null)
  const [saved, setSaved] = useState(false)

  // Keep the form in step with the store (e.g. after Undo).
  const storedKey = JSON.stringify(data.availability)
  useEffect(() => setAv(data.availability), [storedKey]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setName(data.profile.name), [data.profile.name])

  const errors = useMemo(() => validateAvailability(av), [av])
  const warnings = useMemo(() => availabilityWarnings(av), [av])
  const dirty = JSON.stringify(av) !== storedKey
  const hasErrors = Object.keys(errors).length > 0

  const futureBlocked = data.availability.blockedDates.filter((d) => d >= now.date).sort()
  const futureExtra = data.availability.extraWindows.filter((w) => w.date >= now.date).sort((a, b) => a.date.localeCompare(b.date) || a.startMin - b.startMin)

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings</h1>
          <p>Your profile, study times, and data.</p>
        </div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setHow(true)}>
          <Lightbulb size={15} aria-hidden="true" /> How Zuno thinks
        </button>
      </header>

      <ChangeBanner />

      {!storageOk ? (
        <div className="banner banner--coral" role="alert">
          <div className="banner__body">
            <p className="banner__title">Progress can't be saved in this browser</p>
            <p className="muted small">Browser storage is unavailable or full (a private window can cause this). Zuno still works, but your data will be gone when you close the tab.</p>
          </div>
        </div>
      ) : null}

      <div className="settings-grid">
        <section className="panel stack" aria-labelledby="set-prof">
          <h2 id="set-prof" className="panel__title">Profile</h2>
          <Field label="Your name">
            {(p) => <input {...p} className="input" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} onBlur={() => store.setProfileName(name.trim())} />}
          </Field>
          <label className="check">
            <input type="checkbox" checked={data.settings.timerByDefault} onChange={(e) => store.setTimerEnabled(e.target.checked)} />
            <span>
              <strong>Use the study timer by default</strong>
              <span className="muted small" style={{ display: 'block' }}>You can switch it off for any session.</span>
            </span>
          </label>
        </section>

        <section className="panel stack" aria-labelledby="set-off">
          <h2 id="set-off" className="panel__title">Days off and extra time</h2>
          <p className="muted small">These come from What-If scenarios you applied. Remove one and Zuno re-plans.</p>
          {futureBlocked.length === 0 && futureExtra.length === 0 ? <p className="muted">Nothing set. Try the What-If simulator on the Memory forecast page.</p> : null}
          <ul className="stack stack--sm">
            {futureBlocked.map((dte) => (
              <li key={dte} className="row row--between">
                <span>Day off · {formatDateWithWeekday(dte)}</span>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => store.removeBlockedDate(dte)}>Remove</button>
              </li>
            ))}
            {futureExtra.map((w) => (
              <li key={w.id} className="row row--between">
                <span>Extra time · {formatDateWithWeekday(w.date)}, {formatClock(w.startMin)}–{formatClock(w.endMin)}</span>
                <button type="button" className="btn btn--sm btn--ghost" onClick={() => store.removeExtraWindow(w.id)}>Remove</button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="panel stack stack--lg" aria-labelledby="set-av">
        <div className="panel__head" style={{ marginBottom: 0 }}>
          <div>
            <h2 id="set-av" className="panel__title">Study times</h2>
            <p className="panel__sub">Changing these re-plans your future sessions. Past sessions and recall checks are never touched.</p>
          </div>
        </div>
        <AvailabilityEditor value={av} onChange={(v) => { setAv(v); setSaved(false) }} errors={errors} warnings={warnings} />
        <div className="row row--wrap">
          <button
            type="button"
            className="btn btn--primary"
            disabled={!dirty || hasErrors}
            onClick={() => {
              store.setAvailability(av)
              setSaved(true)
            }}
          >
            <Save size={17} aria-hidden="true" /> Save and re-plan
          </button>
          <button type="button" className="btn btn--ghost" disabled={!dirty} onClick={() => setAv(data.availability)}>
            <RotateCcw size={16} aria-hidden="true" /> Discard edits
          </button>
          {hasErrors && dirty ? <span className="field__error" role="alert">Fix the highlighted fields to save.</span> : null}
          {saved && !dirty ? <span className="status status--strong" role="status">Saved. Your plan has been recalculated.</span> : null}
        </div>
      </section>

      <section className="panel stack" aria-labelledby="set-data">
        <h2 id="set-data" className="panel__title">Your data</h2>
        {data.profile.isSample ? (
          <p className="banner banner--mint" style={{ display: 'block' }}>
            You are exploring <strong>sample data</strong>: a made-up student called Maya with two weeks of history. Nothing here is real.
          </p>
        ) : null}
        <p className="muted small">Everything is stored only in this browser. No account, no server.</p>
        <div className="row row--wrap">
          <button type="button" className="btn" onClick={() => (data.onboarded && !data.profile.isSample ? setConfirm('demo') : (store.loadDemo(), navigate('/')))}>
            <Sparkles size={16} aria-hidden="true" /> {data.profile.isSample ? 'Reload the sample student' : 'Load sample data'}
          </button>
          {data.profile.isSample ? (
            <button type="button" className="btn" onClick={() => setConfirm('fresh')}>Start with my own subjects</button>
          ) : null}
          <button type="button" className="btn btn--danger" onClick={() => setConfirm('reset')}>
            <Trash2 size={16} aria-hidden="true" /> Reset everything
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirm === 'demo'}
        title="Replace your data with the sample student?"
        message="This swaps your subjects, plan and recall checks for the labelled sample student. Your own data will be lost unless you have it somewhere else. This can't be undone."
        confirmLabel="Replace with sample data"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); store.loadDemo(); navigate('/') }}
      />
      <ConfirmDialog
        open={confirm === 'fresh'}
        title="Leave the sample and start fresh?"
        message="The sample student will be cleared, then you'll set up your own subjects and week."
        confirmLabel="Clear sample and set up"
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); store.reset(); navigate('/setup') }}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Reset everything?"
        message="This deletes your subjects, topics, plan, sessions, recall-check history and settings from this browser. It can't be undone."
        confirmLabel="Delete everything"
        destructive
        onCancel={() => setConfirm(null)}
        onConfirm={() => { setConfirm(null); store.reset(); navigate('/') }}
      />
      <HowItWorks open={how} onClose={() => setHow(false)} data={data} now={now} />
    </>
  )
}
