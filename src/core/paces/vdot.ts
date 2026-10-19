import type { PaceModel, PaceRange, PaceZones, RacePerformance } from './types'

/**
 * Jack Daniels' VDOT model (Daniels & Gilbert, 1979).
 *
 *   VO2(v)  = -4.60 + 0.182258·v + 0.000104·v²          v in m/min
 *   %max(t) = 0.8 + 0.1894393·e^(-0.012778·t)
 *                 + 0.2989558·e^(-0.1932605·t)         t in min
 *   VDOT    = VO2(d / t) / %max(t)
 */

export interface VdotSettings {
  /** Fractions of VDOT that define each zone (see planRules.paces). */
  easy: [slow: number, fast: number]
  threshold: number
  interval: number
  /** Repetition pace is this many seconds per 400 m faster than interval pace. */
  repetitionOffsetPer400S: number
  /** Width (s/km) of the band shown around single-value zones. */
  bandS: number
}

export const MARATHON_M = 42195
export const HALF_MARATHON_M = 21097.5

export function vo2AtVelocity(vMPerMin: number): number {
  return -4.6 + 0.182258 * vMPerMin + 0.000104 * vMPerMin * vMPerMin
}

export function fractionOfMaxAtDuration(tMin: number): number {
  return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin)
}

export function vdotFromRace({ distanceM, timeS }: RacePerformance): number {
  if (distanceM <= 0 || timeS <= 0) throw new Error('Race distance and time must be positive')
  const tMin = timeS / 60
  return vo2AtVelocity(distanceM / tMin) / fractionOfMaxAtDuration(tMin)
}

/** Velocity (m/min) at which VO2 equals `vo2`: inverse of vo2AtVelocity. */
export function velocityAtVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -(4.6 + vo2)
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

/** Race time for `distanceM` at the given VDOT, solved by bisection. */
export function predictRaceTimeS(vdot: number, distanceM: number): number {
  let lo = 1 // seconds
  let hi = 60 * 60 * 24
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2
    // A longer time gives a lower VDOT, so the function is monotonic.
    if (vdotFromRace({ distanceM, timeS: mid }) > vdot) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

const secPerKm = (vMPerMin: number) => 60000 / vMPerMin

const paceAtFraction = (vdot: number, fraction: number) => secPerKm(velocityAtVo2(vdot * fraction))

const band = (center: number, width: number): PaceRange => ({
  fast: center - width / 2,
  slow: center + width / 2,
})

export const vdotPaceModel: PaceModel<VdotSettings> = {
  id: 'vdot',

  fitnessFromRace: vdotFromRace,

  predictTimeS: predictRaceTimeS,

  zones(vdot: number, s: VdotSettings): PaceZones {
    const interval = paceAtFraction(vdot, s.interval)
    const repetition = interval - s.repetitionOffsetPer400S * 2.5
    return {
      E: { fast: paceAtFraction(vdot, s.easy[1]), slow: paceAtFraction(vdot, s.easy[0]) },
      M: band(predictRaceTimeS(vdot, MARATHON_M) / (MARATHON_M / 1000), s.bandS),
      HMP: band(predictRaceTimeS(vdot, HALF_MARATHON_M) / (HALF_MARATHON_M / 1000), s.bandS),
      T: band(paceAtFraction(vdot, s.threshold), s.bandS),
      I: band(interval, s.bandS),
      R: band(repetition, s.bandS),
    }
  },
}
