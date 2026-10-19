import { z } from 'zod'
import { DAYS_PER_WEEK, EXPERIENCE_LEVELS, GOAL_DISTANCES, PHASES, QUALITY_TYPES } from '../types'

const fraction = z.number().min(0).max(1)
const positive = z.number().positive()
const nonNegative = z.number().min(0)
const count = z.number().int().min(0)

/** An object with exactly one entry per key of `keys`. */
const per = <K extends readonly [string, ...string[]], T extends z.ZodType>(keys: K, value: T) =>
  z.object(Object.fromEntries(keys.map((k) => [k, value])) as { [P in K[number]]: T }).strict()

const DAY_KEYS = DAYS_PER_WEEK.map(String) as unknown as readonly ['3', '4', '5', '6', '7']

const perGoal = <T extends z.ZodType>(value: T) => per(GOAL_DISTANCES, value)
const perExperience = <T extends z.ZodType>(value: T) => per(EXPERIENCE_LEVELS, value)
const perPhase = <T extends z.ZodType>(value: T) => per(PHASES, value)
const perDays = <T extends z.ZodType>(value: T) => per(DAY_KEYS, value)

const ladderRung = z
  .object({
    reps: z.number().int().positive(),
    workMin: positive.optional(),
    workM: positive.optional(),
    recoveryMin: nonNegative,
  })
  .strict()
  .refine((r) => (r.workMin === undefined) !== (r.workM === undefined), {
    message: 'set exactly one of workMin or workM',
  })

const ladder = z.array(ladderRung).min(1)

export const planRulesSchema = z
  .object({
    paces: z
      .object({
        easy: z.tuple([fraction, fraction]),
        threshold: fraction,
        interval: fraction,
        repetitionOffsetPer400S: nonNegative,
        bandS: nonNegative,
      })
      .strict(),
    goalPaceZone: perGoal(z.enum(['E', 'M', 'HMP', 'T', 'I', 'R'])),

    minWeeks: perGoal(z.number().int().positive()),
    maxWeeks: z.number().int().positive(),
    phaseSplit: z.object({ base: fraction, peak: fraction }).strict(),

    volume: z
      .object({
        peakKm: perGoal(perExperience(positive)),
        maxPeakMultiplier: z.number().min(1),
        maxWeeklyIncrease: fraction,
        minWeeklyIncreaseKm: nonNegative,
        maxWeeklyIncreaseKm: positive,
        raiseStartToFitLongestRun: z.boolean(),
      })
      .strict(),

    downWeek: z
      .object({
        every: perExperience(z.number().int().min(2)),
        factor: fraction,
        skipWithinWeeksOfTaper: count,
      })
      .strict(),

    taper: z
      .object({
        weeks: perGoal(z.number().int().min(1)),
        volumeFactors: perGoal(z.array(fraction).min(1)),
      })
      .strict(),

    longRun: z
      .object({
        minKm: positive,
        weeklyIncreaseKm: nonNegative,
        maxKm: perGoal(positive),
        maxShareByDays: perDays(fraction),
        shareBonusByGoal: perGoal(fraction),
        maxDurationMin: positive,
        neverBelowLongestRecent: z.boolean(),
        taperFactor: fraction,
      })
      .strict(),

    intensity: z.object({ maxHardShare: fraction }).strict(),

    quality: z
      .object({
        perWeek: perExperience(perPhase(count)),
        maxByDays: perDays(count),
        menu: perPhase(z.array(z.enum(QUALITY_TYPES)).min(1)),
        strides: z
          .object({
            phases: z.array(z.enum(PHASES)),
            reps: count,
            durationS: positive,
          })
          .strict(),
        warmupMin: nonNegative,
        cooldownMin: nonNegative,
        downWeekStepBack: count,
        ladders: per(QUALITY_TYPES, ladder),
      })
      .strict(),

    spacing: z.object({ minDaysBetweenHard: z.number().int().min(1) }).strict(),

    easy: z.object({ minKm: positive, maxShareOfLongRun: fraction }).strict(),

    adapt: z
      .object({
        window: z.number().int().min(1),
        upgradeAfterHits: z.number().int().min(1),
        upgradeMaxRpe: z.number().min(1).max(10),
        fasterThanTarget: fraction,
        downgradeAfterMisses: z.number().int().min(1).max(3),
        downgradeMinRpe: z.number().min(1).max(10),
        missTolerance: fraction,
        vdotStep: positive,
        maxVdotStep: positive,
        easyTooFastNudgeAfter: z.number().int().min(1),
      })
      .strict(),

    missed: z
      .object({
        easy: z.enum(['drop']),
        quality: z.enum(['moveIfSpaced', 'drop']),
        longRun: z.enum(['moveWithinWeek', 'drop']),
        neverDouble: z.boolean(),
      })
      .strict(),

    breaks: z
      .object({
        continueUpToDays: count,
        easeBackUpToDays: count,
        returnFactor: fraction,
        vdotPenaltyPerWeekOff: nonNegative,
        maxVdotPenalty: nonNegative,
      })
      .strict(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message })

    if (r.paces.easy[0] >= r.paces.easy[1]) {
      issue(['paces', 'easy'], 'easy must be [slow, fast] with slow < fast')
    }
    if (!(r.paces.easy[1] < r.paces.threshold && r.paces.threshold < r.paces.interval)) {
      issue(['paces'], 'fractions must increase: easy < threshold < interval')
    }
    if (r.phaseSplit.base + r.phaseSplit.peak >= 1) {
      issue(['phaseSplit'], 'base + peak must leave room for build (sum < 1)')
    }
    for (const goal of GOAL_DISTANCES) {
      if (r.taper.volumeFactors[goal].length !== r.taper.weeks[goal]) {
        issue(['taper', 'volumeFactors', goal], `needs one factor per taper week (${r.taper.weeks[goal]})`)
      }
      if (r.minWeeks[goal] <= r.taper.weeks[goal]) {
        issue(['minWeeks', goal], 'must be longer than the taper')
      }
      if (r.minWeeks[goal] > r.maxWeeks) issue(['minWeeks', goal], 'must not exceed maxWeeks')
      if (r.longRun.maxKm[goal] < r.longRun.minKm) {
        issue(['longRun', 'maxKm', goal], 'must be at least longRun.minKm')
      }
    }
    for (const days of DAY_KEYS)
      for (const goal of GOAL_DISTANCES) {
        if (r.longRun.maxShareByDays[days] + r.longRun.shareBonusByGoal[goal] > 1) {
          issue(['longRun', 'shareBonusByGoal', goal], `long-run share above 100 % at ${days} days/week`)
        }
      }
    if (r.volume.minWeeklyIncreaseKm > r.volume.maxWeeklyIncreaseKm) {
      issue(['volume'], 'minWeeklyIncreaseKm must not exceed maxWeeklyIncreaseKm')
    }
    if (r.easy.minKm > r.longRun.minKm * r.easy.maxShareOfLongRun) {
      issue(['easy', 'minKm'], 'is longer than an easy run may be next to the shortest long run')
    }
    if (r.adapt.upgradeAfterHits > r.adapt.window) {
      issue(['adapt', 'upgradeAfterHits'], 'cannot exceed adapt.window')
    }
    if (r.adapt.vdotStep > r.adapt.maxVdotStep) {
      issue(['adapt', 'vdotStep'], 'cannot exceed adapt.maxVdotStep')
    }
    if (r.breaks.continueUpToDays > r.breaks.easeBackUpToDays) {
      issue(['breaks'], 'continueUpToDays must not exceed easeBackUpToDays')
    }
  })

export type PlanRules = z.output<typeof planRulesSchema>
export type PlanRulesInput = z.input<typeof planRulesSchema>

export class PlanRulesError extends Error {
  readonly issues: string[]
  constructor(issues: string[]) {
    super(`Invalid plan rules:\n${issues.map((i) => `  • ${i}`).join('\n')}`)
    this.name = 'PlanRulesError'
    this.issues = issues
  }
}

/** Validates rules and returns them, or throws a readable PlanRulesError. */
export function parsePlanRules(input: unknown): PlanRules {
  const result = planRulesSchema.safeParse(input)
  if (result.success) return result.data
  throw new PlanRulesError(
    result.error.issues.map((i) => `${i.path.length ? i.path.join('.') : '(root)'}: ${i.message}`),
  )
}
