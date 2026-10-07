// Variable rewards: the odds of a surprise on each log, and how big a treat is.
// Balancing numbers and the item pool; the roll itself is in src/game/rewards.ts.

import type { Item } from '../game/types'
import { ITEMS } from './items'

export interface RewardConfig {
  /** Share of logs (0 to 1) that bring a rare item. Checked first, so it's the low band of the roll. */
  rareChance: number
  /** Share of logs (0 to 1) that bring a treat, the band just above the rare one. */
  treatChance: number
  /** A treat's bonus XP as a share of the task's XP, rounded to a whole number. */
  treatBonusShare: number
  /**
   * The items a rare roll can bring, in pick order. Once every one is found, a rare
   * roll brings a treat instead.
   */
  items: readonly Item[]
  /**
   * Bad-luck protection: once this many active logs in a row (since the last find, or
   * since the start) have brought no item, the next log brings one whatever the roll.
   * Does nothing once every item is found. 0 (or anything below 1) turns it off.
   */
  itemPityLogs: number
}

export const RARE_CHANCE = 0.03
export const TREAT_CHANCE = 0.2
export const TREAT_BONUS_SHARE = 0.5
/** Added 2026-10-07 after simulation, with the pool growing from 12 to 18 items. */
export const ITEM_PITY_LOGS = 30

export const REWARDS: RewardConfig = {
  rareChance: RARE_CHANCE,
  treatChance: TREAT_CHANCE,
  treatBonusShare: TREAT_BONUS_SHARE,
  items: ITEMS,
  itemPityLogs: ITEM_PITY_LOGS,
}
