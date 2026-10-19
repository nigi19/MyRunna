import type { PlanRules } from '../config'
import type { DaysPerWeek, Experience, GoalDistance, Phase, QualityType } from '../types'
import type { QualityPick } from './workouts'

export const round1 = (x: number) => Math.round(x * 10) / 10
export const roundHalf = (x: number) => Math.round(x * 2) / 2
const pct = (x: number) => `${Math.round(x * 100)} %`

/* ─────────────────────────────── Phases ─────────────────────────────── */

export function assignPhases(nWeeks: number, goal: GoalDistance, rules: PlanRules): Phase[] {
  const taper = Math.min(rules.taper.weeks[goal], nWeeks - 1)
  const rest = nWeeks - taper
  const base = Math.round(rest * rules.phaseSplit.base)
  const peak = Math.round(rest * rules.phaseSplit.peak)
  const build = rest - base - peak
  return [
    ...Array<Phase>(base).fill('base'),
    ...Array<Phase>(build).fill('build'),
    ...Array<Phase>(peak).fill('peak'),
    ...Array<Phase>(taper).fill('taper'),
  ]
}

/* ─────────────────────────────── Volume ─────────────────────────────── */

export interface VolumeWeek {
  km: number
  isDown: boolean
  reason: string
}

export interface VolumeInput {
  phases: Phase[]
  goal: GoalDistance
  experience: Experience
  daysPerWeek: DaysPerWeek
  currentWeeklyKm: number
  longestRecentRunKm: number
}

/** Max long-run share of weekly km for this profile. */
export const longRunShare = (v: Pick<VolumeInput, 'daysPerWeek' | 'goal'>, rules: PlanRules) =>
  rules.longRun.maxShareByDays[v.daysPerWeek] + rules.longRun.shareBonusByGoal[v.goal]

export function startVolume(v: VolumeInput, rules: PlanRules): { km: number; reason: string } {
  const share = longRunShare(v, rules)
  const fitLongest = v.longestRecentRunKm / share
  if (rules.volume.raiseStartToFitLongestRun && fitLongest > v.currentWeeklyKm) {
    const km = round1(fitLongest)
    return {
      km,
      reason: `Start at ${km} km instead of ${v.currentWeeklyKm} km so your ${v.longestRecentRunKm} km long run fits the ${pct(share)} long-run share for ${v.daysPerWeek} days/week`,
    }
  }
  return { km: v.currentWeeklyKm, reason: `Start at your current ${v.currentWeeklyKm} km/week` }
}

export function planVolume(v: VolumeInput, rules: PlanRules): { weeks: VolumeWeek[]; peakKm: number } {
  const { phases } = v
  const rest = phases.filter((p) => p !== 'taper').length
  const every = rules.downWeek.every[v.experience]
  const isDown = (w: number) =>
    w > 0 && (w + 1) % every === 0 && w < rest - rules.downWeek.skipWithinWeeksOfTaper

  const start = startVolume(v, rules)
  const target = Math.max(
    start.km,
    Math.min(rules.volume.peakKm[v.goal][v.experience], start.km * rules.volume.maxPeakMultiplier),
  )

  // Spread the climb evenly over the base + build weeks that are not down weeks.
  const firstPeak = phases.indexOf('peak') === -1 ? rest : phases.indexOf('peak')
  let growthWeeks = 0
  for (let w = 1; w < firstPeak; w++) if (!isDown(w)) growthWeeks++
  const step = growthWeeks > 0 ? (target - start.km) / growthWeeks : target - start.km

  const allowed = (km: number) =>
    Math.min(
      Math.max(km * rules.volume.maxWeeklyIncrease, rules.volume.minWeeklyIncreaseKm),
      rules.volume.maxWeeklyIncreaseKm,
    )

  const weeks: VolumeWeek[] = []
  let level = start.km
  for (let w = 0; w < rest; w++) {
    if (w === 0) {
      weeks.push({ km: round1(level), isDown: false, reason: start.reason })
    } else if (isDown(w)) {
      weeks.push({
        km: round1(level * rules.downWeek.factor),
        isDown: true,
        reason: `Down week (every ${every}th week): ${pct(rules.downWeek.factor)} of ${round1(level)} km`,
      })
    } else {
      const cap = allowed(level)
      const wanted = phases[w] === 'peak' ? target - level : Math.min(step, target - level)
      const inc = Math.max(0, Math.min(wanted, cap))
      level += inc
      weeks.push({
        km: round1(level),
        isDown: false,
        reason:
          inc > 0
            ? `+${round1(inc)} km towards peak ${round1(target)} km (max +${round1(cap)} km this week)`
            : `Hold at peak ${round1(level)} km`,
      })
    }
  }

  const peakKm = round1(level)
  // A plan too short for the full taper keeps its last (race-week) factors.
  const taperWeeks = phases.length - rest
  const factors = taperWeeks > 0 ? rules.taper.volumeFactors[v.goal].slice(-taperWeeks) : []
  factors.forEach((f, t) => {
    const raceWeek = t === factors.length - 1
    weeks.push({
      km: round1(peakKm * f),
      isDown: false,
      reason: `Taper: ${pct(f)} of peak ${peakKm} km${raceWeek ? ', excluding the race' : ''}`,
    })
  })
  return { weeks, peakKm }
}

/* ────────────────────────────── Long runs ───────────────────────────── */

export interface LongRunWeek {
  /** 0 in race week: the race is the long run. */
  km: number
  reason: string
}

export function planLongRuns(
  v: VolumeInput,
  volume: VolumeWeek[],
  easyPaceS: number,
  rules: PlanRules,
): LongRunWeek[] {
  const lr = rules.longRun
  const share = longRunShare(v, rules)
  const durationCapKm = (lr.maxDurationMin * 60) / easyPaceS
  const maxKm = Math.min(lr.maxKm[v.goal], durationCapKm)
  const maxReason =
    maxKm < lr.maxKm[v.goal]
      ? `${lr.maxDurationMin} min at easy pace (${round1(maxKm)} km)`
      : `${lr.maxKm[v.goal]} km for this distance`
  const floor = lr.neverBelowLongestRecent ? Math.min(v.longestRecentRunKm, maxKm) : 0

  const out: LongRunWeek[] = []
  let level = Math.min(Math.max(v.longestRecentRunKm, lr.minKm), maxKm)
  let peak = level

  v.phases.forEach((phase, w) => {
    const week = volume[w]
    const raceWeek = w === v.phases.length - 1
    if (raceWeek) {
      out.push({ km: 0, reason: 'Race week: the race is the long run' })
    } else if (phase === 'taper') {
      const km = roundHalf(Math.max(lr.minKm, Math.min(peak * lr.taperFactor, week.km * share)))
      out.push({ km, reason: `Taper long run: ${pct(lr.taperFactor)} of peak ${peak} km` })
    } else if (week.isDown) {
      const km = roundHalf(Math.max(lr.minKm, level * rules.downWeek.factor))
      out.push({ km, reason: `Down week: ${pct(rules.downWeek.factor)} of ${level} km` })
    } else {
      const wanted = w === 0 ? level : level + lr.weeklyIncreaseKm
      const shareCap = week.km * share
      let km = Math.min(wanted, shareCap, maxKm)
      const limits: string[] = []
      if (km < wanted) {
        limits.push(
          shareCap <= maxKm ? `${pct(share)} of ${week.km} km (${v.daysPerWeek} days/week)` : maxReason,
        )
      }
      if (km < floor) {
        km = floor
        limits.push(`not below your longest recent run (${floor} km)`)
      }
      km = roundHalf(km)
      level = km
      peak = Math.max(peak, km)
      const grow = w === 0 ? 'Start at your longest recent run' : `+${lr.weeklyIncreaseKm} km/week`
      out.push({ km, reason: `${grow}${limits.length ? `; capped at ${limits.join(', ')}` : ''}` })
    }
  })
  return out
}

/* ────────────────────────── Quality sessions ────────────────────────── */

export interface QualityWeek {
  picks: QualityPick[]
  reason: string
}

export function planQuality(v: VolumeInput, volume: VolumeWeek[], rules: PlanRules): QualityWeek[] {
  const q = rules.quality
  const done: Record<QualityType, number> = { threshold: 0, interval: 0, repetition: 0, racePace: 0 }
  const weekInPhase: Record<Phase, number> = { base: 0, build: 0, peak: 0, taper: 0 }

  return v.phases.map((phase, w) => {
    const raceWeek = w === v.phases.length - 1
    const n = Math.max(
      0,
      Math.min(q.perWeek[v.experience][phase], q.maxByDays[v.daysPerWeek], v.daysPerWeek - 2),
    )
    const menu = q.menu[phase]
    const k = weekInPhase[phase]++
    const easier = raceWeek || phase === 'taper' || volume[w].isDown

    const picks: QualityPick[] = []
    for (let i = 0; i < n; i++) {
      const type = menu[(k * n + i) % menu.length]
      const ladderTop = q.ladders[type].length - 1
      if (raceWeek) {
        picks.push({ type, rung: 0 })
      } else if (easier) {
        picks.push({ type, rung: Math.max(0, Math.min(done[type], ladderTop + 1) - 1 - q.downWeekStepBack) })
      } else {
        picks.push({ type, rung: Math.min(done[type], ladderTop) })
        done[type]++
      }
    }

    const reason =
      n === 0
        ? `No quality session in ${phase} for ${v.experience} runners`
        : `${n} quality session${n > 1 ? 's' : ''} (${phase} menu: ${menu.join(' → ')})` +
          (raceWeek
            ? '; race week: shortest version'
            : easier
              ? `; ${phase === 'taper' ? 'taper' : 'down week'}: step back ${q.downWeekStepBack}`
              : '')
    return { picks, reason }
  })
}
