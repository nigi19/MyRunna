import type { PlannedSession, SessionType } from '../../core/plan/types'
import type { StepZone, WorkoutStep } from '../../core/plan/workouts'
import type { PaceZoneId } from '../../core/paces/types'
import type { Phase } from '../../core/types'

export const ZONE_LABELS: Record<PaceZoneId, string> = {
  E: 'Easy',
  M: 'Marathon pace',
  HMP: 'Half-marathon pace',
  T: 'Threshold',
  I: 'Interval',
  R: 'Repetition',
}

export const ZONE_HELP: Record<PaceZoneId, string> = {
  E: 'Conversational. Most of your running.',
  M: 'Steady, sustainable for hours.',
  HMP: 'Your goal half-marathon effort.',
  T: 'Comfortably hard, ~1 hour race effort.',
  I: 'Hard, ~3–5K race effort.',
  R: 'Fast and relaxed, short reps with full recovery.',
}

export const SESSION_LABELS: Record<SessionType, string> = {
  rest: 'Rest',
  easy: 'Easy run',
  long: 'Long run',
  threshold: 'Threshold',
  interval: 'Intervals',
  repetition: 'Repetitions',
  racePace: 'Race pace',
  race: 'Race',
}

/** Tailwind classes per session type: a coloured dot/badge. */
export const SESSION_COLORS: Record<SessionType, string> = {
  rest: 'bg-zinc-300 dark:bg-zinc-600',
  easy: 'bg-emerald-500',
  long: 'bg-sky-500',
  threshold: 'bg-orange-500',
  interval: 'bg-rose-500',
  repetition: 'bg-violet-500',
  racePace: 'bg-amber-500',
  race: 'bg-yellow-400',
}

export const PHASE_LABELS: Record<Phase, string> = {
  base: 'Base',
  build: 'Build',
  peak: 'Peak',
  taper: 'Taper',
}

export const STEP_LABELS: Record<WorkoutStep['kind'], string> = {
  warmup: 'Warm-up',
  work: 'Work',
  recovery: 'Recovery',
  cooldown: 'Cool-down',
  steady: 'Run',
}

export const zoneLabel = (zone: StepZone) => (zone === 'jog' ? 'Easy jog' : ZONE_LABELS[zone])

/** 1200 → "20 min", 90 → "1:30 min", 20 → "20 s" */
export function formatStepDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return s === 0 ? `${m} min` : `${m}:${String(s).padStart(2, '0')} min`
}

/** 400 → "400 m", 8500 → "8.5 km" */
export const formatStepDistance = (m: number) =>
  m >= 1000 ? `${Math.round(m / 100) / 10} km` : `${Math.round(m)} m`

export const formatMinutes = (min: number) =>
  min >= 60
    ? `${Math.floor(min / 60)} h ${String(Math.round(min % 60)).padStart(2, '0')} min`
    : `${Math.round(min)} min`

export const isRun = (s: PlannedSession) => s.type !== 'rest'

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
})

/** "2026-10-27" → "Tue 27 Oct" */
export const formatDate = (date: string) => DATE_FMT.format(new Date(`${date}T00:00:00Z`)).replace(',', '')
