// Variable rewards: the odds of a surprise on each log, and how big a treat is.
// Balancing numbers only; the roll itself is in src/game/rewards.ts.

export interface RewardConfig {
  /** Share of logs (0 to 1) that bring a rare item. Checked first, so it's the low band of the roll. */
  rareChance: number
  /** Share of logs (0 to 1) that bring a treat, the band just above the rare one. */
  treatChance: number
  /** A treat's bonus XP as a share of the task's XP, rounded to a whole number. */
  treatBonusShare: number
}

/**
 * Rare items arrive in Milestone 4 slice 2. Until then a roll in the rare band
 * (chance < RARE_CHANCE) brings nothing, so treats stay at exactly TREAT_CHANCE and
 * the pace matches slice 2, where items are worth no XP.
 */
export const RARE_CHANCE = 0.03
export const TREAT_CHANCE = 0.2
export const TREAT_BONUS_SHARE = 0.5

export const REWARDS: RewardConfig = {
  rareChance: RARE_CHANCE,
  treatChance: TREAT_CHANCE,
  treatBonusShare: TREAT_BONUS_SHARE,
}
