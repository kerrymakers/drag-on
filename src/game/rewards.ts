// Variable rewards: the roll made once at log time, the XP a log is worth, and the
// items found so far. Pure: the caller draws the random numbers and passes them in.

import type { RewardConfig } from '../config/rewards'
import { activeLogs } from './active'
import { dayKey } from './day'
import type { GameEvent, Item, LogEvent, Reward, RewardRoll, Task } from './types'

/**
 * The reward for a new log of `task`, or undefined for none. One draw decides:
 * - chance < rareChance: a rare item, picked by `roll.pick` from the items in
 *   `config.items` not found yet (in config order: floor(pick × count)). Once every
 *   item is found, this band brings a treat instead.
 * - chance < rareChance + treatChance: a treat worth round(task.xp × treatBonusShare)
 *   bonus XP. A task so small the bonus rounds to 0 gets no treat, never "+0".
 * - anything else: no reward.
 * Bad-luck protection comes first: if the last `config.itemPityLogs` active logs
 * brought no item (see logsSinceFind), this log brings an item whatever the chance,
 * instead of any treat. It does nothing once every item is found.
 * A chance that isn't a number in [0, 1) (NaN, say) otherwise falls through to no
 * reward. A pick outside [0, 1) is clamped, so it still picks an item.
 */
export function rollReward(
  task: Task,
  events: readonly GameEvent[],
  roll: RewardRoll,
  config: RewardConfig,
): Reward | undefined {
  const { chance } = roll
  const validChance = chance >= 0 && chance < 1
  const rare = validChance && chance < config.rareChance
  if (rare || pityDue(events, config)) {
    const item = pickItem(events, config.items, roll.pick)
    if (item) return { kind: 'item', itemId: item.id }
  }
  if (!validChance) return undefined
  // A rare roll with everything found brings a treat, so it's never a let-down.
  if (rare || chance < config.rareChance + config.treatChance) return treat(task, config)
  return undefined
}

/**
 * How many active logs in a row, most recent last, have brought no item: those after
 * the last active log with a configured item (or all of them, before the first find).
 * Undone logs don't count, and undoing a find brings back the logs before it.
 */
export function logsSinceFind(events: readonly GameEvent[], items: readonly Item[]): number {
  const logs = activeLogs(events)
  let n = 0
  for (let i = logs.length - 1; i >= 0; i--) {
    if (itemFor(logs[i] as LogEvent, items)) break
    n++
  }
  return n
}

/** Whether bad-luck protection guarantees the next log an item (items still to find aside). */
function pityDue(events: readonly GameEvent[], config: RewardConfig): boolean {
  return config.itemPityLogs >= 1 && logsSinceFind(events, config.items) >= config.itemPityLogs
}

function treat(task: Task, config: RewardConfig): Reward | undefined {
  const bonusXp = Math.round(task.xp * config.treatBonusShare)
  return bonusXp > 0 ? { kind: 'treat', bonusXp } : undefined
}

/** One of the items not found yet, chosen by `pick` in [0, 1), or null if all are found. */
function pickItem(events: readonly GameEvent[], items: readonly Item[], pick: number): Item | null {
  const found = new Set(foundItems(events, items).map((f) => f.item.id))
  const left = items.filter((i) => !found.has(i.id))
  if (left.length === 0) return null
  const p = pick >= 0 ? pick : 0 // NaN and negatives pick the first
  const index = Math.min(left.length - 1, Math.floor(p * left.length))
  return left[index] ?? null
}

/**
 * A log's treat bonus, or 0. Saved data can hold a reward this version doesn't
 * recognise (written by a later version, or edited by hand), so this checks the shape
 * at run time: anything but a treat with a finite, non-negative bonus counts 0.
 */
export function treatBonus(log: LogEvent): number {
  const reward: unknown = log.reward
  if (typeof reward !== 'object' || reward === null) return 0
  const r = reward as { kind?: unknown; bonusXp?: unknown }
  if (r.kind !== 'treat') return 0
  const bonus = r.bonusXp
  return typeof bonus === 'number' && Number.isFinite(bonus) && bonus >= 0 ? bonus : 0
}

/** The XP a log is worth: its base `xpAwarded` plus any treat bonus. Use this for every XP sum. */
export function logXp(log: LogEvent): number {
  return log.xpAwarded + treatBonus(log)
}

/**
 * The item id a log's reward names, or null. Checks the shape at run time, like
 * treatBonus: anything but an item reward with a non-empty string id is null. It
 * doesn't check the id is in config (see foundItems and itemFor).
 */
export function rewardItemId(log: LogEvent): string | null {
  const reward: unknown = log.reward
  if (typeof reward !== 'object' || reward === null) return null
  const r = reward as { kind?: unknown; itemId?: unknown }
  if (r.kind !== 'item') return null
  return typeof r.itemId === 'string' && r.itemId !== '' ? r.itemId : null
}

/** The configured item a log brought, or null (no item, a malformed reward, or an id not in `items`). */
export function itemFor(log: LogEvent, items: readonly Item[]): Item | null {
  const id = rewardItemId(log)
  return id === null ? null : (items.find((i) => i.id === id) ?? null)
}

export interface FoundItem {
  item: Item
  /** The log that brought it. */
  logId: string
  timestamp: number
  /** The game day it was found ("YYYY-MM-DD"). */
  dayKey: string
}

/**
 * The items found so far, in the order they were found: one entry per item, from the
 * first active (not undone) log that brought it. Undoing that log takes the item away
 * (or moves it to a later log that brought it too). Rewards that aren't a well-formed
 * item, or name an id not in `items`, are ignored; an id that a later config adds
 * counts from then on. Items are worth no XP.
 */
export function foundItems(events: readonly GameEvent[], items: readonly Item[]): FoundItem[] {
  const found: FoundItem[] = []
  const seen = new Set<string>()
  for (const log of activeLogs(events)) {
    const item = itemFor(log, items)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    found.push({ item, logId: log.id, timestamp: log.timestamp, dayKey: dayKey(log.timestamp) })
  }
  return found
}
