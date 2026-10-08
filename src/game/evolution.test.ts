import { describe, expect, it } from 'vitest'
import { REWARDS } from '../config/rewards'
import { STREAKS } from '../config/streaks'
import { LOOK_CHANGE_MARGIN } from '../config/evolution'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STATS } from '../config/stats'
import { at, undo, NO_REWARD } from '../testing/helpers'
import { evolutionLook, lookChange, type Evolution, type EvolutionRules } from './evolution'
import { createLogEvent } from './log'
import type { GameEvent, LogEvent, Reward, Stage, StatId, Task } from './types'

// Small thresholds keep the numbers readable. Juvenile at 100.
const STAGES_A: Stage[] = [
  { id: 'egg', name: 'Egg', xpFrom: 0 },
  { id: 'hatchling', name: 'Hatchling', xpFrom: 20 },
  { id: 'juvenile', name: 'Juvenile', xpFrom: 100 },
  { id: 'adult', name: 'Adult', xpFrom: 400 },
]
const withThreshold = (id: string, xpFrom: number): Stage[] =>
  STAGES_A.map((s) => (s.id === id ? { ...s, xpFrom } : s))
/** The real margin from config, so these tests follow it if it's retuned. */
const M = LOOK_CHANGE_MARGIN
const RULES: EvolutionRules = { evolvesAt: 'juvenile', margin: M }
/** The most a stat can have without being more than the margin ahead of `xp`. */
const barFor = (xp: number) => xp * (1 + M)

const taskFor = (stat: StatId): Task => ({
  id: `t-${stat}`,
  name: stat,
  stat,
  xp: 0,
  rules: { kind: 'maxPerDay', max: 999 },
  archived: false,
})
const TASKS_A: Task[] = STATS.map((s) => taskFor(s.id))

let n = 0
let clock = at('2026-10-05T12:00:00+01:00')
/** Logs through createLogEvent, so stageReached is recorded as in the app. */
function add(events: GameEvent[], stat: StatId | 'gone', xp: number, stages: readonly Stage[] = STAGES_A): GameEvent[] {
  const task: Task = stat === 'gone' ? { ...taskFor('heart'), id: 'gone' } : taskFor(stat)
  const e = createLogEvent({ ...task, xp }, events, DEFAULT_SETTINGS, (clock += 1000), `e${++n}`, NO_REWARD, { stages, rewards: REWARDS, streaks: STREAKS })
  if (!e) throw new Error('refused')
  return [...events, e]
}
const evo = (events: readonly GameEvent[], stages: readonly Stage[] = STAGES_A, rules = RULES): Evolution =>
  evolutionLook(events, TASKS_A, STATS, stages, rules)
const last = (events: readonly GameEvent[]) => events.at(-1) as LogEvent

describe('evolutionLook', () => {
  it('is neutral with nothing seen for an empty log', () => {
    expect(evo([])).toEqual({ look: 'neutral', seen: [] })
  })

  it('stays neutral below Juvenile, whatever the stats', () => {
    let events = add([], 'wisdom', 60)
    events = add(events, 'strength', 39)
    expect(evo(events)).toEqual({ look: 'neutral', seen: [] })
  })

  it('takes the top stat on the log that reaches Juvenile', () => {
    let events = add([], 'wisdom', 60)
    events = add(events, 'heart', 45) // 105: Juvenile, wisdom on top
    expect(evo(events)).toEqual({ look: 'wisdom', seen: ['wisdom'] })
  })

  it('resolves a tie at Juvenile by stat order in config', () => {
    let events = add([], 'heart', 50)
    events = add(events, 'discipline', 50) // tied at 100
    expect(evo(events).look).toBe('discipline')
    // Config order decides, not log order
    let other = add([], 'discipline', 50)
    other = add(other, 'heart', 50)
    expect(evo(other).look).toBe('discipline')
  })

  it('uses a margin from config that the boundary tests below can hit exactly', () => {
    expect(M).toBeGreaterThan(0)
    // 1000 * (1 + M) must be a whole number of XP for the exact-boundary tests.
    expect(Number.isInteger(Math.round(1000 * M * 1e6) / 1e6)).toBe(true)
  })

  it('changes the look when another stat leads by more than the margin', () => {
    let events = add([], 'strength', 100) // strength look at 100
    events = add(events, 'wisdom', Math.floor(barFor(100)) + 1) // just over the bar
    expect(evo(events)).toEqual({ look: 'wisdom', seen: ['strength', 'wisdom'] })
  })

  it('keeps the look on a lead of exactly the margin, less, or a tie', () => {
    const exact = Math.round(barFor(1000)) // e.g. 1100 at 10%
    let events = add([], 'strength', 1000)
    events = add(events, 'wisdom', 1000) // tie
    expect(evo(events).look).toBe('strength')
    events = add(events, 'wisdom', exact - 1 - 1000) // one short of the bar
    expect(evo(events).look).toBe('strength')
    events = add(events, 'wisdom', 1) // exactly the margin ahead, not more
    expect(evo(events).look).toBe('strength')
    events = add(events, 'wisdom', 1) // one over
    expect(evo(events).look).toBe('wisdom')
  })

  it('handles an exact-margin boundary without floating-point surprises', () => {
    // 1 + M isn't exact in binary (100 * 1.1 is 110.00000000000001); a small tolerance absorbs it
    let events = add([], 'heart', 100)
    events = add(events, 'strength', Math.round(barFor(100))) // exactly the margin ahead of 100
    expect(evo(events).look).toBe('heart')
    // The same at fixed margins, either side of the boundary
    const at = (margin: number, xp: number) => {
      const e = add(add([], 'heart', 100), 'strength', xp)
      return evolutionLook(e, TASKS_A, STATS, STAGES_A, { ...RULES, margin }).look
    }
    expect(at(0.1, 110)).toBe('heart')
    expect(at(0.1, 111)).toBe('strength')
    expect(at(0.05, 105)).toBe('heart')
    expect(at(0.05, 106)).toBe('strength')
  })

  it('a stat that is already ahead but within the margin at Juvenile changes nothing until it pulls away', () => {
    let events = add([], 'heart', 99)
    events = add(events, 'strength', 1) // 100: Juvenile; heart on top
    const within = Math.ceil(barFor(99)) - 1 // e.g. 108 vs a bar of 108.9 at 10%
    events = add(events, 'strength', within - 1) // ahead of heart, but within the margin
    expect(evo(events).look).toBe('heart')
    events = add(events, 'strength', 1) // over the bar
    expect(evo(events).look).toBe('strength')
  })

  it('compares against the current look, not the first one', () => {
    const wisdom = Math.floor(barFor(100)) + 10 // e.g. 120: wisdom takes over from strength 100
    let events = add([], 'strength', 100)
    events = add(events, 'wisdom', wisdom)
    // Strength is now more than the margin ahead of its own first total, but not of wisdom
    events = add(events, 'strength', wisdom - 100)
    expect(evo(events).look).toBe('wisdom')
    events = add(events, 'strength', Math.floor(barFor(wisdom)) + 1 - wisdom) // over wisdom's bar
    expect(evo(events)).toEqual({ look: 'strength', seen: ['strength', 'wisdom'] })
  })

  it('lists each look once, in the order first seen', () => {
    let events = add([], 'strength', 100)
    events = add(events, 'heart', 120)
    events = add(events, 'strength', 40) // back to strength
    events = add(events, 'heart', 60) // back to heart
    events = add(events, 'discipline', 300)
    expect(evo(events)).toEqual({ look: 'discipline', seen: ['strength', 'heart', 'discipline'] })
  })

  it('undoing the log that changed the look puts it back', () => {
    let events = add([], 'strength', 100)
    events = add(events, 'wisdom', 120)
    const changed = last(events)
    expect(evo(events).look).toBe('wisdom')
    events = [...events, undo(changed, clock + 1000)]
    expect(evo(events)).toEqual({ look: 'strength', seen: ['strength'] })
  })

  it('undoing the log that reached Juvenile goes back to neutral', () => {
    let events = add([], 'heart', 90)
    events = add(events, 'heart', 20)
    expect(evo(events).look).toBe('heart')
    events = [...events, undo(last(events), clock + 1000)]
    expect(evo(events)).toEqual({ look: 'neutral', seen: [] })
  })

  it('keeps an evolved dragon evolved when the Juvenile threshold is raised (held stage)', () => {
    let events = add([], 'wisdom', 70)
    events = add(events, 'heart', 40) // 110: Juvenile recorded on this log
    expect(last(events).stageReached).toBe('juvenile')
    expect(evo(events, withThreshold('juvenile', 300))).toEqual({ look: 'wisdom', seen: ['wisdom'] })
  })

  it('uses the held stage from the log it was recorded on, not later', () => {
    // Raised to 300 after evolving: the look is still decided on the recorded log
    let events = add([], 'heart', 70)
    events = add(events, 'wisdom', 40) // 110: Juvenile here, heart on top
    events = add(events, 'wisdom', 50) // wisdom 90 vs heart 70: changes
    expect(evo(events, withThreshold('juvenile', 300))).toEqual({ look: 'wisdom', seen: ['heart', 'wisdom'] })
  })

  it('evolves earlier in the replay when the Juvenile threshold is lowered', () => {
    let events = add([], 'heart', 60)
    events = add(events, 'strength', 30) // 90: below 100
    expect(evo(events).look).toBe('neutral')
    // At 50, the first log (heart 60) already reaches Juvenile
    expect(evo(events, withThreshold('juvenile', 50))).toEqual({ look: 'heart', seen: ['heart'] })
  })

  it('counts a stage recorded above Juvenile (e.g. Adult) as evolved', () => {
    const events: GameEvent[] = [
      { id: 'a', type: 'log', taskId: 't-discipline', timestamp: clock, xpAwarded: 30, stageReached: 'adult' },
    ]
    expect(evo(events).look).toBe('discipline')
  })

  it('ignores stageReached ids that are no longer in config', () => {
    const events: GameEvent[] = [
      { id: 'a', type: 'log', taskId: 't-discipline', timestamp: clock, xpAwarded: 30, stageReached: 'gone' },
    ]
    expect(evo(events).look).toBe('neutral')
  })

  it('counts logs of unknown tasks towards the stage but no stat', () => {
    let events = add([], 'gone', 95)
    events = add(events, 'wisdom', 10) // 105: Juvenile; only wisdom has XP
    expect(evo(events).look).toBe('wisdom')
    events = add(events, 'gone', 500) // no stat moves
    expect(evo(events).look).toBe('wisdom')
  })

  it('waits for a stat with XP if Juvenile is reached on unknown tasks alone', () => {
    let events = add([], 'gone', 150)
    expect(evo(events).look).toBe('neutral')
    events = add(events, 'heart', 5)
    expect(evo(events)).toEqual({ look: 'heart', seen: ['heart'] })
  })

  it('stays neutral if the evolution stage is not in config', () => {
    const events = add([], 'heart', 500)
    expect(evo(events, STAGES_A, { ...RULES, evolvesAt: 'nope' })).toEqual({ look: 'neutral', seen: [] })
  })

  it('replays in append order, like stageHistory', () => {
    // A log saved later with an earlier timestamp (phone clock change) still comes after
    const a: LogEvent = { id: 'a', type: 'log', taskId: 't-strength', timestamp: clock, xpAwarded: 100 }
    const b: LogEvent = { id: 'b', type: 'log', taskId: 't-heart', timestamp: clock - 86_400_000, xpAwarded: 200 }
    expect(evo([a, b])).toEqual({ look: 'heart', seen: ['strength', 'heart'] })
  })
})

describe('lookChange', () => {
  const E = (look: Evolution['look'], seen: StatId[]): Evolution => ({ look, seen })

  it('is null when nothing changed', () => {
    expect(lookChange(E('neutral', []), E('neutral', []))).toBeNull()
    expect(lookChange(E('heart', ['heart']), E('heart', ['heart']))).toBeNull()
  })

  it('celebrates the first look at Juvenile', () => {
    expect(lookChange(E('neutral', []), E('wisdom', ['wisdom']))).toEqual({ look: 'wisdom', firstTime: true })
  })

  it('celebrates a look never seen before', () => {
    expect(lookChange(E('strength', ['strength']), E('heart', ['strength', 'heart']))).toEqual({
      look: 'heart',
      firstTime: true,
    })
  })

  it('changes back to a look seen before quietly', () => {
    expect(lookChange(E('heart', ['strength', 'heart']), E('strength', ['strength', 'heart']))).toEqual({
      look: 'strength',
      firstTime: false,
    })
  })

  it('never reports going back to neutral', () => {
    expect(lookChange(E('heart', ['heart']), E('neutral', []))).toBeNull()
  })

  it('works end to end: only first-time looks celebrate', () => {
    let events = add([], 'strength', 100)
    let before = evo([])
    expect(lookChange(before, evo(events))?.firstTime).toBe(true) // strength at Juvenile
    before = evo(events)
    events = add(events, 'heart', 120)
    expect(lookChange(before, evo(events))).toEqual({ look: 'heart', firstTime: true })
    before = evo(events)
    events = add(events, 'strength', 40)
    expect(lookChange(before, evo(events))).toEqual({ look: 'strength', firstTime: false })
    before = evo(events)
    events = add(events, 'heart', 60)
    expect(lookChange(before, evo(events))).toEqual({ look: 'heart', firstTime: false })
  })

  it('an undo of a new look reverts to a look already seen, so it never celebrates', () => {
    let events = add([], 'strength', 100)
    events = add(events, 'heart', 120)
    const before = evo(events)
    const after = evo([...events, undo(last(events), clock + 1000)])
    expect(lookChange(before, after)).toEqual({ look: 'strength', firstTime: false })
  })
})

describe('evolutionLook with treats', () => {
  it("counts a treat's bonus toward total XP and its stat", () => {
    // Base XP alone: 50 + 45 = 95, short of Juvenile (100), with strength ahead.
    // A treat of 10 on the wisdom log reaches Juvenile and puts wisdom on top.
    let events = add([], 'strength', 50)
    const treat = createLogEvent(
      { ...taskFor('wisdom'), xp: 45 },
      events,
      DEFAULT_SETTINGS,
      (clock += 1000),
      `e${++n}`,
      { chance: REWARDS.rareChance, pick: 0 },
      { stages: STAGES_A, rewards: { ...REWARDS, treatBonusShare: 10 / 45 }, streaks: STREAKS },
    ) as LogEvent
    expect(treat.reward).toEqual({ kind: 'treat', bonusXp: 10 })
    expect(treat.stageReached).toBe('juvenile')
    events = [...events, treat]
    expect(evo(events)).toEqual({ look: 'wisdom', seen: ['wisdom'] })
  })

  it('takes the bonus back on undo', () => {
    const events: GameEvent[] = [
      { id: 'a', type: 'log', taskId: 't-strength', timestamp: clock, xpAwarded: 50 },
      { id: 'b', type: 'log', taskId: 't-wisdom', timestamp: clock, xpAwarded: 45, reward: { kind: 'treat', bonusXp: 10 } },
    ]
    expect(evo(events).look).toBe('wisdom')
    expect(evo([...events, undo(events[1]!, clock)])).toEqual({ look: 'neutral', seen: [] })
  })

  it('ignores a reward shape it does not recognise', () => {
    const odd = { kind: 'confetti', bonusXp: 999 } as unknown as Reward
    const events: GameEvent[] = [
      { id: 'a', type: 'log', taskId: 't-wisdom', timestamp: clock, xpAwarded: 50, reward: odd },
    ]
    expect(evo(events)).toEqual({ look: 'neutral', seen: [] })
  })
})

