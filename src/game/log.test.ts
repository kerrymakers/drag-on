import { describe, expect, it } from 'vitest'
import { REWARDS } from '../config/rewards'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import { TASKS } from '../config/tasks'
import { createLogEvent, createUndoEvent, undoableLog } from './log'
import { dragonStage, stageFor, totalXp } from './state'
import type { GameEvent, LogEvent, Stage, Task } from './types'
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
  const e = createLogEvent(t, events, settings, now, id, STAGES, NO_REWARD, REWARDS)
  if (!e) throw new Error(`${t.id} refused at ${new Date(now).toISOString()}`)
  return [...events, e]
}

describe('createLogEvent', () => {
  it('records the task, time, id and current XP', () => {
    expect(createLogEvent(gym, [], settings, MON('08:00'), 'abc', STAGES, NO_REWARD, REWARDS)).toEqual({
      id: 'abc',
      type: 'log',
      taskId: 'gym',
      timestamp: MON('08:00'),
      xpAwarded: gym.xp,
    })
  })

  it('refuses a second once-per-day log', () => {
    const events = tap([], gym, MON('08:00'), 'a')
    expect(createLogEvent(gym, events, settings, MON('09:00'), 'b', STAGES, NO_REWARD, REWARDS)).toBeNull()
  })

  it('refuses the avoided task once it reaches its daily limit', () => {
    let events: GameEvent[] = []
    for (let i = 0; i < avoidedMax; i++) events = tap(events, avoided, MON('09:00') + i * 60_000, `a${i}`)
    expect(createLogEvent(avoided, events, settings, MON('12:00'), 'next', STAGES, NO_REWARD, REWARDS)).toBeNull()
  })

  it('accepts wake-up at 06:45 and refuses it at 06:46', () => {
    expect(createLogEvent(wake, [], settings, MON('06:45:00'), 'a', STAGES, NO_REWARD, REWARDS)).not.toBeNull()
    expect(createLogEvent(wake, [], settings, MON('06:46:00'), 'b', STAGES, NO_REWARD, REWARDS)).toBeNull()
  })

  it('refuses wake-up at 02:00 Tuesday, which is Monday night', () => {
    expect(createLogEvent(wake, [], settings, TUE('02:00'), 'a', STAGES, NO_REWARD, REWARDS)).toBeNull()
  })

  it('refuses wake-up at the weekend', () => {
    expect(createLogEvent(wake, [], settings, at('2026-10-10T06:00:00+01:00'), 'a', STAGES, NO_REWARD, REWARDS)).toBeNull()
  })

  it('refuses archived tasks', () => {
    expect(createLogEvent({ ...gym, archived: true }, [], settings, MON('08:00'), 'a', STAGES, NO_REWARD, REWARDS)).toBeNull()
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
    expect(createLogEvent(gym, [...events, u], settings, MON('08:02'), 'b', STAGES, NO_REWARD, REWARDS)).not.toBeNull()
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
    const e = createLogEvent(read, [], settings, MON('08:00'), 'a', STAGES, TREAT, REWARDS)
    expect(e).toMatchObject({ xpAwarded: read.xp, reward: { kind: 'treat', bonusXp: bonus(read) } })
    expect(totalXp([e as GameEvent])).toBe(read.xp + bonus(read))
  })

  it('saves no reward key on a roll that brings nothing', () => {
    const e = createLogEvent(read, [], settings, MON('08:00'), 'a', STAGES, NO_REWARD, REWARDS)
    expect(e).not.toHaveProperty('reward')
  })

  it('brings nothing in the rare band for now (items arrive in slice 2)', () => {
    const e = createLogEvent(read, [], settings, MON('08:00'), 'a', STAGES, { chance: 0, pick: 0 }, REWARDS)
    expect(e).not.toHaveProperty('reward')
  })

  it('gives no reward when the log is refused', () => {
    const events = tap([], gym, MON('08:00'), 'a')
    expect(createLogEvent(gym, events, settings, MON('09:00'), 'b', STAGES, TREAT, REWARDS)).toBeNull()
  })

  it('records stageReached when the treat bonus is what crosses a threshold', () => {
    const hatchAt = gym.xp + 1 // the base XP alone falls short
    const stages: Stage[] = [
      { id: 'egg', name: 'Egg', xpFrom: 0 },
      { id: 'hatchling', name: 'Hatchling', xpFrom: hatchAt },
    ]
    const plain = createLogEvent(gym, [], settings, MON('08:00'), 'a', stages, NO_REWARD, REWARDS)
    expect(plain).not.toHaveProperty('stageReached')
    const treat = createLogEvent(gym, [], settings, MON('08:00'), 'a', stages, TREAT, REWARDS) as LogEvent
    expect(treat.stageReached).toBe('hatchling')
    // Raising the threshold past the total later doesn't take the stage away.
    const raised = stages.map((s) => (s.id === 'hatchling' ? { ...s, xpFrom: 1000 } : s))
    expect(dragonStage([treat], raised).id).toBe('hatchling')
  })

  it('takes the bonus away with the log on undo', () => {
    let events: GameEvent[] = [createLogEvent(gym, [], settings, MON('08:00'), 'a', STAGES, NO_REWARD, REWARDS)!]
    events = [...events, createLogEvent(read, events, settings, MON('08:01'), 'b', STAGES, TREAT, REWARDS)!]
    expect(totalXp(events)).toBe(gym.xp + read.xp + bonus(read))
    events = [...events, createUndoEvent(events, MON('08:02'), 'u')!]
    expect(totalXp(events)).toBe(gym.xp)
  })
})

