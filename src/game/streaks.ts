// Streaks, streak freezes and weekly counts, all worked out from the event log by
// walking game days from the first log to `now`. Nothing here is stored, so undoing a
// log recalculates everything. A wake schedule edit applies from its day on (see
// scheduleOn), so it never changes how an earlier day was judged.
//
// Agreed 2026-10-07: only two daily streaks (the overall "any log" one and wake-up),
// and freezes protect the overall streak only. Other tasks get weekly counts instead,
// so a rest day never resets anything.

import type { StreakConfig } from '../config/streaks'
import { activeLogs } from './active'
import { clockToDayMinutes, dayKey, nextDayKey, shiftDayKey, weekdayOf } from './day'
import { scheduleOn, WEEKDAYS } from './settings'
import type { GameEvent, LogEvent, Settings, Task, WakeSchedule, Weekday } from './types'

/**
 * How a game day looks on the History calendar.
 * - logged: at least one active log.
 * - frozen: a finished day with no log, covered by a held freeze. The streak carried on.
 * - missed: a finished day with no log and nothing to cover it. Never shown as a failure.
 * - pending: today, with no log yet. Never "missed" while it's still going.
 */
export type DayStatus = 'logged' | 'frozen' | 'missed' | 'pending'

export interface OverallStreak {
  /**
   * Days with a log in the current run. Frozen days keep the run going but don't add
   * to it. An unlogged today doesn't count yet, so this shows the run through yesterday.
   */
  current: number
  /** The longest run ever, counted the same way. */
  best: number
  /** Freezes held right now (0 to freezeMaxHeld). */
  freezesHeld: number
  /** Whether today has a log yet. */
  todayLogged: boolean
  /** Every game day from the first log's day to today. Days outside that range have no entry. */
  days: ReadonlyMap<string, DayStatus>
}

/** The distinct game days with an active log, up to and including `today`. */
function loggedDays(events: readonly GameEvent[], today: string, taskIds?: ReadonlySet<string>): Set<string> {
  const days = new Set<string>()
  for (const log of activeLogs(events)) {
    if (taskIds && !taskIds.has(log.taskId)) continue
    const key = dayKey(log.timestamp)
    if (key <= today) days.add(key) // a log from the future (clock skew) waits until its day
  }
  return days
}

/** The earliest day key in a set, or null if it's empty. */
function earliest(days: ReadonlySet<string>): string | null {
  let first: string | null = null
  for (const d of days) if (first === null || d < first) first = d
  return first
}

/**
 * The overall "any log" streak. Walking day by day from the first log:
 * - A day with a log adds one. Each time the count reaches a multiple of
 *   `freezeEveryDays`, a freeze is earned (up to `freezeMaxHeld`).
 * - A finished day with no log, during a run, uses a held freeze if there is one: the
 *   run carries on and the day doesn't add to the count. With no freeze, the run ends
 *   quietly and the count goes back to 0.
 * - Nothing else changes the freezes held. A run only ends once none are left, so a
 *   new run always starts from 0 and earns its own.
 * - Today, unlogged, is pending: it never ends a run or uses a freeze.
 * A freeze is spent on the first quiet day even if the next day ends the run anyway,
 * because at the time nobody knows whether the next day will be logged.
 */
export function overallStreak(events: readonly GameEvent[], now: number, config: StreakConfig): OverallStreak {
  const today = dayKey(now)
  const logged = loggedDays(events, today)
  const days = new Map<string, DayStatus>()
  const first = earliest(logged)
  let current = 0
  let best = 0
  let held = 0
  if (first !== null) {
    for (let d = first; d <= today; d = nextDayKey(d)) {
      if (logged.has(d)) {
        current++
        best = Math.max(best, current)
        if (config.freezeEveryDays >= 1 && current % config.freezeEveryDays === 0) {
          held = Math.min(config.freezeMaxHeld, held + 1)
        }
        days.set(d, 'logged')
      } else if (d === today) {
        days.set(d, 'pending')
      } else if (held > 0) {
        // Only possible during a run: held is always 0 while current is 0.
        held--
        days.set(d, 'frozen')
      } else {
        current = 0
        days.set(d, 'missed')
      }
    }
  }
  return { current, best, freezesHeld: Math.max(0, held), todayLogged: logged.has(today), days }
}

/**
 * The streak milestone (from `config.milestones`) that a new `log` reaches for the
 * first time ever, or null. `events` are the events before it; the log's own
 * timestamp is "now". It counts only if:
 * - the log actually adds to the streak count (a second log the same day doesn't), and
 * - the best overall streak before it was below the milestone, and the count with it
 *   is at or above it.
 * Nothing is stored, so undoing the log undoes the milestone and a relog earns it
 * again; a later run reaching the same length after a break doesn't. Frozen days
 * don't add to the count, so they don't bring a milestone closer.
 */
export function streakMilestoneReached(
  events: readonly GameEvent[],
  log: LogEvent,
  config: StreakConfig,
): number | null {
  const now = log.timestamp
  const before = overallStreak(events, now, config)
  const after = overallStreak([...events, log], now, config)
  if (after.current <= before.current) return null
  const reached = [...config.milestones]
    .filter((m) => before.best < m && after.current >= m)
    .sort((a, b) => a - b)
  return reached[0] ?? null
}

/**
 * Whether `log` earns a streak freeze: it takes the count to a multiple of
 * `config.freezeEveryDays` while fewer than `config.freezeMaxHeld` are held.
 * `events` are the events before it.
 */
export function logEarnsFreeze(events: readonly GameEvent[], log: LogEvent, config: StreakConfig): boolean {
  const now = log.timestamp
  return overallStreak([...events, log], now, config).freezesHeld > overallStreak(events, now, config).freezesHeld
}

/**
 * The latest day a freeze covered since the last log, while the run it kept going is
 * still the current one; null if none (no freeze used since the last log, or the run
 * ended anyway). An unlogged today is still pending, so it's skipped.
 */
export function latestFrozenDay(events: readonly GameEvent[], now: number, config: StreakConfig): string | null {
  const { days } = overallStreak(events, now, config)
  const today = dayKey(now)
  for (let d = today; days.has(d); d = shiftDayKey(d, -1)) {
    const status = days.get(d)
    if (status === 'frozen') return d
    if (status === 'logged' || status === 'missed') return null
  }
  return null
}

/** The smallest milestone above `best` (the best overall streak so far), or null after the last. */
export function nextMilestone(best: number, milestones: readonly number[]): number | null {
  const ahead = milestones.filter((m) => m > best).sort((a, b) => a - b)
  return ahead[0] ?? null
}

export interface WakeStreak {
  /** Target days in a row with a wake-up log. An unlogged today doesn't count yet. */
  current: number
  /** The longest run ever. */
  best: number
  /** Whether today's schedule has a target on any day of the week. */
  hasTargets: boolean
}

/** Whether `weekday` has a usable wake target in the schedule (a malformed time counts as none). */
function hasTarget(schedule: WakeSchedule, weekday: Weekday): boolean {
  const target = schedule[weekday]
  return target != null && clockToDayMinutes(target) !== null
}

/**
 * The wake-up streak: days in a row on which a wake-up task (rules.kind 'wakeUp') was
 * logged. Logs only exist when they were in time (see createLogEvent), so every
 * active one counts. Each day is judged by the schedule in force on it (scheduleOn):
 * - a day with a target and a log adds one;
 * - a finished day with a target and no log ends the run quietly;
 * - a day with no target is skipped, neither adding nor ending anything (but a log
 *   on it still counts, since it must have had a target when it was logged);
 * - today, unlogged, is pending.
 * Not protected by freezes. A schedule with no targets at all skips every unlogged
 * day, so the streak simply rests where it was.
 * Decided 2026-10-09: past days keep the schedule they had, so adding a target today
 * never ends a run on an earlier unlogged day of that weekday, and removing one never
 * changes an earlier day. Saves with no schedule history judge every day by
 * `settings.wakeSchedule`.
 */
export function wakeStreak(
  events: readonly GameEvent[],
  tasks: readonly Task[],
  settings: Settings,
  now: number,
): WakeStreak {
  const today = dayKey(now)
  const wakeIds = new Set(tasks.filter((t) => t.rules.kind === 'wakeUp').map((t) => t.id))
  const hasTargets = WEEKDAYS.some((w) => hasTarget(scheduleOn(settings, today), w))
  const logged = loggedDays(events, today, wakeIds)
  const first = earliest(logged)
  let current = 0
  let best = 0
  if (first !== null) {
    for (let d = first; d <= today; d = nextDayKey(d)) {
      if (logged.has(d)) {
        current++
        best = Math.max(best, current)
      } else if (d !== today && hasTarget(scheduleOn(settings, d), weekdayOf(d))) {
        current = 0
      }
    }
  }
  return { current, best, hasTargets }
}

/** The first day of the week (starting on `weekStart`) that game day `key` falls in. */
export function weekStartKey(key: string, weekStart: Weekday): string {
  const order: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const back = (order.indexOf(weekdayOf(key)) - order.indexOf(weekStart) + 7) % 7
  return shiftDayKey(key, -back)
}

export interface WeeklyCount {
  taskId: string
  /** Distinct game days with a log of this task in the current week (so far). */
  thisWeek: number
  /** The most distinct days in any one week, this one included. */
  bestWeek: number
}

/**
 * For each task, in the order given: how many distinct game days it was logged on in
 * the current week (weeks start on `config.weekStart`), and its best week ever. A task
 * logged twice in a day counts that day once. Logs dated after today are ignored.
 */
export function weeklyCounts(
  events: readonly GameEvent[],
  tasks: readonly Task[],
  now: number,
  config: StreakConfig,
): WeeklyCount[] {
  const today = dayKey(now)
  const thisWeek = weekStartKey(today, config.weekStart)
  return tasks.map((task) => {
    const perWeek = new Map<string, number>()
    for (const d of loggedDays(events, today, new Set([task.id]))) {
      const week = weekStartKey(d, config.weekStart)
      perWeek.set(week, (perWeek.get(week) ?? 0) + 1)
    }
    let bestWeek = 0
    for (const n of perWeek.values()) bestWeek = Math.max(bestWeek, n)
    return { taskId: task.id, thisWeek: perWeek.get(thisWeek) ?? 0, bestWeek }
  })
}

/** The game day of the first active log (ignoring any dated after today), or null before any log. */
export function firstLogDay(events: readonly GameEvent[], now: number): string | null {
  return earliest(loggedDays(events, dayKey(now)))
}
