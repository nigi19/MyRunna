import { useMemo, useState } from 'react'
import { rules } from '../../core/config'
import { addDays, isIsoDate, WEEKDAY_NAMES, type Weekday } from '../../core/dates'
import { formatDuration, parseDuration } from '../../core/format'
import { generatePlan } from '../../core/plan/generatePlan'
import type { PlanInputs } from '../../core/plan/types'
import {
  DAYS_PER_WEEK,
  GOAL_DISTANCE_M,
  type DaysPerWeek,
  type Experience,
  type GoalDistance,
} from '../../core/types'
import { useApp } from '../appContext'
import { Button, Card, Choice, Field, inputClass } from '../components/ui'

const GOALS: { value: GoalDistance; label: string }[] = [
  { value: '5k', label: '5K' },
  { value: '10k', label: '10K' },
  { value: 'half', label: 'Half' },
  { value: 'marathon', label: 'Marathon' },
]

const EXPERIENCE: { value: Experience; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
]

const WEEKDAYS = WEEKDAY_NAMES.map((label, value) => ({ value: value as Weekday, label }))

interface Form {
  goal: GoalDistance
  raceDate: string
  anchorDistance: GoalDistance
  anchorTime: string
  weeklyKm: string
  longestKm: string
  days: DaysPerWeek
  longRunDay: Weekday
  unavailable: Weekday[]
  experience: Experience
  startDate: string
}

function formFromInputs(i: PlanInputs | undefined, today: string): Form {
  const anchorDistance =
    (Object.entries(GOAL_DISTANCE_M).find(([, m]) => m === i?.anchor.distanceM)?.[0] as GoalDistance) ?? '10k'
  return {
    goal: i?.goal.distance ?? 'half',
    raceDate: i?.goal.raceDate ?? addDays(today, 16 * 7),
    anchorDistance,
    anchorTime: i ? formatDuration(i.anchor.timeS) : '60:00',
    weeklyKm: String(i?.currentWeeklyKm ?? 20),
    longestKm: String(i?.longestRecentRunKm ?? 10),
    days: i?.daysPerWeek ?? 3,
    longRunDay: i?.longRunDay ?? 6,
    unavailable: i?.unavailableWeekdays ?? [],
    experience: i?.experience ?? 'intermediate',
    startDate: today,
  }
}

function toInputs(f: Form): PlanInputs {
  const num = (label: string, text: string) => {
    const n = Number(text.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number ≥ 0`)
    return n
  }
  if (!isIsoDate(f.raceDate)) throw new Error('Pick a race date')
  if (!isIsoDate(f.startDate)) throw new Error('Pick a start date')
  let timeS: number
  try {
    timeS = parseDuration(f.anchorTime)
  } catch {
    throw new Error('Race time must look like 25:30 or 1:55:00')
  }
  return {
    goal: { distance: f.goal, raceDate: f.raceDate },
    anchor: { distanceM: GOAL_DISTANCE_M[f.anchorDistance], timeS },
    experience: f.experience,
    currentWeeklyKm: num('Weekly km', f.weeklyKm),
    longestRecentRunKm: num('Longest run', f.longestKm),
    daysPerWeek: f.days,
    longRunDay: f.longRunDay,
    unavailableWeekdays: f.unavailable.length ? f.unavailable : undefined,
    startDate: f.startDate,
  }
}

export function SetupWizard({
  initial,
  onDone,
  onCancel,
}: {
  initial?: PlanInputs
  onDone: () => void
  onCancel?: () => void
}) {
  const { createPlan, today } = useApp()
  const [form, setForm] = useState(() => formFromInputs(initial, today))
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => ({ ...f, [key]: value }))

  const preview = useMemo(() => {
    try {
      const inputs = toInputs(form)
      const plan = generatePlan(inputs, rules)
      return { inputs, plan, error: undefined }
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) }
    }
  }, [form])

  const toggleUnavailable = (d: Weekday) =>
    set(
      'unavailable',
      form.unavailable.includes(d) ? form.unavailable.filter((x) => x !== d) : [...form.unavailable, d],
    )

  async function submit() {
    if (!preview.inputs) return
    setSaving(true)
    try {
      await createPlan(preview.inputs)
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{initial ? 'New plan' : 'Set up your plan'}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Everything below feeds the rules in planRules.ts. Nothing is hidden.
        </p>
      </header>

      <Card className="space-y-4">
        <h2 className="font-semibold">Goal race</h2>
        <Choice label="Goal distance" options={GOALS} value={form.goal} onChange={(v) => set('goal', v)} />
        <Field label="Race date">
          <input
            type="date"
            className={inputClass}
            value={form.raceDate}
            onChange={(e) => set('raceDate', e.target.value)}
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Current fitness</h2>
        <Field label="A recent race or time trial" hint="Sets your training paces (VDOT).">
          <Choice
            label="Recent race distance"
            options={GOALS}
            value={form.anchorDistance}
            onChange={(v) => set('anchorDistance', v)}
          />
        </Field>
        <Field label="Finish time" hint="mm:ss or h:mm:ss">
          <input
            className={inputClass}
            inputMode="numeric"
            value={form.anchorTime}
            onChange={(e) => set('anchorTime', e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Weekly km now">
            <input
              className={inputClass}
              inputMode="decimal"
              value={form.weeklyKm}
              onChange={(e) => set('weeklyKm', e.target.value)}
            />
          </Field>
          <Field label="Longest recent run (km)">
            <input
              className={inputClass}
              inputMode="decimal"
              value={form.longestKm}
              onChange={(e) => set('longestKm', e.target.value)}
            />
          </Field>
        </div>
        <Field label="Experience">
          <Choice
            label="Experience"
            options={EXPERIENCE}
            value={form.experience}
            onChange={(v) => set('experience', v)}
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="font-semibold">Your week</h2>
        <Field label="Runs per week">
          <Choice
            label="Runs per week"
            options={DAYS_PER_WEEK.map((d) => ({ value: d, label: String(d) }))}
            value={form.days}
            onChange={(v) => set('days', v)}
          />
        </Field>
        <Field label="Long-run day">
          <Choice
            label="Long-run day"
            options={WEEKDAYS}
            value={form.longRunDay}
            onChange={(v) => set('longRunDay', v)}
          />
        </Field>
        <Field label="Days you can't run" hint="Optional.">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((d) => (
              <button
                key={d.value}
                type="button"
                aria-pressed={form.unavailable.includes(d.value)}
                onClick={() => toggleUnavailable(d.value)}
                className={`rounded-xl px-3 py-2 text-sm ring-1 ${
                  form.unavailable.includes(d.value)
                    ? 'bg-zinc-800 text-white ring-zinc-800 line-through dark:bg-zinc-200 dark:text-zinc-900'
                    : 'ring-zinc-300 dark:ring-zinc-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Start date" hint="The plan starts on the first Monday on or after this date.">
          <input
            type="date"
            className={inputClass}
            value={form.startDate}
            onChange={(e) => set('startDate', e.target.value)}
          />
        </Field>
      </Card>

      <Card className="space-y-2">
        <h2 className="font-semibold">Preview</h2>
        {preview.plan ? (
          <div aria-label="Plan preview" className="space-y-1 text-sm">
            <p>
              VDOT <strong>{preview.plan.fitness.toFixed(1)}</strong> · {preview.plan.weeks.length} weeks from{' '}
              {preview.plan.startDate} · peak {Math.max(...preview.plan.weeks.map((w) => w.km))} km/week ·
              longest run{' '}
              {Math.max(...preview.plan.weeks.filter((w) => !w.isRaceWeek).map((w) => w.longRunKm))} km
            </p>
            <ul className="list-disc pl-5 text-zinc-600 dark:text-zinc-400">
              {preview.plan.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p role="alert" className="text-sm text-rose-600">
            {preview.error}
          </p>
        )}
      </Card>

      <div className="flex gap-3">
        {onCancel && (
          <Button variant="secondary" onClick={onCancel} className="flex-1">
            Cancel
          </Button>
        )}
        <Button onClick={submit} disabled={!preview.plan || saving} className="flex-1">
          {initial ? 'Replace plan' : 'Create plan'}
        </Button>
      </div>
      {initial && (
        <p className="text-xs text-zinc-500">
          Your current plan is archived, not deleted. Logged runs stay in your history.
        </p>
      )}
    </div>
  )
}
