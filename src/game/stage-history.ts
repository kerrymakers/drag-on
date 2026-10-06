// When the dragon first reached each stage, replayed from the event log.

import { dayKey } from './day'
import { logXp } from './rewards'
import { activeLogs, stageFor } from './state'
import type { GameEvent, Stage } from './types'

export interface StageReached {
  stage: Stage
  /** The game day the stage was first reached, or null for the first stage before any log. */
  dayKey: string | null
}

/**
 * Every stage reached so far, lowest first, with the game day it was first reached.
 *
 * Replays active logs in the order they were appended, using the same rule as
 * dragonStage: after each log the stage is the higher of the stage its running XP
 * earns and the highest `stageReached` recorded so far (ids not in config ignored).
 * Undone logs never happened. If one log jumps several stages, each stage it passes
 * gets that log's day. The first stage's day is the first log's day (null if there
 * are no logs), so the list is never empty and always ends at the current stage.
 */
export function stageHistory(events: readonly GameEvent[], stages: readonly Stage[]): StageReached[] {
  const sorted = [...stages].sort((a, b) => a.xpFrom - b.xpFrom)
  const first = stageFor(Number.NEGATIVE_INFINITY, sorted)
  const byId = new Map(sorted.map((s) => [s.id, s]))
  const logs = activeLogs(events)
  const firstLog = logs[0]

  const history: StageReached[] = [{ stage: first, dayKey: firstLog ? dayKey(firstLog.timestamp) : null }]
  let reachedIndex = 0
  let xp = 0
  let held: Stage = first

  for (const log of logs) {
    xp += logXp(log)
    const recorded = log.stageReached === undefined ? undefined : byId.get(log.stageReached)
    if (recorded && recorded.xpFrom > held.xpFrom) held = recorded
    const byXp = stageFor(xp, sorted)
    const now = byXp.xpFrom > held.xpFrom ? byXp : held
    const index = sorted.indexOf(now)
    if (index > reachedIndex) {
      const day = dayKey(log.timestamp)
      for (let i = reachedIndex + 1; i <= index; i++) {
        history.push({ stage: sorted[i] as Stage, dayKey: day })
      }
      reachedIndex = index
    }
  }
  return history
}
