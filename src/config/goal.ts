// The weekly goal (Milestone 8): one task, so many days a week. Balancing numbers only;
// the rules are in src/game/goal.ts.

import type { Weekday } from '../game/types'
import { WEEK_START } from './streaks'

export interface GoalConfig {
  /** The goal treat's bonus XP, saved on the log that meets the week's goal. */
  bonusXp: number
  /** The fewest days a week a goal can ask for. */
  minDays: number
  /** The most days a week a goal can ask for (the wake-up task may allow fewer). */
  maxDays: number
  /** Days a week a new goal starts at. */
  defaultDays: number
  /** The first day of a goal week, as for the weekly counts in History. */
  weekStart: Weekday
}

/** Starting value 2026-10-13 (M8 slice 1); balance-checker sizes it. */
export const GOAL_BONUS_XP = 30
export const GOAL_MIN_DAYS = 1
export const GOAL_MAX_DAYS = 7
export const GOAL_DEFAULT_DAYS = 3

export const GOAL: GoalConfig = {
  bonusXp: GOAL_BONUS_XP,
  minDays: GOAL_MIN_DAYS,
  maxDays: GOAL_MAX_DAYS,
  defaultDays: GOAL_DEFAULT_DAYS,
  weekStart: WEEK_START,
}
