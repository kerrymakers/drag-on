// Holding the stage: a stage once reached is recorded on the log that reached it,
// so changing thresholds later can't take it away. Undo removes the record.

import { describe, expect, it } from 'vitest'
import { REWARDS } from '../config/rewards'
import { STREAKS } from '../config/streaks'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import { at, log, undo, NO_REWARD } from '../testing/helpers'
import { createLogEvent, createUndoEvent } from './log'
import { dragonProgress, dragonStage, heldStage, stageFor, stageUp, totalXp } from './state'
import type { GameEvent, Stage, Task } from './types'

const STAGES_A: Stage[] = [
  { id: 'egg', name: 'Egg', xpFrom: 0 },
  { id: 'hatchling', name: 'Hatchling', xpFrom: 100 },
  { id: 'whelp', name: 'Whelp', xpFrom: 500 },
  { id: 'juvenile', name: 'Juvenile', xpFrom: 1300 },
]
const withThreshold = (id: string, xpFrom: number): Stage[] =>
  STAGES_A.map((s) => (s.id === id ? { ...s, xpFrom } : s))

/** A task that can be logged many times a day, for any amount of XP. */
const chunk = (xp: number): Task => ({
  id: `chunk-${xp}`,
  name: 'Chunk',
  stat: 'discipline',
  xp,
  rules: { kind: 'maxPerDay', max: 99 },
  archived: false,
})

let minute = 0
const NOON = at('2026-10-05T12:00:00+01:00')
/** Logs through the real createLogEvent (so stageReached is recorded) and appends it. */
function logXp(events: GameEvent[], xp: number, stages: readonly Stage[] = STAGES_A): GameEvent[] {
  const e = createLogEvent(chunk(xp), events, DEFAULT_SETTINGS, NOON + ++minute * 1000, `e${minute}`, NO_REWARD, { stages, rewards: REWARDS, streaks: STREAKS })
  if (!e) throw new Error('refused')
  return [...events, e]
}
function undoLast(events: GameEvent[]): GameEvent[] {
  const u = createUndoEvent(events, NOON + ++minute * 1000, `u${minute}`)
  if (!u) throw new Error('nothing to undo')
  return [...events, u]
}
const last = (events: GameEvent[]) => events[events.length - 1]

describe('recording stageReached', () => {
  it('records nothing while the dragon stays an egg', () => {
    const events = logXp(logXp([], 40), 40)
    expect(events.every((e) => e.type === 'log' && e.stageReached === undefined)).toBe(true)
  })

  it('records the stage on the log that crosses a threshold, and not after', () => {
    let events = logXp([], 90)
    events = logXp(events, 20)
    expect(last(events)).toMatchObject({ stageReached: 'hatchling' })
    events = logXp(events, 20)
    expect(last(events)).not.toHaveProperty('stageReached')
  })

  it('records only the highest stage when one log crosses several thresholds', () => {
    const events = logXp([], 600)
    expect(last(events)).toMatchObject({ stageReached: 'whelp' })
    expect(stageUp([], events, STAGES_A)?.id).toBe('whelp')
  })
})

describe('dragonStage', () => {
  it('holds the stage after a threshold is raised', () => {
    const events = logXp(logXp([], 90), 30) // 120 XP, crossed 100
    const harder = withThreshold('hatchling', 150)
    expect(stageFor(totalXp(events), harder).id).toBe('egg')
    expect(dragonStage(events, harder).id).toBe('hatchling')
  })

  it('rises straight away when a threshold is lowered', () => {
    const events = logXp([], 80)
    expect(dragonStage(events, STAGES_A).id).toBe('egg')
    expect(dragonStage(events, withThreshold('hatchling', 50)).id).toBe('hatchling')
  })

  it('keeps a stage that came from a lowered threshold once the next log records it', () => {
    const before = logXp([], 80) // an egg under the old thresholds, nothing recorded
    expect(last(before)).not.toHaveProperty('stageReached')
    const easier = withThreshold('hatchling', 50)
    const events = logXp(before, 5, easier)
    expect(last(events)).toMatchObject({ stageReached: 'hatchling' })
    // Raising the threshold back doesn't take it away.
    expect(dragonStage(events, STAGES_A).id).toBe('hatchling')
  })

  it('drops back when the log that crossed the threshold is undone', () => {
    let events = logXp(logXp([], 90), 20)
    expect(dragonStage(events, STAGES_A).id).toBe('hatchling')
    events = undoLast(events)
    expect(heldStage(events, STAGES_A)).toBeNull()
    expect(dragonStage(events, STAGES_A).id).toBe('egg')
  })

  it('drops back when the crossing log is undone after a threshold was raised', () => {
    let events = logXp(logXp([], 90), 20)
    const harder = withThreshold('hatchling', 150)
    events = undoLast(events)
    expect(dragonStage(events, harder).id).toBe('egg')
  })

  it('keeps holding when a later, non-crossing log is undone after a raise', () => {
    let events = logXp(logXp([], 90), 20) // crosses
    events = logXp(events, 10) // 120 XP, no record
    const harder = withThreshold('hatchling', 150)
    events = undoLast(events)
    expect(dragonStage(events, harder).id).toBe('hatchling')
  })

  it('works with old events that have no stageReached', () => {
    // Saved before stage holding existed: the stage comes from XP alone.
    const old = [log({ id: 'gym', xp: 40 }, NOON), log({ id: 'walk', xp: 90 }, NOON + 1)]
    expect(dragonStage(old, STAGES).id).toBe('hatchling')
    expect(dragonProgress(old, STAGES).stage.id).toBe('hatchling')
    // The next log quietly records the stage it's already at, so it's held from then on.
    const next = createLogEvent(chunk(5), old, DEFAULT_SETTINGS, NOON + 2, 'n', NO_REWARD, { stages: STAGES, rewards: REWARDS, streaks: STREAKS })
    expect(next?.stageReached).toBe('hatchling')
    expect(stageUp(old, [...old, next as GameEvent], STAGES)).toBeNull()
  })

  it('does not strand old data when a later crossing log is undone', () => {
    // Saved before stage holding: 120 XP, Hatchling from XP alone, nothing recorded.
    let events: GameEvent[] = [log({ id: 'gym', xp: 120 }, NOON)]
    events = logXp(events, 10) // silently records hatchling
    expect(last(events)).toMatchObject({ stageReached: 'hatchling' })
    events = logXp(events, 400) // 530 XP: crosses whelp
    expect(last(events)).toMatchObject({ stageReached: 'whelp' })
    events = undoLast(events) // back to 130 XP
    const harder = withThreshold('hatchling', 200)
    expect(stageFor(totalXp(events), harder).id).toBe('egg')
    expect(dragonStage(events, harder).id).toBe('hatchling')
  })

  it('ignores a recorded stage that is no longer in the config', () => {
    const events: GameEvent[] = [{ ...log({ id: 'gym', xp: 40 }, NOON), stageReached: 'phoenix' }]
    expect(heldStage(events, STAGES_A)).toBeNull()
    expect(dragonStage(events, STAGES_A).id).toBe('egg')
  })

  it('ignores a recorded stage on a log that was undone directly', () => {
    const crossing: GameEvent = { ...log({ id: 'gym', xp: 120 }, NOON), stageReached: 'hatchling' }
    const events = [crossing, undo(crossing, NOON + 1)]
    expect(dragonStage(events, withThreshold('hatchling', 150)).id).toBe('egg')
  })
})

describe('dragonProgress when the stage is ahead of the XP', () => {
  it('starts the bar from 0 and counts to the next threshold', () => {
    const events = logXp(logXp([], 90), 30) // 120 XP
    const harder = withThreshold('hatchling', 150)
    const p = dragonProgress(events, harder)
    expect(p.stage.id).toBe('hatchling')
    expect(p.next?.id).toBe('whelp')
    expect(p.fraction).toBe(0)
    expect(p.xpIntoStage).toBe(0)
    expect(p.xpToNext).toBe(500 - 120)
  })

  it('has no next stage at the last stage', () => {
    const p = dragonProgress(logXp([], 2000), STAGES_A)
    expect(p.stage.id).toBe('juvenile')
    expect(p.next).toBeNull()
    expect(p.fraction).toBe(1)
  })
})

describe('stageUp', () => {
  it('reports the new stage when a log crosses a threshold', () => {
    const before = logXp([], 90)
    const after = logXp(before, 20)
    expect(stageUp(before, after, STAGES_A)?.id).toBe('hatchling')
  })

  it('reports nothing within a stage', () => {
    const before = logXp([], 10)
    expect(stageUp(before, logXp(before, 20), STAGES_A)).toBeNull()
  })

  it('never reports going down (undo)', () => {
    const before = logXp(logXp([], 90), 20)
    expect(stageUp(before, undoLast(before), STAGES_A)).toBeNull()
  })

  it('celebrates again when the threshold is re-crossed after an undo', () => {
    let events = logXp(logXp([], 90), 20)
    events = undoLast(events)
    const again = logXp(events, 20)
    expect(last(again)).toMatchObject({ stageReached: 'hatchling' })
    expect(stageUp(events, again, STAGES_A)?.id).toBe('hatchling')
  })

  it('does not celebrate a stage that was already held', () => {
    const events = logXp(logXp([], 90), 30) // held hatchling at 120
    const harder = withThreshold('hatchling', 150)
    expect(stageUp(events, logXp(events, 40, harder), harder)).toBeNull() // 160 XP, still hatchling
  })
})

describe('the 2026-10-06 rebalance for treats', () => {
  // The thresholds before the rebalance, frozen here on purpose.
  const OLD: Stage[] = [
    { id: 'egg', name: 'Egg', xpFrom: 0 },
    { id: 'hatchling', name: 'Hatchling', xpFrom: 100 },
    { id: 'whelp', name: 'Whelp', xpFrom: 500 },
    { id: 'juvenile', name: 'Juvenile', xpFrom: 1300 },
    { id: 'adult', name: 'Adult', xpFrom: 3500 },
    { id: 'elder', name: 'Elder', xpFrom: 7000 },
  ]
  const juvenileNow = STAGES.find((s) => s.id === 'juvenile')!.xpFrom

  it('keeps a dragon at 1,350 XP that reached Juvenile under the old thresholds', () => {
    let events = logXp([], 120, OLD) // hatchling
    events = logXp(events, 480, OLD) // 600: whelp
    events = logXp(events, 750, OLD) // 1,350: juvenile under the old thresholds
    expect(last(events)).toMatchObject({ stageReached: 'juvenile' })
    expect(totalXp(events)).toBe(1350)
    expect(1350).toBeLessThan(juvenileNow) // the new threshold is above it
    expect(dragonStage(events, STAGES).id).toBe('juvenile')
    // The bar counts on toward Adult from there, never back down.
    expect(dragonProgress(events, STAGES).stage.id).toBe('juvenile')
    // Another log doesn't celebrate a stage it already has.
    const after = logXp(events, 20, STAGES)
    expect(stageUp(events, after, STAGES)).toBeNull()
  })

  it('follows the new thresholds for data with no records at all (saved before stage holding)', () => {
    const events = [log({ id: 'gym', xp: 1350 }, NOON)] // old data, no records
    expect(dragonStage(events, STAGES).id).toBe('whelp')
  })
})
