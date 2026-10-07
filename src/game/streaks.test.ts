import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import type { StreakConfig } from '../config/streaks'
import { TASKS } from '../config/tasks'
import { at, log, undo } from '../testing/helpers'
import { instantInDay, shiftDayKey } from './day'
import { firstLogDay, overallStreak, wakeStreak, weekStartKey, weeklyCounts } from './streaks'
import type { GameEvent, Settings, Task } from './types'

/** Fixed numbers, so these tests don't move when the real config is rebalanced. */
const CONFIG: StreakConfig = { freezeEveryDays: 7, freezeMaxHeld: 2, milestones: [7, 30, 100], weekStart: 'mon' }

const task = (id: string): Task => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(id)
  return t
}
const wake = task('wake')
const gym = task('gym')
const read = task('read')

// Thu 1 Oct 2026 is BST. Day n of October, at noon on the London clock.
const START = '2026-10-01'
const dayN = (n: number) => shiftDayKey(START, n - 1)
const noonOf = (key: string) => instantInDay(key, 8 * 60)
const noon = (n: number) => noonOf(dayN(n))
/** A gym log at noon on each of the given October days. */
const logsOn = (...days: number[]): GameEvent[] => days.map((n) => log(gym, noon(n)))
/** Days a to b inclusive. */
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)

const streak = (events: readonly GameEvent[], now: number) => overallStreak(events, now, CONFIG)

describe('overallStreak', () => {
  it('is all zeroes with no logs', () => {
    const s = streak([], noon(1))
    expect(s).toMatchObject({ current: 0, best: 0, freezesHeld: 0, todayLogged: false })
    expect(s.days.size).toBe(0)
  })

  it('counts consecutive logged days, once per day however many logs', () => {
    const events = [...logsOn(1, 2, 3), log(read, noon(3) + 60_000)]
    const s = streak(events, noon(3))
    expect(s).toMatchObject({ current: 3, best: 3, todayLogged: true })
    expect([...s.days.values()]).toEqual(['logged', 'logged', 'logged'])
  })

  it('keeps an unlogged today pending, showing the streak through yesterday', () => {
    const s = streak(logsOn(1, 2, 3), noon(4))
    expect(s).toMatchObject({ current: 3, todayLogged: false })
    expect(s.days.get(dayN(4))).toBe('pending')
    // Still pending at 03:59 the next morning, the last minute of day 4.
    const late = at('2026-10-05T03:59:00+01:00')
    expect(streak(logsOn(1, 2, 3), late).days.get(dayN(4))).toBe('pending')
    expect(streak(logsOn(1, 2, 3), late).current).toBe(3)
  })

  it('treats a 03:59 log as the day before and 04:00 as the new day', () => {
    // Day 1 at noon, then 03:59 on the 3rd: that's still day 2, so the run is 2 days.
    const early = [log(gym, noon(1)), log(gym, at('2026-10-03T03:59:00+01:00'))]
    expect(streak(early, noon(3))).toMatchObject({ current: 2, todayLogged: false })
    // 04:00 on the 3rd is day 3, leaving day 2 empty: a fresh start.
    const late = [log(gym, noon(1)), log(gym, at('2026-10-03T04:00:00+01:00'))]
    const s = streak(late, noon(3))
    expect(s).toMatchObject({ current: 1, best: 1, todayLogged: true })
    expect(s.days.get(dayN(2))).toBe('missed')
  })

  it('ends quietly after a finished day with no log and no freeze, keeping the best', () => {
    const s = streak(logsOn(1, 2, 3, 5), noon(5))
    expect(s).toMatchObject({ current: 1, best: 3, freezesHeld: 0 })
    expect(s.days.get(dayN(4))).toBe('missed')
  })

  it('shows 0 for a run that ended before today, with today still pending', () => {
    expect(streak(logsOn(1, 2), noon(4))).toMatchObject({ current: 0, best: 2 })
  })

  it('earns a freeze when the streak reaches 7 days', () => {
    expect(streak(logsOn(...range(1, 6)), noon(6)).freezesHeld).toBe(0)
    expect(streak(logsOn(...range(1, 7)), noon(7)).freezesHeld).toBe(1)
  })

  it('uses a held freeze on a quiet day: the streak carries on without counting that day', () => {
    const events = logsOn(...range(1, 7), 9)
    const s = streak(events, noon(9))
    expect(s).toMatchObject({ current: 8, best: 8, freezesHeld: 0 })
    expect(s.days.get(dayN(8))).toBe('frozen')
  })

  it('shows a frozen yesterday while today is pending, streak intact', () => {
    const s = streak(logsOn(...range(1, 7)), noon(9))
    expect(s).toMatchObject({ current: 7, freezesHeld: 0 })
    expect(s.days.get(dayN(8))).toBe('frozen')
    expect(s.days.get(dayN(9))).toBe('pending')
  })

  it('holds at most two freezes', () => {
    expect(streak(logsOn(...range(1, 14)), noon(14)).freezesHeld).toBe(2)
    expect(streak(logsOn(...range(1, 21)), noon(21)).freezesHeld).toBe(2)
    // Two quiet days in a row are both covered, then the next is not.
    const s = streak(logsOn(...range(1, 21)), noon(25))
    expect([22, 23, 24].map((n) => s.days.get(dayN(n)))).toEqual(['frozen', 'frozen', 'missed'])
    expect(s).toMatchObject({ current: 0, best: 21, freezesHeld: 0 })
  })

  it('with one freeze, two quiet days use it on the first and end the run on the second', () => {
    const s = streak(logsOn(...range(1, 7), 10), noon(10))
    expect(s.days.get(dayN(8))).toBe('frozen')
    expect(s.days.get(dayN(9))).toBe('missed')
    expect(s).toMatchObject({ current: 1, best: 7, freezesHeld: 0 })
  })

  it('spends freezes one per quiet day, keeping any left over', () => {
    // 14 days earns two; one quiet day (15) uses one; the other is still held.
    expect(streak(logsOn(...range(1, 14), 16), noon(16))).toMatchObject({ current: 15, freezesHeld: 1 })
  })

  it('keeps freezes across a break and lets the next run earn more', () => {
    // A run can only end once no freeze is held, so nothing is ever taken away by a break.
    // Run one: days 1-7 earns one, used on day 8; day 9 ends the run.
    // Run two: days 10-23 (14 days) earns two. Quiet days in between never spend anything.
    const s = streak(logsOn(...range(1, 7), ...range(10, 23)), noon(23))
    expect(s.days.get(dayN(8))).toBe('frozen')
    expect(s.days.get(dayN(9))).toBe('missed')
    expect(s).toMatchObject({ current: 14, best: 14, freezesHeld: 2 })
    // Several quiet days after a run ends stay plain, and the count stays at 0.
    const gap = streak(logsOn(...range(1, 7)), noon(14))
    expect([8, 9, 10, 11, 12, 13].map((n) => gap.days.get(dayN(n)))).toEqual([
      'frozen',
      'missed',
      'missed',
      'missed',
      'missed',
      'missed',
    ])
    expect(gap).toMatchObject({ current: 0, best: 7, freezesHeld: 0 })
  })

  it('recalculates when the day’s only log is undone', () => {
    const only = log(gym, noon(3))
    const events: GameEvent[] = [...logsOn(1, 2), only]
    expect(streak(events, noon(3))).toMatchObject({ current: 3, todayLogged: true })
    const undone = [...events, undo(only, noon(3) + 1000)]
    const s = streak(undone, noon(3))
    expect(s).toMatchObject({ current: 2, todayLogged: false })
    expect(s.days.get(dayN(3))).toBe('pending')
  })

  it('undoing the log that earned a freeze takes the freeze back', () => {
    const seventh = log(gym, noon(7))
    const events: GameEvent[] = [...logsOn(...range(1, 6)), seventh]
    expect(streak(events, noon(7)).freezesHeld).toBe(1)
    expect(streak([...events, undo(seventh, noon(7) + 1)], noon(7)).freezesHeld).toBe(0)
  })

  it('ignores logs dated after today (clock skew)', () => {
    const s = streak(logsOn(1, 2, 5), noon(2))
    expect(s).toMatchObject({ current: 2, todayLogged: true })
    expect(s.days.has(dayN(5))).toBe(false)
  })

  it('turns freezes off with freezeEveryDays below 1', () => {
    const s = overallStreak(logsOn(...range(1, 14)), noon(14), { ...CONFIG, freezeEveryDays: 0 })
    expect(s.freezesHeld).toBe(0)
  })
})

describe('wakeStreak', () => {
  const settings = DEFAULT_SETTINGS // weekdays 06:30, weekends none
  // Mon 5 Oct 2026, 06:40 BST: inside the 15 minute grace window.
  const wakeOn = (key: string) => log(wake, instantInDay(key, 2 * 60 + 40))
  const MON = '2026-10-05'
  const day = (offset: number) => shiftDayKey(MON, offset)

  it('is zero with no wake logs, and reports whether the schedule has targets', () => {
    expect(wakeStreak([], TASKS, settings, noonOf(MON))).toEqual({ current: 0, best: 0, hasTargets: true })
  })

  it('counts a log in the grace window (only in-time logs are ever saved)', () => {
    expect(wakeStreak([wakeOn(MON)], TASKS, settings, noonOf(MON)).current).toBe(1)
  })

  it('skips weekend days with no target instead of ending the run', () => {
    // Thu, Fri, then Sat and Sun with no target, then Mon.
    const events = [wakeOn(day(3)), wakeOn(day(4)), wakeOn(day(7))]
    expect(wakeStreak(events, TASKS, settings, noonOf(day(7)))).toMatchObject({ current: 3, best: 3 })
    // On Sunday the run from Fri is intact.
    expect(wakeStreak(events.slice(0, 2), TASKS, settings, noonOf(day(6))).current).toBe(2)
  })

  it('ends quietly after a finished target day with no wake log', () => {
    const events = [wakeOn(day(0)), wakeOn(day(1)), wakeOn(day(3))]
    expect(wakeStreak(events, TASKS, settings, noonOf(day(3)))).toMatchObject({ current: 1, best: 2 })
  })

  it('keeps today pending until it ends', () => {
    const events = [wakeOn(day(0)), wakeOn(day(1))]
    expect(wakeStreak(events, TASKS, settings, noonOf(day(2))).current).toBe(2)
    expect(wakeStreak(events, TASKS, settings, noonOf(day(3))).current).toBe(0)
  })

  it('counts a wake log on a day that has no target now (the schedule changed since)', () => {
    const sat = day(5)
    const events = [wakeOn(day(4)), wakeOn(sat)]
    expect(wakeStreak(events, TASKS, settings, noonOf(sat)).current).toBe(2)
  })

  it('rests where it was when the schedule has no targets at all', () => {
    const none: Settings = {
      ...settings,
      wakeSchedule: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
    }
    const events = [wakeOn(day(0)), wakeOn(day(1))]
    expect(wakeStreak(events, TASKS, none, noonOf(day(30)))).toEqual({ current: 2, best: 2, hasTargets: false })
    expect(wakeStreak([], TASKS, none, noonOf(day(30)))).toEqual({ current: 0, best: 0, hasTargets: false })
  })

  it('judges past days by the current schedule, so a new Saturday target can end a run', () => {
    // Fri, then Sat with no log, then Mon. With weekends off that's a run of 2.
    const events = [wakeOn(day(4)), wakeOn(day(7))]
    expect(wakeStreak(events, TASKS, settings, noonOf(day(7))).current).toBe(2)
    const satTarget: Settings = { ...settings, wakeSchedule: { ...settings.wakeSchedule, sat: '08:00' } }
    expect(wakeStreak(events, TASKS, satTarget, noonOf(day(7)))).toMatchObject({ current: 1, best: 1 })
  })

  it('treats a malformed target as no target', () => {
    const odd: Settings = { ...settings, wakeSchedule: { ...settings.wakeSchedule, tue: 'soon' } }
    const events = [wakeOn(day(0)), wakeOn(day(2))]
    expect(wakeStreak(events, TASKS, odd, noonOf(day(2))).current).toBe(2)
  })

  it('ignores other tasks and undone wake logs', () => {
    const first = wakeOn(day(0))
    const events: GameEvent[] = [first, log(gym, noonOf(day(1))), undo(first, noonOf(day(0)))]
    expect(wakeStreak(events, TASKS, settings, noonOf(day(1))).current).toBe(0)
  })
})

describe('weekStartKey', () => {
  it('finds the Monday of the week', () => {
    expect(weekStartKey('2026-10-05', 'mon')).toBe('2026-10-05')
    expect(weekStartKey('2026-10-11', 'mon')).toBe('2026-10-05')
    expect(weekStartKey('2026-10-12', 'mon')).toBe('2026-10-12')
    expect(weekStartKey('2026-10-01', 'mon')).toBe('2026-09-28')
  })

  it('honours another week start', () => {
    expect(weekStartKey('2026-10-05', 'sun')).toBe('2026-10-04')
    expect(weekStartKey('2026-10-10', 'sun')).toBe('2026-10-04')
  })
})

describe('weeklyCounts', () => {
  const counts = (events: readonly GameEvent[], now: number) =>
    Object.fromEntries(weeklyCounts(events, [gym, read], now, CONFIG).map((c) => [c.taskId, c]))

  it('is zero for every task before anything is logged, in task order', () => {
    expect(weeklyCounts([], [gym, read], noon(5), CONFIG)).toEqual([
      { taskId: 'gym', thisWeek: 0, bestWeek: 0 },
      { taskId: 'read', thisWeek: 0, bestWeek: 0 },
    ])
  })

  it('counts distinct days this Mon–Sun week, and the best week ever', () => {
    // Week of Mon 28 Sep: Thu 1, Fri 2, Sat 3 Oct. Week of Mon 5 Oct: Mon 5, Wed 7.
    const events = [...logsOn(1, 2, 3, 5, 7), log(gym, noon(7) + 60_000), log(read, noon(6))]
    const c = counts(events, noon(8))
    expect(c.gym).toEqual({ taskId: 'gym', thisWeek: 2, bestWeek: 3 })
    expect(c.read).toEqual({ taskId: 'read', thisWeek: 1, bestWeek: 1 })
  })

  it('starts each week at zero without touching the best', () => {
    expect(counts(logsOn(1, 2, 3), noon(5)).gym).toEqual({ taskId: 'gym', thisWeek: 0, bestWeek: 3 })
  })

  it('drops an undone log', () => {
    const l = log(gym, noon(5))
    expect(counts([l, undo(l, noon(5) + 1)], noon(5)).gym).toEqual({ taskId: 'gym', thisWeek: 0, bestWeek: 0 })
  })

  it('puts 03:59 on Monday into the week before, and 04:00 into the new one', () => {
    expect(counts([log(gym, at('2026-10-05T03:59:00+01:00'))], noon(5)).gym!.thisWeek).toBe(0)
    expect(counts([log(gym, at('2026-10-05T04:00:00+01:00'))], noon(5)).gym!.thisWeek).toBe(1)
  })

  it('handles a week spanning the clocks going back (Sun 25 Oct 2026)', () => {
    // Mon 19 Oct (BST) to Sun 25 Oct, when 02:00 BST becomes 01:00 GMT.
    const events = [
      log(gym, at('2026-10-19T07:00:00+01:00')),
      log(gym, at('2026-10-24T22:00:00+01:00')), // Sat
      log(gym, at('2026-10-25T01:30:00+00:00')), // the second 01:30, still Sat's game day
      log(gym, at('2026-10-26T03:59:00+00:00')), // GMT: still Sunday's game day
      log(gym, at('2026-10-26T04:00:00+00:00')), // Monday: a new week
    ]
    // The last minute of Sunday's game day, in GMT now: Mon 19, Sat 24 (twice) and Sun 25.
    const sunday = counts(events.slice(0, 4), at('2026-10-26T03:59:30+00:00'))
    expect(sunday.gym!.thisWeek).toBe(3)
    const monday = counts(events, at('2026-10-26T12:00:00+00:00'))
    expect(monday.gym).toEqual({ taskId: 'gym', thisWeek: 1, bestWeek: 3 }) // Mon 19, Sat 24, Sun 25
  })

  it('keeps an overall streak unbroken across the clock change', () => {
    const events = range(20, 28).map((n) => log(gym, noon(n)))
    expect(streak(events, noon(28))).toMatchObject({ current: 9, freezesHeld: 1 })
  })
})

describe('firstLogDay', () => {
  it('is null before any log and the earliest active log’s day after', () => {
    expect(firstLogDay([], noon(3))).toBeNull()
    const first = log(gym, at('2026-10-02T02:00:00+01:00')) // game day 1 Oct
    expect(firstLogDay([log(gym, noon(3)), first], noon(3))).toBe('2026-10-01')
    expect(firstLogDay([first, undo(first, noon(3))], noon(3))).toBeNull()
  })
})
