import { describe, expect, it } from 'vitest'
import { clockToDayMinutes, dayKey, dayMinutesToClock, minutesSinceDayStart, weekdayOf } from './day'
import { at } from '../testing/helpers'

describe('dayKey', () => {
  it('starts the day at 04:00 London time (BST)', () => {
    expect(dayKey(at('2026-10-05T03:59:59+01:00'))).toBe('2026-10-04')
    expect(dayKey(at('2026-10-05T04:00:00+01:00'))).toBe('2026-10-05')
  })

  it('starts the day at 04:00 London time (GMT)', () => {
    expect(dayKey(at('2026-12-01T03:59:00Z'))).toBe('2026-11-30')
    expect(dayKey(at('2026-12-01T04:00:00Z'))).toBe('2026-12-01')
  })

  it('counts 01:00 and 02:00 towards the previous day', () => {
    expect(dayKey(at('2026-10-06T01:00:00+01:00'))).toBe('2026-10-05')
    expect(dayKey(at('2026-10-06T02:00:00+01:00'))).toBe('2026-10-05')
  })

  it('keeps late evening on the same day', () => {
    expect(dayKey(at('2026-10-05T23:59:00+01:00'))).toBe('2026-10-05')
  })

  it('crosses month and year boundaries', () => {
    expect(dayKey(at('2027-01-01T02:00:00Z'))).toBe('2026-12-31')
    expect(dayKey(at('2026-03-01T03:00:00Z'))).toBe('2026-02-28')
  })

  describe('spring forward, Sun 29 Mar 2026 (01:00 GMT jumps to 02:00 BST)', () => {
    it('03:59 BST is still Saturday', () => {
      expect(dayKey(at('2026-03-29T03:59:00+01:00'))).toBe('2026-03-28')
    })
    it('04:00 BST is Sunday', () => {
      // Subtracting 4 hours from the instant would wrongly give Saturday here.
      expect(dayKey(at('2026-03-29T04:00:00+01:00'))).toBe('2026-03-29')
    })
    it('the hours either side of the jump belong to Saturday', () => {
      expect(dayKey(at('2026-03-29T00:30:00Z'))).toBe('2026-03-28') // 00:30 GMT
      expect(dayKey(at('2026-03-29T01:30:00Z'))).toBe('2026-03-28') // 02:30 BST
    })
  })

  describe('fall back, Sun 25 Oct 2026 (02:00 BST drops to 01:00 GMT)', () => {
    it('03:59 GMT is still Saturday', () => {
      // Subtracting 4 hours from the instant would wrongly give Sunday here.
      expect(dayKey(at('2026-10-25T03:59:00Z'))).toBe('2026-10-24')
    })
    it('04:00 GMT is Sunday', () => {
      expect(dayKey(at('2026-10-25T04:00:00Z'))).toBe('2026-10-25')
    })
    it('both 01:30s belong to Saturday', () => {
      expect(dayKey(at('2026-10-25T01:30:00+01:00'))).toBe('2026-10-24')
      expect(dayKey(at('2026-10-25T01:30:00Z'))).toBe('2026-10-24')
    })
  })
})

describe('minutesSinceDayStart', () => {
  it('is 0 at 04:00 and 1439 at 03:59', () => {
    expect(minutesSinceDayStart(at('2026-10-05T04:00:00+01:00'))).toBe(0)
    expect(minutesSinceDayStart(at('2026-10-06T03:59:00+01:00'))).toBe(1439)
  })

  it('drops seconds', () => {
    expect(minutesSinceDayStart(at('2026-10-05T06:45:00+01:00'))).toBe(165)
    expect(minutesSinceDayStart(at('2026-10-05T06:45:59+01:00'))).toBe(165)
    expect(minutesSinceDayStart(at('2026-10-05T06:46:00+01:00'))).toBe(166)
  })

  it('uses the wall clock on clock-change days', () => {
    expect(minutesSinceDayStart(at('2026-03-29T06:30:00+01:00'))).toBe(150)
    expect(minutesSinceDayStart(at('2026-10-25T06:30:00Z'))).toBe(150)
  })
})

describe('clockToDayMinutes', () => {
  it('converts HH:MM to minutes since 04:00', () => {
    expect(clockToDayMinutes('04:00')).toBe(0)
    expect(clockToDayMinutes('06:30')).toBe(150)
    expect(clockToDayMinutes('03:59')).toBe(1439)
  })

  it('rejects malformed times', () => {
    expect(clockToDayMinutes('6:30')).toBeNull()
    expect(clockToDayMinutes('24:00')).toBeNull()
    expect(clockToDayMinutes('06:60')).toBeNull()
    expect(clockToDayMinutes('')).toBeNull()
  })
})

describe('dayMinutesToClock', () => {
  it('turns minutes since 04:00 back into HH:MM', () => {
    expect(dayMinutesToClock(0)).toBe('04:00')
    expect(dayMinutesToClock(165)).toBe('06:45')
    expect(dayMinutesToClock(1439)).toBe('03:59')
  })

  it('round-trips with clockToDayMinutes', () => {
    for (const t of ['00:00', '03:59', '04:00', '06:30', '12:15', '23:59']) {
      expect(dayMinutesToClock(clockToDayMinutes(t) as number)).toBe(t)
    }
  })
})

describe('weekdayOf', () => {
  it('reads the weekday from the calendar date', () => {
    expect(weekdayOf('2026-10-05')).toBe('mon')
    expect(weekdayOf('2026-10-10')).toBe('sat')
    expect(weekdayOf('2026-10-11')).toBe('sun')
    expect(weekdayOf('2026-03-29')).toBe('sun')
    expect(weekdayOf('2026-10-25')).toBe('sun')
  })

  it('pairs with dayKey so 02:00 Tuesday is Monday', () => {
    expect(weekdayOf(dayKey(at('2026-10-06T02:00:00+01:00')))).toBe('mon')
  })
})
