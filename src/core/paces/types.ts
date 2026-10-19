/** Training intensity zones. HMP = half-marathon pace. */
export type PaceZoneId = 'E' | 'M' | 'HMP' | 'T' | 'I' | 'R'

/** A pace range in seconds per km; `fast` <= `slow`. */
export interface PaceRange {
  fast: number
  slow: number
}

export type PaceZones = Record<PaceZoneId, PaceRange>

export interface RacePerformance {
  distanceM: number
  timeS: number
}

/**
 * A fitness model turns a race result into a fitness value, training paces
 * and race predictions. Swap implementations to try other methods.
 */
export interface PaceModel<TSettings = unknown> {
  readonly id: string
  fitnessFromRace(race: RacePerformance): number
  zones(fitness: number, settings: TSettings): PaceZones
  predictTimeS(fitness: number, distanceM: number): number
}
