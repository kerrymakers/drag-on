import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { at, log, undo } from '../testing/helpers'
import { createLogEvent } from './log'
import { stageHistory } from './stage-history'
import { dragonStage } from './state'
import type { GameEvent, LogEvent, Stage, Task } from './types'

const STAGES_A: Stage[] = [
  { id: 'egg', name: 'Egg', xpFrom: 0 },
  { id: 'hatchling', name: 'Hatchling', xpFrom: 100 },
  { id: 'whelp', name: 'Whelp', xpFrom: 500 },
  { id: 'juvenile', name: 'Juvenile', xpFrom: 1300 },
]
const withThreshold = (id: string, xpFrom: number): Stage[] =>
  STAGES_A.map((s) => (s.id === id ? { ...s, xpFrom } : s))

const chunk = (xp: number): Task => ({
  id: `chunk-${xp}`,
  name: 'Chunk',
  stat: 'discipline',
  xp,
  rules: { kind: 'maxPerDay', max: 99 },
  archived: false,
})

let n = 0
/** Logs through createLogEvent, so stageReached is recorded as in the app. */
function logXp(events: GameEvent[], xp: number, when: number, stages: readonly Stage[] = STAGES_A): GameEvent[] {
  const e = createLogEvent(chunk(xp), events, DEFAULT_SETTINGS, when, `h${++n}`, stages)
  if (!e) throw new Error('refused')
  return [...events, e]
}
const day = (d: number, time = '12:00') => at(`2026-10-${String(d).padStart(2, '0')}T${time}:00+01:00`)
const summary = (events: readonly GameEvent[], stages: readonly Stage[] = STAGES_A) =>
  stageHistory(events, stages).map((r) => [r.stage.id, r.dayKey])

describe('stageHistory', () => {
  it('is just the egg, with no day, before any logs', () => {
    expect(summary([])).toEqual([['egg', null]])
  })

  it("gives the egg the first log's day", () => {
    expect(summary(logXp([], 10, day(3)))).toEqual([['egg', '2026-10-03']])
  })

  it('records the day each stage was first reached', () => {
    let events = logXp([], 60, day(1))
    events = logXp(events, 60, day(2)) // 120: hatchling
    events = logXp(events, 300, day(4))
    events = logXp(events, 200, day(6)) // 620: whelp
    events = logXp(events, 10, day(7))
    expect(summary(events)).toEqual([
      ['egg', '2026-10-01'],
      ['hatchling', '2026-10-02'],
      ['whelp', '2026-10-06'],
    ])
  })

  it('uses the game day, so a log at 01:00 counts towards the day before', () => {
    let events = logXp([], 50, day(1))
    events = logXp(events, 60, at('2026-10-03T01:00:00+01:00'))
    expect(summary(events)).toEqual([
      ['egg', '2026-10-01'],
      ['hatchling', '2026-10-02'],
    ])
  })

  it('gives every stage passed in one log that log’s day', () => {
    const events = logXp([], 600, day(5))
    expect(summary(events)).toEqual([
      ['egg', '2026-10-05'],
      ['hatchling', '2026-10-05'],
      ['whelp', '2026-10-05'],
    ])
  })

  it('ignores undone logs, and a later log can reach the stage again on its own day', () => {
    let events = logXp([], 90, day(1))
    events = logXp(events, 20, day(2)) // hatchling
    const crossing = events[events.length - 1] as LogEvent
    events = [...events, undo(crossing, day(2, '12:05'))]
    expect(summary(events)).toEqual([['egg', '2026-10-01']])
    events = logXp(events, 20, day(4))
    expect(summary(events)).toEqual([
      ['egg', '2026-10-01'],
      ['hatchling', '2026-10-04'],
    ])
  })

  it('moves the egg day forward if the first log is undone', () => {
    const first = log({ id: 'gym', xp: 40 }, day(1))
    const events: GameEvent[] = [first, log({ id: 'gym', xp: 40 }, day(3)), undo(first, day(1, '12:01'))]
    expect(summary(events)).toEqual([['egg', '2026-10-03']])
  })

  it('keeps a held stage, and its day, after a threshold is raised', () => {
    let events = logXp([], 80, day(1))
    events = logXp(events, 40, day(2)) // 120: hatchling, recorded
    events = logXp(events, 10, day(3))
    const raised = withThreshold('hatchling', 200)
    expect(dragonStage(events, raised).id).toBe('hatchling')
    expect(summary(events, raised)).toEqual([
      ['egg', '2026-10-01'],
      ['hatchling', '2026-10-02'],
    ])
  })

  it('moves a stage reached only by XP to a later day when its threshold is raised', () => {
    // Old data: no stageReached recorded.
    const events: GameEvent[] = [
      log({ id: 'gym', xp: 120 }, day(1)),
      log({ id: 'gym', xp: 100 }, day(2)),
    ]
    expect(summary(events)).toEqual([
      ['egg', '2026-10-01'],
      ['hatchling', '2026-10-01'],
    ])
    expect(summary(events, withThreshold('hatchling', 200))).toEqual([
      ['egg', '2026-10-01'],
      ['hatchling', '2026-10-02'],
    ])
  })

  it('reaches a stage earlier when its threshold is lowered', () => {
    let events = logXp([], 300, day(1))
    events = logXp(events, 10, day(2))
    expect(summary(events, withThreshold('whelp', 305))).toEqual([
      ['egg', '2026-10-01'],
      ['hatchling', '2026-10-01'],
      ['whelp', '2026-10-02'],
    ])
  })

  it('counts XP from tasks missing from config, and ignores stage ids missing from config', () => {
    const gone: LogEvent = { ...log({ id: 'gone', xp: 150 }, day(1)), stageReached: 'mystery' }
    expect(summary([gone])).toEqual([
      ['egg', '2026-10-01'],
      ['hatchling', '2026-10-01'],
    ])
  })

  it('always ends at the current dragonStage', () => {
    let events = logXp([], 80, day(1))
    events = logXp(events, 40, day(2))
    events = logXp(events, 500, day(3))
    for (const stages of [STAGES_A, withThreshold('whelp', 2000), withThreshold('hatchling', 50)]) {
      const h = stageHistory(events, stages)
      expect(h[h.length - 1]?.stage.id).toBe(dragonStage(events, stages).id)
    }
  })

  it('does not depend on the order stages are listed in config', () => {
    const events = logXp([], 600, day(5))
    expect(summary(events, [...STAGES_A].reverse())).toEqual(summary(events))
  })
})
