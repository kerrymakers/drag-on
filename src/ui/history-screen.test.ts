import { describe, expect, it } from 'vitest'
import { ITEMS } from '../config/items'
import { TASKS } from '../config/tasks'
import { at, itemLog, log, treatLog, undo } from '../testing/helpers'
import {
  HISTORY,
  bestStreak,
  calendarDayLabel,
  dayCount,
  freezesLine,
  historyFound,
  historyLogXp,
  monthTitle,
  streakChip,
  streakChipLabel,
  weekLine,
} from './copy'
import { dayEntries, monthBounds, monthCells, monthOf, shiftMonth, weekColumns, weeklyTasks } from './history-screen'

const gym = TASKS.find((t) => t.id === 'gym')!
const read = TASKS.find((t) => t.id === 'read')!

describe('weekColumns', () => {
  it('starts on the configured day', () => {
    expect(weekColumns('mon')).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
    expect(weekColumns('sun')).toEqual(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
  })
})

describe('shiftMonth', () => {
  it('steps months across years', () => {
    expect(shiftMonth('2026-10', 1)).toBe('2026-11')
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
    expect(shiftMonth('2026-10', -13)).toBe('2025-09')
  })
})

describe('monthCells', () => {
  it('pads to the 1st’s weekday, then lists every day', () => {
    // 1 Oct 2026 is a Thursday: three blanks in a Monday-first week.
    const cells = monthCells('2026-10', 'mon')
    expect(cells.slice(0, 4)).toEqual([null, null, null, '2026-10-01'])
    expect(cells.filter((c) => c !== null)).toHaveLength(31)
    expect(cells.at(-1)).toBe('2026-10-31')
  })

  it('has no blanks when the month starts on the week start, and knows leap years', () => {
    expect(monthCells('2026-06', 'mon')[0]).toBe('2026-06-01') // a Monday
    expect(monthCells('2028-02', 'mon').filter(Boolean)).toHaveLength(29)
  })
})

describe('monthBounds', () => {
  it('runs from the first log’s month to this month', () => {
    expect(monthBounds('2026-08-14', '2026-10-07')).toEqual({ min: '2026-08', max: '2026-10' })
  })

  it('is just this month before any log', () => {
    expect(monthBounds(null, '2026-10-07')).toEqual({ min: '2026-10', max: '2026-10' })
  })

  it('never goes past this month', () => {
    expect(monthBounds('2026-12-01', '2026-10-07')).toEqual({ min: '2026-10', max: '2026-10' })
    expect(monthOf('2026-10-07')).toBe('2026-10')
  })
})

describe('dayEntries', () => {
  const day = '2026-10-05'
  const noon = at('2026-10-05T12:00:00+01:00')

  it('lists a day’s logs in time order, with XP including treats and any find', () => {
    const events = [
      treatLog(read, noon + 2000, 13),
      log(gym, noon),
      itemLog(gym, noon + 1000, ITEMS[0]!.id),
      log(gym, at('2026-10-06T12:00:00+01:00')), // another day
    ]
    expect(dayEntries(events, day, TASKS, ITEMS).map(({ taskName, xp, treat, itemName }) => ({ taskName, xp, treat, itemName }))).toEqual([
      { taskName: gym.name, xp: gym.xp, treat: 0, itemName: null },
      { taskName: gym.name, xp: gym.xp, treat: 0, itemName: ITEMS[0]!.name },
      { taskName: read.name, xp: read.xp + 13, treat: 13, itemName: null },
    ])
  })

  it('counts a 03:59 log towards the day before', () => {
    const late = log(gym, at('2026-10-06T03:59:00+01:00'))
    expect(dayEntries([late], day, TASKS, ITEMS)).toHaveLength(1)
    expect(dayEntries([late], '2026-10-06', TASKS, ITEMS)).toHaveLength(0)
  })

  it('leaves out undone logs, and their finds', () => {
    const find = itemLog(gym, noon, ITEMS[0]!.id)
    expect(dayEntries([find, undo(find, noon + 1)], day, TASKS, ITEMS)).toEqual([])
  })

  it('names an unknown task gently, and ignores an item id not in config', () => {
    const odd = itemLog({ id: 'gone', xp: 5 }, noon, 'from-the-future')
    expect(dayEntries([odd], day, TASKS, ITEMS)[0]).toMatchObject({ taskName: HISTORY.unknownTask, itemName: null })
  })
})

describe('weeklyTasks', () => {
  it('leaves out wake-up (it has its own streak) and archived tasks, keeping the order', () => {
    const shown = weeklyTasks(TASKS)
    expect(shown.some((t) => t.rules.kind === 'wakeUp')).toBe(false)
    expect(shown.map((t) => t.id)).toEqual(TASKS.filter((t) => !t.archived && t.rules.kind !== 'wakeUp').map((t) => t.id))
    expect(shown.map((t) => t.id)).toContain('gym')
    expect(weeklyTasks([{ ...gym, archived: true }])).toEqual([])
  })
})

describe('History copy', () => {
  it('counts days kindly', () => {
    expect(dayCount(1)).toBe('1 day')
    expect(dayCount(12)).toBe('12 days')
    expect(bestStreak(15)).toBe('Best: 15 days')
    expect(streakChip(12)).toBe('12 days')
    expect(streakChipLabel(2)).toContain('2 days')
  })

  it('treats a reset as a fresh start, never a loss', () => {
    expect(HISTORY.freshStart).toBe('A fresh start today')
    const all = Object.values(HISTORY).join(' ').toLowerCase()
    for (const word of ['lost', 'broke', 'broken', 'missed', 'failed']) expect(all).not.toContain(word)
  })

  it('explains freezes, and how many are held', () => {
    expect(freezesLine(0, 7)).toBe('A streak freeze arrives every 7 days in a row')
    expect(freezesLine(1, 7)).toBe('1 streak freeze ready')
    expect(freezesLine(2, 7)).toBe('2 streak freezes ready')
  })

  it('shows this week, and the best week only when it’s higher', () => {
    expect(weekLine(0, 0)).toBe('Not yet')
    expect(weekLine(0, 4)).toBe('Not yet · best 4')
    expect(weekLine(3, 3)).toBe('3 days')
    expect(weekLine(1, 5)).toBe('1 day · best 5')
  })

  it('labels calendar days without ever saying a day was missed', () => {
    expect(calendarDayLabel('2026-10-05', 'logged', false)).toBe('5 October, logged')
    expect(calendarDayLabel('2026-10-07', 'pending', true)).toBe('7 October, today')
    expect(calendarDayLabel('2026-10-04', 'missed', false)).toBe('4 October')
    expect(calendarDayLabel('2026-10-03', 'frozen', false)).toContain('streak freeze')
    expect(monthTitle('2026-10')).toBe('October 2026')
  })

  it('shows a log’s XP with its treat, and what it found', () => {
    expect(historyLogXp(25, 0)).toBe('+25 XP')
    expect(historyLogXp(38, 13)).toBe('+38 XP (with a +13 treat)')
    expect(historyFound('Tiny book')).toBe('Found the tiny book')
  })
})
