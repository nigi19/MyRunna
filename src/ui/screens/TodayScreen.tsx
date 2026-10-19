import { daysBetween, WEEKDAY_NAMES } from '../../core/dates'
import { formatDuration, formatPace } from '../../core/format'
import type { PlannedSession, PlanWeek } from '../../core/plan/types'
import type { CompletedActivity } from '../../data'
import { useApp } from '../appContext'
import { SessionCard, SessionDot } from '../components/SessionCard'
import { Badge, Button, Card } from '../components/ui'
import { formatDate, PHASE_LABELS } from '../lib/labels'
import { activitiesFor, findSession, nextRun, planStatus } from '../lib/planQueries'

function DoneNote({ runs }: { runs: CompletedActivity[] }) {
  return (
    <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
      <p className="font-semibold">✓ Done</p>
      {runs.map((r) => (
        <p key={r.id}>
          {r.distanceKm} km in {formatDuration(r.durationS)}
          {r.distanceKm > 0 && ` · ${formatPace(r.durationS / r.distanceKm)}/km`}
          {r.rpe && ` · effort ${r.rpe}/10`}
        </p>
      ))}
    </div>
  )
}

function WeekStrip({ week, planId, today }: { week: PlanWeek; planId: string; today: string }) {
  const { activities } = useApp()
  return (
    <ol className="grid grid-cols-7 gap-1 text-center text-xs" aria-label="This week">
      {week.sessions.map((s) => {
        const done = activitiesFor(planId, s.date, activities).length > 0
        const isToday = s.date === today
        return (
          <li
            key={s.date}
            className={`flex flex-col items-center gap-1 rounded-lg py-1.5 ${isToday ? 'bg-zinc-100 font-semibold dark:bg-zinc-800' : ''}`}
            title={s.title}
          >
            <span>{WEEKDAY_NAMES[s.weekday]}</span>
            <SessionDot session={s} />
            <span className="h-4 text-zinc-500">
              {done ? '✓' : s.type === 'rest' ? '' : `${Math.round(s.distanceKm)}`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function TodayScreen({ onLog }: { onLog: (session?: PlannedSession) => void }) {
  const { active, activities, today } = useApp()
  if (!active) return null
  const plan = active.plan
  const status = planStatus(plan, today)

  if (status.kind === 'before') {
    const first = nextRun(plan, today)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Your plan starts in {status.daysToStart} days</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Until {formatDate(plan.startDate)}, keep running easy as you do now.
        </p>
        {first && (
          <Card>
            <p className="mb-2 text-sm font-medium text-zinc-500">First session</p>
            <SessionCard session={first} zones={plan.zones} />
          </Card>
        )}
      </div>
    )
  }

  if (status.kind === 'after') {
    const race = findSession(plan, plan.raceDate)
    const raceRuns = activitiesFor(active.id, plan.raceDate, activities)
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">🏁 Plan complete</h1>
        {raceRuns.length > 0 ? (
          <DoneNote runs={raceRuns} />
        ) : (
          race && <Button onClick={() => onLog(race)}>Log your race</Button>
        )}
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Recover with a few easy days, then set up your next goal under Settings → New plan.
        </p>
      </div>
    )
  }

  const { week, session } = status
  const runs = activitiesFor(active.id, today, activities)
  const upcoming = session.type === 'rest' ? nextRun(plan, today) : undefined
  const daysToRace = daysBetween(today, plan.raceDate)

  return (
    <div className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">{formatDate(today)}</p>
          <h1 className="text-2xl font-bold">What do I run today?</h1>
        </div>
        <div className="text-right text-xs text-zinc-500">
          <Badge className="whitespace-nowrap bg-zinc-100 dark:bg-zinc-800">
            {PHASE_LABELS[week.phase]} · week {week.index + 1}/{plan.weeks.length}
          </Badge>
          <p className="mt-1">{daysToRace === 0 ? 'Race day!' : `${daysToRace} days to race`}</p>
        </div>
      </header>

      <Card className="space-y-4">
        <SessionCard session={session} zones={plan.zones} showDate={false} />
        {runs.length > 0 ? (
          <DoneNote runs={runs} />
        ) : (
          session.type !== 'rest' && (
            <Button className="w-full" onClick={() => onLog(session)}>
              Log this run
            </Button>
          )
        )}
      </Card>

      {upcoming && (
        <Card>
          <p className="mb-2 text-sm font-medium text-zinc-500">Next run</p>
          <SessionCard session={upcoming} zones={plan.zones} showReason={false} />
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-baseline justify-between">
          <h2 className="font-semibold">This week</h2>
          <span className="text-sm text-zinc-500">
            {week.km} km{week.isDownWeek && ' · down week'}
          </span>
        </div>
        <WeekStrip week={week} planId={active.id} today={today} />
      </Card>
    </div>
  )
}
