import { useState } from 'react'
import { isIsoDate } from '../../core/dates'
import { formatDuration, formatPace, parseDuration } from '../../core/format'
import { useApp } from '../appContext'
import { SessionDot } from '../components/SessionCard'
import { Button, Card, Choice, Field, inputClass } from '../components/ui'
import { formatDate } from '../lib/labels'
import { findSession } from '../lib/planQueries'

const RPE = Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))

export interface LogPrefill {
  date: string
  distanceKm?: number
}

export function LogScreen({ prefill }: { prefill?: LogPrefill }) {
  const { active, activities, today, logRun, deleteRun } = useApp()
  const [date, setDate] = useState(prefill?.date ?? today)
  const [distance, setDistance] = useState(prefill?.distanceKm ? String(prefill.distanceKm) : '')
  const [time, setTime] = useState('')
  const [rpe, setRpe] = useState(5)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string>()
  const [saved, setSaved] = useState<string>()

  const planned = active && isIsoDate(date) ? findSession(active.plan, date) : undefined
  const counts = planned && planned.type !== 'rest' ? planned : undefined

  async function save() {
    setError(undefined)
    setSaved(undefined)
    const km = Number(distance.replace(',', '.'))
    let durationS: number
    try {
      durationS = parseDuration(time)
    } catch {
      setError('Time must look like 42:30 or 1:05:00')
      return
    }
    if (!isIsoDate(date)) return setError('Pick a date')
    if (!(km > 0)) return setError('Distance must be more than 0 km')
    try {
      await logRun({
        date,
        source: 'manual',
        distanceKm: km,
        durationS,
        rpe,
        notes: notes.trim() || undefined,
        plannedSession: counts && active ? { planId: active.id, date } : undefined,
      })
      setSaved(`Saved: ${km} km in ${formatDuration(durationS)}`)
      setDistance('')
      setTime('')
      setNotes('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const recent = [...activities].reverse().slice(0, 30)

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Log a run</h1>
      <Card className="space-y-4">
        <Field label="Date">
          <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <p className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          {counts ? (
            <>
              <SessionDot session={counts} />
              <span>
                Counts for: <strong>{counts.title}</strong>
              </span>
            </>
          ) : (
            'No planned run on this day: saved as an extra run.'
          )}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Distance (km)">
            <input
              className={inputClass}
              inputMode="decimal"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="5.2"
            />
          </Field>
          <Field label="Time" hint="mm:ss or h:mm:ss">
            <input
              className={inputClass}
              inputMode="numeric"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="42:30"
            />
          </Field>
        </div>
        <Field label="Effort (1 = very easy, 10 = all out)">
          <Choice label="Effort" options={RPE} value={rpe} onChange={setRpe} />
        </Field>
        <Field label="Notes">
          <textarea
            className={inputClass}
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            {saved}
          </p>
        )}
        <Button className="w-full" onClick={save}>
          Save run
        </Button>
      </Card>

      <section className="space-y-2">
        <h2 className="font-semibold">Recent runs</h2>
        {recent.length === 0 && <p className="text-sm text-zinc-500">No runs logged yet.</p>}
        <ul className="space-y-2">
          {recent.map((a) => (
            <li key={a.id}>
              <Card className="flex items-center justify-between gap-3 !p-3">
                <div className="text-sm">
                  <p className="font-medium">
                    {formatDate(a.date)} · {a.distanceKm} km in {formatDuration(a.durationS)}
                  </p>
                  <p className="text-zinc-500">
                    {a.distanceKm > 0 && `${formatPace(a.durationS / a.distanceKm)}/km`}
                    {a.rpe && ` · effort ${a.rpe}`}
                    {a.plannedSession ? '' : ' · extra run'}
                    {a.notes && ` · ${a.notes}`}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  aria-label={`Delete run on ${a.date}`}
                  onClick={() => {
                    if (confirm('Delete this run?')) void deleteRun(a.id)
                  }}
                >
                  Delete
                </Button>
              </Card>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
