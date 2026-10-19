// Prints the example plan as Markdown: `npm run plan > docs/example-plan.md`
import { exampleHalfMarathon } from '../src/core/plan/examples'
import { formatPlanMarkdown } from '../src/core/plan/formatPlan'
import { generatePlan } from '../src/core/plan/generatePlan'

console.log(formatPlanMarkdown(generatePlan(exampleHalfMarathon)))
