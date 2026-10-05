// The dragon's four stats, totalled from the event log. Nothing here is stored.

import { activeLogs } from './state'
import type { GameEvent, Stat, StatId, Task } from './types'

export interface StatTotal {
  stat: Stat
  /** XP from active logs of tasks mapped to this stat. */
  xp: number
}

/**
 * XP per stat, in config order, using the XP saved on each active log. Every stat
 * starts at 0. Archived tasks still count under their stat. Logs for a task id that
 * is no longer in config count towards no stat (they still count towards total XP).
 */
export function statTotals(
  events: readonly GameEvent[],
  tasks: readonly Task[],
  stats: readonly Stat[],
): StatTotal[] {
  const statOf = new Map(tasks.map((t) => [t.id, t.stat]))
  const sums = new Map<StatId, number>(stats.map((s) => [s.id, 0]))
  for (const log of activeLogs(events)) {
    const stat = statOf.get(log.taskId)
    if (stat === undefined) continue
    const sum = sums.get(stat)
    if (sum !== undefined) sums.set(stat, sum + log.xpAwarded)
  }
  return stats.map((stat) => ({ stat, xp: sums.get(stat.id) ?? 0 }))
}
