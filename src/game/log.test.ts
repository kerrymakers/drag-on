import { describe, expect, it } from 'vitest'
import { REWARDS } from '../config/rewards'
import { STREAKS } from '../config/streaks'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import { TASKS } from '../config/tasks'
import { createLogEvent, createUndoEvent, undoableLog } from './log'
import { foundItems, itemFor, logsSinceFind, rewardMilestone } from './rewards'
import { dragonStage, stageFor, totalXp } from './state'
import { instantInDay, shiftDayKey } from './day'
import type { StreakConfig } from '../config/streaks'
import type { GameEvent, LogEvent, RewardRoll, Stage, Task } from './types'
import { at, NO_REWARD } from '../testing/helpers'

const task = (id: string): Task => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(id)
  return t
}
const wake = task('wake')
const gym = task('gym')
const walk = task('walk')
const read = task('read')
const avoided = task('avoided')
const settings = DEFAULT_SETTINGS
const avoidedMax = avoided.rules.kind === 'maxPerDay' ? avoided.rules.max : NaN
const MON = (time: string) => at(`2026-10-05T${time}+01:00`)
const TUE = (time: string) => at(`2026-10-06T${time}+01:00`)

/** Logs a task and appends it, failing the test if it was refused. */
function tap(events: GameEvent[], t: Task, now: number, id: string): GameEvent[] {
  const e = createLogEvent(t, events, settings, now, id, NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })
  if (!e) throw new Error(`${t.id} refused at ${new Date(now).toISOString()}`)
  return [...events, e]
}

describe('createLogEvent', () => {
  it('records the task, time, id and current XP', () => {
    expect(createLogEvent(gym, [], settings, MON('08:00'), 'abc', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).toEqual({
      id: 'abc',
      type: 'log',
      taskId: 'gym',
      timestamp: MON('08:00'),
      xpAwarded: gym.xp,
    })
  })

  it('refuses a second once-per-day log', () => {
    const events = tap([], gym, MON('08:00'), 'a')
    expect(createLogEvent(gym, events, settings, MON('09:00'), 'b', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).toBeNull()
  })

  it('refuses the avoided task once it reaches its daily limit', () => {
    let events: GameEvent[] = []
    for (let i = 0; i < avoidedMax; i++) events = tap(events, avoided, MON('09:00') + i * 60_000, `a${i}`)
    expect(createLogEvent(avoided, events, settings, MON('12:00'), 'next', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).toBeNull()
  })

  it('accepts wake-up at 06:45 and refuses it at 06:46', () => {
    expect(createLogEvent(wake, [], settings, MON('06:45:00'), 'a', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).not.toBeNull()
    expect(createLogEvent(wake, [], settings, MON('06:46:00'), 'b', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).toBeNull()
  })

  it('refuses wake-up at 02:00 Tuesday, which is Monday night', () => {
    expect(createLogEvent(wake, [], settings, TUE('02:00'), 'a', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).toBeNull()
  })

  it('refuses wake-up at the weekend', () => {
    expect(createLogEvent(wake, [], settings, at('2026-10-10T06:00:00+01:00'), 'a', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).toBeNull()
  })

  it('refuses archived tasks', () => {
    expect(createLogEvent({ ...gym, archived: true }, [], settings, MON('08:00'), 'a', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).toBeNull()
  })

  it('uses the task XP at log time, so later XP edits leave old logs alone', () => {
    const events = tap([], { ...gym, xp: 41 }, MON('08:00'), 'a')
    const after = tap(events, { ...walk, xp: 99 }, MON('09:00'), 'b')
    expect(totalXp(after)).toBe(140)
  })
})

describe('undo', () => {
  it('has nothing to undo on an empty log', () => {
    expect(undoableLog([], MON('08:00'))).toBeNull()
    expect(createUndoEvent([], MON('08:00'), 'u')).toBeNull()
  })

  it('undoes the most recent log by appending an undo event', () => {
    let events = tap([], gym, MON('08:00'), 'a')
    events = tap(events, walk, MON('09:00'), 'b')
    const u = createUndoEvent(events, MON('09:01'), 'u1')
    expect(u).toEqual({ id: 'u1', type: 'undo', targetEventId: 'b', timestamp: MON('09:01') })
    const after = [...events, u as GameEvent]
    expect(after).toHaveLength(3) // nothing deleted
    expect(totalXp(after)).toBe(gym.xp)
  })

  it('undoing twice undoes two different logs', () => {
    let events = tap([], gym, MON('08:00'), 'a')
    events = tap(events, walk, MON('09:00'), 'b')
    const u1 = createUndoEvent(events, MON('09:01'), 'u1') as GameEvent
    events = [...events, u1]
    const u2 = createUndoEvent(events, MON('09:02'), 'u2')
    expect(u2?.targetEventId).toBe('a')
    events = [...events, u2 as GameEvent]
    expect(totalXp(events)).toBe(0)
    expect(createUndoEvent(events, MON('09:03'), 'u3')).toBeNull()
  })

  it('never targets a log that is already undone', () => {
    const events = tap([], gym, MON('08:00'), 'a')
    const u1 = createUndoEvent(events, MON('08:01'), 'u1') as GameEvent
    const after = [...events, u1]
    expect(undoableLog(after, MON('08:02'))).toBeNull()
    expect(createUndoEvent(after, MON('08:02'), 'u2')).toBeNull()
  })

  it('lets a task be logged again after its log is undone', () => {
    const events = tap([], gym, MON('08:00'), 'a')
    const u = createUndoEvent(events, MON('08:01'), 'u') as GameEvent
    expect(createLogEvent(gym, [...events, u], settings, MON('08:02'), 'b', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).not.toBeNull()
  })

  it('still works at 03:59 for a log from earlier that day', () => {
    const events = tap([], gym, MON('22:00'), 'a')
    expect(undoableLog(events, TUE('03:59'))?.id).toBe('a')
  })

  it('has nothing to undo once the day rolls over at 04:00', () => {
    const events = tap([], gym, MON('22:00'), 'a')
    expect(undoableLog(events, TUE('04:00'))).toBeNull()
    expect(createUndoEvent(events, TUE('04:00'), 'u')).toBeNull()
  })

  it('skips older days and finds today’s latest log', () => {
    let events = tap([], gym, MON('22:00'), 'a')
    events = tap(events, walk, TUE('09:00'), 'b')
    const u1 = createUndoEvent(events, TUE('09:01'), 'u1') as GameEvent
    events = [...events, u1]
    expect(createUndoEvent(events, TUE('09:02'), 'u2')).toBeNull()
  })

  it('uses append order, not timestamps, to find the last log', () => {
    // Phone clock went backwards between taps.
    let events = tap([], gym, MON('10:00'), 'a')
    events = tap(events, walk, MON('09:00'), 'b')
    expect(undoableLog(events, MON('10:05'))?.id).toBe('b')
  })

  it('can take the dragon back to an egg (undo is for mis-taps)', () => {
    let events: GameEvent[] = []
    events = tap(events, wake, MON('06:00'), 'a')
    events = tap(events, gym, MON('08:00'), 'b')
    events = tap(events, walk, MON('12:00'), 'c')
    events = tap(events, read, MON('20:00'), 'd')
    // Put the hatch threshold exactly at this day's total, so the last log hatches it.
    const hatchAt = wake.xp + gym.xp + walk.xp + read.xp
    const stages = STAGES.map((s) => (s.id === 'hatchling' ? { ...s, xpFrom: hatchAt } : s))
    expect(stageFor(totalXp(events), stages).id).toBe('hatchling')
    events = [...events, createUndoEvent(events, MON('20:01'), 'u') as GameEvent]
    expect(totalXp(events)).toBe(hatchAt - read.xp)
    expect(stageFor(totalXp(events), stages).id).toBe('egg')
  })
})

describe('createLogEvent rewards', () => {
  const TREAT = { chance: REWARDS.rareChance, pick: 0 }
  const bonus = (t: Task) => Math.round(t.xp * REWARDS.treatBonusShare)

  it('saves a treat on the log, keeping xpAwarded as the base XP', () => {
    const e = createLogEvent(read, [], settings, MON('08:00'), 'a', TREAT, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })
    expect(e).toMatchObject({ xpAwarded: read.xp, reward: { kind: 'treat', bonusXp: bonus(read) } })
    expect(totalXp([e as GameEvent])).toBe(read.xp + bonus(read))
  })

  it('saves no reward key on a roll that brings nothing', () => {
    const e = createLogEvent(read, [], settings, MON('08:00'), 'a', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })
    expect(e).not.toHaveProperty('reward')
  })

  it('saves an item on the log in the rare band, with the base XP unchanged', () => {
    const e = createLogEvent(read, [], settings, MON('08:00'), 'a', { chance: 0, pick: 0 }, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })
    expect(e).toMatchObject({ xpAwarded: read.xp, reward: { kind: 'item', itemId: REWARDS.items[0]!.id } })
    expect(totalXp([e as GameEvent])).toBe(read.xp)
  })

  it('picks among the items not found yet, from the whole log', () => {
    const RARE = { chance: 0, pick: 0 }
    let events: GameEvent[] = [createLogEvent(gym, [], settings, MON('08:00'), 'a', RARE, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })!]
    events = [...events, createLogEvent(read, events, settings, MON('08:01'), 'b', RARE, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })!]
    expect(foundItems(events, REWARDS.items).map((f) => f.item.id)).toEqual(REWARDS.items.slice(0, 2).map((i) => i.id))
    // Undo takes the second find away, so the next rare roll can bring it again.
    events = [...events, createUndoEvent(events, MON('08:02'), 'u')!]
    expect(foundItems(events, REWARDS.items)).toHaveLength(1)
    const again = createLogEvent(read, events, settings, MON('08:03'), 'c', RARE, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })
    expect(again?.reward).toEqual({ kind: 'item', itemId: REWARDS.items[1]!.id })
  })

  it('gives no reward when the log is refused', () => {
    const events = tap([], gym, MON('08:00'), 'a')
    expect(createLogEvent(gym, events, settings, MON('09:00'), 'b', TREAT, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })).toBeNull()
  })

  it('records stageReached when the treat bonus is what crosses a threshold', () => {
    const hatchAt = gym.xp + 1 // the base XP alone falls short
    const stages: Stage[] = [
      { id: 'egg', name: 'Egg', xpFrom: 0 },
      { id: 'hatchling', name: 'Hatchling', xpFrom: hatchAt },
    ]
    const plain = createLogEvent(gym, [], settings, MON('08:00'), 'a', NO_REWARD, { stages, rewards: REWARDS, streaks: STREAKS })
    expect(plain).not.toHaveProperty('stageReached')
    const treat = createLogEvent(gym, [], settings, MON('08:00'), 'a', TREAT, { stages, rewards: REWARDS, streaks: STREAKS }) as LogEvent
    expect(treat.stageReached).toBe('hatchling')
    // Raising the threshold past the total later doesn't take the stage away.
    const raised = stages.map((s) => (s.id === 'hatchling' ? { ...s, xpFrom: 1000 } : s))
    expect(dragonStage([treat], raised).id).toBe('hatchling')
  })

  it('takes the bonus away with the log on undo', () => {
    let events: GameEvent[] = [createLogEvent(gym, [], settings, MON('08:00'), 'a', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })!]
    events = [...events, createLogEvent(read, events, settings, MON('08:01'), 'b', TREAT, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })!]
    expect(totalXp(events)).toBe(gym.xp + read.xp + bonus(read))
    events = [...events, createUndoEvent(events, MON('08:02'), 'u')!]
    expect(totalXp(events)).toBe(gym.xp)
  })
})


describe('createLogEvent streak milestones', () => {
  /** Fixed numbers, so these tests don't move when the real config is rebalanced. */
  const CONFIG: StreakConfig = { freezeEveryDays: 7, freezeMaxHeld: 2, milestones: [7, 30, 60, 100], weekStart: 'mon' }
  // Thu 1 Oct 2026. Day n of the run, at 10:00 on the London clock.
  const dayN = (n: number) => shiftDayKey('2026-10-01', n - 1)
  const tenOn = (n: number, minutes = 0) => instantInDay(dayN(n), 6 * 60 + minutes)
  const PICK_LAST: RewardRoll = { chance: 0.9999, pick: 0.9999 } // no luck at all; picks the last item left

  /** Logs `t` on each given day through createLogEvent and appends it. */
  function logDays(days: number[], events: GameEvent[] = [], config = CONFIG, t = gym, roll = NO_REWARD): GameEvent[] {
    for (const n of days) {
      const e = createLogEvent(t, events, settings, tenOn(n), `d${n}-${events.length}`, roll, { stages: STAGES, rewards: REWARDS, streaks: config })
      if (!e) throw new Error(`refused on day ${n}`)
      events = [...events, e]
    }
    return events
  }
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i)
  const last = (events: GameEvent[]) => events.at(-1) as LogEvent

  it('gives the log that first reaches 7 days a guaranteed item, saved with the milestone', () => {
    const six = logDays(range(1, 6))
    expect(six.some((e) => (e as LogEvent).reward)).toBe(false)
    const seventh = createLogEvent(gym, six, settings, tenOn(7), 'seven', PICK_LAST, { stages: STAGES, rewards: REWARDS, streaks: CONFIG })!
    const lastItem = REWARDS.items.at(-1)!
    expect(seventh.reward).toEqual({ kind: 'item', itemId: lastItem.id, milestone: 7 })
    expect(itemFor(seventh, REWARDS.items)).toEqual(lastItem)
    expect(rewardMilestone(seventh)).toBe(7)
    // It counts as a find, so bad-luck protection starts over.
    expect(logsSinceFind([...six, seventh], REWARDS.items)).toBe(0)
  })

  it('never gives it to a second log the same day', () => {
    const seven = logDays(range(1, 7))
    expect(rewardMilestone(last(seven))).toBe(7)
    const again = createLogEvent(read, seven, settings, tenOn(7, 5), 'again', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: CONFIG })!
    expect(again).not.toHaveProperty('reward')
  })

  it('picks only among items not found yet', () => {
    const first = REWARDS.items[0]!
    const events = logDays([1], [], CONFIG, gym, { chance: 0, pick: 0 }) // a lucky find of the first item
    expect(itemFor(last(events), REWARDS.items)).toEqual(first)
    const seven = logDays(range(2, 7), events)
    const reward = last(seven).reward
    expect(reward).toEqual({ kind: 'item', itemId: REWARDS.items[1]!.id, milestone: 7 })
  })

  it('gives the normal roll when a later run reaches 7 again after a break', () => {
    const firstRun = logDays(range(1, 7))
    expect(rewardMilestone(last(firstRun))).toBe(7)
    // The freeze earned at 7 covers day 8; day 9 ends the run. A new run from day 11.
    const secondRun = logDays(range(11, 17), firstRun)
    expect(secondRun.slice(firstRun.length).map((e) => (e as LogEvent).reward)).toEqual(Array(7).fill(undefined))
  })

  it('can be earned again after undoing the milestone log, by relogging', () => {
    let events = logDays(range(1, 7))
    expect(rewardMilestone(last(events))).toBe(7)
    events = [...events, createUndoEvent(events, tenOn(7, 1), 'u')!]
    expect(foundItems(events, REWARDS.items)).toHaveLength(0)
    const relog = createLogEvent(walk, events, settings, tenOn(7, 2), 'relog', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: CONFIG })!
    expect(rewardMilestone(relog)).toBe(7)
  })

  it('falls back to the normal roll once every item is found', () => {
    const all: GameEvent[] = REWARDS.items.map((item, i) => ({
      id: `found-${i}`,
      type: 'log',
      taskId: 'avoided',
      timestamp: tenOn(-10 - i),
      xpAwarded: 0,
      reward: { kind: 'item', itemId: item.id },
    }))
    const six = logDays(range(1, 6), all)
    const TREAT = { chance: REWARDS.rareChance, pick: 0 }
    const seventh = createLogEvent(gym, six, settings, tenOn(7), 's', TREAT, { stages: STAGES, rewards: REWARDS, streaks: CONFIG })!
    expect(seventh.reward).toEqual({ kind: 'treat', bonusXp: Math.round(gym.xp * REWARDS.treatBonusShare) })
    const plain = createLogEvent(gym, six, settings, tenOn(7), 's', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: CONFIG })!
    expect(plain).not.toHaveProperty('reward')
  })

  it("doesn't count frozen days towards a milestone", () => {
    // A freeze every 3 days: days 1-3 earn one, day 4 is frozen, so day 7 makes 6.
    const config: StreakConfig = { ...CONFIG, freezeEveryDays: 3 }
    const events = logDays([1, 2, 3, 5, 6, 7], [], config)
    expect(events.every((e) => !(e as LogEvent).reward)).toBe(true)
    const eighth = logDays([8], events, config)
    expect(rewardMilestone(last(eighth))).toBe(7)
  })

  it('reaches 30, 60 and 100 the same way, each once', () => {
    const events = logDays(range(1, 100))
    const milestones = events.map((e) => rewardMilestone(e as LogEvent)).filter((m) => m !== null)
    expect(milestones).toEqual([7, 30, 60, 100])
    expect(rewardMilestone(events[29] as LogEvent)).toBe(30)
    expect(rewardMilestone(events[59] as LogEvent)).toBe(60)
  })

  it('is stored once on the log and stays the same after a reload and later logs', () => {
    const events = logDays(range(1, 8))
    const reloaded = JSON.parse(JSON.stringify(events)) as GameEvent[]
    expect(reloaded[6]).toEqual(events[6])
    expect(rewardMilestone(reloaded[6] as LogEvent)).toBe(7)
    expect(foundItems(reloaded, REWARDS.items).map((f) => f.logId)).toEqual([events[6]!.id])
    // Rebalancing the milestones later doesn't rewrite a saved find.
    const moved: StreakConfig = { ...CONFIG, milestones: [5] }
    const next = logDays([9], reloaded, moved)
    expect(rewardMilestone(reloaded[6] as LogEvent)).toBe(7)
    expect(last(next)).not.toHaveProperty('reward')
  })

  it('uses the real config: STREAKS milestones are 7, 30, 60 and 100', () => {
    expect(STREAKS.milestones).toEqual([7, 30, 60, 100])
  })
})
