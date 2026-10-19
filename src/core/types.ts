export const GOAL_DISTANCES = ['5k', '10k', 'half', 'marathon'] as const
export type GoalDistance = (typeof GOAL_DISTANCES)[number]

export const GOAL_DISTANCE_M: Record<GoalDistance, number> = {
  '5k': 5000,
  '10k': 10000,
  half: 21097.5,
  marathon: 42195,
}

export const EXPERIENCE_LEVELS = ['beginner', 'intermediate', 'advanced'] as const
export type Experience = (typeof EXPERIENCE_LEVELS)[number]

export const PHASES = ['base', 'build', 'peak', 'taper'] as const
export type Phase = (typeof PHASES)[number]

export const DAYS_PER_WEEK = [3, 4, 5, 6, 7] as const
export type DaysPerWeek = (typeof DAYS_PER_WEEK)[number]

/** Quality session kinds. `racePace` resolves to the goal's pace zone. */
export const QUALITY_TYPES = ['threshold', 'interval', 'repetition', 'racePace'] as const
export type QualityType = (typeof QUALITY_TYPES)[number]
