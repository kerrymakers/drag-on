// The daily secret mission (Milestone 8, slice 3): each game day the dragon has a small
// secret wish, picked from the day and a seed saved in settings. A log that grants it
// saves a bonus on itself (LogEvent.mission), on top of any other reward. Everything
// else is worked out from the event log, so undoing the granting log reopens the wish.
// Pure: the time is passed in.
//
// Decided 2026-10-13:
// - The pool is the wishes possible with the active tasks: early bird, two different
//   stats, three logs, the stat of the day and a "fresh" task. Each needs an active
//   task other than wake-up (its schedule skips days), though a wake-up log still
//   counts towards granting one.
// - A wish counts even if it was never revealed: a surprise grant.
// - At most one grant per game day.
// - A wish that's out of reach (early bird after its time) goes quiet: never mentioned.

import type { Mission, MissionConfig } from '../config/missions'
import { activeLogs } from './active'
import { clockToDayMinutes, dayKey, minutesSinceDayStart, shiftDayKey } from './day'
import { mixedHash } from './hash'
import { missionOf } from './rewards'
import { weekStartKey } from './streaks'
import { timesADay } from './tasks'
import type { GameEvent, LogEvent, MissionGrant, StatId, Task } from './types'

/**
 * How far back the no-repeat rule looks to work out yesterday's wish. Yesterday's
 * depends on the day before's, and so on; a chain of shifts this long is vanishingly
 * rare, so starting from a plain pick this many days back gives the same answer.
 */
const LOOKBACK_DAYS = 7

export type MissionStatus = 'open' | 'granted' | 'out-of-reach'

/** The tasks a wish can be about: active, and not the wake-up task. */
function wishTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => !t.archived && t.rules.kind !== 'wakeUp')
}

/**
 * The tasks that would grant a "fresh" wish on game day `day`: active tasks other than
 * wake-up with no active log this week before `day`. It's judged on logs from before
 * the day starts, so it stays the same all day.
 */
export function freshTasks(day: string, tasks: readonly Task[], events: readonly GameEvent[], config: Pick<MissionConfig, 'weekStart'>): Task[] {
  const start = weekStartKey(day, config.weekStart)
  const logged = new Set<string>()
  for (const l of activeLogs(events)) {
    const d = dayKey(l.timestamp)
    if (d >= start && d < day) logged.add(l.taskId)
  }
  return wishTasks(tasks).filter((t) => !logged.has(t.id))
}

/** Whether `mission` can be granted on `day` with these tasks. */
function possible(mission: Mission, candidates: readonly Task[], fresh: readonly Task[]): boolean {
  if (candidates.length === 0) return false
  switch (mission.kind) {
    case 'early':
      return true
    case 'logs':
      return candidates.reduce((n, t) => n + (timesADay(t) ?? 0), 0) >= mission.count
    case 'stats':
      return new Set(candidates.map((t) => t.stat)).size >= mission.count
    case 'stat':
      return candidates.some((t) => t.stat === mission.stat)
    case 'fresh':
      return fresh.length > 0
  }
}

/** The wishes possible on game day `day`, in config order. */
export function missionPool(day: string, tasks: readonly Task[], events: readonly GameEvent[], config: MissionConfig): Mission[] {
  const candidates = wishTasks(tasks)
  const fresh = freshTasks(day, tasks, events, config)
  return config.missions.filter((m) => possible(m, candidates, fresh))
}

/**
 * The dragon's secret wish on game day `day`, or null with no seed or nothing possible.
 * A hash of the seed and the day picks from the pool (see missionPool), so it's the
 * same on every reload. If that would repeat yesterday's wish it shifts to the next
 * one in the pool. Yesterday's is worked out with today's pool, so a task added or
 * archived since can (rarely) let a wish come twice in a row.
 */
export function missionFor(
  day: string,
  seed: string | undefined,
  tasks: readonly Task[],
  events: readonly GameEvent[],
  config: MissionConfig,
): Mission | null {
  if (!seed) return null
  const pool = missionPool(day, tasks, events, config)
  if (pool.length === 0) return null
  let pick: Mission | null = null
  for (let back = LOOKBACK_DAYS; back >= 0; back--) {
    let i = mixedHash(`${seed}:${shiftDayKey(day, -back)}`) % pool.length
    if (pick && pool.length > 1 && pool[i]?.id === pick.id) i = (i + 1) % pool.length
    pick = pool[i] ?? null
  }
  return pick
}

/** Active logs on game day `day`, in the order they were appended. */
function logsOn(events: readonly GameEvent[], day: string): LogEvent[] {
  return activeLogs(events).filter((l) => dayKey(l.timestamp) === day)
}

/** The game-day minute an early-bird log must come before, or 0 (none can) if malformed. */
function earlyLimit(config: Pick<MissionConfig, 'earlyBefore'>): number {
  return clockToDayMinutes(config.earlyBefore) ?? 0
}

/**
 * Where today's wish stands at `now`: granted once an active log today holds a grant
 * (whichever wish it was), out of reach for the early bird once its time has passed,
 * else open. Undoing the granting log makes it open again.
 */
export function missionStatus(
  mission: Mission,
  events: readonly GameEvent[],
  now: number,
  config: Pick<MissionConfig, 'earlyBefore'>,
): MissionStatus {
  if (logsOn(events, dayKey(now)).some((l) => missionOf(l) !== null)) return 'granted'
  if (mission.kind === 'early' && minutesSinceDayStart(now) >= earlyLimit(config)) return 'out-of-reach'
  return 'open'
}

/**
 * The grant for a new `log`, if it completes `mission` (the wish for the log's game
 * day), else undefined. `events` are the events before it; the log's own timestamp is
 * "now". Nothing if an active log that day already holds a grant (one a day), or the
 * bonus in config is 0 or less. Each kind, counting this log:
 * - early: the log is before `earlyBefore`;
 * - logs: at least `count` active logs that day;
 * - stats: logs that day for at least `count` different stats (a task not in `tasks`
 *   counts for none);
 * - stat: the log's task is for that stat;
 * - fresh: the log's task is one of that day's fresh tasks (see freshTasks).
 */
export function missionGrantFor(
  mission: Mission | null,
  events: readonly GameEvent[],
  log: LogEvent,
  tasks: readonly Task[],
  config: MissionConfig,
): MissionGrant | undefined {
  if (!mission || config.bonusXp <= 0) return undefined
  const day = dayKey(log.timestamp)
  const today = logsOn(events, day)
  if (today.some((l) => missionOf(l) !== null)) return undefined
  const statOf = (taskId: string): StatId | undefined => tasks.find((t) => t.id === taskId)?.stat
  let done: boolean
  switch (mission.kind) {
    case 'early':
      done = minutesSinceDayStart(log.timestamp) < earlyLimit(config)
      break
    case 'logs':
      done = today.length + 1 >= mission.count
      break
    case 'stats': {
      const stats = new Set([...today, log].map((l) => statOf(l.taskId)))
      stats.delete(undefined)
      done = stats.size >= mission.count
      break
    }
    case 'stat':
      done = statOf(log.taskId) === mission.stat
      break
    case 'fresh':
      done = freshTasks(day, tasks, events, config).some((t) => t.id === log.taskId)
      break
  }
  return done ? { id: mission.id, bonusXp: config.bonusXp } : undefined
}
