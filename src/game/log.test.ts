import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import { TASKS } from '../config/tasks'
import { createLogEvent, createUndoEvent, undoableLog } from './log'
import { stageFor, totalXp } from './state'
import type { GameEvent, Task } from './types'
import { at } from '../testing/helpers'

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
  const e = createLogEvent(t, events, settings, now, id, STAGES)
  if (!e) throw new Error(`${t.id} refused at ${new Date(now).toISOString()}`)
  return [...events, e]
}

describe('createLogEvent', () => {
  it('records the task, time, id and current XP', () => {
    expect(createLogEvent(gym, [], settings, MON('08:00'), 'abc', STAGES)).toEqual({
      id: 'abc',
      type: 'log',
      taskId: 'gym',
      timestamp: MON('08:00'),
      xpAwarded: gym.xp,
    })
  })

  it('refuses a second once-per-day log', () => {
    const events = tap([], gym, MON('08:00'), 'a')
    expect(createLogEvent(gym, events, settings, MON('09:00'), 'b', STAGES)).toBeNull()
  })

  it('refuses the avoided task once it reaches its daily limit', () => {
    let events: GameEvent[] = []
    for (let i = 0; i < avoidedMax; i++) events = tap(events, avoided, MON('09:00') + i * 60_000, `a${i}`)
    expect(createLogEvent(avoided, events, settings, MON('12:00'), 'next', STAGES)).toBeNull()
  })

  it('accepts wake-up at 06:45 and refuses it at 06:46', () => {
    expect(createLogEvent(wake, [], settings, MON('06:45:00'), 'a', STAGES)).not.toBeNull()
    expect(createLogEvent(wake, [], settings, MON('06:46:00'), 'b', STAGES)).toBeNull()
  })

  it('refuses wake-up at 02:00 Tuesday, which is Monday night', () => {
    expect(createLogEvent(wake, [], settings, TUE('02:00'), 'a', STAGES)).toBeNull()
  })

  it('refuses wake-up at the weekend', () => {
    expect(createLogEvent(wake, [], settings, at('2026-10-10T06:00:00+01:00'), 'a', STAGES)).toBeNull()
  })

  it('refuses archived tasks', () => {
    expect(createLogEvent({ ...gym, archived: true }, [], settings, MON('08:00'), 'a', STAGES)).toBeNull()
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
    expect(createLogEvent(gym, [...events, u], settings, MON('08:02'), 'b', STAGES)).not.toBeNull()
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
