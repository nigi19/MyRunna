import type { PlanRulesInput } from './schema'

/**
 * MyRunna plan rules: every tunable number the engine uses lives here.
 *
 * Read it top to bottom like a coaching philosophy. Change a value and the
 * next generated (or re-generated) plan follows it. The file is validated
 * against `schema.ts` at startup, so a typo or an impossible combination
 * fails loudly instead of producing a strange plan.
 *
 * Conventions: distances in km unless the name ends in M (metres),
 * durations in minutes unless the name ends in S (seconds),
 * fractions are 0–1 (0.10 = 10 %).
 */
export const planRules = {
  /* ───────────────────────────── Paces ───────────────────────────── */

  /**
   * Pace zones as fractions of VDOT (Jack Daniels). Easy is a range from
   * slow to fast; the others are a single pace shown with a small band.
   */
  paces: {
    easy: [0.59, 0.74],
    threshold: 0.88,
    interval: 0.975,
    // Daniels: R pace ≈ 6 s per 400 m faster than I pace.
    repetitionOffsetPer400S: 6,
    // Single-value zones are shown as pace ± bandS/2 (s/km).
    bandS: 6,
  },

  /** Which pace zone a `racePace` session uses, per goal distance. */
  goalPaceZone: { '5k': 'I', '10k': 'T', half: 'HMP', marathon: 'M' },

  /* ──────────────────────────── Plan length ──────────────────────── */

  /** Fewer weeks than this → the plan is still built, with a warning. */
  minWeeks: { '5k': 6, '10k': 8, half: 10, marathon: 14 },
  /** More weeks than this → the plan starts later; run as you are until then. */
  maxWeeks: 24,

  /**
   * Share of the pre-taper weeks given to base and peak; build gets the rest.
   * Taper length is set per distance below.
   */
  phaseSplit: { base: 0.35, peak: 0.25 },

  /* ───────────────────────────── Volume ──────────────────────────── */

  volume: {
    /**
     * Target peak weekly km per goal and experience. The plan never goes
     * higher than this, nor higher than `maxPeakMultiplier` × your start.
     */
    peakKm: {
      '5k': { beginner: 15, intermediate: 25, advanced: 40 },
      '10k': { beginner: 20, intermediate: 28, advanced: 45 },
      half: { beginner: 25, intermediate: 32, advanced: 50 },
      marathon: { beginner: 40, intermediate: 55, advanced: 75 },
    },
    maxPeakMultiplier: 2.5,
    /** Build weeks grow by the larger of these two, capped by the max. */
    maxWeeklyIncrease: 0.1,
    minWeeklyIncreaseKm: 1.5,
    maxWeeklyIncreaseKm: 5,
    /**
     * If your longest recent run is a bigger share of your week than the
     * long-run cap allows, start the plan at the volume that fits it instead
     * of cutting your long run (you said volume can go up if needed).
     */
    raiseStartToFitLongestRun: true,
  },

  /** A lighter week every N weeks; skipped right before the taper. */
  downWeek: {
    every: { beginner: 3, intermediate: 4, advanced: 4 },
    factor: 0.75,
    skipWithinWeeksOfTaper: 1,
  },

  taper: {
    weeks: { '5k': 1, '10k': 1, half: 2, marathon: 3 },
    /**
     * Weekly km as a fraction of peak, one entry per taper week. The last
     * entry is race week and excludes the race itself.
     */
    volumeFactors: {
      '5k': [0.6],
      '10k': [0.6],
      half: [0.7, 0.3],
      marathon: [0.75, 0.6, 0.35],
    },
  },

  /* ──────────────────────────── Long run ─────────────────────────── */

  longRun: {
    minKm: 6,
    weeklyIncreaseKm: 1.5,
    maxKm: { '5k': 12, '10k': 16, half: 19, marathon: 32 },
    /**
     * Max share of weekly km. With fewer running days the long run is
     * naturally a bigger part of the week.
     */
    maxShareByDays: { 3: 0.55, 4: 0.4, 5: 0.35, 6: 0.3, 7: 0.3 },
    /** Added to that share per goal: marathon long runs need a bigger slice of the week. */
    shareBonusByGoal: { '5k': 0, '10k': 0, half: 0, marathon: 0.1 },
    maxDurationMin: 150,
    /** Outside down/taper weeks, never plan a long run shorter than your current longest. */
    neverBelowLongestRecent: true,
    /** Long run of the first taper week as a fraction of the peak long run. */
    taperFactor: 0.65,
  },

  /* ──────────────────────────── Intensity ────────────────────────── */

  intensity: {
    /** 80/20: at most this share of weekly running time at T/I/R/goal pace. */
    maxHardShare: 0.2,
  },

  quality: {
    /** Quality sessions per week, by experience and phase … */
    perWeek: {
      beginner: { base: 0, build: 1, peak: 1, taper: 1 },
      intermediate: { base: 1, build: 2, peak: 2, taper: 1 },
      advanced: { base: 1, build: 2, peak: 2, taper: 1 },
    },
    /** … but never more than this for a given number of running days. */
    maxByDays: { 3: 1, 4: 2, 5: 2, 6: 2, 7: 2 },
    /**
     * Session types per phase. With fewer slots than types, weeks rotate
     * through the list so you still see every type.
     */
    menu: {
      base: ['repetition', 'threshold'],
      build: ['threshold', 'interval'],
      peak: ['racePace', 'threshold'],
      taper: ['racePace'],
    },
    /** Strides (e.g. 4–6 × 20 s fast, relaxed) added to easy runs in these phases. */
    strides: { phases: ['base', 'build', 'peak'], reps: 6, durationS: 20 },
    warmupMin: 12,
    cooldownMin: 10,
    /** In a down week, a session steps back this many rungs on its ladder. */
    downWeekStepBack: 1,

    /**
     * Workout ladders: each time a session type recurs it moves one rung up.
     * `reps × work` with `recovery` jog between reps. Work is a duration
     * (`min`) or distance (`m`); recovery is always a jog duration.
     */
    ladders: {
      threshold: [
        { reps: 3, workMin: 5, recoveryMin: 1 },
        { reps: 4, workMin: 5, recoveryMin: 1 },
        { reps: 3, workMin: 8, recoveryMin: 2 },
        { reps: 4, workMin: 8, recoveryMin: 2 },
        { reps: 2, workMin: 12, recoveryMin: 2 },
        { reps: 3, workMin: 10, recoveryMin: 2 },
        { reps: 2, workMin: 15, recoveryMin: 3 },
        { reps: 1, workMin: 25, recoveryMin: 0 },
      ],
      interval: [
        { reps: 5, workMin: 2, recoveryMin: 2 },
        { reps: 6, workMin: 2, recoveryMin: 2 },
        { reps: 5, workMin: 3, recoveryMin: 2 },
        { reps: 6, workMin: 3, recoveryMin: 2 },
        { reps: 4, workMin: 4, recoveryMin: 3 },
        { reps: 5, workMin: 4, recoveryMin: 3 },
      ],
      repetition: [
        { reps: 6, workM: 200, recoveryMin: 1.5 },
        { reps: 8, workM: 200, recoveryMin: 1.5 },
        { reps: 6, workM: 300, recoveryMin: 2 },
        { reps: 8, workM: 300, recoveryMin: 2 },
        { reps: 6, workM: 400, recoveryMin: 2.5 },
      ],
      racePace: [
        { reps: 2, workMin: 10, recoveryMin: 3 },
        { reps: 3, workMin: 10, recoveryMin: 3 },
        { reps: 2, workMin: 15, recoveryMin: 3 },
        { reps: 3, workMin: 12, recoveryMin: 3 },
        { reps: 2, workMin: 20, recoveryMin: 4 },
        { reps: 1, workMin: 30, recoveryMin: 0 },
      ],
    },
  },

  /* ──────────────────────────── Schedule ─────────────────────────── */

  spacing: {
    /** Minimum days between two hard days (quality or long run): 2 = 48 h. */
    minDaysBetweenHard: 2,
  },

  easy: {
    minKm: 3,
    /** An easy run is never longer than this share of the week's long run. */
    maxShareOfLongRun: 0.75,
  },

  /* ─────────────────────────── Adaptation ────────────────────────── */
  // Everything below only creates *suggestions*; nothing changes until you approve.

  adapt: {
    /** Look at this many recent quality sessions. */
    window: 4,
    /** Suggest faster paces if this many in the window hit target … */
    upgradeAfterHits: 3,
    /** … with RPE at or below this … */
    upgradeMaxRpe: 6,
    /** … or ran at least this much faster than target. */
    fasterThanTarget: 0.02,
    /** Suggest slower paces if this many of the last 3 missed target … */
    downgradeAfterMisses: 2,
    /** … with RPE at or above this. */
    downgradeMinRpe: 8,
    /** A pace miss is more than this much slower than the zone's slow edge. */
    missTolerance: 0.02,
    vdotStep: 0.5,
    maxVdotStep: 1,
    /** Nudge (no pace change) after this many easy runs faster than easy pace. */
    easyTooFastNudgeAfter: 3,
  },

  missed: {
    /** easy: dropped, never made up. */
    easy: 'drop',
    /** quality: moved to the next day that keeps hard-day spacing, else dropped. */
    quality: 'moveIfSpaced',
    /** long: moved within the same week if possible, else skipped. */
    longRun: 'moveWithinWeek',
    /** Never squeeze two runs into one day or push the week above target. */
    neverDouble: true,
  },

  breaks: {
    /** Up to this many days off: continue as planned. */
    continueUpToDays: 4,
    /** Up to this many days: first week back at `returnFactor`, quality repeated. */
    easeBackUpToDays: 10,
    returnFactor: 0.8,
    /** Longer: re-plan from actual volume, suggesting VDOT − this per week off. */
    vdotPenaltyPerWeekOff: 1,
    maxVdotPenalty: 3,
  },
} satisfies PlanRulesInput
