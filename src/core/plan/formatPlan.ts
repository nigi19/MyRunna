import { WEEKDAY_NAMES } from '../dates'
import { formatDuration, formatPace } from '../format'
import type { PaceZoneId, PaceZones } from '../paces/types'
import type { Plan, PlannedSession } from './types'
import type { WorkoutItem, WorkoutStep } from './workouts'

const ZONE_ORDER: PaceZoneId[] = ['E', 'M', 'HMP', 'T', 'I', 'R']

export const paceRange = (zones: PaceZones, zone: PaceZoneId) =>
  `${formatPace(zones[zone].fast)}–${formatPace(zones[zone].slow)}`

function describeStep(step: WorkoutStep, zones: PaceZones): string {
  const size =
    step.distanceM !== undefined
      ? step.distanceM >= 1000
        ? `${Math.round(step.distanceM / 100) / 10} km`
        : `${Math.round(step.distanceM)} m`
      : formatDuration(step.durationS ?? 0)
  const zone = step.zone === 'jog' ? 'jog' : `${step.zone} ${paceRange(zones, step.zone)}`
  return `${step.kind} ${size} ${zone}`
}

/** One-line structure, e.g. "warmup 12:00 E … · 3 × (work 5:00 T …, recovery 1:00 jog) · cooldown …" */
export function describeWorkout(items: WorkoutItem[], zones: PaceZones): string {
  return items
    .map((item) =>
      item.kind === 'repeat'
        ? `${item.reps} × (${item.steps.map((s) => describeStep(s, zones)).join(', ')})`
        : describeStep(item, zones),
    )
    .join(' · ')
}

const sessionCell = (s: PlannedSession) => (s.type === 'rest' ? '–' : s.title)

/** The whole plan as Markdown: overview table, paces and per-week detail. */
export function formatPlanMarkdown(plan: Plan): string {
  const out: string[] = []
  const i = plan.inputs
  out.push(`# Training plan: ${i.goal.distance} on ${plan.raceDate}`, '')
  out.push(
    `Fitness ${plan.paceModelId.toUpperCase()} ${plan.fitness.toFixed(1)} · ${i.daysPerWeek} days/week · long run ${WEEKDAY_NAMES[i.longRunDay]} · ${i.experience} · start ${plan.startDate}`,
    '',
  )
  for (const w of plan.warnings) out.push(`> ${w}`)
  out.push('', '## Paces (per km)', '', '| Zone | Pace |', '| --- | --- |')
  for (const z of ZONE_ORDER) out.push(`| ${z} | ${paceRange(plan.zones, z)} |`)

  out.push('', '## Overview', '')
  out.push(`| Wk | Mon | Phase | km | Long | Hard | ${WEEKDAY_NAMES.join(' | ')} |`)
  out.push(
    `| ${Array(5 + 7 + 1)
      .fill('---')
      .join(' | ')} |`,
  )
  for (const w of plan.weeks) {
    const tag = w.isRaceWeek ? ' 🏁' : w.isDownWeek ? ' ↓' : ''
    out.push(
      `| ${w.index + 1} | ${w.startDate.slice(5)} | ${w.phase}${tag} | ${w.km} | ${w.longRunKm} | ${Math.round(w.hardShare * 100)} % | ${w.sessions.map(sessionCell).join(' | ')} |`,
    )
  }

  out.push('', '## Weeks', '')
  for (const w of plan.weeks) {
    out.push(`### Week ${w.index + 1} · ${w.startDate} · ${w.phase}${w.isDownWeek ? ' (down week)' : ''}`, '')
    for (const r of w.reasons) out.push(`- ${r}`)
    out.push('')
    for (const s of w.sessions.filter((x) => x.type !== 'rest')) {
      out.push(
        `- **${WEEKDAY_NAMES[s.weekday]} ${s.date}: ${s.title}** · ${s.distanceKm} km · ~${s.durationMin} min`,
        `  - ${describeWorkout(s.items, plan.zones)}`,
        `  - _${s.reason}_`,
      )
    }
    out.push('')
  }
  return out.join('\n')
}
