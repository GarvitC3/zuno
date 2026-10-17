import { useMemo } from 'react'
import { GROUP_LABEL, betaStdDev, durationGroup, isInitialEstimate, observationCount, pComplete } from '../engine/completion'
import { ENGINE as E } from '../engine/config'
import { recallAt, projectionMemory } from '../engine/memory'
import { momentToAbs, type LocalMoment } from '../engine/time'
import type { AppData } from '../types'
import { Modal } from './ui/Modal'
import { pct } from './session-ui'

/**
 * "How Zuno thinks": the three pieces of maths, with live numbers from the
 * student's own data (or plain definitions when there is no data yet).
 */
export function HowItWorks({ open, onClose, data, now, topicId }: { open: boolean; onClose: () => void; data: AppData; now: LocalMoment; topicId?: string }) {
  const topic = data.topics.find((t) => t.id === topicId) ?? data.topics[0]
  const live = useMemo(() => {
    if (!topic) return null
    const mem = projectionMemory(topic.memory, topic.struggling)
    return { topic, mem, rNow: recallAt(mem, momentToAbs(now)) }
  }, [topic, now])
  const sessionMin = data.availability.preferredSessionMin
  const group = durationGroup(sessionMin)
  const beta = data.completion[group]
  return (
    <Modal open={open} onClose={onClose} title="How Zuno thinks" description="Three small models work together. Every number below is an estimate, not a promise." wide>
      <div className="stack">
        <section className="stack--sm stack">
          <h3 style={{ fontSize: 'var(--fs-lg)' }}>1. What you remember</h3>
          <p className="muted">
            Memory fades over time. Zuno models the chance you can recall a topic as{' '}
            <span className="math">R(t) = A · e<sup>−t/S</sup></span>
          </p>
          <ul className="kbd-list muted small">
            <li><span className="math">A</span> recall right after your latest recall check (or starting estimate)</li>
            <li><span className="math">t</span> days since then</li>
            <li><span className="math">S</span> memory stability in days: bigger means slower forgetting</li>
          </ul>
          <p className="muted small">
            A recall check of <em>k</em> correct out of <em>n</em> updates <span className="math">A</span> as a weighted average of what the model expected and what you scored:{' '}
            <span className="math">A_new = (n₀·R_before + k) / (n₀ + n)</span> with <span className="math">n₀ = {E.PRIOR_STRENGTH}</span>. Stability grows after strong results and stays short after weak ones.
            These constants are sensible starting assumptions, not scientifically calibrated values.
          </p>
          {live ? (
            <p className="banner banner--plain" style={{ padding: 'var(--s-3) var(--s-4)' }}>
              <span className="small">
                <strong>{live.topic.name}</strong>: A = {pct(live.mem.recall)}, S = {live.mem.stability.toFixed(1)} days → estimated recall today R = <strong>{pct(live.rNow)}</strong>
                {live.topic.struggling ? ' (stability reduced because you flagged it)' : ''}
              </span>
            </p>
          ) : null}
        </section>

        <hr className="divider" />

        <section className="stack stack--sm">
          <h3 style={{ fontSize: 'var(--fs-lg)' }}>2. How likely you are to finish a session</h3>
          <p className="muted">
            Not every planned session happens. For each session length group Zuno keeps a Beta(α, β) belief and uses{' '}
            <span className="math">p = α / (α + β)</span>. Completed sessions add to α, skipped ones add to β, partial ones add fractions of each (a pragmatic approximation).
          </p>
          <p className="banner banner--plain" style={{ padding: 'var(--s-3) var(--s-4)' }}>
            <span className="small">
              For {sessionMin}-minute sessions ({GROUP_LABEL[group]}): α = {beta.alpha.toFixed(1)}, β = {beta.beta.toFixed(1)} → p = <strong>{pct(pComplete(data.completion, sessionMin))}</strong> ± {pct(betaStdDev(beta))}
              {isInitialEstimate(data.completion, group)
                ? ` — still an initial estimate (${observationCount(data.completion, group)} real sessions so far; new users start from an assumed average).`
                : ` — learned from ${observationCount(data.completion, group)} of your sessions.`}
            </span>
          </p>
        </section>

        <hr className="divider" />

        <section className="stack stack--sm">
          <h3 style={{ fontSize: 'var(--fs-lg)' }}>3. What to study next</h3>
          <p className="muted">
            For each possible session Zuno asks how much it would raise your recall <em>on exam day</em>, given the sessions already planned:
          </p>
          <p className="math math-block">
            score = importance × P(complete) × Δ(exam-day recall) ÷ minutes
          </p>
          <p className="muted small">
            It fills your real free time (outside commitments, inside your study windows, before each exam) by repeatedly picking the highest score and then
            recomputing gains so the same benefit is never counted twice. This greedy method aims to improve the objective but does not guarantee the single best plan.
            A review is assumed to lift recall part of the way towards {pct(E.REVIEW_CEILING)}, never to 100%.
          </p>
        </section>
      </div>
    </Modal>
  )
}
