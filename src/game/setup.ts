// First-run setup (Milestone 9, slice 2): what a new friend picks before their egg
// arrives, turned into settings in one go. Pure: the time and config are passed in.
//
// Each choice is optional. One that's left out (its step skipped) changes nothing,
// so skipping everything gives back the settings as they were.

import type { GoalConfig } from '../config/goal'
import { cleanGoal, withGoal } from './goal'
import { cleanDragonName, withScheduleEdit } from './settings'
import { archiveTask, effectiveTasks, withTasks } from './tasks'
import type { Goal, Settings, Task, WakeSchedule } from './types'

export interface SetupChoices {
  /** The name as typed (tidied here, blank is no name). Absent: unchanged. */
  name?: string
  /** A colour id the art knows. Absent: unchanged (classic). */
  colour?: string
  /**
   * The ids of the tasks to keep on. Every other active task is archived, never
   * deleted. Absent, or a list that would leave no task on: unchanged.
   */
  keepTasks?: readonly string[]
  /** The wake-up times, from today on. Ignored while the wake-up task isn't on. */
  wakeSchedule?: WakeSchedule
  /** The weekly goal, or null for none. Dropped if malformed or its task isn't on. */
  goal?: Goal | null
}

export interface SetupRules {
  /** The built-in tasks (config: TASKS). */
  defaults: readonly Task[]
  /** The longest dragon name (config: DRAGON_NAME_MAX). */
  nameMax: number
  /** The weekly goal's bounds (config: GOAL). */
  goal: Pick<GoalConfig, 'minDays' | 'maxDays'>
}

/** The tasks left on after `keep`, or null if that would leave none (then nothing changes). */
function keptTasks(tasks: readonly Task[], keep: readonly string[]): Task[] | null {
  const ids = new Set(keep)
  let next = [...tasks]
  for (const t of tasks) if (!t.archived && !ids.has(t.id)) next = archiveTask(next, t.id)
  return next.some((t) => !t.archived) ? next : null
}

/** Settings with the first-run choices applied (see SetupChoices). */
export function applySetup(settings: Settings, choices: SetupChoices, now: number, rules: SetupRules): Settings {
  let next = settings
  if (choices.name !== undefined) next = { ...next, dragonName: cleanDragonName(choices.name, rules.nameMax) }
  if (choices.colour) next = { ...next, dragonColour: choices.colour }

  const tasks = effectiveTasks(next, rules.defaults)
  if (choices.keepTasks) {
    const kept = keptTasks(tasks, choices.keepTasks)
    // Nothing archived: leave the list unstored, as if never edited.
    if (kept && kept.some((t, i) => t.archived !== tasks[i]?.archived)) next = withTasks(next, kept, rules.defaults)
  }
  const active = effectiveTasks(next, rules.defaults).filter((t) => !t.archived)

  const wakeOn = active.some((t) => t.rules.kind === 'wakeUp')
  if (choices.wakeSchedule && wakeOn) next = withScheduleEdit(next, choices.wakeSchedule, now)

  if (choices.goal !== undefined) {
    const goal = choices.goal === null ? null : cleanGoal(choices.goal, rules.goal)
    next = withGoal(next, goal && active.some((t) => t.id === goal.taskId) ? goal : null)
  }
  return next
}
