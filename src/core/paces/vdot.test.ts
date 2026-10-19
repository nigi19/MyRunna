import { describe, expect, it } from 'vitest'
import { rules } from '../config'
import { HALF_MARATHON_M, MARATHON_M, predictRaceTimeS, vdotFromRace, vdotPaceModel } from './vdot'

const hms = (h: number, m: number, s: number) => h * 3600 + m * 60 + s
const centre = (r: { fast: number; slow: number }) => (r.fast + r.slow) / 2

// Race-equivalency rows from Daniels' Running Formula VDOT table.
const table = [
  { vdot: 30, k5: hms(0, 30, 40), k10: hms(1, 3, 46), half: hms(2, 21, 4), full: hms(4, 49, 17) },
  { vdot: 40, k5: hms(0, 24, 8), k10: hms(0, 50, 3), half: hms(1, 50, 59), full: hms(3, 49, 45) },
  { vdot: 50, k5: hms(0, 19, 57), k10: hms(0, 41, 21), half: hms(1, 31, 35), full: hms(3, 10, 49) },
  { vdot: 60, k5: hms(0, 17, 3), k10: hms(0, 35, 22), half: hms(1, 18, 9), full: hms(2, 43, 25) },
]

describe('VDOT race equivalency', () => {
  it.each(table)('predicts Daniels table times for VDOT $vdot within 0.5%', (row) => {
    const cases: [number, number][] = [
      [5000, row.k5],
      [10000, row.k10],
      [HALF_MARATHON_M, row.half],
      [MARATHON_M, row.full],
    ]
    for (const [distance, expected] of cases) {
      const predicted = predictRaceTimeS(row.vdot, distance)
      expect(Math.abs(predicted - expected) / expected).toBeLessThan(0.005)
    }
  })

  it('round-trips race → VDOT → race', () => {
    const race = { distanceM: 10000, timeS: hms(0, 65, 0) }
    const vdot = vdotFromRace(race)
    expect(vdot).toBeCloseTo(29.35, 1)
    expect(predictRaceTimeS(vdot, 10000)).toBeCloseTo(race.timeS, 0)
  })

  it('rejects non-positive input', () => {
    expect(() => vdotFromRace({ distanceM: 0, timeS: 100 })).toThrow()
  })
})

describe('VDOT training zones', () => {
  // Daniels table, seconds per km.
  const expected = [
    { vdot: 40, T: hms(0, 5, 6), I: hms(0, 4, 42) },
    { vdot: 50, T: hms(0, 4, 15), I: hms(0, 3, 55) },
  ]

  it.each(expected)('matches Daniels T and I pace for VDOT $vdot within 3 s/km', (row) => {
    const z = vdotPaceModel.zones(row.vdot, rules.paces)
    expect(Math.abs(centre(z.T) - row.T)).toBeLessThanOrEqual(3)
    expect(Math.abs(centre(z.I) - row.I)).toBeLessThanOrEqual(3)
  })

  it('orders zones from slow to fast', () => {
    const z = vdotPaceModel.zones(45, rules.paces)
    const order = [z.E.slow, z.E.fast, centre(z.M), centre(z.HMP), centre(z.T), centre(z.I), centre(z.R)]
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeLessThan(order[i - 1])
  })
})
