import type { Weekday } from '../dates'

export interface PlacementRequest {
  /** Days you can run, excluding the anchor. */
  available: Weekday[]
  /** Long-run day (or race day in race week): always a run, always "hard". */
  anchor: Weekday
  nQuality: number
  nEasy: number
  /** Minimum days between two hard days. */
  minGap: number
}

export interface Placement {
  anchor: Weekday
  quality: Weekday[]
  easy: Weekday[]
  /** Quality sessions that could not be placed with enough spacing. */
  droppedQuality: number
  /** Easy runs that did not fit in the available days. */
  droppedEasy: number
}

/** Days apart, wrapping around the week (Sat → next Mon = 2). */
export const gap = (a: Weekday, b: Weekday) => {
  const d = Math.abs(a - b)
  return Math.min(d, 7 - d)
}

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]]
  if (items.length < k) return []
  const [first, ...rest] = items
  return [...combinations(rest, k - 1).map((c) => [first, ...c]), ...combinations(rest, k)]
}

const pairGaps = (days: Weekday[]) => {
  const gaps: number[] = []
  for (let i = 0; i < days.length; i++)
    for (let j = i + 1; j < days.length; j++) gaps.push(gap(days[i], days[j]))
  return gaps
}

const minOf = (xs: number[]) => (xs.length ? Math.min(...xs) : 7)
const sumOf = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

/** Compare score tuples: higher is better, earlier entries win. */
const better = (a: number[], b: number[]) => {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

function best<T>(options: T[], score: (o: T) => number[]): T | undefined {
  let winner: T | undefined
  let winnerScore: number[] = []
  for (const option of options) {
    const s = score(option)
    if (winner === undefined || better(s, winnerScore)) {
      winner = option
      winnerScore = s
    }
  }
  return winner
}

/**
 * Picks run days for one week, deterministically:
 * 1. quality days as far from the anchor and each other as possible, never
 *    closer than `minGap`; if that's impossible a session is dropped;
 * 2. easy days spread evenly between all runs, avoiding the day right before
 *    a hard day where possible.
 * Ties go to the earlier weekday.
 */
export function placeWeek(req: PlacementRequest): Placement {
  const candidates = req.available.filter((d) => d !== req.anchor).sort((a, b) => a - b)

  let nQuality = Math.min(req.nQuality, candidates.length)
  let quality: Weekday[] = []
  for (; nQuality > 0; nQuality--) {
    const feasible = combinations(candidates, nQuality).filter(
      (combo) => minOf(pairGaps([req.anchor, ...combo])) >= req.minGap,
    )
    const pick = best(feasible, (combo) => {
      const gaps = pairGaps([req.anchor, ...combo])
      return [minOf(gaps), sumOf(gaps), -sumOf(combo)]
    })
    if (pick) {
      quality = pick
      break
    }
  }

  const hard = [req.anchor, ...quality]
  const remaining = candidates.filter((d) => !quality.includes(d))
  const nEasy = Math.min(req.nEasy, remaining.length)
  const easy =
    best(combinations(remaining, nEasy), (combo) => {
      const runs = [...hard, ...combo]
      const dayBeforeHard = combo.filter((d) => hard.includes(((d + 1) % 7) as Weekday)).length
      return [minOf(pairGaps(runs)), -dayBeforeHard, sumOf(pairGaps(runs)), -sumOf(combo)]
    }) ?? []

  return {
    anchor: req.anchor,
    quality,
    easy,
    droppedQuality: req.nQuality - quality.length,
    droppedEasy: req.nEasy - easy.length,
  }
}
