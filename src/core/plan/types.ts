import type { ISODate, Weekday } from '../dates'
import type { PaceZones, RacePerformance } from '../paces/types'
import type { DaysPerWeek, Experience, GoalDistance, Phase, QualityType } from '../types'
import type { WorkoutItem } from './workouts'

export interface PlanInputs {
  goal: { distance: GoalDistance; raceDate: ISODate }
  /** One recent (or estimated) race: sets your fitness. */
  anchor: RacePerformance
  experience: Experience
  currentWeeklyKm: number
  longestRecentRunKm: number
  daysPerWeek: DaysPerWeek
  longRunDay: Weekday
  unavailableWeekdays?: Weekday[]
  /** The plan starts on the first Monday on or after this date. */
  startDate: ISODate
}

export type SessionType = 'rest' | 'easy' | 'long' | QualityType | 'race'

export interface PlannedSession {
  date: ISODate
  weekday: Weekday
  type: SessionType
  title: string
  items: WorkoutItem[]
  distanceKm: number
  durationMin: number
  hardMin: number
  reason: string
}

export interface PlanWeek {
  index: number
  startDate: ISODate
  phase: Phase
  /** 1-based week number within its phase. */
  phaseWeek: number
  isDownWeek: boolean
  isRaceWeek: boolean
  km: number
  longRunKm: number
  /** Share of running time at T/I/R/goal pace (race excluded). */
  hardShare: number
  sessions: PlannedSession[]
  reasons: string[]
}

export interface Plan {
  inputs: PlanInputs
  paceModelId: string
  fitness: number
  zones: PaceZones
  startDate: ISODate
  raceDate: ISODate
  weeks: PlanWeek[]
  warnings: string[]
}
