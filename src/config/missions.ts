// The daily secret mission (Milestone 8, slice 3): the dragon's small wish for the day.
// Balancing numbers and the list of wishes; the rules are in src/game/mission.ts.

import type { StatId, Weekday } from '../game/types'
import { WEEK_START } from './streaks'

/**
 * One kind of wish. Ids are saved on the logs that grant them, so they're stable and
 * the list is append-only: never rename or reuse one.
 * - early: any log before `earlyBefore` (game day, so 04:00 to just before it)
 * - logs: `count` logs today
 * - stats: logs for `count` different stats today
 * - stat: a log of a task for `stat`
 * - fresh: a log of a task with no log yet this week (before today)
 */
export type Mission =
  | { id: string; kind: 'early' }
  | { id: string; kind: 'logs'; count: number }
  | { id: string; kind: 'stats'; count: number }
  | { id: string; kind: 'stat'; stat: StatId }
  | { id: string; kind: 'fresh' }

export interface MissionConfig {
  /** Bonus XP saved on the log that grants the day's wish, on top of any other reward. */
  bonusXp: number
  /** "HH:MM" wall clock: an early-bird wish needs a log before this. */
  earlyBefore: string
  /** The first day of a week, for the "fresh" wish (as in History). */
  weekStart: Weekday
  /** Every wish, in pick order. */
  missions: readonly Mission[]
}

/** Sized 2026-10-13 (M8 slice 3a): 15 to 10 after simulation, keeping typical Elder near the spec window (see SPEC). */
export const MISSION_BONUS_XP = 10
export const EARLY_BIRD_BEFORE = '09:00'

export const MISSIONS: readonly Mission[] = [
  { id: 'early', kind: 'early' },
  { id: 'two-stats', kind: 'stats', count: 2 },
  { id: 'three-logs', kind: 'logs', count: 3 },
  { id: 'stat:strength', kind: 'stat', stat: 'strength' },
  { id: 'stat:discipline', kind: 'stat', stat: 'discipline' },
  { id: 'stat:wisdom', kind: 'stat', stat: 'wisdom' },
  { id: 'stat:heart', kind: 'stat', stat: 'heart' },
  { id: 'fresh', kind: 'fresh' },
]

export const MISSION: MissionConfig = {
  bonusXp: MISSION_BONUS_XP,
  earlyBefore: EARLY_BIRD_BEFORE,
  weekStart: WEEK_START,
  missions: MISSIONS,
}
