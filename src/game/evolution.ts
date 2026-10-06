// The dragon's evolution look, replayed from the event log. Nothing here is stored.

import { logXp } from './rewards'
import { activeLogs, stageFor } from './state'
import type { GameEvent, Stage, StageId, Stat, StatId, Task } from './types'

/** 'neutral' before the dragon evolves, then the stat its look comes from. */
export type LookId = StatId | 'neutral'

export interface EvolutionRules {
  /** The stage id at which the dragon first takes on a look. */
  evolvesAt: StageId
  /** How far (as a share) another stat must lead the current look's stat to change it. */
  margin: number
}

export interface Evolution {
  look: LookId
  /** Every look the dragon has had so far, in the order first seen. Never 'neutral'. */
  seen: StatId[]
}

/** Absorbs floating-point noise, so a lead of exactly the margin never counts as more. */
const EPSILON = 1e-9

/** The highest stat (ties go to config order), or null if every stat is still 0. */
function topStat(stats: readonly Stat[], totals: ReadonlyMap<StatId, number>): StatId | null {
  let best: StatId | null = null
  let bestXp = 0
  for (const s of stats) {
    const xp = totals.get(s.id) ?? 0
    if (xp > bestXp) {
      best = s.id
      bestXp = xp
    }
  }
  return best
}

/**
 * The dragon's look and every look it has had.
 *
 * Replays active logs (undo applied) in the order they were appended, like
 * stageHistory, keeping running stat totals (as statTotals: logs of tasks no longer
 * in config count under no stat) and the held stage (as dragonStage: the higher of
 * the XP stage and the highest `stageReached` recorded so far).
 * - Below `evolvesAt` the look is 'neutral'.
 * - On the first log at or above it, the look becomes the top stat (ties go to
 *   config order). If every stat is still 0 then, it stays neutral until one isn't.
 * - After that the look changes only when another stat is more than `margin` ahead
 *   of the current look's stat. If several are, the highest wins (ties: config order).
 * If `evolvesAt` isn't a configured stage, the dragon stays neutral.
 */
export function evolutionLook(
  events: readonly GameEvent[],
  tasks: readonly Task[],
  stats: readonly Stat[],
  stages: readonly Stage[],
  rules: EvolutionRules,
): Evolution {
  const evolveStage = stages.find((s) => s.id === rules.evolvesAt)
  const seen: StatId[] = []
  if (!evolveStage) return { look: 'neutral', seen }

  const byId = new Map(stages.map((s) => [s.id, s]))
  const statOf = new Map(tasks.map((t) => [t.id, t.stat]))
  const totals = new Map<StatId, number>(stats.map((s) => [s.id, 0]))
  let xp = 0
  let heldFrom = Number.NEGATIVE_INFINITY
  let look: LookId = 'neutral'

  for (const log of activeLogs(events)) {
    const gained = logXp(log)
    xp += gained
    const stat = statOf.get(log.taskId)
    const sum = stat === undefined ? undefined : totals.get(stat)
    if (stat !== undefined && sum !== undefined) totals.set(stat, sum + gained)
    const recorded = log.stageReached === undefined ? undefined : byId.get(log.stageReached)
    if (recorded && recorded.xpFrom > heldFrom) heldFrom = recorded.xpFrom

    if (look === 'neutral') {
      const stageFrom = Math.max(heldFrom, stageFor(xp, stages).xpFrom)
      if (stageFrom < evolveStage.xpFrom) continue
      const top = topStat(stats, totals)
      if (top === null) continue
      look = top
    } else {
      const bar = (totals.get(look) ?? 0) * (1 + rules.margin)
      let best: StatId | null = null
      let bestXp = bar
      for (const s of stats) {
        const v = totals.get(s.id) ?? 0
        if (s.id !== look && v - bestXp > EPSILON) {
          best = s.id
          bestXp = v
        }
      }
      if (best === null) continue
      look = best
    }
    if (!seen.includes(look)) seen.push(look)
  }
  return { look, seen }
}

export interface LookChange {
  /** The new look. */
  look: StatId
  /** True if the dragon has never had this look before: worth celebrating. */
  firstTime: boolean
}

/**
 * How the look changed between two evolutions (before and after a log), or null if
 * it didn't. Going back to neutral (undoing the log that evolved it) is never a change.
 */
export function lookChange(before: Evolution, after: Evolution): LookChange | null {
  if (after.look === before.look || after.look === 'neutral') return null
  return { look: after.look, firstTime: !before.seen.includes(after.look) }
}
