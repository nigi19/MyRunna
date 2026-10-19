import { rules as defaultRules, type PlanRules } from '../config'
import {
  addDays,
  daysBetween,
  isIsoDate,
  mondayOnOrAfter,
  mondayOnOrBefore,
  weekdayOf,
  WEEKDAY_NAMES,
  type Weekday,
} from '../dates'
import { formatDuration } from '../format'
import type { PaceModel, PaceZoneId, PaceZones } from '../paces/types'
import { vdotPaceModel, type VdotSettings } from '../paces/vdot'
import { DAYS_PER_WEEK, GOAL_DISTANCE_M, type Phase } from '../types'
import {
  assignPhases,
  planLongRuns,
  planQuality,
  planVolume,
  round1,
  roundHalf,
  type LongRunWeek,
  type QualityWeek,
  type VolumeInput,
  type VolumeWeek,
} from './progression'
import { gap, placeWeek } from './schedule'
import type { Plan, PlanInputs, PlannedSession, PlanWeek, SessionType } from './types'
import {
  easyRun,
  estimatePace,
  qualityWorkout,
  steadyRun,
  totals,
  zoneForQuality,
  type QualityPick,
  type WorkoutItem,
} from './workouts'

const QUALITY_NAMES: Record<string, string> = {
  threshold: 'Threshold',
  interval: 'Intervals',
  repetition: 'Repetitions',
  racePace: 'Race pace',
}

const GOAL_NAMES = { '5k': '5K', '10k': '10K', half: 'Half marathon', marathon: 'Marathon' }

const pct = (x: number) => `${Math.round(x * 100)} %`

export class PlanInputError extends Error {}

function validateInputs(i: PlanInputs) {
  const problems: string[] = []
  if (!isIsoDate(i.startDate)) problems.push(`startDate "${i.startDate}" is not a YYYY-MM-DD date`)
  if (!isIsoDate(i.goal.raceDate)) problems.push(`raceDate "${i.goal.raceDate}" is not a YYYY-MM-DD date`)
  if (!DAYS_PER_WEEK.includes(i.daysPerWeek)) problems.push('daysPerWeek must be 3–7')
  if (!(i.currentWeeklyKm >= 0)) problems.push('currentWeeklyKm must be ≥ 0')
  if (!(i.longestRecentRunKm >= 0)) problems.push('longestRecentRunKm must be ≥ 0')
  const available = 7 - new Set(i.unavailableWeekdays ?? []).size
  if (available < i.daysPerWeek)
    problems.push(`only ${available} available days for ${i.daysPerWeek} runs/week`)
  if (problems.length) throw new PlanInputError(problems.join('; '))
}

/** Long-run day, or the nearest available day if it's blocked (ties → later day). */
function resolveLongRunDay(i: PlanInputs): Weekday {
  const blocked = new Set(i.unavailableWeekdays ?? [])
  if (!blocked.has(i.longRunDay)) return i.longRunDay
  const options = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter((d) => !blocked.has(d))
  return options.sort((a, b) => gap(a, i.longRunDay) - gap(b, i.longRunDay) || b - a)[0]
}

interface WeekContext {
  rules: PlanRules
  zones: PaceZones
  goalZone: PaceZoneId
  inputs: PlanInputs
  longRunDay: Weekday
}

interface Built {
  sessions: PlannedSession[]
  reasons: string[]
  hardShare: number
}

function session(
  date: string,
  type: SessionType,
  title: string,
  items: WorkoutItem[],
  zones: PaceZones,
  reason: string,
): PlannedSession {
  const t = totals(items, zones)
  return {
    date,
    weekday: weekdayOf(date),
    type,
    title,
    items,
    distanceKm: round1(t.distanceKm),
    durationMin: Math.round(t.durationMin),
    hardMin: Math.round(t.hardMin),
    reason,
  }
}

function buildWeek(
  ctx: WeekContext,
  monday: string,
  phase: Phase,
  isRaceWeek: boolean,
  volume: VolumeWeek,
  longRun: LongRunWeek,
  quality: QualityWeek,
): Built {
  const { rules, zones, inputs } = ctx
  const raceDay = weekdayOf(inputs.goal.raceDate)
  const anchor = isRaceWeek ? raceDay : ctx.longRunDay
  const blocked = new Set(inputs.unavailableWeekdays ?? [])
  const available = ([0, 1, 2, 3, 4, 5, 6] as Weekday[]).filter(
    (d) => !blocked.has(d) && (!isRaceWeek || d < raceDay),
  )

  const runs = inputs.daysPerWeek
  const placement = placeWeek({
    available,
    anchor,
    nQuality: quality.picks.length,
    nEasy: runs - 1 - quality.picks.length,
    minGap: rules.spacing.minDaysBetweenHard,
  })
  const reasons: string[] = []
  if (placement.droppedQuality > 0) {
    reasons.push(
      `${placement.droppedQuality} quality session(s) dropped: no day ≥ ${rules.spacing.minDaysBetweenHard} days from other hard days`,
    )
  }
  if (placement.droppedEasy > 0 && !isRaceWeek) {
    reasons.push(`${placement.droppedEasy} easy run(s) dropped: not enough available days`)
  }

  // Quality picks in the order of their days; the 80/20 check may shrink them.
  const picks: QualityPick[] = quality.picks.slice(0, placement.quality.length).map((p) => ({ ...p }))
  const goalKm = GOAL_DISTANCE_M[inputs.goal.distance] / 1000
  const longRefKm = isRaceWeek ? goalKm : longRun.km
  const strides = rules.quality.strides.phases.includes(phase) && !isRaceWeek ? rules.quality.strides : null

  // Strides go on the easy run furthest from hard days (fresh legs; ties → later day).
  const hardDays = [anchor, ...placement.quality]
  const stridesDay = [...placement.easy].sort(
    (a, b) =>
      Math.min(...hardDays.map((h) => gap(b, h))) - Math.min(...hardDays.map((h) => gap(a, h))) || b - a,
  )[0]

  for (let attempt = 0; ; attempt++) {
    const qualitySessions = picks.map((pick, i) => {
      const zone = zoneForQuality(pick.type, ctx.goalZone)
      const workout = qualityWorkout(pick, zone, rules)
      const ladderLen = rules.quality.ladders[pick.type].length
      return session(
        addDays(monday, placement.quality[i]),
        pick.type,
        `${QUALITY_NAMES[pick.type]}: ${workout.label}`,
        workout.items,
        zones,
        `${QUALITY_NAMES[pick.type]} step ${Math.min(pick.rung, ladderLen - 1) + 1}/${ladderLen}. ${quality.reason}`,
      )
    })
    const qualityKm = qualitySessions.reduce((s, x) => s + x.distanceKm, 0)

    const nEasy = placement.easy.length
    const easyBudget = volume.km - longRun.km - qualityKm
    const lo = rules.easy.minKm
    const hi = Math.max(lo, longRefKm * rules.easy.maxShareOfLongRun)
    const perRun = nEasy > 0 ? easyBudget / nEasy : 0
    const easyKm = roundHalf(Math.min(Math.max(perRun, lo), hi))
    const easyReasons: string[] = []
    if (nEasy > 0 && perRun < lo) easyReasons.push(`raised to the ${lo} km minimum`)
    if (nEasy > 0 && perRun > hi) {
      easyReasons.push(`capped at ${pct(rules.easy.maxShareOfLongRun)} of the ${longRefKm} km long run`)
    }

    const easySessions = placement.easy.map((d) => {
      const withStrides = d === stridesDay ? strides : null
      return session(
        addDays(monday, d),
        'easy',
        `Easy ${easyKm} km${withStrides ? ` + ${withStrides.reps} strides` : ''}`,
        easyRun(easyKm, withStrides, zones),
        zones,
        `Remaining weekly volume split over ${nEasy} easy run${nEasy > 1 ? 's' : ''}` +
          (easyReasons.length ? `; ${easyReasons.join(', ')}` : ''),
      )
    })

    const anchorDate = addDays(monday, anchor)
    const anchorSession = isRaceWeek
      ? session(
          anchorDate,
          'race',
          `${GOAL_NAMES[inputs.goal.distance]} race`,
          steadyRun(goalKm, ctx.goalZone),
          zones,
          'Race day',
        )
      : session(
          anchorDate,
          'long',
          `Long run ${longRun.km} km`,
          steadyRun(longRun.km, 'E'),
          zones,
          longRun.reason,
        )

    const training = [...qualitySessions, ...easySessions, ...(isRaceWeek ? [] : [anchorSession])]
    const totalMin = training.reduce((s, x) => s + x.durationMin, 0)
    const hardMin = training.reduce((s, x) => s + x.hardMin, 0)
    const hardShare = totalMin > 0 ? hardMin / totalMin : 0

    // 80/20 guard: shrink the hardest session one step at a time.
    if (hardShare > rules.intensity.maxHardShare && picks.length > 0 && attempt < 50) {
      const i = qualitySessions.reduce(
        (best, s, j) => (s.hardMin > qualitySessions[best].hardMin ? j : best),
        0,
      )
      const pick = picks[i]
      const reps = qualityWorkout(pick, ctx.goalZone, rules).reps
      if (pick.rung > 0) pick.rung--
      else if (reps > 1) pick.repsOverride = reps - 1
      else {
        reasons.push(
          `Hard share ${pct(hardShare)} above ${pct(rules.intensity.maxHardShare)} even at the smallest session`,
        )
        return finish()
      }
      if (attempt === 0)
        reasons.push(`Quality shortened to keep hard time ≤ ${pct(rules.intensity.maxHardShare)} (80/20)`)
      continue
    }
    return finish()

    function finish(): Built {
      const byDate = new Map([...training, anchorSession].map((s) => [s.date, s]))
      const sessions = [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const date = addDays(monday, d)
        const planned = byDate.get(date)
        if (planned) return planned
        const afterRace = isRaceWeek && d > raceDay
        return session(date, 'rest', 'Rest', [], zones, afterRace ? 'After the race' : 'Rest day')
      })
      reasons.push(
        `Hard time ${hardMin} of ${totalMin} min (${pct(hardShare)}, max ${pct(rules.intensity.maxHardShare)})`,
      )
      return { sessions, reasons, hardShare }
    }
  }
}

/**
 * Builds a full training plan from the inputs and the rules in planRules.ts.
 * Deterministic: the same inputs and rules always give the same plan.
 */
export function generatePlan(
  inputs: PlanInputs,
  rules: PlanRules = defaultRules,
  paceModel: PaceModel<VdotSettings> = vdotPaceModel,
): Plan {
  validateInputs(inputs)
  const warnings: string[] = []
  const goal = inputs.goal.distance

  const raceMonday = mondayOnOrBefore(inputs.goal.raceDate)
  let firstMonday = mondayOnOrAfter(inputs.startDate)
  let nWeeks = daysBetween(firstMonday, raceMonday) / 7 + 1
  if (nWeeks < 2) throw new PlanInputError('The race is too soon: a plan needs at least 2 weeks')
  if (nWeeks > rules.maxWeeks) {
    firstMonday = addDays(raceMonday, -(rules.maxWeeks - 1) * 7)
    warnings.push(
      `Race is ${nWeeks} weeks away; the plan starts on ${firstMonday} (${rules.maxWeeks} weeks). Run as you do now until then.`,
    )
    nWeeks = rules.maxWeeks
  }
  if (nWeeks < rules.minWeeks[goal]) {
    warnings.push(`Only ${nWeeks} weeks; ${rules.minWeeks[goal]} or more is recommended for this distance.`)
  }

  const fitness = paceModel.fitnessFromRace(inputs.anchor)
  const zones = paceModel.zones(fitness, rules.paces)
  const goalZone = rules.goalPaceZone[goal] as PaceZoneId
  const longRunDay = resolveLongRunDay(inputs)
  if (longRunDay !== inputs.longRunDay) {
    warnings.push(
      `Long-run day ${WEEKDAY_NAMES[inputs.longRunDay]} is unavailable; using ${WEEKDAY_NAMES[longRunDay]}.`,
    )
  }

  const phases = assignPhases(nWeeks, goal, rules)
  const v: VolumeInput = {
    phases,
    goal,
    experience: inputs.experience,
    daysPerWeek: inputs.daysPerWeek,
    currentWeeklyKm: inputs.currentWeeklyKm,
    longestRecentRunKm: inputs.longestRecentRunKm,
  }
  const volume = planVolume(v, rules).weeks
  const longRuns = planLongRuns(v, volume, estimatePace('E', zones), rules)
  const quality = planQuality(v, volume, rules)

  const ctx: WeekContext = { rules, zones, goalZone, inputs, longRunDay }
  const phaseTotals = phases.reduce<Record<string, number>>(
    (acc, p) => ({ ...acc, [p]: (acc[p] ?? 0) + 1 }),
    {},
  )
  const phaseSeen: Record<string, number> = {}

  const weeks: PlanWeek[] = phases.map((phase, w) => {
    const monday = addDays(firstMonday, w * 7)
    const isRaceWeek = w === nWeeks - 1
    const built = buildWeek(ctx, monday, phase, isRaceWeek, volume[w], longRuns[w], quality[w])
    const phaseWeek = (phaseSeen[phase] = (phaseSeen[phase] ?? 0) + 1)
    const km = round1(built.sessions.filter((s) => s.type !== 'race').reduce((s, x) => s + x.distanceKm, 0))
    const plannedKm = volume[w].km
    const reasons = [
      `${phase[0].toUpperCase()}${phase.slice(1)} week ${phaseWeek} of ${phaseTotals[phase]}`,
      `Volume ${plannedKm} km: ${volume[w].reason}`,
      ...(Math.abs(km - plannedKm) >= 1 ? [`Sessions add up to ${km} km (rounding and per-run limits)`] : []),
      ...(isRaceWeek ? [] : [`Long run ${longRuns[w].km} km: ${longRuns[w].reason}`]),
      `Quality: ${quality[w].reason}`,
      ...built.reasons,
    ]
    return {
      index: w,
      startDate: monday,
      phase,
      phaseWeek,
      isDownWeek: volume[w].isDown,
      isRaceWeek,
      km,
      longRunKm: isRaceWeek ? round1(GOAL_DISTANCE_M[goal] / 1000) : longRuns[w].km,
      hardShare: built.hardShare,
      sessions: built.sessions,
      reasons,
    }
  })

  const predicted = paceModel.predictTimeS(fitness, GOAL_DISTANCE_M[goal])
  warnings.push(`Predicted ${GOAL_NAMES[goal]} at today's fitness: ${formatDuration(predicted)}.`)

  return {
    inputs,
    paceModelId: paceModel.id,
    fitness,
    zones,
    startDate: firstMonday,
    raceDate: inputs.goal.raceDate,
    weeks,
    warnings,
  }
}
