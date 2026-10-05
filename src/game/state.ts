// Derived state, calculated from the event log every time. Nothing here is stored.

import { WAKE_GRACE_MINUTES } from '../config/time'
import { clockToDayMinutes, dayKey, minutesSinceDayStart, weekdayOf } from './day'
import type { GameEvent, LogEvent, Settings, Stage, Task, TaskAvailability } from './types'

/** Log events that haven't been undone, in the order they were appended. */
export function activeLogs(events: readonly GameEvent[]): LogEvent[] {
  const undone = new Set<string>()
  for (const e of events) if (e.type === 'undo') undone.add(e.targetEventId)
  return events.filter((e): e is LogEvent => e.type === 'log' && !undone.has(e.id))
}

/** Total XP from active logs, using the XP saved on each event. */
export function totalXp(events: readonly GameEvent[]): number {
  return activeLogs(events).reduce((sum, e) => sum + e.xpAwarded, 0)
}

function sortedStages(stages: readonly Stage[]): Stage[] {
  if (stages.length === 0) throw new Error('No stages configured')
  return [...stages].sort((a, b) => a.xpFrom - b.xpFrom)
}

/** The highest stage whose threshold has been reached (the first stage if none). */
export function stageFor(xp: number, stages: readonly Stage[]): Stage {
  const sorted = sortedStages(stages)
  let current = sorted[0] as Stage
  for (const s of sorted) if (xp >= s.xpFrom) current = s
  return current
}

export interface StageProgress {
  stage: Stage
  /** null at the final stage. */
  next: Stage | null
  /** XP earned since this stage began. */
  xpIntoStage: number
  /** XP still needed to reach the next stage (0 at the final stage). */
  xpToNext: number
  /** 0 to 1, for the XP bar. 1 at the final stage. */
  fraction: number
}

export function progressToNextStage(xp: number, stages: readonly Stage[]): StageProgress {
  const sorted = sortedStages(stages)
  const stage = stageFor(xp, sorted)
  const next = sorted.find((s) => s.xpFrom > stage.xpFrom) ?? null
  const xpIntoStage = Math.max(0, xp - stage.xpFrom)
  if (!next) return { stage, next, xpIntoStage, xpToNext: 0, fraction: 1 }
  const span = next.xpFrom - stage.xpFrom
  return {
    stage,
    next,
    xpIntoStage,
    xpToNext: next.xpFrom - xp,
    fraction: Math.min(1, xpIntoStage / span),
  }
}

/** Active logs of one task on the same game day as `now`. */
export function countToday(taskId: string, events: readonly GameEvent[], now: number): number {
  const today = dayKey(now)
  return activeLogs(events).filter((e) => e.taskId === taskId && dayKey(e.timestamp) === today)
    .length
}

/**
 * The last wall-clock minute (since 04:00) at which the wake-up task counts today,
 * or null if today has no wake target. The cutoff is inclusive to the minute:
 * with a 06:30 target, 06:45:59 counts and 06:46:00 doesn't.
 */
export function wakeDeadline(settings: Settings, now: number): number | null {
  const target = settings.wakeSchedule[weekdayOf(dayKey(now))]
  if (target == null) return null
  const minutes = clockToDayMinutes(target)
  return minutes == null ? null : minutes + WAKE_GRACE_MINUTES
}

const HIDDEN = (count: number, limit: number): TaskAvailability => ({
  visible: false,
  canLog: false,
  countToday: count,
  limit,
})

export function taskAvailability(
  task: Task,
  events: readonly GameEvent[],
  settings: Settings,
  now: number,
): TaskAvailability {
  const count = countToday(task.id, events, now)
  const rules = task.rules

  if (rules.kind === 'wakeUp') {
    const limit = 1
    if (task.archived) return HIDDEN(count, limit)
    const deadline = wakeDeadline(settings, now)
    // Days with no target are skipped, not missed.
    if (deadline == null) return HIDDEN(count, limit)
    // Once logged, it stays on screen as done for the rest of the day.
    if (count >= limit) return { visible: true, canLog: false, countToday: count, limit }
    if (minutesSinceDayStart(now) <= deadline) {
      return { visible: true, canLog: true, countToday: count, limit }
    }
    // The window closed without a log: quietly hide it.
    return HIDDEN(count, limit)
  }

  const limit = rules.kind === 'oncePerDay' ? 1 : rules.max
  if (task.archived) return HIDDEN(count, limit)
  return { visible: true, canLog: count < limit, countToday: count, limit }
}
