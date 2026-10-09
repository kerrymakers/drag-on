// When to gently suggest a backup. Pure: the time is passed in.

import { activeLogs } from './active'
import { dayKey, daysBetween } from './day'
import type { GameEvent } from './types'

/**
 * True once more than `days` game days have passed since the last backup. With no
 * backup ever, it counts from the first active log instead; with no logs at all
 * (or only undone ones) there's nothing to lose, so it's never due. Counted in whole
 * game days, so it stays the same all day and is due from 04:00 on day `days + 1`.
 */
export function backupDue(
  events: readonly GameEvent[],
  lastBackupAt: number | undefined,
  now: number,
  days: number,
): boolean {
  const logs = activeLogs(events)
  if (logs.length === 0) return false
  const from = lastBackupAt ?? logs.reduce((min, l) => Math.min(min, l.timestamp), Infinity)
  return daysBetween(dayKey(from), dayKey(now)) > days
}
