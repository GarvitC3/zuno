import { describe, expect, it } from 'vitest'
import { createDemoData } from '../data/demo'
import { addDays, diffDays, formatClock, fromAbs, momentFromDate, relativeWhen, toAbs, weekdayOf } from './time'

describe('local dates', () => {
  it('adds days across US and EU daylight-saving changes without shifting', () => {
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08') // US spring forward
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01') // US fall back
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29') // EU spring forward
    expect(diffDays('2026-03-07', '2026-03-10')).toBe(3)
    expect(diffDays('2026-10-30', '2026-11-03')).toBe(4)
  })

  it('handles month, year and leap-year boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31')
  })

  it('computes weekdays consistently (0 = Sunday)', () => {
    expect(weekdayOf('2026-10-19')).toBe(1) // Monday
    expect(weekdayOf('2026-10-25')).toBe(0) // Sunday
    expect(weekdayOf('2026-03-08')).toBe(0)
  })

  it('treats every local day as exactly 1440 minutes', () => {
    expect(toAbs('2026-03-09', 0) - toAbs('2026-03-08', 0)).toBe(1440)
    expect(toAbs('2026-11-02', 0) - toAbs('2026-11-01', 0)).toBe(1440)
  })

  it('round-trips absolute minutes', () => {
    const m = fromAbs(toAbs('2026-10-19', 15 * 60 + 45))
    expect(m).toEqual({ date: '2026-10-19', minute: 945 })
  })

  it('reads local date parts at the midnight boundary', () => {
    expect(momentFromDate(new Date(2026, 9, 17, 23, 59))).toEqual({ date: '2026-10-17', minute: 1439 })
    expect(momentFromDate(new Date(2026, 9, 18, 0, 0))).toEqual({ date: '2026-10-18', minute: 0 })
  })

  it('formats times and relative days', () => {
    expect(formatClock(15 * 60 + 30)).toBe('3:30 PM')
    expect(formatClock(0)).toBe('12:00 AM')
    expect(formatClock(12 * 60)).toBe('12:00 PM')
    expect(relativeWhen('2026-10-20', 15 * 60 + 30, '2026-10-19')).toBe('tomorrow at 3:30 PM')
  })

  it('produces identical plans in every time zone', () => {
    const original = process.env.TZ
    const results: string[] = []
    try {
      for (const tz of ['UTC', 'America/New_York', 'Australia/Sydney', 'Asia/Kolkata', 'Pacific/Auckland']) {
        process.env.TZ = tz
        const d = createDemoData({ date: '2026-10-31', minute: 14 * 60 }) // spans the US DST change on Nov 1
        results.push(JSON.stringify(d.sessions.filter((s) => s.status === 'planned').map((s) => [s.date, s.startMin, s.durationMin, s.topicId])))
      }
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
    expect(new Set(results).size).toBe(1)
  })
})
