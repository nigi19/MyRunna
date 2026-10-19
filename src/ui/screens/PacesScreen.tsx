import { useMemo, useState } from 'react'
import { rules } from '../../core/config'
import { formatDuration, formatPace, parseDuration } from '../../core/format'
import type { PaceZoneId, PaceZones } from '../../core/paces/types'
import { vdotPaceModel } from '../../core/paces/vdot'
import { GOAL_DISTANCE_M, type GoalDistance } from '../../core/types'
import { useApp } from '../appContext'
import { Card, Choice, Field, inputClass } from '../components/ui'
import { ZONE_HELP, ZONE_LABELS } from '../lib/labels'

const ZONES: PaceZoneId[] = ['E', 'M', 'HMP', 'T', 'I', 'R']
const DISTANCES: { value: GoalDistance; label: string }[] = [
  { value: '5k', label: '5K' },
  { value: '10k', label: '10K' },
  { value: 'half', label: 'Half' },
  { value: 'marathon', label: 'Marathon' },
]

function ZoneTable({ zones }: { zones: PaceZones }) {
  return (
    <table className="w-full text-sm">
      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {ZONES.map((z) => (
          <tr key={z}>
            <td className="py-2 pr-2">
              <p className="font-medium">
                {ZONE_LABELS[z]} <span className="text-zinc-400">({z})</span>
              </p>
              <p className="text-xs text-zinc-500">{ZONE_HELP[z]}</p>
            </td>
            <td className="py-2 text-right font-mono tabular-nums">
              {formatPace(zones[z].fast)}–{formatPace(zones[z].slow)}/km
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function Predictions({ vdot }: { vdot: number }) {
  return (
    <ul className="grid grid-cols-2 gap-2 text-sm">
      {DISTANCES.map((d) => (
        <li key={d.value} className="rounded-xl bg-zinc-50 p-2 dark:bg-zinc-800">
          <span className="text-zinc-500">{d.label}</span>{' '}
          <strong className="tabular-nums">
            {formatDuration(vdotPaceModel.predictTimeS(vdot, GOAL_DISTANCE_M[d.value]))}
          </strong>
        </li>
      ))}
    </ul>
  )
}

export function PacesScreen() {
  const { active } = useApp()
  const [distance, setDistance] = useState<GoalDistance>('10k')
  const [time, setTime] = useState('')

  const whatIf = useMemo(() => {
    try {
      const vdot = vdotPaceModel.fitnessFromRace({
        distanceM: GOAL_DISTANCE_M[distance],
        timeS: parseDuration(time),
      })
      return { vdot, zones: vdotPaceModel.zones(vdot, rules.paces) }
    } catch {
      return null
    }
  }, [distance, time])

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Paces</h1>
      {active && (
        <Card className="space-y-3">
          <h2 className="font-semibold">Your training paces · VDOT {active.plan.fitness.toFixed(1)}</h2>
          <ZoneTable zones={active.plan.zones} />
          <h3 className="pt-2 text-sm font-semibold">Equivalent race times today</h3>
          <Predictions vdot={active.plan.fitness} />
        </Card>
      )}
      <Card className="space-y-3">
        <h2 className="font-semibold">What if?</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Try another race result. This doesn't change your plan.
        </p>
        <Choice label="Distance" options={DISTANCES} value={distance} onChange={setDistance} />
        <Field label="Time" hint="mm:ss or h:mm:ss">
          <input
            className={inputClass}
            inputMode="numeric"
            value={time}
            placeholder="55:00"
            onChange={(e) => setTime(e.target.value)}
          />
        </Field>
        {whatIf && (
          <>
            <p className="text-sm">
              VDOT <strong>{whatIf.vdot.toFixed(1)}</strong>
            </p>
            <ZoneTable zones={whatIf.zones} />
            <Predictions vdot={whatIf.vdot} />
          </>
        )}
      </Card>
    </div>
  )
}
