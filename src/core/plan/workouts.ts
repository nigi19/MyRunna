import type { PlanRules } from '../config'
import type { PaceZoneId, PaceZones } from '../paces/types'
import type { QualityType } from '../types'

/** `jog` is recovery jogging, estimated at the slow end of easy pace. */
export type StepZone = PaceZoneId | 'jog'

export interface WorkoutStep {
  kind: 'warmup' | 'work' | 'recovery' | 'cooldown' | 'steady'
  zone: StepZone
  durationS?: number
  distanceM?: number
}

/** `reps` × steps. The recovery after the last rep is skipped. */
export interface RepeatBlock {
  kind: 'repeat'
  reps: number
  steps: WorkoutStep[]
}

export type WorkoutItem = WorkoutStep | RepeatBlock

export interface WorkoutTotals {
  distanceKm: number
  durationMin: number
  /** Minutes at T/I/R/HMP/M: the "20" in 80/20. */
  hardMin: number
}

export interface QualityPick {
  type: QualityType
  rung: number
  /** Set when the 80/20 check had to cut reps below the ladder's first rung. */
  repsOverride?: number
}

export const QUALITY_ZONE: Record<Exclude<QualityType, 'racePace'>, PaceZoneId> = {
  threshold: 'T',
  interval: 'I',
  repetition: 'R',
}

export const zoneForQuality = (type: QualityType, goalZone: PaceZoneId): PaceZoneId =>
  type === 'racePace' ? goalZone : QUALITY_ZONE[type]

/** Seconds per km used to estimate time and distance for a zone. */
export function estimatePace(zone: StepZone, zones: PaceZones): number {
  if (zone === 'jog') return zones.E.slow
  return (zones[zone].fast + zones[zone].slow) / 2
}

function stepTotals(step: WorkoutStep, zones: PaceZones) {
  const pace = estimatePace(step.zone, zones)
  const durationS = step.durationS ?? ((step.distanceM ?? 0) / 1000) * pace
  const distanceM = step.distanceM ?? (durationS / pace) * 1000
  const hard = step.zone !== 'E' && step.zone !== 'jog'
  return { distanceM, durationS, hardS: hard ? durationS : 0 }
}

export function totals(items: WorkoutItem[], zones: PaceZones): WorkoutTotals {
  let distanceM = 0
  let durationS = 0
  let hardS = 0
  const add = (step: WorkoutStep, times: number) => {
    const t = stepTotals(step, zones)
    distanceM += t.distanceM * times
    durationS += t.durationS * times
    hardS += t.hardS * times
  }
  for (const item of items) {
    if (item.kind === 'repeat') {
      for (const step of item.steps) add(step, step.kind === 'recovery' ? item.reps - 1 : item.reps)
    } else {
      add(item, 1)
    }
  }
  return { distanceKm: distanceM / 1000, durationMin: durationS / 60, hardMin: hardS / 60 }
}

export function qualityWorkout(
  pick: QualityPick,
  zone: PaceZoneId,
  rules: PlanRules,
): { items: WorkoutItem[]; reps: number; label: string } {
  const ladder = rules.quality.ladders[pick.type]
  const rung = ladder[Math.min(pick.rung, ladder.length - 1)]
  const reps = pick.repsOverride ?? rung.reps
  const work: WorkoutStep =
    rung.workM !== undefined
      ? { kind: 'work', zone, distanceM: rung.workM }
      : { kind: 'work', zone, durationS: (rung.workMin ?? 0) * 60 }
  const repSteps: WorkoutStep[] = [work]
  if (rung.recoveryMin > 0 && reps > 1) {
    repSteps.push({ kind: 'recovery', zone: 'jog', durationS: rung.recoveryMin * 60 })
  }
  const items: WorkoutItem[] = []
  if (rules.quality.warmupMin > 0) {
    items.push({ kind: 'warmup', zone: 'E', durationS: rules.quality.warmupMin * 60 })
  }
  items.push(reps > 1 ? { kind: 'repeat', reps, steps: repSteps } : work)
  if (rules.quality.cooldownMin > 0) {
    items.push({ kind: 'cooldown', zone: 'E', durationS: rules.quality.cooldownMin * 60 })
  }
  const size = rung.workM !== undefined ? `${rung.workM} m` : `${rung.workMin} min`
  const recovery = reps > 1 && rung.recoveryMin > 0 ? `, ${rung.recoveryMin} min jog` : ''
  const label = reps > 1 ? `${reps} × ${size} @ ${zone}${recovery}` : `${size} @ ${zone}`
  return { items, reps, label }
}

export function easyRun(km: number, strides: PlanRules['quality']['strides'] | null, zones: PaceZones) {
  if (!strides || strides.reps === 0) {
    return [{ kind: 'steady', zone: 'E', distanceM: km * 1000 }] satisfies WorkoutItem[]
  }
  const stridesBlock: RepeatBlock = {
    kind: 'repeat',
    reps: strides.reps,
    steps: [
      { kind: 'work', zone: 'R', durationS: strides.durationS },
      { kind: 'recovery', zone: 'jog', durationS: 60 },
    ],
  }
  // Strides are part of the run's distance, not extra.
  const stridesM = totals([stridesBlock], zones).distanceKm * 1000
  return [
    { kind: 'steady', zone: 'E', distanceM: Math.max(0, km * 1000 - stridesM) },
    stridesBlock,
  ] satisfies WorkoutItem[]
}

export const steadyRun = (km: number, zone: PaceZoneId): WorkoutItem[] => [
  { kind: 'steady', zone, distanceM: km * 1000 },
]
