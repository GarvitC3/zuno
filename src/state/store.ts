/**
 * Zuno application store — framework-free so it can be tested without React.
 *
 * - `data` is persisted AppData.
 * - `ui` is transient: last plan change, the undo stack, a toast, a load notice.
 * - Every mutating action calls a pure operation from src/domain, then `apply`.
 *
 * Undo: reversible operations push the previous AppData on a short stack.
 * Operations that write quiz history or close a session (finishSession,
 * recordManualQuiz, startFresh, loadDemo) clear the stack, so Undo can never
 * erase a recall check or move a completed session.
 */
import type {
  AppData,
  Availability,
  ChangeSummary,
  QuizResult,
} from '../types'
import { createDemoData } from '../data/demo'
import * as ops from '../domain/ops'
import type { FinishInput, FinishOutput, OpError, OpOutput, SubjectInput, TopicInput } from '../domain/ops'
import { replan } from '../engine/plan'
import type { WhatIfOp } from '../engine/whatif'
import type { LocalMoment } from '../engine/time'
import { clearData, emptyData, loadData, saveData, type StorageLike } from './persistence'

export interface Toast {
  id: number
  message: string
  undoable: boolean
}

export interface UiState {
  change: ChangeSummary | null
  /** Epoch ms when `change` was created. */
  changeAt: number
  undo: AppData[]
  toast: Toast | null
  notice: string | null
}

export interface StoreState {
  data: AppData
  ui: UiState
  storageOk: boolean
}

export interface StoreOptions {
  storage: StorageLike | null
  clock: () => LocalMoment
  /** Epoch-ms clock, injectable for tests. */
  nowMs?: () => number
}

const MAX_UNDO = 10

export function createStore(options: StoreOptions) {
  const { storage, clock } = options
  const nowMs = options.nowMs ?? (() => Date.now())
  const listeners = new Set<() => void>()
  let toastSeq = 0

  const loaded = loadData(storage)
  let state: StoreState = {
    data: loaded.data ?? emptyData(),
    ui: { change: null, changeAt: 0, undo: [], toast: null, notice: loaded.status === 'recovered' ? (loaded.message ?? null) : null },
    storageOk: loaded.status !== 'unavailable' && storage !== null,
  }

  const emit = () => listeners.forEach((l) => l())

  function set(next: StoreState, persist = true) {
    const dataChanged = next.data !== state.data
    state = next
    if (persist && dataChanged && state.data.onboarded) {
      const ok = saveData(state.data, storage)
      if (!ok && storage) state = { ...state, storageOk: false }
    }
    emit()
  }

  const toast = (message: string, undoable: boolean): Toast => ({ id: ++toastSeq, message, undoable })

  /** Apply an operation's output to the store. */
  function apply(out: OpOutput, opts: { clearUndo?: boolean } = {}) {
    if (out.error) return
    const undoable = !opts.clearUndo && !!out.change?.canUndo
    const undo = opts.clearUndo ? [] : undoable ? [...state.ui.undo, state.data].slice(-MAX_UNDO) : state.ui.undo
    set({
      ...state,
      data: out.data,
      ui: {
        ...state.ui,
        undo,
        change: out.change ?? state.ui.change,
        changeAt: out.change ? nowMs() : state.ui.changeAt,
        toast: out.change ? toast(out.change.title, undoable) : state.ui.toast,
      },
    })
  }

  const errorOf = (out: OpOutput): OpError | null => out.error ?? null

  const store = {
    getState: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    now: clock,

    // ---- Setup ----------------------------------------------------------------
    loadDemo() {
      const data = createDemoData(clock())
      set({ ...state, data, ui: { change: null, changeAt: 0, undo: [], toast: null, notice: null } })
    },
    commitOnboarding(data: AppData) {
      set({ ...state, data: { ...data, onboarded: true }, ui: { change: null, changeAt: 0, undo: [], toast: null, notice: null } })
    },
    reset() {
      clearData(storage)
      set({ ...state, data: emptyData(), ui: { change: null, changeAt: 0, undo: [], toast: null, notice: null } }, false)
    },

    // ---- Sessions ---------------------------------------------------------------
    skipSession(id: string) {
      apply(ops.skipSession(state.data, id, clock()))
    },
    moveSession(id: string, date: string, startMin: number, durationMin?: number): OpError | null {
      const out = ops.moveSession(state.data, id, date, startMin, clock(), durationMin)
      apply(out)
      return errorOf(out)
    },
    unlockSession(id: string) {
      apply(ops.unlockSession(state.data, id, clock()))
    },
    startSession(id: string) {
      const s = state.data.sessions.find((x) => x.id === id)
      if (!s || s.status !== 'planned') return
      const t = state.data.activeTimer
      if (t && t.sessionId === id) return
      set({
        ...state,
        data: {
          ...state.data,
          activeTimer: {
            sessionId: id,
            runningSince: state.data.settings.timerByDefault ? nowMs() : null,
            accumulatedMs: 0,
            useTimer: state.data.settings.timerByDefault,
          },
        },
      })
    },
    pauseTimer() {
      const t = state.data.activeTimer
      if (!t || t.runningSince === null) return
      set({
        ...state,
        data: { ...state.data, activeTimer: { ...t, runningSince: null, accumulatedMs: t.accumulatedMs + (nowMs() - t.runningSince) } },
      })
    },
    resumeTimer() {
      const t = state.data.activeTimer
      if (!t || t.runningSince !== null) return
      set({ ...state, data: { ...state.data, activeTimer: { ...t, runningSince: nowMs(), useTimer: true } } })
    },
    setTimerEnabled(on: boolean) {
      const t = state.data.activeTimer
      const settings = { ...state.data.settings, timerByDefault: on }
      set({
        ...state,
        data: {
          ...state.data,
          settings,
          activeTimer: t ? { ...t, useTimer: on, runningSince: on ? (t.runningSince ?? nowMs()) : null } : t,
        },
      })
    },
    cancelSession() {
      if (!state.data.activeTimer) return
      set({ ...state, data: { ...state.data, activeTimer: null } })
    },
    finishSession(input: FinishInput): FinishOutput {
      const out = ops.finishSession(state.data, input, clock())
      apply(out, { clearUndo: true })
      return out
    },
    recordManualQuiz(input: { topicId: string; correct: number; total: number }): FinishOutput {
      const out = ops.recordManualQuiz(state.data, input, clock())
      apply(out, { clearUndo: true })
      return out
    },
    markMissedAsSkipped() {
      apply(ops.markMissedAsSkipped(state.data, clock()))
    },

    // ---- Topics & subjects --------------------------------------------------------
    toggleStruggle(topicId: string) {
      apply(ops.toggleStruggle(state.data, topicId, clock()))
    },
    saveSubject(input: SubjectInput): OpError | null {
      const out = ops.saveSubject(state.data, input, clock())
      apply(out)
      return errorOf(out)
    },
    deleteSubject(id: string) {
      apply(ops.deleteSubject(state.data, id, clock()), { clearUndo: false })
    },
    saveTopic(input: TopicInput): OpError | null {
      const out = ops.saveTopic(state.data, input, clock())
      apply(out)
      return errorOf(out)
    },
    deleteTopic(id: string) {
      apply(ops.deleteTopic(state.data, id, clock()))
    },

    // ---- Availability, What-If, Course Correction ------------------------------------
    setAvailability(av: Availability) {
      apply(ops.setAvailability(state.data, av, clock()))
    },
    applyWhatIf(list: readonly WhatIfOp[]) {
      apply(ops.applyWhatIf(state.data, list, clock()))
    },
    applyCorrection(corrected: AppData, note?: string) {
      apply(ops.applyCorrected(state.data, corrected, clock(), note))
    },
    removeBlockedDate(date: string) {
      const av = { ...state.data.availability, blockedDates: state.data.availability.blockedDates.filter((d) => d !== date) }
      apply(ops.setAvailability(state.data, av, clock()))
    },
    removeExtraWindow(id: string) {
      const av = { ...state.data.availability, extraWindows: state.data.availability.extraWindows.filter((w) => w.id !== id) }
      apply(ops.setAvailability(state.data, av, clock()))
    },

    // ---- Housekeeping ----------------------------------------------------------------
    setProfileName(name: string) {
      set({ ...state, data: { ...state.data, profile: { ...state.data.profile, name: name.slice(0, 40) } } })
    },
    undo() {
      const stack = state.ui.undo
      if (stack.length === 0) return
      const prev = stack[stack.length - 1]
      set({
        ...state,
        data: prev,
        ui: { ...state.ui, undo: stack.slice(0, -1), change: null, toast: toast('Undone. Your plan is back as it was.', false) },
      })
    },
    dismissChange() {
      if (state.ui.change) set({ ...state, ui: { ...state.ui, change: null } }, false)
    },
    /** Clear a "what changed" note when the student moves to another page, unless it was just created. */
    dismissStaleChange(graceMs = 1500) {
      if (state.ui.change && nowMs() - state.ui.changeAt > graceMs) set({ ...state, ui: { ...state.ui, change: null } }, false)
    },
    dismissToast() {
      if (state.ui.toast) set({ ...state, ui: { ...state.ui, toast: null } }, false)
    },
    dismissNotice() {
      if (state.ui.notice) set({ ...state, ui: { ...state.ui, notice: null } }, false)
    },
    /** On a new day, quietly re-plan so today's flight plan reflects today's memory. */
    refreshForNewDay() {
      const d = state.data
      const now = clock()
      if (!d.onboarded || d.planMeta.generatedFor === now.date) return
      const { data } = replan(d, now)
      set({ ...state, data })
    },
    quizById(id: string): QuizResult | undefined {
      return state.data.quizzes.find((q) => q.id === id)
    },
  }
  return store
}

export type ZunoStore = ReturnType<typeof createStore>
