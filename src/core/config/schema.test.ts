import { describe, expect, it } from 'vitest'
import { planRules } from './planRules'
import { parsePlanRules, PlanRulesError } from './schema'

/** A deep copy of the default rules with `edit` applied. */
const withEdit = (edit: (r: any) => void) => {
  const copy = structuredClone(planRules)
  edit(copy)
  return copy
}

const issuesOf = (input: unknown): string[] => {
  try {
    parsePlanRules(input)
    return []
  } catch (e) {
    if (e instanceof PlanRulesError) return e.issues
    throw e
  }
}

describe('plan rules schema', () => {
  it('accepts the default planRules.ts', () => {
    expect(issuesOf(planRules)).toEqual([])
  })

  it.each([
    ['a missing section', (r: any) => delete r.longRun, 'longRun'],
    ['a misspelt key', (r: any) => (r.downWeek.factr = 0.7), 'downWeek'],
    ['a fraction above 1', (r: any) => (r.intensity.maxHardShare = 20), 'intensity.maxHardShare'],
    [
      'a missing days-per-week entry',
      (r: any) => delete r.longRun.maxShareByDays[5],
      'longRun.maxShareByDays.5',
    ],
    ['an unknown quality type', (r: any) => (r.quality.menu.build = ['tempo']), 'quality.menu.build.0'],
    [
      'a rung with both workMin and workM',
      (r: any) => (r.quality.ladders.interval[0].workM = 400),
      'quality.ladders.interval.0',
    ],
  ])('rejects %s', (_label, edit, path) => {
    const issues = issuesOf(withEdit(edit))
    expect(issues.some((i) => i.startsWith(path))).toBe(true)
  })

  it.each([
    ['easy range reversed', (r: any) => (r.paces.easy = [0.74, 0.59]), 'paces.easy'],
    ['threshold slower than easy', (r: any) => (r.paces.threshold = 0.7), 'paces'],
    ['phase split leaving no build', (r: any) => (r.phaseSplit = { base: 0.6, peak: 0.4 }), 'phaseSplit'],
    [
      'taper factors not matching taper weeks',
      (r: any) => (r.taper.weeks.half = 3),
      'taper.volumeFactors.half',
    ],
    ['min weeks shorter than the taper', (r: any) => (r.minWeeks.marathon = 3), 'minWeeks.marathon'],
    [
      'upgrade needing more hits than the window',
      (r: any) => (r.adapt.upgradeAfterHits = 9),
      'adapt.upgradeAfterHits',
    ],
  ])('rejects an impossible combination: %s', (_label, edit, path) => {
    const issues = issuesOf(withEdit(edit))
    expect(issues.some((i) => i.startsWith(path))).toBe(true)
  })

  it('lists every problem in one readable error', () => {
    const broken = withEdit((r) => {
      r.intensity.maxHardShare = 2
      r.easy.minKm = -1
    })
    expect(() => parsePlanRules(broken)).toThrow(/intensity\.maxHardShare[\s\S]*easy\.minKm/)
  })
})
