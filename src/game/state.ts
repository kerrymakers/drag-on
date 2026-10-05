// Derived state, calculated from the event log every time. Nothing here is stored.

import { WAKE_GRACE_MINUTES } from '../config/time'
import {
  clockToDayMinutes,
  dayKey,
  daysBetween,
  instantInDay,
  minutesSinceDayStart,
  nextDayStart,
  weekdayOf,
} from './day'
import type {
  GameEvent,
  LogEvent,
  MoodId,
  MoodLevel,
  Settings,
  Stage,
  Task,
  TaskAvailability,
} from './types'

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

/** The highest stage recorded on an active log, ignoring ids no longer in config. */
export function heldStage(events: readonly GameEvent[], stages: readonly Stage[]): Stage | null {
  const byId = new Map(stages.map((s) => [s.id, s]))
  let held: Stage | null = null
  for (const log of activeLogs(events)) {
    const s = log.stageReached === undefined ? undefined : byId.get(log.stageReached)
    if (s && (!held || s.xpFrom > held.xpFrom)) held = s
  }
  return held
}

/**
 * The dragon's stage: the higher of the stage its XP earns and the highest stage
 * recorded on an active log. Raising a threshold never takes a stage away;
 * lowering one raises the stage straight away.
 */
export function dragonStage(events: readonly GameEvent[], stages: readonly Stage[]): Stage {
  const byXp = stageFor(totalXp(events), stages)
  const held = heldStage(events, stages)
  return held && held.xpFrom > byXp.xpFrom ? held : byXp
}

export interface StageProgress {
  stage: Stage
  /** null at the final stage. */
  next: Stage | null
  /** XP earned since this stage began (0 if the stage is held above the XP). */
  xpIntoStage: number
  /** XP still needed to reach the next stage's threshold (0 at the final stage). */
  xpToNext: number
  /** 0 to 1, for the XP bar. 1 at the final stage. */
  fraction: number
}

/**
 * Progress from `stage` (default: the stage `xp` earns) toward the next one.
 * Passing a held stage that's ahead of the XP gives fraction 0 and the XP still
 * needed to reach the next stage's threshold. A `held` stage at or below the stage
 * the XP earns is ignored: the XP stage wins.
 */
export function progressToNextStage(xp: number, stages: readonly Stage[], held?: Stage): StageProgress {
  const sorted = sortedStages(stages)
  const byXp = stageFor(xp, sorted)
  const stage = held && held.xpFrom > byXp.xpFrom ? held : byXp
  const next = sorted.find((s) => s.xpFrom > stage.xpFrom) ?? null
  const xpIntoStage = Math.max(0, xp - stage.xpFrom)
  if (!next) return { stage, next, xpIntoStage, xpToNext: 0, fraction: 1 }
  const span = next.xpFrom - stage.xpFrom
  return {
    stage,
    next,
    xpIntoStage,
    xpToNext: Math.max(0, next.xpFrom - xp),
    fraction: Math.min(1, xpIntoStage / span),
  }
}

/** The dragon's progress, taking a held stage into account. */
export function dragonProgress(events: readonly GameEvent[], stages: readonly Stage[]): StageProgress {
  return progressToNextStage(totalXp(events), stages, dragonStage(events, stages))
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

/**
 * The stage the dragon has grown into between two versions of the event log, if it's
 * higher than before; otherwise null. If one log crosses several thresholds, this is
 * the highest. Going down (undo) is never a stage-up.
 */
export function stageUp(
  before: readonly GameEvent[],
  after: readonly GameEvent[],
  stages: readonly Stage[],
): Stage | null {
  const was = dragonStage(before, stages)
  const now = dragonStage(after, stages)
  return now.xpFrom > was.xpFrom ? now : null
}

/**
 * The next moment after `now` when what the home screen shows can change on its own:
 * the next 04:00 day start, or the minute the wake-up window closes if that's sooner.
 */
export function nextRefreshAt(settings: Settings, now: number): number {
  const dayStart = nextDayStart(now)
  const deadline = wakeDeadline(settings, now)
  if (deadline == null) return dayStart
  // The window closes at the start of the minute after the (inclusive) deadline minute.
  const closes = instantInDay(dayKey(now), deadline + 1)
  return closes > now && closes < dayStart ? closes : dayStart
}

export interface Mood {
  mood: MoodId
  /** Whole game days since the newest active log, or null if there are no logs. */
  daysSinceLog: number | null
  /** The game day of the newest active log (where the current gap began), or null. */
  lastLogDay: string | null
}

/**
 * How the dragon feels: by whole game days since the newest active (not undone) log.
 * With no logs at all it's happy. A log dated in the future (clock skew) counts as today.
 */
export function moodFor(events: readonly GameEvent[], now: number, moods: readonly MoodLevel[]): Mood {
  if (moods.length === 0) throw new Error('No moods configured')
  const sorted = [...moods].sort((a, b) => a.fromDays - b.fromDays)
  const first = sorted[0] as MoodLevel
  const logs = activeLogs(events)
  if (logs.length === 0) return { mood: first.id, daysSinceLog: null, lastLogDay: null }
  const newest = logs.reduce((a, b) => (b.timestamp > a.timestamp ? b : a))
  const lastLogDay = dayKey(newest.timestamp)
  const days = Math.max(0, daysBetween(lastLogDay, dayKey(now)))
  let mood = first
  for (const m of sorted) if (days >= m.fromDays) mood = m
  return { mood: mood.id, daysSinceLog: days, lastLogDay }
}
