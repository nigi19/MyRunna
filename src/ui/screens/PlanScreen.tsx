import { useState } from 'react'
import { WEEKDAY_NAMES } from '../../core/dates'
import type { PlanWeek } from '../../core/plan/types'
import { useApp } from '../appContext'
import { SessionCard, SessionDot } from '../components/SessionCard'
import { Badge, Card } from '../components/ui'
import { formatDate, PHASE_LABELS } from '../lib/labels'
import { activitiesFor, findWeek } from '../lib/planQueries'

const PHASE_STYLES = {
  base: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
  build: 'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  peak: 'bg-orange-100 text-orange-900 dark:bg-orange-950 dark:text-orange-200',
  taper: 'bg-violet-100 text-violet-900 dark:bg-violet-950 dark:text-violet-200',
}

function WeekCard({
  week,
  current,
  defaultOpen,
}: {
  week: PlanWeek
  current: boolean
  defaultOpen: boolean
}) {
  const { active, activities, today } = useApp()
  const [open, setOpen] = useState(defaultOpen)
  const [selected, setSelected] = useState<string>()
  const plan = active!.plan

  return (
    <Card className={current ? 'ring-2 ring-emerald-500 dark:ring-emerald-500' : ''}>
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>
          <span className="font-semibold">Week {week.index + 1}</span>
          <span className="text-sm text-zinc-500"> · {formatDate(week.startDate)}</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <Badge className={PHASE_STYLES[week.phase]}>
            {PHASE_LABELS[week.phase]}
            {week.isDownWeek && ' ↓'}
            {week.isRaceWeek && ' 🏁'}
          </Badge>
          <span className="w-14 text-right tabular-nums">{week.km} km</span>
        </span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {week.sessions.map((s) => {
              const done = activitiesFor(active!.id, s.date, activities).length > 0
              const isSelected = selected === s.date
              return (
                <li key={s.date}>
                  <button
                    type="button"
                    disabled={s.type === 'rest'}
                    onClick={() => setSelected(isSelected ? undefined : s.date)}
                    className={`flex w-full items-center gap-3 py-2 text-left text-sm ${s.date === today ? 'font-semibold' : ''}`}
                  >
                    <span className="w-8 text-zinc-500">{WEEKDAY_NAMES[s.weekday]}</span>
                    <SessionDot session={s} />
                    <span className={`flex-1 ${s.type === 'rest' ? 'text-zinc-400' : ''}`}>{s.title}</span>
                    <span className="tabular-nums text-zinc-500">
                      {done ? '✓' : s.type === 'rest' ? '' : `${s.distanceKm} km`}
                    </span>
                  </button>
                  {isSelected && (
                    <div className="pb-3 pl-11">
                      <SessionCard session={s} zones={plan.zones} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          <details className="text-sm text-zinc-600 dark:text-zinc-400">
            <summary className="cursor-pointer select-none font-medium">
              Why this week looks like this
            </summary>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {week.reasons.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Card>
  )
}

export function PlanScreen() {
  const { active, today } = useApp()
  if (!active) return null
  const plan = active.plan
  const current = findWeek(plan, today)

  return (
    <div className="space-y-3">
      <header>
        <h1 className="text-2xl font-bold">Plan</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          {plan.weeks.length} weeks · race {formatDate(plan.raceDate)} · tap a week, then a session for
          details
        </p>
      </header>
      {plan.weeks.map((w) => (
        <WeekCard
          key={w.startDate}
          week={w}
          current={w === current}
          defaultOpen={current ? w === current : w.index === 0}
        />
      ))}
    </div>
  )
}
