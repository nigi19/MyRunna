import { describe, expect, it } from 'vitest'
import { rules } from '../config'
import { addDays, daysBetween, weekdayOf, type Weekday } from '../dates'
import { DAYS_PER_WEEK, EXPERIENCE_LEVELS, GOAL_DISTANCE_M, GOAL_DISTANCES } from '../types'
import { exampleHalfMarathon } from './examples'
import { generatePlan, PlanInputError } from './generatePlan'
import { planVolume } from './progression'
import { gap } from './schedule'
import type { Plan, PlanInputs, PlannedSession } from './types'

const HARD = new Set(['threshold', 'interval', 'repetition', 'racePace', 'long', 'race'])
const runs = (sessions: PlannedSession[]) => sessions.filter((s) => s.type !== 'rest')

describe('example plan: half marathon, 3 days/week', () => {
  const plan = generatePlan(exampleHalfMarathon)

  it('runs 18 weeks from Mon 26 Oct 2026 to the race on Sun 28 Feb 2027', () => {
    expect(plan.weeks).toHaveLength(18)
    expect(plan.startDate).toBe('2026-10-26')
    const race = plan.weeks.at(-1)!.sessions.find((s) => s.type === 'race')!
    expect(race.date).toBe('2027-02-28')
    expect(race.distanceKm).toBeCloseTo(21.1, 1)
  })

  it('splits phases 6 base / 6 build / 4 peak / 2 taper', () => {
    const count = (p: string) => plan.weeks.filter((w) => w.phase === p).length
    expect([count('base'), count('build'), count('peak'), count('taper')]).toEqual([6, 6, 4, 2])
  })

  it('has a down week every 4th week', () => {
    expect(plan.weeks.filter((w) => w.isDownWeek).map((w) => w.index + 1)).toEqual([4, 8, 12])
  })

  it('uses Tue quality, Thu easy, Sat long every training week', () => {
    for (const w of plan.weeks.slice(0, -1)) {
      expect(
        runs(w.sessions).map((s) => [
          s.weekday,
          s.type === 'easy' ? 'easy' : s.type === 'long' ? 'long' : 'q',
        ]),
      ).toEqual([
        [1, 'q'],
        [3, 'easy'],
        [5, 'long'],
      ])
    }
  })

  it('climbs from ~18 km to a ~32 km peak and long runs from 10 to 17.5 km', () => {
    const km = plan.weeks.map((w) => w.km)
    expect(km[0]).toBeGreaterThanOrEqual(18)
    expect(Math.max(...km)).toBeGreaterThanOrEqual(31)
    expect(Math.max(...km)).toBeLessThanOrEqual(33)
    expect(plan.weeks[0].longRunKm).toBe(10)
    expect(Math.max(...plan.weeks.slice(0, -1).map((w) => w.longRunKm))).toBe(17.5)
  })

  it('keeps at least 80 % of running time easy every week', () => {
    for (const w of plan.weeks) expect(w.hardShare).toBeLessThanOrEqual(rules.intensity.maxHardShare)
  })

  it('progresses workouts up their ladders', () => {
    const thresholds = plan.weeks
      .flatMap((w) => w.sessions)
      .filter((s) => s.type === 'threshold')
      .map((s) => s.title)
    expect(thresholds[0]).toBe('Threshold: 3 × 5 min @ T, 1 min jog')
    expect(thresholds.at(-1)).toBe('Threshold: 2 × 15 min @ T, 3 min jog')
  })

  it('matches the golden overview', () => {
    const overview = plan.weeks.map(
      (w) =>
        `${w.index + 1} ${w.phase}${w.isDownWeek ? '↓' : ''} ${w.km}km LR${w.longRunKm} ` +
        runs(w.sessions)
          .map((s) => s.title)
          .join(' | '),
    )
    expect(overview).toMatchSnapshot()
  })
})

/* ──────────────────── Invariants over many profiles ──────────────────── */

const profiles: PlanInputs[] = []
for (const distance of GOAL_DISTANCES)
  for (const experience of EXPERIENCE_LEVELS)
    for (const daysPerWeek of DAYS_PER_WEEK)
      for (const [currentWeeklyKm, longestRecentRunKm] of [
        [5, 4],
        [15, 10],
        [45, 18],
      ])
        for (const raceDate of ['2027-02-28', '2027-01-06'])
          profiles.push({
            goal: { distance, raceDate },
            anchor: { distanceM: 5000, timeS: 25 * 60 },
            experience,
            currentWeeklyKm,
            longestRecentRunKm,
            daysPerWeek,
            longRunDay: 6,
            unavailableWeekdays: daysPerWeek <= 5 ? [4] : [],
            startDate: '2026-10-26',
          })

const label = (p: PlanInputs) =>
  `${p.goal.distance} ${p.experience} ${p.daysPerWeek}d ${p.currentWeeklyKm}km ${p.goal.raceDate}`

describe.each(profiles.map((p) => [label(p), p] as const))('invariants: %s', (_name, inputs) => {
  const plan: Plan = generatePlan(inputs)

  it('has consecutive weeks ending in race week', () => {
    plan.weeks.forEach((w, i) => {
      expect(w.startDate).toBe(addDays(plan.startDate, i * 7))
      expect(w.sessions.map((s) => s.date)).toEqual([0, 1, 2, 3, 4, 5, 6].map((d) => addDays(w.startDate, d)))
    })
    const race = plan.weeks.at(-1)!.sessions.filter((s) => s.type === 'race')
    expect(race).toHaveLength(1)
    expect(race[0].date).toBe(inputs.goal.raceDate)
    expect(race[0].distanceKm).toBeCloseTo(GOAL_DISTANCE_M[inputs.goal.distance] / 1000, 1)
  })

  it('schedules the right number of runs, never on unavailable days', () => {
    for (const w of plan.weeks) {
      const r = runs(w.sessions)
      if (w.isRaceWeek) expect(r.length).toBeLessThanOrEqual(inputs.daysPerWeek)
      else expect(r.length).toBe(inputs.daysPerWeek)
      for (const s of r) expect(inputs.unavailableWeekdays ?? []).not.toContain(s.weekday)
    }
  })

  it('keeps hard days apart', () => {
    for (const w of plan.weeks) {
      const hard = w.sessions.filter((s) => HARD.has(s.type)).map((s) => s.weekday)
      for (let i = 0; i < hard.length; i++)
        for (let j = i + 1; j < hard.length; j++) {
          expect(gap(hard[i] as Weekday, hard[j] as Weekday)).toBeGreaterThanOrEqual(
            rules.spacing.minDaysBetweenHard,
          )
        }
    }
  })

  it('respects 80/20, long-run and easy-run limits', () => {
    for (const w of plan.weeks) {
      const capped = w.reasons.some((r) => r.includes('even at the smallest session'))
      if (!capped) expect(w.hardShare).toBeLessThanOrEqual(rules.intensity.maxHardShare + 1e-9)
      for (const s of w.sessions) {
        if (s.type === 'long')
          expect(s.distanceKm).toBeLessThanOrEqual(rules.longRun.maxKm[inputs.goal.distance])
        if (s.type === 'easy') expect(s.distanceKm).toBeGreaterThanOrEqual(rules.easy.minKm)
      }
    }
  })

  it('explains every week and session', () => {
    for (const w of plan.weeks) {
      expect(w.reasons.length).toBeGreaterThan(2)
      for (const s of w.sessions) expect(s.reason).not.toBe('')
    }
  })

  it('is deterministic', () => {
    expect(generatePlan(inputs)).toEqual(plan)
  })
})

describe('volume progression', () => {
  it('never grows faster than the weekly cap', () => {
    for (const p of profiles) {
      const phases = generatePlan(p).weeks.map((w) => w.phase)
      const { weeks } = planVolume({ ...p, goal: p.goal.distance, phases }, rules)
      let previous = weeks[0].km
      for (const w of weeks.slice(1)) {
        if (w.isDown || w.reason.startsWith('Taper')) continue
        const cap = Math.min(
          Math.max(previous * rules.volume.maxWeeklyIncrease, rules.volume.minWeeklyIncreaseKm),
          rules.volume.maxWeeklyIncreaseKm,
        )
        expect(w.km - previous).toBeLessThanOrEqual(cap + 0.11)
        previous = w.km
      }
    }
  })
})

describe('inputs', () => {
  it('starts on the next Monday', () => {
    const plan = generatePlan({ ...exampleHalfMarathon, startDate: '2026-10-21' })
    expect(plan.startDate).toBe('2026-10-26')
    expect(weekdayOf(plan.startDate)).toBe(0)
  })

  it('starts later when the race is further away than maxWeeks', () => {
    const plan = generatePlan({ ...exampleHalfMarathon, startDate: '2026-01-05' })
    expect(plan.weeks).toHaveLength(rules.maxWeeks)
    expect(plan.warnings.some((w) => w.includes('the plan starts on'))).toBe(true)
  })

  it('warns about a short plan', () => {
    const plan = generatePlan({ ...exampleHalfMarathon, startDate: '2027-01-25' })
    expect(daysBetween(plan.startDate, plan.raceDate)).toBeLessThan(rules.minWeeks.half * 7)
    expect(plan.warnings.some((w) => w.includes('recommended'))).toBe(true)
  })

  it('moves the long run off an unavailable day', () => {
    const plan = generatePlan({ ...exampleHalfMarathon, unavailableWeekdays: [5] })
    expect(plan.weeks[0].sessions.find((s) => s.type === 'long')!.weekday).toBe(6)
  })

  it('rejects impossible inputs', () => {
    expect(() => generatePlan({ ...exampleHalfMarathon, startDate: '2027-02-27' })).toThrow(PlanInputError)
    expect(() => generatePlan({ ...exampleHalfMarathon, startDate: '26-10-2026' })).toThrow(PlanInputError)
    expect(() =>
      generatePlan({ ...exampleHalfMarathon, daysPerWeek: 6, unavailableWeekdays: [0, 1, 2] }),
    ).toThrow(PlanInputError)
  })
})
