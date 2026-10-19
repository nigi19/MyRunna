import { formatPace } from '../../core/format'
import type { PlannedSession } from '../../core/plan/types'
import type { StepZone, WorkoutItem, WorkoutStep } from '../../core/plan/workouts'
import type { PaceZones } from '../../core/paces/types'
import {
  formatDate,
  formatMinutes,
  formatStepDistance,
  formatStepDuration,
  SESSION_COLORS,
  SESSION_LABELS,
  STEP_LABELS,
  zoneLabel,
} from '../lib/labels'

function pace(zone: StepZone, zones: PaceZones) {
  const range = zone === 'jog' ? zones.E : zones[zone]
  if (zone === 'jog') return `>${formatPace(range.fast)}/km`
  return `${formatPace(range.fast)}–${formatPace(range.slow)}/km`
}

function StepRow({ step, zones }: { step: WorkoutStep; zones: PaceZones }) {
  const size =
    step.distanceM !== undefined
      ? formatStepDistance(step.distanceM)
      : formatStepDuration(step.durationS ?? 0)
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5">
      <span>
        <span className="font-medium">{STEP_LABELS[step.kind]}</span> {size}
        <span className="text-zinc-500"> · {zoneLabel(step.zone)}</span>
      </span>
      <span className="shrink-0 font-mono text-sm tabular-nums">{pace(step.zone, zones)}</span>
    </li>
  )
}

export function WorkoutStructure({ items, zones }: { items: WorkoutItem[]; zones: PaceZones }) {
  return (
    <ol className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800" aria-label="Workout structure">
      {items.map((item, i) =>
        item.kind === 'repeat' ? (
          <li key={i} className="py-1.5">
            <span className="font-semibold">{item.reps} ×</span>
            <ol className="ml-3 border-l-2 border-zinc-200 pl-3 dark:border-zinc-700">
              {item.steps.map((s, j) => (
                <StepRow key={j} step={s} zones={zones} />
              ))}
            </ol>
            {item.steps.some((s) => s.kind === 'recovery') && (
              <p className="text-xs text-zinc-500">No recovery after the last rep.</p>
            )}
          </li>
        ) : (
          <StepRow key={i} step={item} zones={zones} />
        ),
      )}
    </ol>
  )
}

export function SessionDot({ session }: { session: Pick<PlannedSession, 'type'> }) {
  return (
    <span
      aria-hidden
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${SESSION_COLORS[session.type]}`}
    />
  )
}

export function SessionCard({
  session,
  zones,
  showDate = true,
  showReason = true,
}: {
  session: PlannedSession
  zones: PaceZones
  showDate?: boolean
  showReason?: boolean
}) {
  return (
    <div className="space-y-3">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          <SessionDot session={session} />
          {SESSION_LABELS[session.type]}
          {showDate && <span className="font-normal normal-case">· {formatDate(session.date)}</span>}
        </p>
        <h2 className="mt-1 text-xl font-bold">{session.title}</h2>
        {session.type !== 'rest' && (
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            {session.distanceKm} km · ~{formatMinutes(session.durationMin)}
            {session.hardMin > 0 && ` · ${session.hardMin} min hard`}
          </p>
        )}
      </div>
      {session.items.length > 0 && <WorkoutStructure items={session.items} zones={zones} />}
      {showReason && (
        <details className="text-sm text-zinc-600 dark:text-zinc-400">
          <summary className="cursor-pointer select-none font-medium">Why this session?</summary>
          <p className="mt-1">{session.reason}</p>
        </details>
      )}
    </div>
  )
}
