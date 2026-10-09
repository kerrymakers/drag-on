import type { EffortId, EffortLevel, Task } from '../game/types'

// "How hard is this for you?" (Milestone 7, slice 1, 2026-10-09). A task's XP comes from
// its level, and the level caps how many times a day it can be logged, so XP × times a
// day stays within TASK_DAILY_XP_MAX (45, 50 and 40). Ids are stable: tasks refer to them.
export const EFFORT_LEVELS: readonly EffortLevel[] = [
  { id: 'nudge', label: 'A little nudge', xp: 15, maxTimesADay: 3 },
  { id: 'effort', label: 'Takes effort', xp: 25, maxTimesADay: 2 },
  { id: 'hard', label: 'Really hard', xp: 40, maxTimesADay: 1 },
]

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
    effort: 'hard',
  },
  {
    id: 'walk',
    name: 'Went for a walk',
    stat: 'strength',
    xp: 15,
    rules: { kind: 'oncePerDay' },
    archived: false,
    effort: 'nudge',
  },
  {
    id: 'read',
    name: 'Read for 20 minutes',
    stat: 'wisdom',
    xp: 25,
    rules: { kind: 'oncePerDay' },
    archived: false,
    effort: 'effort',
  },
  {
    id: 'selfcare',
    name: 'Looked after myself',
    stat: 'heart',
    xp: 25,
    rules: { kind: 'oncePerDay' },
    archived: false,
    effort: 'effort',
  },
  {
    id: 'avoided',
    name: "Something I've been avoiding",
    stat: 'discipline',
    xp: 15,
    rules: { kind: 'maxPerDay', max: 2 },
    archived: false,
    effort: 'nudge',
  },
]

// Task editing in Settings (Milestone 6, slice 3). Set 2026-10-09 after simulation
// (see SPEC.md, Tasks): higher caps let a typical dragon reach Elder in a few months
// and finish the collection long before it.

/** The longest task name, in characters (counted like the dragon's name). */
export const TASK_NAME_MAX = 40
/** The most "times a day" any task can be set to (each effort level has its own cap too). */
export const TASK_TIMES_A_DAY_MAX = 3
/**
 * A task's XP × times a day can't go over this. The effort levels are set to fit it;
 * for an older task with no level, it caps times a day at its stored XP.
 */
export const TASK_DAILY_XP_MAX = 50
/** The most tasks that can be active (not archived) at once, so Home stays manageable. */
export const MAX_ACTIVE_TASKS = 8
/** A new task's starting effort level and times a day. */
export const NEW_TASK_EFFORT: EffortId = 'nudge'
export const NEW_TASK_TIMES_A_DAY = 1
/**
 * Every task added in Settings has an id starting with this, so it can never clash with
 * a built-in id. Built-in ids above must never start with it.
 */
export const NEW_TASK_ID_PREFIX = 'my-'

/** The limits task editing works within, all from the values above. */
export const TASK_LIMITS = {
  nameMax: TASK_NAME_MAX,
  timesADayMax: TASK_TIMES_A_DAY_MAX,
  dailyXpMax: TASK_DAILY_XP_MAX,
  maxActive: MAX_ACTIVE_TASKS,
} as const
