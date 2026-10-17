# Zuno — your next move, calculated

Zuno is a personal "mission control" for studying. Given **what you remember, how much time you really have, and how realistically you will study**, it answers one question: *what should I do next?*

Everything runs in the browser. No account, no API keys, no server, no database.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: maths, scheduler constraints, persistence, UI-facing operations
npm run typecheck  # tsc (app + tests)
npm run build      # type-check + production build into dist/
```

## Try the demo

1. Open the app and press **Explore a demo** (or Settings → *Load sample data*; it asks before replacing real data).
2. The sample student is "Maya" (clearly marked *Sample data*): Mathematics, Physics and Chemistry, nine topics, two weeks of seeded study history, exams 7, 13 and 20 days from today. Exam dates are relative to the day you open it. The history is **replayed through the real engine**, so every number on the dashboard is calculated, not hard-coded.

**The key demonstration (about 90 seconds):**

1. **Mission Control** → *Up next* is Newton's laws. Its reason comes from model data: *"Your last recall check was 2/5, and Physics is your closest exam."* Open **Show the math** for the numbers behind it.
2. **Start session** → *I'm done* (say you studied the full time) → **Start a 5-question check** → answer mostly wrong.
3. The result screen explains what changed: your observed score (kept separate from the model's estimate), the estimate before and after, new memory stability, and each moved or added session.
4. Back on **Mission Control**, the *What changed* banner lists the specific moves ("Newton's laws moved to tomorrow at 10:00 AM") and the exam-day forecast shift. **Undo** is offered for plan changes.
5. Try **Skip** on any session, or open the **Memory forecast** page, add a skipped day in **What-If** (a preview only), and compare it with the saved plan before you choose *Apply changes*.
6. Running behind? **Course Correction** asks which exams matter and how many hours you can really give, then shows what is prioritized, reduced or left out and why.

## What is implemented (first pass)

| Area | Status |
| --- | --- |
| Three-step onboarding with field-level validation, plan proposal and explanation | Done |
| Mission Control: up next (+ reason), today's flight plan, memory forecast, topics needing attention | Done |
| Study calendar: weekly grid (desktop), day agenda (mobile), session detail with move / resize / skip / start | Done |
| Subjects & topics: add / edit / delete with confirmation, recall, last and next review, recent checks, "I'm struggling" flag | Done |
| Focused session view: optional timer (pause/resume), finish early / partial, recall check afterwards | Done |
| Recall checks: local verified question bank for the demo topics; manual "k correct out of n" for your own topics | Done |
| Memory forecast with exam date, planned reviews, no-review baseline, observed checks, data-table alternative | Done |
| What-If (skip a day, add time) with previews kept separate from the saved plan | Done |
| Course Correction (priorities + real time budget → revised plan with reasons) | Done |
| Persistence (versioned, validated, recovers from malformed data), reset, undo for plan changes | Done |

**Left for the second pass** (the data model already has room; there are deliberately no placeholder screens): Orbit Map (topics already carry `prerequisites`), an AI Study Advisor grounded in the engine's structured explanations (the scheduler works without AI), richer scenario comparison, and the Simulation Lab comparing the planner with simpler strategies.

## The mathematics

All constants live in one file, [`src/engine/config.ts`](src/engine/config.ts). **They are reasonable starting assumptions, not values fitted to real student data. Nothing here is "scientifically calibrated".** The *form* of each model is standard; the *numbers* are tunable.

### 1. Memory: exponential decay

```
R(t) = A · exp(−t / S)
```

`R` = estimated probability of recall, `A` = recall right after the latest assessment, `t` = **days** since then, `S` = memory stability in **days** (larger = slower forgetting). `R` is clamped to [0, 1], `S` is kept positive (0.75 – 120 days), and elapsed time never goes negative.

Starting point: self-rated familiarity 1–5 maps to `A` of 0.10 / 0.30 / 0.50 / 0.70 / 0.85 (and `S` of 3 / 5 / 7 / 10 / 14 days); "I'm not sure yet" starts at `A = 0.40` and is flagged as a guess.

### 2. Recall-check update

The model's own forecast `R_before` acts as a Beta prior worth `n₀` questions (`n₀ = 4`; `1.5` after a guessed start). A check of `k` correct out of `n` gives the posterior mean:

```
A_new = (n₀ · R_before + k) / (n₀ + n)
S_new = S · (0.5 + 1.8 · A_new)        (heuristic, clamped)
```

Bigger checks move the estimate more; strong results lengthen stability, weak results leave reviews close together. The anchor time resets to the time of the check. The study session itself is **not** credited: finishing a timer is not evidence of mastery. Because it blends evidence with a prior, a 1/5 can nudge an already pessimistic estimate (say 15%) up slightly toward 20%; the result screen says so instead of hiding it. Raw scores (`k/n`) are stored separately and never overwritten; the estimate is the model's belief; anything beyond today is a forecast.

### 3. Will you complete a session? Beta-Bernoulli

Per coarse duration group (≤20, 21–40, >40 minutes) completion is `Beta(α, β)`:

```
p_complete = α / (α + β)
```

New-user priors (assumption: longer blocks are harder to finish): short `Beta(3.2, 0.8)` = 0.80, medium `Beta(2.8, 1.2)` = 0.70, long `Beta(2.2, 1.8)` = 0.55. A completed session adds 1 to α; a skipped one adds 1 to β; a **partial** session adds `f` to α and `1 − f` to β where `f` is the fraction done, **a pragmatic approximation** (a strict Bernoulli outcome is 0 or 1, so a fractional observation is not a true likelihood). Groups stay coarse on purpose; finer ones would have too little data. Until a group has three real observations, the UI labels it an *initial estimate*. The student's stated session length is honoured until their own history says it is not working; only then may a shorter block be chosen.

### 4. What to study: the scheduling objective

For a candidate review of topic *i*, length *d*, at time τ:

```
score = importance_i/3 · p_complete(d) · ΔR_exam(i, τ, d | already-planned reviews) / d
```

- **ΔR_exam** is the gain in forecast exam-day recall if the session is completed, *given every review already planned for that topic*, so the same benefit is never counted twice.
- Dividing by `d` makes different lengths comparable (gain per minute).
- Reviews use a documented **hypothetical learning transition**, not an assumption of perfect recall:

```
eff(d)  = 1 − exp(−(d − 5) / 30)                      (5 min settling-in, diminishing returns)
e       = eff(d) · recency                           (recency < 1 if the last review was < 1 day ago, floor 0.2)
A_post  = R_before + (0.95 − R_before) · e           (never reaches 100%)
S_post  = S · (1 + e · spacing),  spacing = clamp((1 − R_before)/0.5, 0.15, 1)
```

- A plan's forecast applies these transitions **in expectation** (a review that is only 60% likely moves `A` and `S` 60% of the way), the same code the scheduler optimises and the charts draw.
- Small constants nudge the plan: a bonus for the student's preferred length, a 3%/day drift discount so plans start earlier instead of cramming, and a bonus for keeping a session exactly where it was, so a replan changes only what it needs to.

**Method: a deterministic greedy heuristic.** Repeatedly pick the highest-scoring feasible candidate, place it, recompute marginal gains, stop when nothing worthwhile remains. Within a day, the closest exam's work goes first. It aims to improve the objective; **it does not claim a global optimum.** Hard constraints it never breaks: inside study windows, outside commitments, no overlap with other sessions (plus breaks), finish before the exam, daily study limit, one session per topic per day, completed sessions and pinned sessions untouched.

**Overfull plans are reported, not hidden.** If a topic's forecast stays below the 70% target and no feasible time remains, it appears as an *unmet need* with an estimated extra time and the limiting reason (no free time, daily limit, or time budget).

### 5. What-If and Course Correction

Both run the **same scheduler** on a copy of your data. What-If tweaks availability (skip a day, add time); Course Correction adds a total-minutes budget and up-weights the subjects you prioritise. Neither touches the saved plan until you apply it; applied changes can be undone straight away.

## How behaviour updates the model

| You… | The model… |
| --- | --- |
| Complete a session | α += 1 for that length group; the plan is re-optimised |
| Skip a session | β += 1; the session's slot and minutes stay "spent" today; sessions it displaced are re-planned and Zuno explains the specific moves |
| Finish part of a session | α += f, β += (1 − f) |
| Take a recall check | `A` and `S` update as in §2; future reviews for that topic are re-planned |
| Flag "I'm struggling" | effective stability × 0.75 for that topic (faster forgetting, so more attention) |
| Do nothing for a while | unrecorded past sessions show as *not recorded*; Course Correction can mark them skipped so the model learns from them |

## Time zones and dates

Every day is a local `YYYY-MM-DD` plus a minute of the day, and all arithmetic counts a day as exactly 1440 minutes. Daylight-saving changes therefore cannot shift a session. A test builds the same plan under five time zones across a DST change and asserts the results are identical.

## Project layout

```
src/
  engine/    pure TypeScript maths: memory, completion, scheduler, slots, forecast, What-If, Course Correction
  domain/    pure AppData → AppData operations (skip, move, finish, quiz, CRUD, onboarding)
  state/     framework-free store, versioned persistence, React bindings, router
  data/      demo student and the verified question bank
  components/, pages/, styles/   UI only; no scheduling logic
```

Presentation never makes scheduling decisions; the engine returns structured explanation data and the UI turns it into words.

## Verification

Run `npm test` (108 tests). They cover: recall stays in [0, 1], decays without review, handles invalid or missing input; the quiz update is the stated posterior and keeps observed scores separate; completion estimates respond to completed, skipped and partial sessions and learn duration groups separately; sessions never overlap commitments or each other and never run past an exam, across many "now" moments; an impossible workload and a no-availability case produce honest unmet-need explanations; a weak recall check earns more review time than a strong one; skipping updates calendar and dashboard consistently; manual moves are validated with field-specific messages; What-If and Course Correction do not mutate saved data (deep-frozen inputs); state survives a reload; malformed storage is backed up and recovered; undo cannot erase quiz history; DST and midnight boundaries.

Not covered by automated tests: the React UI itself (checked by hand in a browser at laptop and phone width, with keyboard navigation through the quiz and dialogs). Only Chromium-based rendering was exercised.

## Known limitations

- Constants are unvalidated assumptions (see above); forecasts are estimates, not predictions.
- The memory model is a single exponential per topic with a simple review transition; real forgetting is richer.
- The greedy planner can be beaten by a global optimiser on tight schedules.
- Question banks exist only for the nine demo topics. For your own topics Zuno never invents questions: it asks for your own "k out of n" result.
- Completion history is per student per length group, with no time-of-day or subject effects.
- Prerequisite links are stored but not yet used in planning.
