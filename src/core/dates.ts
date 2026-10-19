/** Calendar date as YYYY-MM-DD. All maths is done in UTC so time zones never shift a day. */
export type ISODate = string

/** 0 = Monday … 6 = Sunday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const WEEKDAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const DAY_MS = 86_400_000

export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  return fromUtc(toUtc(text)) === text
}

function toUtc(date: ISODate): number {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10)
}

export const addDays = (date: ISODate, days: number): ISODate => fromUtc(toUtc(date) + days * DAY_MS)

export const daysBetween = (from: ISODate, to: ISODate): number =>
  Math.round((toUtc(to) - toUtc(from)) / DAY_MS)

export const weekdayOf = (date: ISODate): Weekday => ((new Date(toUtc(date)).getUTCDay() + 6) % 7) as Weekday

export const mondayOnOrAfter = (date: ISODate): ISODate => addDays(date, (7 - weekdayOf(date)) % 7)

export const mondayOnOrBefore = (date: ISODate): ISODate => addDays(date, -weekdayOf(date))
