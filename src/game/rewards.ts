// Variable rewards: the roll made once at log time, and the XP a log is worth.
// Pure: the caller draws the random numbers and passes them in.

import type { RewardConfig } from '../config/rewards'
import type { GameEvent, LogEvent, Reward, RewardRoll, Task } from './types'

/**
 * The reward for a new log of `task`, or undefined for none. One draw decides:
 * - chance < rareChance: a rare item. Items arrive in Milestone 4 slice 2; until
 *   then this band brings nothing. (`events` and `roll.pick` are for picking among
 *   the items not found yet.)
 * - chance < rareChance + treatChance: a treat worth round(task.xp × treatBonusShare)
 *   bonus XP. A task so small the bonus rounds to 0 gets no treat, never "+0".
 * - anything else: no reward.
 * A chance that isn't a number in [0, 1) (NaN, say) falls through to no reward.
 */
export function rollReward(
  task: Task,
  _events: readonly GameEvent[],
  roll: RewardRoll,
  config: RewardConfig,
): Reward | undefined {
  const { chance } = roll
  if (!(chance >= 0 && chance < 1)) return undefined
  if (chance < config.rareChance) return undefined // rare items: slice 2
  if (chance < config.rareChance + config.treatChance) {
    const bonusXp = Math.round(task.xp * config.treatBonusShare)
    return bonusXp > 0 ? { kind: 'treat', bonusXp } : undefined
  }
  return undefined
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
