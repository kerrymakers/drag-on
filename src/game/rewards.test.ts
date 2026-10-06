import { describe, expect, it } from 'vitest'
import { REWARDS, type RewardConfig } from '../config/rewards'
import { TASKS } from '../config/tasks'
import { at, log, treatLog } from '../testing/helpers'
import { logXp, rollReward, treatBonus } from './rewards'
import type { LogEvent, Reward, Task } from './types'

const task = (id: string): Task => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(id)
  return t
}
const withXp = (xp: number): Task => ({ ...task('read'), xp })
// Fixed odds, so the threshold tests don't move if the real config is retuned.
const ODDS: RewardConfig = { rareChance: 0.03, treatChance: 0.2, treatBonusShare: 0.5 }
const roll = (chance: number, pick = 0) => rollReward(withXp(25), [], { chance, pick }, ODDS)
const NOON = at('2026-10-05T12:00:00+01:00')

describe('rollReward', () => {
  it('brings nothing in the rare band until items arrive (slice 2)', () => {
    expect(roll(0)).toBeUndefined()
    expect(roll(0.0299)).toBeUndefined()
    expect(roll(0.0299, 0.9999)).toBeUndefined()
  })

  it('brings a treat from the top of the rare band up to rare + treat', () => {
    expect(roll(0.03)).toEqual({ kind: 'treat', bonusXp: 13 })
    expect(roll(0.1)).toEqual({ kind: 'treat', bonusXp: 13 })
    expect(roll(0.2299)).toEqual({ kind: 'treat', bonusXp: 13 })
  })

  it('brings nothing from rare + treat upward', () => {
    expect(roll(0.23)).toBeUndefined()
    expect(roll(0.5)).toBeUndefined()
    expect(roll(0.9999)).toBeUndefined()
  })

  it('brings nothing for a chance outside [0, 1)', () => {
    expect(roll(Number.NaN)).toBeUndefined()
    expect(roll(-0.1)).toBeUndefined()
    expect(roll(1)).toBeUndefined()
  })

  it('makes a treat half the task XP, rounded half up', () => {
    const treatFor = (xp: number) => rollReward(withXp(xp), [], { chance: 0.1, pick: 0 }, ODDS)
    expect(treatFor(25)).toEqual({ kind: 'treat', bonusXp: 13 })
    expect(treatFor(15)).toEqual({ kind: 'treat', bonusXp: 8 })
    expect(treatFor(40)).toEqual({ kind: 'treat', bonusXp: 20 })
    expect(treatFor(30)).toEqual({ kind: 'treat', bonusXp: 15 })
    expect(treatFor(1)).toEqual({ kind: 'treat', bonusXp: 1 })
  })

  it('never gives a "+0" treat', () => {
    expect(rollReward(withXp(0), [], { chance: 0.1, pick: 0 }, ODDS)).toBeUndefined()
  })

  it('follows the config', () => {
    const generous: RewardConfig = { rareChance: 0, treatChance: 0.5, treatBonusShare: 1 }
    expect(rollReward(withXp(25), [], { chance: 0.49, pick: 0 }, generous)).toEqual({ kind: 'treat', bonusXp: 25 })
    expect(rollReward(withXp(25), [], { chance: 0.5, pick: 0 }, generous)).toBeUndefined()
  })

  it('uses the real config: 3% rare, then 20% treat at half the XP', () => {
    expect(REWARDS).toEqual(ODDS)
  })
})

describe('treatBonus and logXp', () => {
  it('is just xpAwarded with no reward', () => {
    expect(treatBonus(log(withXp(25), NOON))).toBe(0)
    expect(logXp(log(withXp(25), NOON))).toBe(25)
  })

  it('adds a treat bonus to the base XP', () => {
    const l = treatLog(withXp(25), NOON, 13)
    expect(treatBonus(l)).toBe(13)
    expect(logXp(l)).toBe(38)
  })

  it('counts an item as no bonus', () => {
    const l: LogEvent = { ...log(withXp(25), NOON), reward: { kind: 'item', itemId: 'x' } }
    expect(logXp(l)).toBe(25)
  })

  it('ignores reward shapes it does not recognise, keeping the base XP', () => {
    const odd = (reward: unknown): LogEvent => ({ ...log(withXp(25), NOON), reward: reward as Reward })
    for (const r of [null, 'treat', 7, [], { kind: 'confetti', bonusXp: 99 }, { bonusXp: 99 }]) {
      expect(logXp(odd(r))).toBe(25)
    }
  })

  it('never lets a bad treat bonus change the XP', () => {
    const bad = (bonusXp: unknown): LogEvent => ({
      ...log(withXp(25), NOON),
      reward: { kind: 'treat', bonusXp } as Reward,
    })
    for (const b of [-5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, '13', null, undefined]) {
      expect(logXp(bad(b))).toBe(25)
    }
  })
})
