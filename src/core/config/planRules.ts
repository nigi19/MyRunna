/**
 * MyRunna plan rules — every tunable number the engine uses lives here.
 *
 * Read it top to bottom like a coaching philosophy. Change a value, and the
 * next generated (or re-generated) plan follows it. Sections are added as the
 * engine grows (see docs/PLAN.md §7).
 */
export const planRules = {
  /**
   * Pace zones as fractions of VDOT (Jack Daniels). Easy is a range from
   * slow to fast; the others are a single pace shown with a small band.
   */
  paces: {
    easy: [0.59, 0.74] as [number, number],
    threshold: 0.88,
    interval: 0.975,
    // Daniels: R pace ≈ 6 s per 400 m faster than I pace.
    repetitionOffsetPer400S: 6,
    // Single-value zones are shown as pace ± bandS/2 (s/km).
    bandS: 6,
  },
} as const

export type PlanRules = typeof planRules
