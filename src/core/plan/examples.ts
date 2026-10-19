import type { PlanInputs } from './types'

/** Niels's profile: used by the golden test and `npm run plan`. */
export const exampleHalfMarathon: PlanInputs = {
  goal: { distance: 'half', raceDate: '2027-02-28' },
  anchor: { distanceM: 10000, timeS: 65 * 60 },
  experience: 'intermediate',
  currentWeeklyKm: 15,
  longestRecentRunKm: 10,
  daysPerWeek: 3,
  longRunDay: 5,
  startDate: '2026-10-26',
}
