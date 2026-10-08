// Creating events. The caller supplies the time and the id; nothing here reads the clock.

import type { RewardConfig } from '../config/rewards'
import type { StreakConfig } from '../config/streaks'
import { dayKey } from './day'
import { milestoneReward, rollReward } from './rewards'
import { activeLogs, dragonStage, heldStage, stageFor, taskAvailability } from './state'
import { streakMilestoneReached } from './streaks'
import type { GameEvent, LogEvent, RewardRoll, Settings, Stage, Task, UndoEvent } from './types'

/** The config a new log is judged by: stage thresholds, reward odds and streak rules. */
export interface LogRules {
  stages: readonly Stage[]
  rewards: RewardConfig
  streaks: StreakConfig
}

/**
 * A new log for `task`, or null if the task's rules don't allow a log right now.
 *
 * If the dragon's stage after this log is higher than the highest stage recorded so
 * far, the log records it as `stageReached`, so a later threshold change can't take
 * it away. That covers crossing a threshold, and also the first log after a stage
 * that came only from XP (older data, or a lowered threshold).
 *
 * `roll` is the caller's random draw for the variable reward (see rollReward). The
 * reward is attached before the stage is worked out, so a treat's bonus that crosses
 * a threshold is recorded too.
 *
 * A log that takes the overall streak to one of `streaks.milestones` for the first
 * time ever (judged from `events`, so undoing it lets it be earned again) brings a
 * guaranteed item instead of the roll, saved with the milestone. With every item
 * already found, the normal roll applies.
 */
export function createLogEvent(
  task: Task,
  events: readonly GameEvent[],
  settings: Settings,
  now: number,
  id: string,
  roll: RewardRoll,
  { stages, rewards, streaks }: LogRules,
): LogEvent | null {
  if (!taskAvailability(task, events, settings, now).canLog) return null
  const event: LogEvent = { id, type: 'log', taskId: task.id, timestamp: now, xpAwarded: task.xp }
  const milestone = streakMilestoneReached(events, event, streaks)
  const reward =
    (milestone !== null ? milestoneReward(events, roll, rewards, milestone) : undefined) ??
    rollReward(task, events, roll, rewards)
  if (reward) event.reward = reward
  const after = dragonStage([...events, event], stages)
  // With nothing recorded yet, the first stage needs no record.
  const recorded = heldStage(events, stages) ?? stageFor(Number.NEGATIVE_INFINITY, stages)
  if (after.xpFrom > recorded.xpFrom) event.stageReached = after.id
  return event
}

/**
 * The log that "Undo last log" would undo: the most recently appended active log
 * from today. Append order (not timestamp) decides, so a phone clock change can't
 * make undo skip the log you just tapped. Logs from earlier days can't be undone.
 */
export function undoableLog(events: readonly GameEvent[], now: number): LogEvent | null {
  const today = dayKey(now)
  const logs = activeLogs(events)
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i] as LogEvent
    if (dayKey(log.timestamp) === today) return log
  }
  return null
}

/** An undo for the undoable log, or null if there's nothing to undo. */
export function createUndoEvent(
  events: readonly GameEvent[],
  now: number,
  id: string,
): UndoEvent | null {
  const target = undoableLog(events, now)
  if (!target) return null
  return { id, type: 'undo', targetEventId: target.id, timestamp: now }
}
