// The task list and edits to it (Milestone 6, slice 3). Pure: every edit takes a list
// and returns a new one, for the caller to save on Settings.
//
// - A task's id and stat never change once it exists (decided 2026-10-09: changing
//   the stat would rewrite past stats and the dragon's look).
// - XP comes from the task's effort level (Milestone 7, see taskXp). Level changes only
//   affect future logs: each log saves its own XP when it's made.
// - Tasks are never deleted, only archived. Deleting one would orphan its past logs.

import { cleanText } from './settings'
import type { EffortId, EffortLevel, Settings, StatId, Task, TaskRules } from './types'

/** The bounds task editing works within (config: TASK_LIMITS). */
export interface TaskLimits {
  /** The longest name, in characters. */
  nameMax: number
  /** The most "times a day" any task can be set to (an effort level may allow fewer). */
  timesADayMax: number
  /** A task's XP × times a day can't go over this (caps times a day for a task with no level). */
  dailyXpMax: number
  /** The most active (not archived) tasks at once. */
  maxActive: number
}

const STAT_IDS: readonly StatId[] = ['strength', 'discipline', 'wisdom', 'heart']
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isText = (v: unknown): v is string => typeof v === 'string' && v.trim() !== ''

/** Whether a rules value is one this version knows. */
function isRules(v: unknown): v is TaskRules {
  if (!isObject(v)) return false
  if (v.kind === 'wakeUp' || v.kind === 'oncePerDay') return true
  return v.kind === 'maxPerDay' && typeof v.max === 'number' && Number.isInteger(v.max) && v.max >= 1
}

/**
 * Whether a stored entry is a task this version can use: an id and a name that are
 * non-empty strings, one of the four stats, a positive finite XP, rules of a known
 * shape and a true/false `archived`. Fields it doesn't know about don't matter, and
 * neither does `effort`: missing or unknown, the stored XP applies (see taskXp).
 */
export function isReadableTask(v: unknown): v is Task {
  return (
    isObject(v) &&
    isText(v.id) &&
    isText(v.name) &&
    typeof v.stat === 'string' &&
    (STAT_IDS as readonly string[]).includes(v.stat) &&
    typeof v.xp === 'number' &&
    Number.isFinite(v.xp) &&
    v.xp > 0 &&
    isRules(v.rules) &&
    typeof v.archived === 'boolean'
  )
}

/** One place in the stored list that the app uses: the task, and where it came from. */
interface Slot {
  /** Its index in the stored list. */
  index: number
  task: Task
  /** A built-in task's config default, standing in for a stored entry this version can't read. */
  restored: boolean
}

/**
 * The stored entries the app uses, in order. A readable task is used unless an earlier
 * entry already has its id. An unreadable entry whose id is a built-in task's (not seen
 * yet) gets that task's config default, in the same place. Anything else is left out,
 * but stays in the stored list (see withTasks), so a later version can still read it.
 */
function slotsOf(stored: readonly unknown[], defaults: readonly Task[]): Slot[] {
  const builtIn = new Map(defaults.map((t) => [t.id, t]))
  const seen = new Set<string>()
  const slots: Slot[] = []
  stored.forEach((entry, index) => {
    if (isReadableTask(entry)) {
      if (seen.has(entry.id)) return
      seen.add(entry.id)
      slots.push({ index, task: entry, restored: false })
      return
    }
    const id = isObject(entry) ? entry.id : undefined
    const fallback = typeof id === 'string' && !seen.has(id) ? builtIn.get(id) : undefined
    if (!fallback) return
    seen.add(fallback.id)
    slots.push({ index, task: fallback, restored: true })
  })
  return slots
}

/**
 * The task list in use:
 * - with no stored list (never edited, or an older save), the config's defaults, so
 *   nothing changes until the first edit;
 * - otherwise the stored tasks this version can read, in order (see slotsOf: a built-in
 *   task it can't read gets its default back, in its place), then any default whose id
 *   isn't there, at the end, so a built-in task added in a later version still appears.
 */
export function effectiveTasks(settings: Pick<Settings, 'tasks'>, defaults: readonly Task[]): readonly Task[] {
  const stored = settings.tasks
  if (!stored) return defaults
  const tasks = slotsOf(stored, defaults).map((s) => s.task)
  const ids = new Set(tasks.map((t) => t.id))
  return [...tasks, ...defaults.filter((t) => !ids.has(t.id))]
}

/** Whether two tasks are the same in every field (unknown fields included). */
function sameTask(a: Task, b: Task): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Settings with an edited task list stored. `tasks` is the list in use after an edit
 * (from effectiveTasks, through the edit functions). Entries in the stored list that
 * this version can't use are kept exactly as they were, in place, so a save never
 * loses them. Each task goes back where it was; new ones go at the end. A built-in
 * task standing in for an unreadable entry replaces it only once it's been changed.
 */
export function withTasks(settings: Settings, tasks: readonly Task[], defaults: readonly Task[]): Settings {
  const stored = settings.tasks ?? []
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const next: unknown[] = [...stored]
  const placed = new Set<string>()
  for (const slot of slotsOf(stored, defaults)) {
    const task = byId.get(slot.task.id)
    if (!task) continue // never happens: tasks are never deleted
    placed.add(task.id)
    if (slot.restored && sameTask(task, slot.task)) continue
    next[slot.index] = { ...task }
  }
  for (const t of tasks) if (!placed.has(t.id)) next.push({ ...t })
  return { ...settings, tasks: next }
}

/** How many tasks aren't archived. */
export function activeTaskCount(tasks: readonly Task[]): number {
  return tasks.filter((t) => !t.archived).length
}

/** Whether another active task fits under the cap (for adding or unarchiving). */
export function hasRoomForTask(tasks: readonly Task[], limits: Pick<TaskLimits, 'maxActive'>): boolean {
  return activeTaskCount(tasks) < limits.maxActive
}

/** How many times a day a task can be logged, or null for the wake-up task (its schedule decides). */
export function timesADay(task: Task): number | null {
  switch (task.rules.kind) {
    case 'wakeUp':
      return null
    case 'oncePerDay':
      return 1
    case 'maxPerDay':
      return task.rules.max
  }
}

/** The rules for "times a day" `n`, kept within 1 and the limit: 1 is once a day. */
export function rulesForTimesADay(n: number, limits: Pick<TaskLimits, 'timesADayMax'>): TaskRules {
  const top = Math.max(1, Math.floor(limits.timesADayMax))
  const times = Number.isFinite(n) ? Math.min(top, Math.max(1, Math.round(n))) : 1
  return times === 1 ? { kind: 'oncePerDay' } : { kind: 'maxPerDay', max: times }
}

/**
 * The effort level `id` names, or null for none, or one this version doesn't know
 * (from a later version, or edited by hand: anything that isn't a known id string).
 */
export function effortLevel(id: unknown, levels: readonly EffortLevel[]): EffortLevel | null {
  if (typeof id !== 'string') return null
  return levels.find((l) => l.id === id) ?? null
}

/**
 * The XP a log of `task` is worth now: its effort level's XP, or its stored XP if it
 * has no level or one this version doesn't know.
 */
export function taskXp(task: Task, levels: readonly EffortLevel[]): number {
  return effortLevel(task.effort, levels)?.xp ?? task.xp
}

/**
 * The level to show for `task` in Settings (its row, and the choice already made when
 * its sheet opens): its saved level if this version knows it; otherwise the level
 * worth exactly its stored XP, so an older task at 15, 25 or 40 XP reads as that
 * level; otherwise none. Only for showing: saved data isn't changed until the sheet
 * is saved, and taskXp and maxTimesADay still go by the saved level alone.
 */
export function shownEffort(task: Pick<Task, 'xp' | 'effort'>, levels: readonly EffortLevel[]): EffortLevel | null {
  return effortLevel(task.effort, levels) ?? levels.find((l) => l.xp === task.xp) ?? null
}

/**
 * The most times a day `task` can be set to: its effort level's cap; with no known
 * level, as many as keep its stored XP × times a day within the daily limit (at least
 * once). Never above the overall limit.
 */
export function maxTimesADay(
  task: Pick<Task, 'xp' | 'effort'>,
  levels: readonly EffortLevel[],
  limits: Pick<TaskLimits, 'timesADayMax' | 'dailyXpMax'>,
): number {
  const top = Math.max(1, Math.floor(limits.timesADayMax))
  const level = effortLevel(task.effort, levels)
  const own = level ? level.maxTimesADay : task.xp > 0 ? limits.dailyXpMax / task.xp : top
  return Math.min(top, Math.max(1, Math.floor(Number.isFinite(own) ? own : 1)))
}

/** A task name tidied for saving (trimmed, cut to the limit), or null if blank. */
export function cleanTaskName(raw: string, limits: Pick<TaskLimits, 'nameMax'>): string | null {
  return cleanText(raw, limits.nameMax)
}

/** What the add sheet collects. */
export interface NewTask {
  name: string
  stat: StatId
  effort: EffortId
  timesADay: number
}

/**
 * The list with a new task at the end, or null if it can't be added: a blank name,
 * no room under the active-task cap, an id already in use, or an effort level this
 * version doesn't know. The name is tidied, the XP is the level's, and times a day is
 * kept within the level's cap. `id` comes from the caller (see newTaskId).
 */
export function addTask(
  tasks: readonly Task[],
  draft: NewTask,
  id: string,
  limits: TaskLimits,
  levels: readonly EffortLevel[],
): Task[] | null {
  const name = cleanTaskName(draft.name, limits)
  const level = effortLevel(draft.effort, levels)
  if (name === null || level === null || !hasRoomForTask(tasks, limits) || tasks.some((t) => t.id === id)) return null
  const top = maxTimesADay({ xp: level.xp, effort: level.id }, levels, limits)
  const task: Task = {
    id,
    name,
    stat: draft.stat,
    xp: level.xp,
    rules: rulesForTimesADay(draft.timesADay, { timesADayMax: top }),
    archived: false,
    effort: level.id,
  }
  return [...tasks, task]
}

/** What the edit sheet can change. The id and stat are never among them. */
export interface TaskChanges {
  name?: string
  /** An effort level id. One this version doesn't know is ignored. */
  effort?: EffortId
  /** Ignored for the wake-up task, whose rules never change. */
  timesADay?: number
}

/**
 * The list with one task's name, effort level or times a day changed. Its id, stat and
 * anything else on it stay as they were. A blank name keeps the old one.
 *
 * Picking a level sets the task's `xp` to the level's too, so older versions and
 * exports read the same XP. Times a day is kept within the cap (see maxTimesADay):
 * a harder level lowers it to fit. A task with no level keeps its stored XP and times
 * a day until a level is picked (times a day can still be lowered, or raised as far
 * as its XP allows). Times a day only rewrites the rules when it's a different
 * number, and never for the wake-up task. An unknown id changes nothing.
 */
export function updateTask(
  tasks: readonly Task[],
  id: string,
  changes: TaskChanges,
  limits: TaskLimits,
  levels: readonly EffortLevel[],
): Task[] {
  return tasks.map((task) => {
    if (task.id !== id) return task
    const next: Task = { ...task }
    if (changes.name !== undefined) next.name = cleanTaskName(changes.name, limits) ?? task.name
    const level = changes.effort !== undefined ? effortLevel(changes.effort, levels) : null
    if (level) {
      next.effort = level.id
      next.xp = level.xp
    }
    const current = timesADay(task)
    if (current === null) return next
    const top = maxTimesADay(next, levels, limits)
    let wanted = current
    if (changes.timesADay !== undefined && Number.isFinite(changes.timesADay)) wanted = Math.round(changes.timesADay)
    // A newly picked level brings times a day down to fit. Otherwise only a change asked
    // for is kept in bounds: stored times a day over the cap stays until it's edited.
    if (level || wanted !== current) wanted = Math.min(top, Math.max(1, wanted))
    if (wanted !== current) next.rules = rulesForTimesADay(wanted, { timesADayMax: top })
    return next
  })
}

/** The list with a task archived: hidden on Home, its history and stat XP kept. */
export function archiveTask(tasks: readonly Task[], id: string): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, archived: true } : t))
}

/**
 * The list with an archived task brought back, history intact, or null if there's no
 * room under the active-task cap. An unknown or already active id changes nothing.
 */
export function unarchiveTask(tasks: readonly Task[], id: string, limits: Pick<TaskLimits, 'maxActive'>): Task[] | null {
  const task = tasks.find((t) => t.id === id)
  if (!task || !task.archived) return [...tasks]
  if (!hasRoomForTask(tasks, limits)) return null
  return tasks.map((t) => (t.id === id ? { ...t, archived: false } : t))
}

/** A new task's id: `prefix` (never used by a built-in task) and a unique id from the caller. */
export function newTaskId(prefix: string, unique: string): string {
  return `${prefix}${unique}`
}
