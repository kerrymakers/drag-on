// Creating events. The caller supplies the time and the id; nothing here reads the clock.

import type { GoalConfig } from '../config/goal'
import type { MissionConfig } from '../config/missions'
import type { RewardConfig } from '../config/rewards'
import type { StreakConfig } from '../config/streaks'
import { dayKey } from './day'
import { goalRewardFor } from './goal'
import { missionFor, missionGrantFor } from './mission'
import { rollNatureFind } from './nature'
import { milestoneReward, rollReward } from './rewards'
import { activeLogs, dragonStage, heldStage, stageFor, taskAvailability } from './state'
import { streakMilestoneReached } from './streaks'
import { taskXp } from './tasks'
import type { EffortLevel, GameEvent, LogEvent, NatureFind, RewardRoll, Settings, Stage, Task, UndoEvent } from './types'

/**
 * The config a new log is judged by: stage thresholds, reward odds, streak rules, the
 * effort levels that set a task's XP and the weekly goal's treat, and (optionally)
 * the nature finds and the one task whose logs bring them.
 */
export interface LogRules {
  stages: readonly Stage[]
  rewards: RewardConfig
  streaks: StreakConfig
  effortLevels: readonly EffortLevel[]
  goal: GoalConfig
  nature?: { taskId: string; finds: readonly NatureFind[] }
}

/**
 * A new log for `task`, or null if the task's rules don't allow a log right now.
 * It's worth the task's XP now (see taskXp: its effort level's, else its stored XP),
 * saved on the log so later edits never change it. A treat is a share of that XP.
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
 *
 * Next, a log that earns the week's goal treat (see goalRewardFor) brings it instead
 * of the roll. One reward per log: if a milestone takes the meeting log, the goal
 * treat falls to the goal task's next new day that week.
 *
 * With `wish` (the task list and mission config), a log that grants the day's secret
 * wish (see missionFor and missionGrantFor, using `settings.missionSeed`) saves the
 * grant as `mission`. It's separate from the reward above and stacks with it, and it's
 * attached before the stage is worked out too. Without `wish`, or with no seed, there's
 * no wish.
 *
 * With `nature`, a log of `nature.taskId` (only that task, matched by id) brings a
 * nature find picked by `roll.nature` (see rollNatureFind), saved as `nature`. It's
 * worth no XP and stacks with everything above. No `roll.nature`, no find.
 */
export function createLogEvent(
  task: Task,
  events: readonly GameEvent[],
  settings: Settings,
  now: number,
  id: string,
  roll: RewardRoll,
  { stages, rewards, streaks, effortLevels, goal, nature }: LogRules,
  wish?: { tasks: readonly Task[]; missions: MissionConfig },
): LogEvent | null {
  if (!taskAvailability(task, events, settings, now).canLog) return null
  const xp = taskXp(task, effortLevels)
  const event: LogEvent = { id, type: 'log', taskId: task.id, timestamp: now, xpAwarded: xp }
  const milestone = streakMilestoneReached(events, event, streaks)
  const reward =
    (milestone !== null ? milestoneReward(events, roll, rewards, milestone) : undefined) ??
    goalRewardFor(events, event, task, settings, goal) ??
    rollReward(xp === task.xp ? task : { ...task, xp }, events, roll, rewards)
  if (reward) event.reward = reward
  if (wish) {
    const mission = missionFor(dayKey(now), settings.missionSeed, wish.tasks, events, wish.missions)
    const grant = missionGrantFor(mission, events, event, wish.tasks, wish.missions)
    if (grant) event.mission = grant
  }
  if (nature && task.id === nature.taskId && roll.nature !== undefined) {
    const id = rollNatureFind(events, nature.finds, now, roll.nature)
    if (id !== null) event.nature = { id }
  }
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
