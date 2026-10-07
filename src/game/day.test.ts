import { describe, expect, it } from 'vitest'
import {
  clockToDayMinutes,
  dayKey,
  dayMinutesToClock,
  daysBetween,
  instantInDay,
  nextDayKey,
  minutesSinceDayStart,
  nextDayStart,
  shiftDayKey,
  weekdayOf,
} from './day'
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

describe('instantInDay', () => {
  it('finds the instant of a wall-clock time on a game day', () => {
    expect(instantInDay('2026-10-05', 0)).toBe(at('2026-10-05T04:00:00+01:00'))
    expect(instantInDay('2026-10-05', 166)).toBe(at('2026-10-05T06:46:00+01:00'))
    expect(instantInDay('2026-12-01', 0)).toBe(at('2026-12-01T04:00:00Z'))
  })

  it('runs past midnight into the small hours of the same game day', () => {
    expect(instantInDay('2026-10-05', 1439)).toBe(at('2026-10-06T03:59:00+01:00'))
    expect(dayKey(instantInDay('2026-10-05', 1439))).toBe('2026-10-05')
  })

  it('handles both clock-change days', () => {
    expect(instantInDay('2026-03-29', 0)).toBe(at('2026-03-29T04:00:00+01:00'))
    expect(instantInDay('2026-10-25', 0)).toBe(at('2026-10-25T04:00:00Z'))
    expect(instantInDay('2026-03-28', 0)).toBe(at('2026-03-28T04:00:00Z'))
    expect(instantInDay('2026-10-24', 0)).toBe(at('2026-10-24T04:00:00+01:00'))
  })
})

describe('nextDayKey', () => {
  it('steps one calendar day, across months and years', () => {
    expect(nextDayKey('2026-10-05')).toBe('2026-10-06')
    expect(nextDayKey('2026-02-28')).toBe('2026-03-01')
    expect(nextDayKey('2026-12-31')).toBe('2027-01-01')
  })
})

describe('shiftDayKey', () => {
  it('steps whole calendar days either way, across months, years and clock changes', () => {
    expect(shiftDayKey('2026-10-05', 0)).toBe('2026-10-05')
    expect(shiftDayKey('2026-10-05', -5)).toBe('2026-09-30')
    expect(shiftDayKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDayKey('2026-10-24', 3)).toBe('2026-10-27') // over the clocks going back
    expect(shiftDayKey('2028-03-01', -1)).toBe('2028-02-29')
  })
})

describe('nextDayStart', () => {
  it('is the coming 04:00, whether now is evening or the small hours', () => {
    expect(nextDayStart(at('2026-10-05T12:00:00+01:00'))).toBe(at('2026-10-06T04:00:00+01:00'))
    expect(nextDayStart(at('2026-10-06T03:59:59+01:00'))).toBe(at('2026-10-06T04:00:00+01:00'))
  })

  it('is strictly after now, even exactly at 04:00', () => {
    expect(nextDayStart(at('2026-10-06T04:00:00+01:00'))).toBe(at('2026-10-07T04:00:00+01:00'))
  })

  it('lands on 04:00 local time across both clock changes', () => {
    // Spring forward: Saturday's game day is 23 hours long.
    const sat = at('2026-03-28T12:00:00Z')
    expect(nextDayStart(sat)).toBe(at('2026-03-29T04:00:00+01:00'))
    expect(nextDayStart(at('2026-03-29T02:30:00+01:00'))).toBe(at('2026-03-29T04:00:00+01:00'))
    // Fall back: Saturday's game day is 25 hours long.
    expect(nextDayStart(at('2026-10-24T12:00:00+01:00'))).toBe(at('2026-10-25T04:00:00Z'))
    expect(nextDayStart(at('2026-10-25T01:30:00Z'))).toBe(at('2026-10-25T04:00:00Z'))
  })
})

describe('wall times that are missing or doubled by a clock change', () => {
  it('maps a missing time (spring forward) using the offset from before the change', () => {
    // 01:30 on Sun 29 Mar 2026 never happens; game day 28 Mar + 1290 min = 01:30.
    expect(instantInDay('2026-03-28', 1290)).toBe(at('2026-03-29T01:30:00Z')) // = 02:30 BST
  })

  it('maps a doubled time (fall back) to the later occurrence, in GMT', () => {
    // 01:30 on Sun 25 Oct 2026 happens twice; game day 24 Oct + 1290 min = 01:30.
    expect(instantInDay('2026-10-24', 1290)).toBe(at('2026-10-25T01:30:00Z'))
  })

  it('finds the next 04:00 from inside the doubled hour', () => {
    // 00:30Z and 00:59Z on 25 Oct are the first (BST) 01:30 and 01:59.
    expect(nextDayStart(at('2026-10-25T00:30:00Z'))).toBe(at('2026-10-25T04:00:00Z'))
    expect(nextDayStart(at('2026-10-25T00:59:00Z'))).toBe(at('2026-10-25T04:00:00Z'))
    // And from the second (GMT) occurrence.
    expect(nextDayStart(at('2026-10-25T01:30:00Z'))).toBe(at('2026-10-25T04:00:00Z'))
  })

  it('finds the next 04:00 either side of the missing hour', () => {
    expect(nextDayStart(at('2026-03-29T00:59:00Z'))).toBe(at('2026-03-29T03:00:00Z'))
    expect(nextDayStart(at('2026-03-29T02:59:00Z'))).toBe(at('2026-03-29T03:00:00Z'))
  })

  it('round-trips every minute of both clock-change days', () => {
    for (const key of ['2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25']) {
      for (let m = 0; m < 1440; m++) {
        const t = instantInDay(key, m)
        // Except the missing hour, the instant reads back as the same day and minute.
        const missing = key === '2026-03-28' && m >= 1260 && m < 1320
        if (!missing) {
          expect(dayKey(t)).toBe(key)
          expect(minutesSinceDayStart(t)).toBe(m)
        }
      }
    }
  })
})

describe('daysBetween', () => {
  it('counts whole calendar days between keys', () => {
    expect(daysBetween('2026-10-05', '2026-10-05')).toBe(0)
    expect(daysBetween('2026-10-05', '2026-10-06')).toBe(1)
    expect(daysBetween('2026-10-06', '2026-10-05')).toBe(-1)
  })

  it('is unaffected by both 2026 clock changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1)
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2)
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1)
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2)
  })

  it('crosses month ends, year ends and a leap day', () => {
    expect(daysBetween('2026-01-31', '2026-02-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-02-29')).toBe(1)
    expect(daysBetween('2028-02-29', '2028-03-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1)
    expect(daysBetween('2026-01-01', '2027-01-01')).toBe(365)
    expect(daysBetween('2028-01-01', '2029-01-01')).toBe(366)
  })

  it('rejects malformed keys', () => {
    expect(() => daysBetween('2026-1-5', '2026-01-06')).toThrow()
  })
})
