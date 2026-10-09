import { describe, expect, it } from 'vitest'
import { ITEMS } from '../config/items'
import { REWARDS, type RewardConfig } from '../config/rewards'
import { TASKS } from '../config/tasks'
import { at, itemLog, log, treatLog, undo } from '../testing/helpers'
import {
  foundItems,
  itemFor,
  logXp,
  logsSinceFind,
  milestoneReward,
  rewardItemId,
  rewardMilestone,
  rollReward,
  treatBonus,
} from './rewards'
import type { GameEvent, Item, LogEvent, Reward, Task } from './types'

const task = (id: string): Task => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(id)
  return t
}
const withXp = (xp: number): Task => ({ ...task('read'), xp })
// Fixed odds, so the threshold tests don't move if the real config is retuned.
const POOL: readonly Item[] = [
  { id: 'a', name: 'Item A', slot: 'head' },
  { id: 'b', name: 'Item B', slot: 'neck' },
  { id: 'c', name: 'Item C', slot: 'held' },
  { id: 'd', name: 'Item D', slot: 'held' },
]
// Bad-luck protection off, except in its own tests.
const ODDS: RewardConfig = { rareChance: 0.03, treatChance: 0.2, treatBonusShare: 0.5, items: POOL, itemPityLogs: 0 }
const roll = (chance: number, pick = 0) => rollReward(withXp(25), [], { chance, pick }, ODDS)
const NOON = at('2026-10-05T12:00:00+01:00')

describe('rollReward', () => {
  it('brings an item anywhere in the rare band', () => {
    expect(roll(0)).toEqual({ kind: 'item', itemId: 'a' })
    expect(roll(0.0299)).toEqual({ kind: 'item', itemId: 'a' })
    expect(roll(0.0299, 0.9999)).toEqual({ kind: 'item', itemId: 'd' })
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
    const generous: RewardConfig = { rareChance: 0, treatChance: 0.5, treatBonusShare: 1, items: POOL, itemPityLogs: 0 }
    expect(rollReward(withXp(25), [], { chance: 0.49, pick: 0 }, generous)).toEqual({ kind: 'treat', bonusXp: 25 })
    expect(rollReward(withXp(25), [], { chance: 0.5, pick: 0 }, generous)).toBeUndefined()
  })

  it('uses the real config: 3% rare, then 20% treat at half the XP, from the real items, pity after 30 logs', () => {
    expect(REWARDS).toEqual({ ...ODDS, items: ITEMS, itemPityLogs: 30 })
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

const NOON2 = at('2026-10-06T12:00:00+01:00')
const rare = (events: readonly GameEvent[], pick: number, config: RewardConfig = ODDS, t: Task = withXp(25)) =>
  rollReward(t, events, { chance: 0, pick }, config)

describe('rollReward: picking an item', () => {
  it('picks floor(pick × count) among the items, in config order', () => {
    expect(rare([], 0)).toEqual({ kind: 'item', itemId: 'a' })
    expect(rare([], 0.2499)).toEqual({ kind: 'item', itemId: 'a' })
    expect(rare([], 0.25)).toEqual({ kind: 'item', itemId: 'b' })
    expect(rare([], 0.5)).toEqual({ kind: 'item', itemId: 'c' })
    expect(rare([], 0.75)).toEqual({ kind: 'item', itemId: 'd' })
    expect(rare([], 0.9999999)).toEqual({ kind: 'item', itemId: 'd' })
  })

  it('never picks an item already found', () => {
    const events = [itemLog(withXp(25), NOON, 'b'), itemLog(withXp(25), NOON, 'd')]
    // Left: a, c. Every pick lands on one of them.
    for (let k = 0; k < 100; k++) {
      const r = rare(events, k / 100)
      expect(r?.kind).toBe('item')
      expect(['a', 'c']).toContain((r as { itemId: string }).itemId)
    }
    expect(rare(events, 0)).toEqual({ kind: 'item', itemId: 'a' })
    expect(rare(events, 0.4999)).toEqual({ kind: 'item', itemId: 'a' })
    expect(rare(events, 0.5)).toEqual({ kind: 'item', itemId: 'c' })
    expect(rare(events, 0.9999999)).toEqual({ kind: 'item', itemId: 'c' })
  })

  it('picks the last item left at any pick', () => {
    const events = ['a', 'b', 'd'].map((id) => itemLog(withXp(25), NOON, id))
    expect(rare(events, 0)).toEqual({ kind: 'item', itemId: 'c' })
    expect(rare(events, 0.9999999)).toEqual({ kind: 'item', itemId: 'c' })
  })

  it('clamps a pick outside [0, 1) instead of picking nothing', () => {
    expect(rare([], Number.NaN)).toEqual({ kind: 'item', itemId: 'a' })
    expect(rare([], -1)).toEqual({ kind: 'item', itemId: 'a' })
    expect(rare([], 1)).toEqual({ kind: 'item', itemId: 'd' })
    expect(rare([], Number.POSITIVE_INFINITY)).toEqual({ kind: 'item', itemId: 'd' })
  })

  it('gives a treat in the rare band once every item is found', () => {
    const events = POOL.map((i) => itemLog(withXp(25), NOON, i.id))
    expect(rare(events, 0)).toEqual({ kind: 'treat', bonusXp: 13 })
    expect(rare(events, 0.9999)).toEqual({ kind: 'treat', bonusXp: 13 })
    // Still never "+0".
    expect(rare(events, 0, ODDS, withXp(0))).toBeUndefined()
  })

  it('gives a treat in the rare band when there are no items at all', () => {
    expect(rare([], 0, { ...ODDS, items: [] })).toEqual({ kind: 'treat', bonusXp: 13 })
  })

  it('can bring an undone item again', () => {
    const found = itemLog(withXp(25), NOON, 'a')
    const events = ['b', 'c', 'd'].map((id) => itemLog(withXp(25), NOON, id))
    expect(rare([...events, found], 0)).toEqual({ kind: 'treat', bonusXp: 13 })
    expect(rare([...events, found, undo(found, NOON)], 0)).toEqual({ kind: 'item', itemId: 'a' })
  })

  it('ignores unknown ids when working out what is left', () => {
    const events = [itemLog(withXp(25), NOON, 'zz'), itemLog(withXp(25), NOON, 'a')]
    expect(rare(events, 0)).toEqual({ kind: 'item', itemId: 'b' })
  })

  it('picks from the real items', () => {
    const r = rollReward(withXp(25), [], { chance: 0, pick: 0 }, REWARDS)
    expect(r).toEqual({ kind: 'item', itemId: ITEMS[0]!.id })
  })
})

describe('the item config', () => {
  it('has about a dozen items with unique, non-empty ids, names and a slot each', () => {
    expect(ITEMS.length).toBeGreaterThanOrEqual(10)
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length)
    for (const i of ITEMS) {
      expect(i.id, i.id).toMatch(/^[a-z][a-z0-9-]*$/)
      expect(i.name.trim(), i.id).not.toBe('')
      expect(['head', 'neck', 'held'], i.id).toContain(i.slot)
    }
  })

  it('keeps every saved id and the pick order: new items are only ever appended', () => {
    expect(ITEMS.map((i) => i.id)).toEqual([
      'bow', 'beanie', 'crown', 'flower', 'scarf', 'bell', 'bandana', 'pendant', 'book', 'gem', 'teacup', 'lantern',
      // Added 2026-10-07.
      'partyhat', 'acorn', 'bowtie', 'shells', 'mushroom', 'balloon',
      // Added 2026-10-09.
      'sunhat', 'beret', 'garland', 'moon', 'teddy', 'cookie',
    ])
  })

  it('has the same number of items for each spot', () => {
    const count = (slot: string) => ITEMS.filter((i) => i.slot === slot).length
    expect(count('head')).toBe(8)
    expect(count('neck')).toBe(8)
    expect(count('held')).toBe(8)
  })
})

describe('rewardItemId and itemFor', () => {
  const odd = (reward: unknown): LogEvent => ({ ...log(withXp(25), NOON), reward: reward as Reward })

  it('reads a well-formed item reward', () => {
    const l = itemLog(withXp(25), NOON, 'b')
    expect(rewardItemId(l)).toBe('b')
    expect(itemFor(l, POOL)).toEqual(POOL[1])
  })

  it('is null for no reward, a treat or a malformed reward', () => {
    expect(rewardItemId(log(withXp(25), NOON))).toBeNull()
    expect(rewardItemId(treatLog(withXp(25), NOON, 13))).toBeNull()
    for (const r of [null, 'item', 7, [], { kind: 'item' }, { kind: 'item', itemId: 7 }, { kind: 'item', itemId: '' }, { itemId: 'a' }, { kind: 'Item', itemId: 'a' }]) {
      expect(rewardItemId(odd(r)), JSON.stringify(r)).toBeNull()
      expect(itemFor(odd(r), POOL)).toBeNull()
    }
  })

  it('itemFor is null for an id not in the config', () => {
    expect(rewardItemId(itemLog(withXp(25), NOON, 'zz'))).toBe('zz')
    expect(itemFor(itemLog(withXp(25), NOON, 'zz'), POOL)).toBeNull()
  })
})

describe('foundItems', () => {
  it('is empty with no logs, or no item logs', () => {
    expect(foundItems([], POOL)).toEqual([])
    expect(foundItems([log(withXp(25), NOON), treatLog(withXp(25), NOON, 13)], POOL)).toEqual([])
  })

  it('lists each find in the order found, with its log and game day', () => {
    const first = itemLog(withXp(25), NOON, 'c', 'l1')
    // 01:30 on the 7th still counts toward the game day of the 6th.
    const late = at('2026-10-07T01:30:00+01:00')
    const second = itemLog(withXp(25), late, 'a', 'l2')
    expect(foundItems([first, log(withXp(25), NOON2), second], POOL)).toEqual([
      { item: POOL[2], logId: 'l1', timestamp: NOON, dayKey: '2026-10-05' },
      { item: POOL[0], logId: 'l2', timestamp: late, dayKey: '2026-10-06' },
    ])
  })

  it('counts the first find of an item, ignoring a duplicate', () => {
    const one = itemLog(withXp(25), NOON, 'a', 'one')
    const two = itemLog(withXp(25), NOON2, 'a', 'two')
    const found = foundItems([one, two], POOL)
    expect(found.map((f) => [f.item.id, f.logId])).toEqual([['a', 'one']])
  })

  it('takes an item away when its log is undone', () => {
    const l = itemLog(withXp(25), NOON, 'b')
    expect(foundItems([l], POOL)).toHaveLength(1)
    expect(foundItems([l, undo(l, NOON + 1000)], POOL)).toEqual([])
  })

  it('moves a find to a later duplicate if the first is undone', () => {
    const one = itemLog(withXp(25), NOON, 'a', 'one')
    const two = itemLog(withXp(25), NOON2, 'a', 'two')
    const found = foundItems([one, two, undo(one, NOON2 + 1)], POOL)
    expect(found.map((f) => [f.item.id, f.logId, f.dayKey])).toEqual([['a', 'two', '2026-10-06']])
  })

  it('ignores unknown and malformed item rewards', () => {
    const odd = (reward: unknown): LogEvent => ({ ...log(withXp(25), NOON), reward: reward as Reward })
    const events: GameEvent[] = [
      itemLog(withXp(25), NOON, 'zz'),
      odd({ kind: 'item' }),
      odd({ kind: 'item', itemId: 42 }),
      odd(null),
      odd('item'),
      odd({ kind: 'confetti', itemId: 'a' }),
      itemLog(withXp(25), NOON, 'd'),
    ]
    expect(foundItems(events, POOL).map((f) => f.item.id)).toEqual(['d'])
  })

  it('counts an id from a later config once the config has it', () => {
    const events = [itemLog(withXp(25), NOON, 'e')]
    expect(foundItems(events, POOL)).toEqual([])
    const later: Item[] = [...POOL, { id: 'e', name: 'Item E', slot: 'head' }]
    expect(foundItems(events, later).map((f) => f.item.id)).toEqual(['e'])
  })

  it('ignores an id dropped from the config, and frees nothing else', () => {
    const events = [itemLog(withXp(25), NOON, 'a'), itemLog(withXp(25), NOON, 'b')]
    const fewer = POOL.filter((i) => i.id !== 'a')
    expect(foundItems(events, fewer).map((f) => f.item.id)).toEqual(['b'])
  })

  it('gives items no XP', () => {
    const l = itemLog(withXp(25), NOON, 'a')
    expect(logXp(l)).toBe(25)
    expect(treatBonus(l)).toBe(0)
  })
})

describe('bad-luck protection', () => {
  const PITY: RewardConfig = { ...ODDS, itemPityLogs: 5 }
  const plain = (k: number) => Array.from({ length: k }, (_, j) => log(withXp(25), NOON + j))
  const NOTHING = { chance: 0.9999, pick: 0 }
  const TREAT = { chance: 0.1, pick: 0 }
  const next = (events: readonly GameEvent[], r = NOTHING, config = PITY) => rollReward(withXp(25), events, r, config)

  it('counts the logs since the last find, or since the start', () => {
    expect(logsSinceFind([], POOL)).toBe(0)
    expect(logsSinceFind(plain(3), POOL)).toBe(3)
    expect(logsSinceFind([...plain(3), itemLog(withXp(25), NOON, 'a'), ...plain(2)], POOL)).toBe(2)
    expect(logsSinceFind([...plain(3), itemLog(withXp(25), NOON, 'a')], POOL)).toBe(0)
    // Treats and unknown or malformed item ids aren't finds.
    expect(logsSinceFind([treatLog(withXp(25), NOON, 13), itemLog(withXp(25), NOON, 'zz')], POOL)).toBe(2)
  })

  it('does nothing one log before the threshold', () => {
    expect(next(plain(4))).toBeUndefined()
    expect(next(plain(4), TREAT)).toEqual({ kind: 'treat', bonusXp: 13 })
  })

  it('brings an item exactly at the threshold, whatever the chance', () => {
    expect(next(plain(5))).toEqual({ kind: 'item', itemId: 'a' })
    expect(next(plain(9))).toEqual({ kind: 'item', itemId: 'a' })
    expect(next(plain(5), { chance: Number.NaN, pick: 0 })).toEqual({ kind: 'item', itemId: 'a' })
  })

  it('lets the pick choose which item', () => {
    expect(next(plain(5), { chance: 0.9999, pick: 0.9999 })).toEqual({ kind: 'item', itemId: 'd' })
  })

  it('replaces a treat the roll would have brought', () => {
    expect(next(plain(5), TREAT)).toEqual({ kind: 'item', itemId: 'a' })
  })

  it('resets after a find', () => {
    const events = [...plain(5), itemLog(withXp(25), NOON, 'a')]
    expect(next(events)).toBeUndefined()
    expect(next([...events, ...plain(4)])).toBeUndefined()
    expect(next([...events, ...plain(5)])).toEqual({ kind: 'item', itemId: 'b' })
  })

  it('counts the logs before a find again when the find is undone', () => {
    const find = itemLog(withXp(25), NOON, 'a')
    const events = [...plain(4), find, ...plain(1)]
    expect(next(events)).toBeUndefined()
    expect(logsSinceFind([...events, undo(find, NOON)], POOL)).toBe(5)
    expect(next([...events, undo(find, NOON)])).toEqual({ kind: 'item', itemId: 'a' })
  })

  it('does not count undone logs', () => {
    const logs = plain(5)
    const events = [...logs, undo(logs[4]!, NOON)]
    expect(logsSinceFind(events, POOL)).toBe(4)
    expect(next(events)).toBeUndefined()
  })

  it('does nothing once every item is found: the roll decides as usual', () => {
    const events = [...POOL.map((i) => itemLog(withXp(25), NOON, i.id)), ...plain(10)]
    expect(next(events)).toBeUndefined()
    expect(next(events, TREAT)).toEqual({ kind: 'treat', bonusXp: 13 })
  })

  it('is off below 1', () => {
    expect(next(plain(50), NOTHING, { ...PITY, itemPityLogs: 0 })).toBeUndefined()
    expect(next(plain(50), NOTHING, { ...PITY, itemPityLogs: -1 })).toBeUndefined()
  })

  it('uses the real threshold', () => {
    const real = (k: number) => rollReward(withXp(25), plain(k), NOTHING, REWARDS)
    expect(real(REWARDS.itemPityLogs - 1)).toBeUndefined()
    expect(real(REWARDS.itemPityLogs)).toEqual({ kind: 'item', itemId: ITEMS[0]!.id })
  })
})

describe('milestoneReward and rewardMilestone', () => {
  const NOTHING = { chance: 0.9999, pick: 0 }

  it('picks an item not found yet with roll.pick, whatever the chance, and saves the milestone', () => {
    expect(milestoneReward([], NOTHING, ODDS, 7)).toEqual({ kind: 'item', itemId: 'a', milestone: 7 })
    expect(milestoneReward([], { chance: 0.5, pick: 0.9999 }, ODDS, 30)).toEqual({ kind: 'item', itemId: 'd', milestone: 30 })
    const found = [itemLog(withXp(25), NOON, 'a'), itemLog(withXp(25), NOON + 1, 'b')]
    expect(milestoneReward(found, NOTHING, ODDS, 7)).toEqual({ kind: 'item', itemId: 'c', milestone: 7 })
  })

  it('is undefined once every item is found', () => {
    const all = POOL.map((item, i) => itemLog(withXp(25), NOON + i, item.id))
    expect(milestoneReward(all, NOTHING, ODDS, 7)).toBeUndefined()
  })

  it('reads the milestone back, and the item still counts as found like any other', () => {
    const milestoneLog: LogEvent = { ...log(withXp(25), NOON), reward: { kind: 'item', itemId: 'b', milestone: 7 } }
    expect(rewardMilestone(milestoneLog)).toBe(7)
    expect(rewardItemId(milestoneLog)).toBe('b')
    expect(itemFor(milestoneLog, POOL)?.id).toBe('b')
    expect(foundItems([milestoneLog], POOL).map((f) => f.item.id)).toEqual(['b'])
    expect(logsSinceFind([milestoneLog], POOL)).toBe(0)
  })

  it('is null for a lucky find, a treat, no reward or a malformed milestone', () => {
    expect(rewardMilestone(itemLog(withXp(25), NOON, 'a'))).toBeNull()
    expect(rewardMilestone(treatLog(withXp(25), NOON, 5))).toBeNull()
    expect(rewardMilestone(log(withXp(25), NOON))).toBeNull()
    const odd = (milestone: unknown): LogEvent =>
      ({ ...log(withXp(25), NOON), reward: { kind: 'item', itemId: 'a', milestone } }) as unknown as LogEvent
    for (const bad of ['7', 0, -7, 7.5, Number.NaN, null]) expect(rewardMilestone(odd(bad))).toBeNull()
    // A milestone on a reward that isn't a well-formed item doesn't count either.
    const notItem = { ...log(withXp(25), NOON), reward: { kind: 'treat', bonusXp: 3, milestone: 7 } } as unknown as LogEvent
    expect(rewardMilestone(notItem)).toBeNull()
  })
})
