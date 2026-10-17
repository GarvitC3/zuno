/**
 * Central configuration for every heuristic constant in the Zuno engine.
 *
 * HONESTY NOTE: none of these numbers have been fitted to real student data.
 * They are reasonable starting assumptions chosen so the model behaves
 * sensibly and can be explained. The *form* of the model (exponential decay,
 * Beta-Bernoulli completion, marginal-gain greedy scheduling) is standard; the
 * *constants* are tunable placeholders. Change them here, in one place.
 */

export const ENGINE = {
  // ---- Memory: R(t) = A * exp(-t / S) with t and S in DAYS -----------------------
  /** Stability bounds in days. S must stay positive. */
  STABILITY_MIN_DAYS: 0.75,
  STABILITY_MAX_DAYS: 120,
  /** Fallback stability for brand-new topics, in days. */
  DEFAULT_STABILITY_DAYS: 5,

  /** Starting recall A by self-reported familiarity (1 = brand new … 5 = confident). */
  FAMILIARITY_RECALL: { 1: 0.1, 2: 0.3, 3: 0.5, 4: 0.7, 5: 0.85 } as Record<number, number>,
  /** Starting stability S (days) by familiarity. Stronger prior knowledge forgets a little slower. */
  FAMILIARITY_STABILITY_DAYS: { 1: 3, 2: 5, 3: 7, 4: 10, 5: 14 } as Record<number, number>,
  /** "I'm not sure yet": a middling guess that the first recall check overrides quickly. */
  UNSURE_RECALL: 0.4,

  // ---- Recall-check update (Beta-Binomial style) ---------------------------------
  /**
   * Pseudo-count n0: how many "questions worth" of belief the model puts in its
   * own estimate before a recall check. Posterior mean = (n0*R_before + k) / (n0 + n).
   */
  PRIOR_STRENGTH: 4,
  /** Weaker belief when the starting point was a guess ("not sure yet"). */
  PRIOR_STRENGTH_UNSURE: 1.5,
  /** Stability multiplier after a check: m = A + B * A_new  (A_new = updated recall). */
  QUIZ_STABILITY_MULT_BASE: 0.5,
  QUIZ_STABILITY_MULT_SLOPE: 1.8,
  /** Flagging a topic as "I'm struggling" shrinks its effective stability by this factor. */
  STRUGGLE_STABILITY_FACTOR: 0.75,

  // ---- Hypothetical review transition (used to plan and forecast) ----------------
  /** A review never pushes recall above this ("do not assume perfect recall"). */
  REVIEW_CEILING: 0.95,
  /** Minutes of a session lost to settling in. Learning time = duration - overhead. */
  SESSION_OVERHEAD_MIN: 5,
  /** Time scale of diminishing returns within a session, in minutes. */
  EFFECTIVENESS_TIMESCALE_MIN: 30,
  /** Stability gain at full effectiveness and ideal spacing: S_new = S * (1 + gain). */
  STABILITY_GAIN: 1.0,
  /**
   * Recency discount (limits unhelpful repeats): a review less than this many days
   * after the last assessment or review is scaled down, never below the floor.
   */
  RECENCY_FULL_EFFECT_DAYS: 1,
  RECENCY_FLOOR: 0.2,
  /** Spacing effect: reviews done while recall is still high help stability less. */
  SPACING_REFERENCE_FORGETTING: 0.5,
  SPACING_FLOOR: 0.15,

  // ---- Completion probability: Beta(alpha, beta) per duration group ---------------
  /** Duration groups (minutes): short <= SHORT_MAX < medium <= MEDIUM_MAX < long. */
  SHORT_MAX_MIN: 20,
  MEDIUM_MAX_MIN: 40,
  /**
   * Priors for new users (alpha, beta). Prior strength is 4 pseudo-sessions each.
   * Assumption: longer blocks are somewhat harder to finish.
   */
  COMPLETION_PRIORS: {
    short: { alpha: 3.2, beta: 0.8 }, // mean 0.80
    medium: { alpha: 2.8, beta: 1.2 }, // mean 0.70
    long: { alpha: 2.2, beta: 1.8 }, // mean 0.55
  },
  /** Partial-session evidence counted as a fraction f of a success and (1 - f) of a skip. */
  PARTIAL_FULL_CREDIT_FRACTION: 0.9,

  // ---- Scheduler -----------------------------------------------------------------
  MIN_SESSION_MIN: 15,
  SLOT_GRID_MIN: 5,
  /** Don't schedule a session starting less than this many minutes from "now". */
  LEAD_TIME_MIN: 10,
  MAX_PLAN_HORIZON_DAYS: 28,
  MAX_SESSIONS_PER_PLAN: 140,
  MAX_SESSIONS_PER_TOPIC_PER_DAY: 1,
  /** Skip a candidate that would add less than this much exam-day recall. */
  MIN_EXAM_GAIN: 0.02,
  /** A topic whose projected exam-day recall is above this gets no more reviews. */
  SATURATION_RECALL: 0.85,
  /** Reaching this projected recall counts as "well prepared". Below it with no room = unmet need. */
  TARGET_RECALL: 0.7,
  /** The preferred length wins unless a shorter block scores >10% better per minute AND the student has enough history for that to be evidence. */
  PREFERRED_LENGTH_BONUS: 1.1,
  /** Shorter alternative = this fraction of the preferred length (rounded to the grid). */
  SHORT_ALTERNATIVE_FRACTION: 0.65,
  /** Plans further out are a little less certain to survive real life (also nudges earlier starts). */
  PLAN_DRIFT_PER_DAY: 0.97,
  /** Bonus for keeping a session exactly where the previous plan had it (plans should not jitter). */
  STABILITY_BONUS: 1.15,
  /** Default exam start (minutes after midnight) when none is given. */
  DEFAULT_EXAM_START_MIN: 9 * 60,

  // ---- Status thresholds on current estimated recall ---------------------------------
  STATUS_STRONG: 0.8,
  STATUS_STEADY: 0.6,
  STATUS_FADING: 0.4,
} as const

export type Engine = typeof ENGINE
