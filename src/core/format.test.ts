import { describe, expect, it } from 'vitest'
import { formatDuration, formatPace, parseDuration } from './format'

describe('format', () => {
  it('formats paces', () => {
    expect(formatPace(390)).toBe('6:30')
    expect(formatPace(299.6)).toBe('5:00')
  })

  it('formats and parses durations', () => {
    expect(formatDuration(1840)).toBe('30:40')
    expect(formatDuration(4264)).toBe('1:11:04')
    expect(parseDuration('1:11:04')).toBe(4264)
    expect(parseDuration('65:00')).toBe(3900)
    expect(() => parseDuration('abc')).toThrow()
  })
})
