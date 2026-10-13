import { describe, expect, it } from 'vitest'
import { GOAL } from '../config/goal'
import type { Mission, MissionConfig } from '../config/missions'
import { MISSIONS } from '../config/missions'
import { REWARDS } from '../config/rewards'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { STREAKS } from '../config/streaks'
import { EFFORT_LEVELS, TASKS } from '../config/tasks'
import { at, log, NO_REWARD, undo } from '../testing/helpers'
import { shiftDayKey } from './day'
import { mixedHash, pickFor, stringHash } from './hash'
import { createLogEvent } from './log'
import { freshTasks, missionFor, missionGrantFor, missionPool, missionStatus } from './mission'
import { logXp, missionBonus, missionOf, treatBonus } from './rewards'
import { totalXp } from './state'
import { statTotals } from './stats'
import type { GameEvent, LogEvent, Settings, Task } from './types'

const task = (id: string): Task => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(id)
  return t
}
const wake = task('wake')
const gym = task('gym') // strength, once a day
const walk = task('walk') // strength
const read = task('read') // wisdom
const selfcare = task('selfcare') // heart
const avoided = task('avoided') // discipline

const EARLY: Mission = { id: 'early', kind: 'early' }
const TWO_STATS: Mission = { id: 'two-stats', kind: 'stats', count: 2 }
const THREE_LOGS: Mission = { id: 'three-logs', kind: 'logs', count: 3 }
const HEART: Mission = { id: 'stat:heart', kind: 'stat', stat: 'heart' }
const FRESH: Mission = { id: 'fresh', kind: 'fresh' }

/** Fixed numbers, so these tests don't move when the real config is rebalanced. */
const CONFIG: MissionConfig = { bonusXp: 15, earlyBefore: '09:00', weekStart: 'mon', missions: MISSIONS }
const only = (m: Mission): MissionConfig => ({ ...CONFIG, missions: [m] })

// Mon 5 to Sun 11 October 2026 (BST).
const MON = (hm: string) => at(`2026-10-05T${hm}:00+01:00`)
const TUE = (hm: string) => at(`2026-10-06T${hm}:00+01:00`)
const WED = (hm: string) => at(`2026-10-07T${hm}:00+01:00`)

const grant = (m: Mission | null, events: GameEvent[], t: Task, now: number, config = CONFIG) =>
  missionGrantFor(m, events, log(t, now), TASKS, config)

describe('the shared hash', () => {
  it('picks the same as before for copy lines, and the stirred hash spreads neighbouring keys', () => {
    expect(stringHash('ab')).toBe(97 * 31 + 98)
    expect(pickFor(['a', 'b', 'c'], 'ab')).toBe(['a', 'b', 'c'][(97 * 31 + 98) % 3])
    expect(pickFor([], 'x')).toBeNull()
    const picks = new Set(Array.from({ length: 30 }, (_, i) => mixedHash(`s:${shiftDayKey('2026-10-01', i)}`) % 8))
    expect(picks.size).toBeGreaterThan(4)
  })
})

describe('missionFor', () => {
  it('is the same on every call for a day and seed, null with no seed or nothing possible', () => {
    const a = missionFor('2026-10-06', 'seed-1', TASKS, [], CONFIG)
    expect(a).not.toBeNull()
    expect(missionFor('2026-10-06', 'seed-1', TASKS, [], CONFIG)).toEqual(a)
    expect(missionFor('2026-10-06', undefined, TASKS, [], CONFIG)).toBeNull()
    expect(missionFor('2026-10-06', '', TASKS, [], CONFIG)).toBeNull()
    expect(missionFor('2026-10-06', 'seed-1', TASKS.map((t) => ({ ...t, archived: true })), [], CONFIG)).toBeNull()
    expect(missionFor('2026-10-06', 'seed-1', [wake], [], CONFIG)).toBeNull()
  })

  it('differs between seeds, and never repeats yesterday', () => {
    const days = Array.from({ length: 60 }, (_, i) => shiftDayKey('2026-10-01', i))
    const run = (seed: string) => days.map((d) => missionFor(d, seed, TASKS, [], CONFIG)?.id)
    const a = run('seed-1')
    expect(run('seed-2')).not.toEqual(a)
    for (let i = 1; i < a.length; i++) expect(a[i], days[i]).not.toBe(a[i - 1])
    expect(new Set(a).size).toBe(MISSIONS.length)
  })

  it('only offers wishes the active tasks make possible', () => {
    const ids = (tasks: Task[], events: GameEvent[] = [], day = '2026-10-06') => missionPool(day, tasks, events, CONFIG).map((m) => m.id)
    // No heart task, no heart wish; wake-up alone doesn't make a discipline wish.
    expect(ids([wake, gym, read])).toEqual(['early', 'two-stats', 'stat:strength', 'stat:wisdom', 'fresh'])
    // A once-a-day task and a three-a-day one make three logs possible; one stat isn't two.
    expect(ids([gym, avoided].map((t) => ({ ...t, stat: 'strength' as const })))).toEqual(['early', 'three-logs', 'stat:strength', 'fresh'])
    // Archived tasks don't count.
    expect(ids([gym, { ...read, archived: true }])).toEqual(['early', 'stat:strength', 'fresh'])
    // Fresh needs a task not logged yet this week, judged before today.
    expect(ids([gym], [log(gym, MON('19:00'))])).toEqual(['early', 'stat:strength'])
    expect(ids([gym], [log(gym, TUE('19:00'))])).toEqual(['early', 'stat:strength', 'fresh'])
  })
})

describe('freshTasks', () => {
  it('is the active tasks not logged this week before today, so it holds all day; every task on Monday', () => {
    const events: GameEvent[] = [log(gym, MON('19:00')), log(read, TUE('10:00'))]
    const fresh = (day: string, ev: GameEvent[] = events) => freshTasks(day, TASKS, ev, CONFIG).map((t) => t.id)
    expect(fresh('2026-10-06')).toEqual(['walk', 'read', 'selfcare', 'avoided'])
    expect(fresh('2026-10-07')).toEqual(['walk', 'selfcare', 'avoided'])
    // The next Monday starts a new week; an undone log doesn't count.
    expect(fresh('2026-10-12')).toEqual(['gym', 'walk', 'read', 'selfcare', 'avoided'])
    const first = events[0] as LogEvent
    expect(fresh('2026-10-06', [...events, undo(first, MON('19:01'))])).toContain('gym')
  })
})

describe('missionGrantFor', () => {
  it('grants each kind of wish when a log completes it', () => {
    expect(grant(HEART, [], selfcare, TUE('12:00'))).toEqual({ id: 'stat:heart', bonusXp: 15 })
    expect(grant(HEART, [], read, TUE('12:00'))).toBeUndefined()
    expect(grant(TWO_STATS, [], gym, TUE('12:00'))).toBeUndefined()
    expect(grant(TWO_STATS, [log(walk, TUE('10:00'))], gym, TUE('12:00'))).toBeUndefined()
    expect(grant(TWO_STATS, [log(walk, TUE('10:00'))], read, TUE('12:00'))?.id).toBe('two-stats')
    // A wake-up log counts towards a wish, though it never makes one possible.
    expect(grant(TWO_STATS, [log(wake, TUE('06:40'))], read, TUE('12:00'))?.id).toBe('two-stats')
    const two = [log(avoided, TUE('10:00')), log(avoided, TUE('11:00'))]
    expect(grant(THREE_LOGS, two.slice(0, 1), avoided, TUE('12:00'))).toBeUndefined()
    expect(grant(THREE_LOGS, two, avoided, TUE('12:00'))?.id).toBe('three-logs')
    const monGym = [log(gym, MON('19:00'))]
    expect(grant(FRESH, monGym, gym, TUE('19:00'))).toBeUndefined()
    expect(grant(FRESH, monGym, read, TUE('19:00'))?.id).toBe('fresh')
    // A task logged earlier today is still fresh: the set is fixed at the day's start.
    expect(grant(FRESH, [log(read, TUE('10:00'))], read, TUE('19:00'))?.id).toBe('fresh')
    expect(grant(null, [], read, TUE('12:00'))).toBeUndefined()
    expect(grant(HEART, [], selfcare, TUE('12:00'), { ...CONFIG, bonusXp: 0 })).toBeUndefined()
  })

  it('needs an early bird before 09:00 game time: 08:59 yes, 09:00 no, 03:30 is the night before', () => {
    expect(grant(EARLY, [], read, TUE('04:00'))?.id).toBe('early')
    expect(grant(EARLY, [], read, TUE('08:59'))?.id).toBe('early')
    expect(grant(EARLY, [], read, TUE('09:00'))).toBeUndefined()
    expect(grant(EARLY, [], read, WED('03:30'))).toBeUndefined()
  })

  it('counts logs by game day around 04:00', () => {
    const late = [log(avoided, TUE('20:00')), log(avoided, TUE('22:00'))]
    // 03:59 Wednesday is still Tuesday: the third log of that day.
    expect(grant(THREE_LOGS, late, avoided, WED('03:59'))?.id).toBe('three-logs')
    // 04:00 starts Wednesday: the first log of a new day.
    expect(grant(THREE_LOGS, late, avoided, WED('04:00'))).toBeUndefined()
  })

  it('grants at most once a game day, and again the next day', () => {
    const first = { ...log(selfcare, TUE('10:00')), mission: { id: 'stat:heart', bonusXp: 15 } }
    expect(grant(TWO_STATS, [first], read, TUE('12:00'))).toBeUndefined()
    expect(grant(HEART, [first], selfcare, WED('10:00'))?.id).toBe('stat:heart')
    // An unreadable grant on a log doesn't count as one.
    const odd = { ...log(selfcare, TUE('10:00')), mission: { id: 7 } }
    expect(grant(TWO_STATS, [odd], read, TUE('12:00'))?.id).toBe('two-stats')
  })
})

describe('missionStatus', () => {
  it('is granted once a log today holds a grant; undoing it reopens the wish', () => {
    const granted = { ...log(selfcare, TUE('10:00')), mission: { id: 'stat:heart', bonusXp: 15 } }
    expect(missionStatus(HEART, [], TUE('09:00'), CONFIG)).toBe('open')
    expect(missionStatus(HEART, [granted], TUE('11:00'), CONFIG)).toBe('granted')
    expect(missionStatus(HEART, [granted], WED('11:00'), CONFIG)).toBe('open')
    const undone = [granted, undo(granted, TUE('10:01'))]
    expect(missionStatus(HEART, undone, TUE('11:00'), CONFIG)).toBe('open')
    expect(grant(HEART, undone, selfcare, TUE('11:00'))?.id).toBe('stat:heart')
  })

  it('puts the early bird out of reach from 09:00 with no grant', () => {
    expect(missionStatus(EARLY, [], TUE('08:59'), CONFIG)).toBe('open')
    expect(missionStatus(EARLY, [], TUE('09:00'), CONFIG)).toBe('out-of-reach')
    expect(missionStatus(EARLY, [], WED('03:00'), CONFIG)).toBe('out-of-reach')
    expect(missionStatus(EARLY, [], WED('04:00'), CONFIG)).toBe('open')
  })
})

describe('the wish on a log', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, missionSeed: 'seed-1' }
  const rules = { stages: STAGES, rewards: REWARDS, streaks: STREAKS, effortLevels: EFFORT_LEVELS, goal: GOAL }
  const wish = (m: Mission) => ({ tasks: TASKS, missions: only(m) })
  const TREAT_ROLL = { chance: REWARDS.rareChance + REWARDS.treatChance / 2, pick: 0 }

  it('is saved on the granting log, stacks with a treat, and counts in XP and the task\'s stat', () => {
    const e = createLogEvent(selfcare, [], settings, TUE('10:00'), 'a', TREAT_ROLL, rules, wish(HEART))
    expect(e?.mission).toEqual({ id: 'stat:heart', bonusXp: 15 })
    expect(e && treatBonus(e)).toBeGreaterThan(0)
    if (!e) return
    expect(logXp(e)).toBe(e.xpAwarded + treatBonus(e) + 15)
    expect(totalXp([e])).toBe(logXp(e))
    expect(statTotals([e], TASKS, STATS).find((s) => s.stat.id === 'heart')?.xp).toBe(logXp(e))
    // No seed, or no wish context: no wish.
    expect(createLogEvent(selfcare, [], DEFAULT_SETTINGS, TUE('10:00'), 'b', NO_REWARD, rules, wish(HEART))).not.toHaveProperty('mission')
    expect(createLogEvent(selfcare, [], settings, TUE('10:00'), 'c', NO_REWARD, rules)).not.toHaveProperty('mission')
    // A log that doesn't complete it carries none.
    expect(createLogEvent(read, [], settings, TUE('10:00'), 'd', NO_REWARD, rules, wish(HEART))).not.toHaveProperty('mission')
  })

  it('ignores a grant whose shape it can\'t read', () => {
    const base = log(read, TUE('10:00'))
    for (const bad of [null, 'x', { id: '' , bonusXp: 15 }, { id: 'early' }, { id: 'early', bonusXp: -1 }, { id: 'early', bonusXp: Infinity }]) {
      const l = { ...base, mission: bad } as unknown as LogEvent
      expect(missionOf(l), JSON.stringify(bad)).toBeNull()
      expect(missionBonus(l)).toBe(0)
      expect(logXp(l)).toBe(base.xpAwarded)
    }
  })
})
