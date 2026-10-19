import { z } from 'zod'
import { isIsoDate, type ISODate } from '../core/dates'
import type { Plan } from '../core/plan/types'
import { DAYS_PER_WEEK, EXPERIENCE_LEVELS, GOAL_DISTANCES } from '../core/types'

/* ───────────────────────────── Stored records ───────────────────────────── */

export interface StoredPlan {
  id: string
  /** ISO timestamp. */
  createdAt: string
  status: 'active' | 'archived'
  /** Fingerprint of planRules at generation time (see core/config/hash.ts). */
  rulesHash: string
  plan: Plan
}

export type ActivitySource = 'manual' | 'strava' | 'file'

export interface Lap {
  distanceM: number
  timeS: number
}

export interface CompletedActivity {
  id: string
  date: ISODate
  source: ActivitySource
  /** e.g. the Strava activity id, used to avoid importing twice. */
  externalId?: string
  distanceKm: number
  durationS: number
  /** Perceived effort 1–10. */
  rpe?: number
  laps?: Lap[]
  notes?: string
  /** The planned session this run counts for: sessions are identified by plan + date. */
  plannedSession?: { planId: string; date: ISODate }
  createdAt: string
  updatedAt: string
}

/* ──────────────────────────────── Schemas ───────────────────────────────── */

const isoDate = z.string().refine(isIsoDate, 'expected a YYYY-MM-DD date')
const timestamp = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'expected an ISO timestamp')
const weekday = z.number().int().min(0).max(6)

export const planInputsSchema = z.object({
  goal: z.object({ distance: z.enum(GOAL_DISTANCES), raceDate: isoDate }),
  anchor: z.object({ distanceM: z.number().positive(), timeS: z.number().positive() }),
  experience: z.enum(EXPERIENCE_LEVELS),
  currentWeeklyKm: z.number().min(0),
  longestRecentRunKm: z.number().min(0),
  daysPerWeek: z.union(DAYS_PER_WEEK.map((d) => z.literal(d))),
  longRunDay: weekday,
  unavailableWeekdays: z.array(weekday).optional(),
  startDate: isoDate,
})

/**
 * A plan is generated data, so only its shape is checked here; it can always
 * be regenerated from its (fully validated) inputs.
 */
const planSchema = z
  .object({
    inputs: planInputsSchema,
    paceModelId: z.string(),
    fitness: z.number(),
    zones: z.record(z.string(), z.object({ fast: z.number(), slow: z.number() })),
    startDate: isoDate,
    raceDate: isoDate,
    weeks: z.array(
      z.looseObject({ startDate: isoDate, sessions: z.array(z.looseObject({ date: isoDate })) }),
    ),
    warnings: z.array(z.string()),
  })
  .loose()

export const storedPlanSchema = z.object({
  id: z.string().min(1),
  createdAt: timestamp,
  status: z.enum(['active', 'archived']),
  rulesHash: z.string(),
  plan: planSchema,
})

export const activitySchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  source: z.enum(['manual', 'strava', 'file']),
  externalId: z.string().optional(),
  distanceKm: z.number().min(0),
  durationS: z.number().min(0),
  rpe: z.number().int().min(1).max(10).optional(),
  laps: z.array(z.object({ distanceM: z.number().min(0), timeS: z.number().min(0) })).optional(),
  notes: z.string().optional(),
  plannedSession: z.object({ planId: z.string(), date: isoDate }).optional(),
  createdAt: timestamp,
  updatedAt: timestamp,
})

/** Fields a caller provides when logging a run; ids and timestamps are added by the repository. */
export const newActivitySchema = activitySchema.omit({ id: true, createdAt: true, updatedAt: true })
export type NewActivity = z.input<typeof newActivitySchema>
