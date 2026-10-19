/** 395.4 → "6:35" */
export function formatPace(secPerKm: number): string {
  const total = Math.round(secPerKm)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

/** 4264 → "1:11:04", 1840 → "30:40" */
export function formatDuration(totalS: number): string {
  const s = Math.round(totalS)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** "1:11:04" | "30:40" → seconds */
export function parseDuration(text: string): number {
  const parts = text.trim().split(':').map(Number)
  if (parts.length < 2 || parts.length > 3 || parts.some((p) => !Number.isFinite(p) || p < 0)) {
    throw new Error(`Invalid duration: "${text}"`)
  }
  return parts.reduce((acc, p) => acc * 60 + p, 0)
}
