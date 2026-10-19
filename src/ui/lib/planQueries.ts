import { addDays, daysBetween, type ISODate } from '../../core/dates'
import type { Plan, PlannedSession, PlanWeek } from '../../core/plan/types'
import type { CompletedActivity } from '../../data'

/** Today's date in the device's time zone (not UTC). */
export function localToday(now = new Date()): ISODate {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const findWeek = (plan: Plan, date: ISODate): PlanWeek | undefined =>
  plan.weeks.find((w) => w.startDate <= date && date <= addDays(w.startDate, 6))

export const findSession = (plan: Plan, date: ISODate): PlannedSession | undefined =>
  findWeek(plan, date)?.sessions.find((s) => s.date === date)

/** The first non-rest session strictly after `date`. */
export const nextRun = (plan: Plan, date: ISODate): PlannedSession | undefined =>
  plan.weeks.flatMap((w) => w.sessions).find((s) => s.date > date && s.type !== 'rest')

export type PlanStatus =
  | { kind: 'before'; daysToStart: number }
  | { kind: 'during'; week: PlanWeek; session: PlannedSession }
  | { kind: 'after' }

export function planStatus(plan: Plan, today: ISODate): PlanStatus {
  if (today < plan.startDate) {
    return { kind: 'before', daysToStart: daysBetween(today, plan.startDate) }
  }
  if (today > plan.raceDate) return { kind: 'after' }
  const week = findWeek(plan, today)
  const session = findSession(plan, today)
  return week && session ? { kind: 'during', week, session } : { kind: 'after' }
}

/** Runs logged for a planned session (matched by plan id + date). */
export const activitiesFor = (planId: string, date: ISODate, activities: CompletedActivity[]) =>
  activities.filter((a) => a.plannedSession?.planId === planId && a.plannedSession.date === date)
