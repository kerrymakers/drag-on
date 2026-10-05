import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import { TASKS } from '../config/tasks'
import {
  activeLogs,
  nextRefreshAt,
  progressToNextStage,
  stageFor,
  taskAvailability,
  totalXp,
} from './state'
import { at, log, undo } from '../testing/helpers'
import type { Settings, Stage, Task } from './types'

const task = (id: string): Task => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(id)
  return t
}
const wake = task('wake')
const gym = task('gym')
const walk = task('walk')
const avoided = task('avoided')
const settings = DEFAULT_SETTINGS

/** The avoided task's daily limit, read from config. */
const avoidedMax = avoided.rules.kind === 'maxPerDay' ? avoided.rules.max : NaN

/** A fixed stage table so progress maths doesn't move when the real config is rebalanced. */
const TEST_STAGES: Stage[] = [
  { id: 'egg', name: 'Egg', xpFrom: 0 },
  { id: 'hatchling', name: 'Hatchling', xpFrom: 100 },
  { id: 'whelp', name: 'Whelp', xpFrom: 500 },
]

// Mon 5 Oct 2026 is BST (+01:00).
const MON = (time: string) => at(`2026-10-05T${time}+01:00`)
const TUE = (time: string) => at(`2026-10-06T${time}+01:00`)

describe('activeLogs and totalXp', () => {
  it('sums xpAwarded from logs', () => {
    const events = [log(gym, MON('08:00')), log(walk, MON('12:00'))]
    expect(totalXp(events)).toBe(gym.xp + walk.xp)
  })

  it('ignores undone logs and keeps the rest', () => {
    const a = log(gym, MON('08:00'))
    const b = log(walk, MON('12:00'))
    const events = [a, b, undo(b, MON('12:01'))]
    expect(activeLogs(events)).toEqual([a])
    expect(totalXp(events)).toBe(gym.xp)
  })

  it('uses the XP saved on the event, not the current task XP', () => {
    // Logged when the gym was worth a different amount from today's config.
    const events = [log({ id: 'gym', xp: gym.xp + 7 }, MON('08:00'))]
    expect(totalXp(events)).toBe(gym.xp + 7)
  })

  it('is 0 for an empty log', () => {
    expect(totalXp([])).toBe(0)
  })
})

describe('stageFor', () => {
  it('reaches each configured stage exactly at its threshold', () => {
    const sorted = [...STAGES].sort((x, y) => x.xpFrom - y.xpFrom)
    sorted.forEach((stage, i) => {
      expect(stageFor(stage.xpFrom, STAGES).id).toBe(stage.id)
      const previous = sorted[i - 1]
      if (previous) expect(stageFor(stage.xpFrom - 1, STAGES).id).toBe(previous.id)
    })
    expect(stageFor(0, STAGES).id).toBe('egg')
    expect(stageFor(1_000_000, STAGES).id).toBe('elder')
  })

  it('does not depend on the order stages are listed in', () => {
    expect(stageFor(120, [...TEST_STAGES].reverse()).id).toBe('hatchling')
  })

  it('recalculates from history when a threshold changes', () => {
    const events = [
      log({ id: 'gym', xp: 40 }, MON('08:00')),
      log({ id: 'walk', xp: 30 }, MON('12:00')),
      log({ id: 'read', xp: 30 }, MON('20:00')),
    ]
    const xp = totalXp(events)
    expect(xp).toBe(100)
    expect(stageFor(xp, TEST_STAGES).id).toBe('hatchling')

    const harder: Stage[] = TEST_STAGES.map((s) => (s.id === 'hatchling' ? { ...s, xpFrom: 150 } : s))
    expect(stageFor(xp, harder).id).toBe('egg')
    expect(progressToNextStage(xp, harder).xpToNext).toBe(50)
  })
})

describe('progressToNextStage', () => {
  it('starts at the first stage with the whole gap to go', () => {
    expect(progressToNextStage(0, TEST_STAGES)).toEqual({
      stage: TEST_STAGES[0],
      next: TEST_STAGES[1],
      xpIntoStage: 0,
      xpToNext: 100,
      fraction: 0,
    })
  })

  it('measures progress within the current stage', () => {
    const p = progressToNextStage(250, TEST_STAGES)
    expect(p.stage.id).toBe('hatchling')
    expect(p.next?.id).toBe('whelp')
    expect(p.xpIntoStage).toBe(150)
    expect(p.xpToNext).toBe(250)
    expect(p.fraction).toBeCloseTo(150 / 400)
  })

  it('has no next stage at the last stage', () => {
    const p = progressToNextStage(800, TEST_STAGES)
    expect(p.stage.id).toBe('whelp')
    expect(p.next).toBeNull()
    expect(p.xpIntoStage).toBe(300)
    expect(p.xpToNext).toBe(0)
    expect(p.fraction).toBe(1)
  })

  it('works on the real config: the egg needs the Hatchling threshold to hatch', () => {
    const hatchling = STAGES.find((s) => s.id === 'hatchling') as Stage
    expect(progressToNextStage(0, STAGES).xpToNext).toBe(hatchling.xpFrom)
    expect(progressToNextStage(10_000_000, STAGES).next).toBeNull()
  })
})

describe('taskAvailability: wake-up', () => {
  it('is loggable from 04:00 up to and including 06:45 on a 06:30 weekday', () => {
    expect(taskAvailability(wake, [], settings, MON('04:00:00')).canLog).toBe(true)
    expect(taskAvailability(wake, [], settings, MON('06:30:00')).canLog).toBe(true)
    expect(taskAvailability(wake, [], settings, MON('06:45:00')).canLog).toBe(true)
  })

  it('cuts off at the minute: 06:45:59 counts, 06:46:00 does not', () => {
    expect(taskAvailability(wake, [], settings, MON('06:45:59')).canLog).toBe(true)
    const late = taskAvailability(wake, [], settings, MON('06:46:00'))
    expect(late).toEqual({ visible: false, canLog: false, countToday: 0, limit: 1 })
  })

  it('stays visible as done once logged, even after the window closes', () => {
    const events = [log(wake, MON('06:40'))]
    expect(taskAvailability(wake, events, settings, MON('06:41'))).toEqual({
      visible: true,
      canLog: false,
      countToday: 1,
      limit: 1,
    })
    expect(taskAvailability(wake, events, settings, MON('21:00')).visible).toBe(true)
  })

  it('treats 02:00 Tuesday as Monday night, after the window, so it does not count', () => {
    const now = TUE('02:00')
    expect(taskAvailability(wake, [], settings, now)).toEqual({
      visible: false,
      canLog: false,
      countToday: 0,
      limit: 1,
    })
  })

  it('does not count a 02:00 Tuesday log towards Tuesday', () => {
    const events = [log(wake, TUE('02:00'))]
    const tuesdayMorning = taskAvailability(wake, events, settings, TUE('06:00'))
    expect(tuesdayMorning.countToday).toBe(0)
    expect(tuesdayMorning.canLog).toBe(true)
  })

  it('is hidden on Saturday and Sunday (skipped, not missed)', () => {
    const sat = at('2026-10-10T06:00:00+01:00')
    const sun = at('2026-10-11T06:00:00+01:00')
    expect(taskAvailability(wake, [], settings, sat).visible).toBe(false)
    expect(taskAvailability(wake, [], settings, sun).visible).toBe(false)
  })

  it('follows the per-day schedule in settings', () => {
    const custom: Settings = {
      ...settings,
      wakeSchedule: { ...settings.wakeSchedule, sat: '09:00', mon: null },
    }
    expect(taskAvailability(wake, [], custom, at('2026-10-10T09:15:00+01:00')).canLog).toBe(true)
    expect(taskAvailability(wake, [], custom, at('2026-10-10T09:16:00+01:00')).visible).toBe(false)
    expect(taskAvailability(wake, [], custom, MON('05:00')).visible).toBe(false)
  })

  it('reopens on the next weekday morning', () => {
    const events = [log(wake, MON('06:00'))]
    expect(taskAvailability(wake, events, settings, TUE('03:59')).canLog).toBe(false)
    expect(taskAvailability(wake, events, settings, TUE('04:00')).canLog).toBe(true)
  })

  it('reopens within the window if the log is undone', () => {
    const l = log(wake, MON('06:00'))
    const events = [l, undo(l, MON('06:01'))]
    expect(taskAvailability(wake, events, settings, MON('06:02')).canLog).toBe(true)
  })

  it('uses the wall clock on clock-change Mondays', () => {
    // Mon 30 Mar 2026 is the first BST weekday.
    expect(taskAvailability(wake, [], settings, at('2026-03-30T06:45:00+01:00')).canLog).toBe(true)
    expect(taskAvailability(wake, [], settings, at('2026-03-30T06:46:00+01:00')).canLog).toBe(false)
    // Mon 26 Oct 2026 is the first GMT weekday.
    expect(taskAvailability(wake, [], settings, at('2026-10-26T06:45:00Z')).canLog).toBe(true)
    expect(taskAvailability(wake, [], settings, at('2026-10-26T06:46:00Z')).canLog).toBe(false)
  })
})

describe('taskAvailability: daily limits', () => {
  it('allows a once-per-day task once, then shows it as done', () => {
    expect(taskAvailability(gym, [], settings, MON('08:00'))).toEqual({
      visible: true,
      canLog: true,
      countToday: 0,
      limit: 1,
    })
    const events = [log(gym, MON('08:00'))]
    expect(taskAvailability(gym, events, settings, MON('09:00'))).toEqual({
      visible: true,
      canLog: false,
      countToday: 1,
      limit: 1,
    })
  })

  it('resets once-per-day tasks at 04:00, not midnight', () => {
    const events = [log(gym, MON('20:00'))]
    expect(taskAvailability(gym, events, settings, TUE('00:30')).canLog).toBe(false)
    expect(taskAvailability(gym, events, settings, TUE('03:59')).canLog).toBe(false)
    expect(taskAvailability(gym, events, settings, TUE('04:00')).canLog).toBe(true)
  })

  it('counts a 03:59 log towards the previous day', () => {
    const events = [log(gym, TUE('03:59'))]
    expect(taskAvailability(gym, events, settings, MON('23:00')).countToday).toBe(1)
    expect(taskAvailability(gym, events, settings, TUE('04:00')).countToday).toBe(0)
  })

  it('allows the avoided task up to its configured limit a day', () => {
    expect(avoidedMax).toBeGreaterThan(1)
    const events = Array.from({ length: avoidedMax - 1 }, (_, i) =>
      log(avoided, MON(`${String(9 + i).padStart(2, '0')}:00`)),
    )
    expect(taskAvailability(avoided, events, settings, MON('20:00'))).toEqual({
      visible: true,
      canLog: true,
      countToday: avoidedMax - 1,
      limit: avoidedMax,
    })
    events.push(log(avoided, MON('20:00')))
    expect(taskAvailability(avoided, events, settings, MON('21:00'))).toEqual({
      visible: true,
      canLog: false,
      countToday: avoidedMax,
      limit: avoidedMax,
    })
  })

  it('works with any maxPerDay limit', () => {
    const thrice: Task = { ...avoided, rules: { kind: 'maxPerDay', max: 3 } }
    const events = [log(thrice, MON('09:00')), log(thrice, MON('10:00'))]
    expect(taskAvailability(thrice, events, settings, MON('11:00')).canLog).toBe(true)
    events.push(log(thrice, MON('11:00')))
    expect(taskAvailability(thrice, events, settings, MON('12:00'))).toMatchObject({
      canLog: false,
      countToday: 3,
      limit: 3,
    })
  })

  it('hides archived tasks', () => {
    const archived = { ...walk, archived: true }
    expect(taskAvailability(archived, [], settings, MON('12:00')).visible).toBe(false)
    expect(taskAvailability({ ...wake, archived: true }, [], settings, MON('05:00')).visible).toBe(false)
  })
})

describe('nextRefreshAt', () => {
  it('is the wake window closing (06:46) when that comes first', () => {
    expect(nextRefreshAt(settings, MON('05:00'))).toBe(MON('06:46:00'))
    expect(nextRefreshAt(settings, MON('06:45:59'))).toBe(MON('06:46:00'))
  })

  it('is the next 04:00 once the wake window has closed', () => {
    expect(nextRefreshAt(settings, MON('06:46:00'))).toBe(TUE('04:00'))
    expect(nextRefreshAt(settings, MON('23:00'))).toBe(TUE('04:00'))
  })

  it('is the next 04:00 on days with no wake target', () => {
    const sat = at('2026-10-10T05:00:00+01:00')
    expect(nextRefreshAt(settings, sat)).toBe(at('2026-10-11T04:00:00+01:00'))
  })

  it('treats the small hours as the end of the previous day', () => {
    // 02:00 Tuesday is Monday's game day; Monday's window closed long ago.
    expect(nextRefreshAt(settings, TUE('02:00'))).toBe(TUE('04:00'))
  })

  it('follows the wall clock across a clock change', () => {
    // Saturday night 24 Oct: the next day starts at 04:00 GMT, after the clocks go back.
    expect(nextRefreshAt(settings, at('2026-10-24T22:00:00+01:00'))).toBe(at('2026-10-25T04:00:00Z'))
    // First GMT Monday: the window closes at 06:46 GMT.
    expect(nextRefreshAt(settings, at('2026-10-26T05:00:00Z'))).toBe(at('2026-10-26T06:46:00Z'))
  })
})
