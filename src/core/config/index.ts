import { planRules } from './planRules'
import { parsePlanRules } from './schema'

export type { PlanRules } from './schema'
export { parsePlanRules, PlanRulesError } from './schema'

/** The validated rules. Importing this throws at startup if planRules.ts is invalid. */
export const rules = parsePlanRules(planRules)
