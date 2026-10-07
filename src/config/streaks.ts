// Streaks and streak freezes. Balancing numbers only; the rules are in src/game/streaks.ts.

import type { Weekday } from '../game/types'

export interface StreakConfig {
  /** One freeze is earned each time the overall streak reaches a multiple of this many days. */
  freezeEveryDays: number
  /** Most freezes held at once. One earned while at the cap is simply not added. */
  freezeMaxHeld: number
  /** Overall streak lengths that bring a guaranteed item the first time (Milestone 5, slice 2). */
  milestones: readonly number[]
  /** The first day of a week, for the weekly counts per task. */
  weekStart: Weekday
}

export const FREEZE_EVERY_DAYS = 7
export const FREEZE_MAX_HELD = 2
export const STREAK_MILESTONES: readonly number[] = [7, 30, 100]
export const WEEK_START: Weekday = 'mon'

export const STREAKS: StreakConfig = {
  freezeEveryDays: FREEZE_EVERY_DAYS,
  freezeMaxHeld: FREEZE_MAX_HELD,
  milestones: STREAK_MILESTONES,
  weekStart: WEEK_START,
}

/** The Home streak chip only shows from this many days in a row (a 1-day "streak" is just a log). */
export const STREAK_CHIP_FROM = 2
