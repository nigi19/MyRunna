import { useMemo, useState } from 'react'
import { rules } from './core/config'
import { formatDuration, formatPace, parseDuration } from './core/format'
import { HALF_MARATHON_M, MARATHON_M, vdotPaceModel } from './core/paces/vdot'
import type { PaceZoneId } from './core/paces/types'

const ZONE_LABELS: Record<PaceZoneId, string> = {
  E: 'Easy',
  M: 'Marathon',
  HMP: 'Half marathon',
  T: 'Threshold',
  I: 'Interval',
  R: 'Repetition',
}

const DISTANCES = [
  { label: '5K', m: 5000 },
  { label: '10K', m: 10000 },
  { label: 'Half', m: HALF_MARATHON_M },
  { label: 'Marathon', m: MARATHON_M },
]

export default function App() {
  const [distanceM, setDistanceM] = useState(10000)
  const [time, setTime] = useState('65:00')

  const result = useMemo(() => {
    try {
      const vdot = vdotPaceModel.fitnessFromRace({ distanceM, timeS: parseDuration(time) })
      return { vdot, zones: vdotPaceModel.zones(vdot, rules.paces) }
    } catch {
      return null
    }
  }, [distanceM, time])

  return (
    <main>
      <h1>MyRunna</h1>
      <section>
        <h2>Recent race</h2>
        <label>
          Distance{' '}
          <select value={distanceM} onChange={(e) => setDistanceM(Number(e.target.value))}>
            {DISTANCES.map((d) => (
              <option key={d.m} value={d.m}>
                {d.label}
              </option>
            ))}
          </select>
        </label>{' '}
        <label>
          Time <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="mm:ss" />
        </label>
      </section>

      {result ? (
        <>
          <section>
            <h2>VDOT {result.vdot.toFixed(1)}</h2>
            <table>
              <tbody>
                {(Object.keys(ZONE_LABELS) as PaceZoneId[]).map((id) => (
                  <tr key={id}>
                    <td>{ZONE_LABELS[id]}</td>
                    <td>
                      {formatPace(result.zones[id].fast)}–{formatPace(result.zones[id].slow)} /km
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section>
            <h2>Equivalent race times</h2>
            <ul>
              {DISTANCES.map((d) => (
                <li key={d.m}>
                  {d.label}: {formatDuration(vdotPaceModel.predictTimeS(result.vdot, d.m))}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <p>Enter a time as mm:ss or h:mm:ss.</p>
      )}
    </main>
  )
}
