import type { Task } from '../game/types'

// Task ids are stable: events refer to them, so never rename an id.
export const TASKS: readonly Task[] = [
  {
    id: 'wake',
    name: 'Got up on time',
    stat: 'discipline',
    xp: 30,
    rules: { kind: 'wakeUp' },
    archived: false,
  },
  {
    id: 'gym',
    name: 'Gym / workout',
    stat: 'strength',
    xp: 40,
    rules: { kind: 'oncePerDay' },
    archived: false,
  },
  {
    id: 'walk',
    name: 'Went for a walk',
    stat: 'strength',
    xp: 15,
    rules: { kind: 'oncePerDay' },
    archived: false,
  },
  {
    id: 'read',
    name: 'Read for 20 minutes',
    stat: 'wisdom',
    xp: 25,
    rules: { kind: 'oncePerDay' },
    archived: false,
  },
  {
    id: 'selfcare',
    name: 'Looked after myself',
    stat: 'heart',
    xp: 25,
    rules: { kind: 'oncePerDay' },
    archived: false,
  },
  {
    id: 'avoided',
    name: "Something I've been avoiding",
    stat: 'discipline',
    xp: 15,
    rules: { kind: 'maxPerDay', max: 2 },
    archived: false,
  },
]

// Task editing in Settings (Milestone 6, slice 3). Set 2026-10-09 after simulation
// (see SPEC.md, Tasks): higher caps let a typical dragon reach Elder in a few months
// and finish the collection long before it.

/** The XP stepper's bounds and step. */
export const TASK_XP_MIN = 5
export const TASK_XP_MAX = 50
export const TASK_XP_STEP = 5
/** The longest task name, in characters (counted like the dragon's name). */
export const TASK_NAME_MAX = 40
/** The most "times a day" a task can be set to. */
export const TASK_TIMES_A_DAY_MAX = 3
/** A task's XP × times a day can't go over this (e.g. 25 XP at twice a day, 15 at three times). */
export const TASK_DAILY_XP_MAX = 50
/** The most tasks that can be active (not archived) at once, so Home stays manageable. */
export const MAX_ACTIVE_TASKS = 8
/** A new task's starting XP and times a day. */
export const NEW_TASK_XP = 15
export const NEW_TASK_TIMES_A_DAY = 1
/**
 * Every task added in Settings has an id starting with this, so it can never clash with
 * a built-in id. Built-in ids above must never start with it.
 */
export const NEW_TASK_ID_PREFIX = 'my-'

/** The limits task editing works within, all from the values above. */
export const TASK_LIMITS = {
  xpMin: TASK_XP_MIN,
  xpMax: TASK_XP_MAX,
  xpStep: TASK_XP_STEP,
  nameMax: TASK_NAME_MAX,
  timesADayMax: TASK_TIMES_A_DAY_MAX,
  dailyXpMax: TASK_DAILY_XP_MAX,
  maxActive: MAX_ACTIVE_TASKS,
} as const
