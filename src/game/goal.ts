// The weekly goal (Milestone 8, slice 1): one task, so many different days a week,
// Monday to Sunday as in History. Everything is worked out from the event log, so
// undoing a log recalculates it. Pure: the time is passed in.
//
// Decided 2026-10-13:
// - Meeting the goal brings a goal treat (bonus XP from config), saved on the log that
//   earns it. At most one a week: the first log of the goal task on a new day that
//   leaves the week's distinct-day count at or above the target earns it, if no active
//   log this week already holds one. So a streak-milestone find on the meeting log, or
//   a target lowered to (or below) the count, moves the treat to the next new day.
//   Undoing that log takes the treat with it; logging again earns it back.
// - There's no goal history. Progress counts this week's logs from its first day, so an
//   edit applies from the current week on, and past weeks are fixed by the rewards
//   already saved on their logs.
// - For the wake-up task a week can't ask for more days than it has wake targets.

import type { GoalConfig } from '../config/goal'
import { activeLogs } from './active'
import { dayKey, daysBetween, minutesSinceDayStart, shiftDayKey, weekdayOf } from './day'
import { scheduleOn } from './settings'
import { wakeDeadline } from './state'
import { hasTarget, loggedDays, weekStartKey } from './streaks'
import type { GameEvent, Goal, LogEvent, Reward, Settings, Task } from './types'

export interface GoalProgress {
  task: Task
  /** Distinct game days this week with an active log of the task, today included. Can pass the target. */
  done: number
  /** Days this week the goal asks for (the wake-up task's capped to its target days). */
  target: number
  /** Days left in the week, today included (1 on the last day). */
  daysLeft: number
  /** Whether `done` has reached `target`. */
  met: boolean
  /** Whether the goal task has an active log today (game day). */
  loggedToday: boolean
  /**
   * Days left this week, today included, on which a log of the task could still count:
   * `daysLeft`, except for the wake-up task, where it's the days left with a wake
   * target, today only while its window is still open (see wakeDeadline).
   */
  chancesLeft: number
}

/** The goal's days a week as set, held to the config's bounds. */
function setDays(goal: Goal, config: GoalConfig): number {
  return Math.min(config.maxDays, Math.max(config.minDays, Math.round(goal.daysPerWeek)))
}

/**
 * The most days a goal for `task` can ask for in the week holding `now`: the config's
 * maximum, or for the wake-up task, the days that week with a wake target (each day
 * judged by the schedule in force on it, see scheduleOn). Can be 0 for a wake-up week
 * with no targets.
 */
export function goalMaxDays(task: Task, settings: Settings, now: number, config: GoalConfig): number {
  if (task.rules.kind !== 'wakeUp') return config.maxDays
  const start = weekStartKey(dayKey(now), config.weekStart)
  let days = 0
  for (let i = 0; i < 7; i++) {
    const d = shiftDayKey(start, i)
    if (hasTarget(scheduleOn(settings, d), weekdayOf(d))) days++
  }
  return Math.min(config.maxDays, days)
}

/** The week's target for a goal on `task`, or 0 if the week can't hold one (see goalMaxDays). */
function weekTarget(goal: Goal, task: Task, settings: Settings, now: number, config: GoalConfig): number {
  return Math.min(setDays(goal, config), goalMaxDays(task, settings, now, config))
}

/** Distinct days this week (from `weekStart` to `today`) with an active log of `taskId`. */
function daysThisWeek(events: readonly GameEvent[], taskId: string, weekStart: string, today: string): Set<string> {
  const days = loggedDays(events, today, new Set([taskId]))
  for (const d of days) if (d < weekStart) days.delete(d)
  return days
}

/**
 * How this week's goal is going, or null with no goal, a goal task that's archived or
 * unknown, or a wake-up week with no targets. A task logged twice in a day counts that
 * day once; logs dated after today are ignored.
 */
export function goalProgress(
  events: readonly GameEvent[],
  tasks: readonly Task[],
  settings: Settings,
  now: number,
  config: GoalConfig,
): GoalProgress | null {
  const goal = settings.goal
  if (!goal) return null
  const task = tasks.find((t) => t.id === goal.taskId)
  if (!task || task.archived) return null
  const target = weekTarget(goal, task, settings, now, config)
  if (target < 1) return null
  const today = dayKey(now)
  const start = weekStartKey(today, config.weekStart)
  const days = daysThisWeek(events, task.id, start, today)
  const done = days.size
  const daysLeft = daysBetween(today, shiftDayKey(start, 6)) + 1
  const chancesLeft = task.rules.kind === 'wakeUp' ? wakeChancesLeft(settings, now, today, daysLeft) : daysLeft
  return { task, done, target, daysLeft, met: done >= target, loggedToday: days.has(today), chancesLeft }
}

/** The wake-up task's chances left this week (see GoalProgress.chancesLeft). */
function wakeChancesLeft(settings: Settings, now: number, today: string, daysLeft: number): number {
  const deadline = wakeDeadline(settings, now)
  let chances = deadline !== null && minutesSinceDayStart(now) <= deadline ? 1 : 0
  for (let i = 1; i < daysLeft; i++) {
    const d = shiftDayKey(today, i)
    if (hasTarget(scheduleOn(settings, d), weekdayOf(d))) chances++
  }
  return chances
}

/**
 * Whether the dragon is wistful about the weekly goal (Milestone 8, slice 2). It's a
 * soft touch on top of the mood, about the goal and never about me, and it changes
 * nothing else (XP, stats, stage, streaks, rewards). True only while all hold:
 * - there's a goal this week and it isn't met yet;
 * - the goal task hasn't been logged today, so a log lifts it straight away;
 * - the week can still be met: the days needed fit in the chances left (the days
 *   left, today included; for the wake-up task only those with a wake target, and
 *   today only while its window is open). Once it can't, it goes quiet: a lost week
 *   is never dwelt on;
 * - it's tight: the days needed are more than the chances left less the buffer.
 * A new week starts with nothing done and seven days left, so it resets on Monday.
 */
export function goalWistful(progress: GoalProgress | null, config: Pick<GoalConfig, 'wistfulBuffer'>): boolean {
  if (!progress || progress.met || progress.loggedToday) return false
  const needed = progress.target - progress.done
  return needed <= progress.chancesLeft && needed > progress.chancesLeft - config.wistfulBuffer
}

/** Whether a log holds a goal treat. Checks the shape at run time, like treatBonus. */
export function isGoalTreat(log: LogEvent): boolean {
  const reward: unknown = log.reward
  if (typeof reward !== 'object' || reward === null) return false
  const r = reward as { kind?: unknown; goal?: unknown }
  return r.kind === 'treat' && r.goal === true
}

/**
 * The goal treat for a new `log` of `task`, or undefined. `events` are the events
 * before it; the log's own timestamp is "now". It's earned only when:
 * - the log is of the goal task and its first active log on that game day (a second
 *   log the same day never earns it), and
 * - this week's distinct-day count with it is at least the target (capped as in
 *   goalProgress), and
 * - no active log this week already holds a goal treat.
 * So if the meeting log's reward went to something else (a streak-milestone find), or
 * the target was lowered to the count or below, the next new day of the task earns it.
 * A bonus of 0 (or less) in config gives none.
 */
export function goalRewardFor(
  events: readonly GameEvent[],
  log: LogEvent,
  task: Task,
  settings: Settings,
  config: GoalConfig,
): Reward | undefined {
  const goal = settings.goal
  if (!goal || goal.taskId !== log.taskId || task.id !== log.taskId || config.bonusXp <= 0) return undefined
  const now = log.timestamp
  const target = weekTarget(goal, task, settings, now, config)
  if (target < 1) return undefined
  const today = dayKey(now)
  const start = weekStartKey(today, config.weekStart)
  const before = daysThisWeek(events, task.id, start, today)
  if (before.has(today) || before.size + 1 < target) return undefined
  const end = shiftDayKey(start, 6)
  const already = activeLogs(events).some((l) => {
    const d = dayKey(l.timestamp)
    return d >= start && d <= end && isGoalTreat(l)
  })
  return already ? undefined : { kind: 'treat', bonusXp: config.bonusXp, goal: true }
}

/**
 * A stored goal, checked: a non-empty task id and a whole number of days a week within
 * the config's bounds. Anything else (a later version's shape, a hand edit) is null,
 * so a malformed goal is dropped rather than trusted. Whether the task exists is
 * decided later (see goalProgress), so a goal on an archived task is kept.
 */
export function cleanGoal(raw: unknown, config: Pick<GoalConfig, 'minDays' | 'maxDays'>): Goal | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const { taskId, daysPerWeek } = raw as { taskId?: unknown; daysPerWeek?: unknown }
  if (typeof taskId !== 'string' || taskId === '') return null
  if (typeof daysPerWeek !== 'number' || !Number.isInteger(daysPerWeek)) return null
  if (daysPerWeek < config.minDays || daysPerWeek > config.maxDays) return null
  return { taskId, daysPerWeek }
}

/** Settings with the goal set to `goal` (null for no goal), from this week on. */
export function withGoal(settings: Settings, goal: Goal | null): Settings {
  return { ...settings, goal: goal ? { taskId: goal.taskId, daysPerWeek: goal.daysPerWeek } : null }
}
