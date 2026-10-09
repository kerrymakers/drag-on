// The task list and edits to it (Milestone 6, slice 3). Pure: every edit takes a list
// and returns a new one, for the caller to save on Settings.
//
// - A task's id and stat never change once it exists (decided 2026-10-09: changing
//   the stat would rewrite past stats and the dragon's look).
// - XP edits only affect future logs: each log saves its own XP when it's made.
// - Tasks are never deleted, only archived. Deleting one would orphan its past logs.

import { cleanText } from './settings'
import type { Settings, StatId, Task, TaskRules } from './types'

/** The bounds task editing works within (config: TASK_LIMITS). */
export interface TaskLimits {
  xpMin: number
  xpMax: number
  xpStep: number
  /** The longest name, in characters. */
  nameMax: number
  /** The most "times a day" a task can be set to. */
  timesADayMax: number
  /** A task's XP × times a day can't go over this. */
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
 * shape and a true/false `archived`. Fields it doesn't know about don't matter.
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

type XpLimits = Pick<TaskLimits, 'xpMin' | 'xpMax' | 'xpStep' | 'dailyXpMax'>

/**
 * The most XP a task logged `times` times a day can have: XP × times a day stays
 * within the daily limit, rounded down to the step, and never above the XP maximum
 * or below the minimum. With 50 for both: 50 once a day, 25 twice, 15 three times.
 */
export function maxXpFor(times: number, limits: XpLimits): number {
  const n = Number.isFinite(times) && times >= 1 ? Math.floor(times) : 1
  const step = limits.xpStep > 0 ? limits.xpStep : 1
  const byDay = Math.floor(limits.dailyXpMax / n / step) * step
  return Math.max(limits.xpMin, Math.min(limits.xpMax, byDay))
}

/**
 * XP kept within the bounds for a task logged `times` times a day (a whole number;
 * see maxXpFor). Anything that isn't a number gives the minimum.
 */
export function clampTaskXp(xp: number, times: number, limits: XpLimits): number {
  if (!Number.isFinite(xp)) return limits.xpMin
  return Math.min(maxXpFor(times, limits), Math.max(limits.xpMin, Math.round(xp)))
}

/**
 * The XP stepper's next value: the next multiple of the step up (+1) or down (-1),
 * within the bounds for `times` times a day. A value between steps, or over the
 * bounds (from older data), moves into them first.
 */
export function stepTaskXp(xp: number, direction: 1 | -1, times: number, limits: XpLimits): number {
  const step = limits.xpStep > 0 ? limits.xpStep : 1
  const from = clampTaskXp(xp, times, limits)
  if (from !== Math.round(xp) && direction < 0 && from < xp) return from
  const next = direction > 0 ? (Math.floor(from / step) + 1) * step : (Math.ceil(from / step) - 1) * step
  return clampTaskXp(next, times, limits)
}

/** A task name tidied for saving (trimmed, cut to the limit), or null if blank. */
export function cleanTaskName(raw: string, limits: Pick<TaskLimits, 'nameMax'>): string | null {
  return cleanText(raw, limits.nameMax)
}

/** What the add sheet collects. */
export interface NewTask {
  name: string
  stat: StatId
  xp: number
  timesADay: number
}

/**
 * The list with a new task at the end, or null if it can't be added: a blank name,
 * no room under the active-task cap, or an id already in use. The name is tidied and
 * the XP and times a day kept within bounds, XP × times a day included (maxXpFor).
 * `id` comes from the caller (see newTaskId).
 */
export function addTask(tasks: readonly Task[], draft: NewTask, id: string, limits: TaskLimits): Task[] | null {
  const name = cleanTaskName(draft.name, limits)
  if (name === null || !hasRoomForTask(tasks, limits) || tasks.some((t) => t.id === id)) return null
  const task: Task = {
    id,
    name,
    stat: draft.stat,
    xp: 0,
    rules: rulesForTimesADay(draft.timesADay, limits),
    archived: false,
  }
  task.xp = clampTaskXp(draft.xp, timesADay(task) ?? 1, limits)
  return [...tasks, task]
}

/** What the edit sheet can change. The id and stat are never among them. */
export interface TaskChanges {
  name?: string
  xp?: number
  /** Ignored for the wake-up task, whose rules never change. */
  timesADay?: number
}

/**
 * The list with one task's name, XP or times a day changed. Its id, stat and anything
 * else on it stay as they were. A blank name keeps the old one. XP × times a day is
 * kept within the daily limit: raising times a day lowers the XP to fit if needed. Times a day only
 * rewrites the rules when it's a different number, and never for the wake-up task.
 * An unknown id changes nothing.
 */
export function updateTask(tasks: readonly Task[], id: string, changes: TaskChanges, limits: TaskLimits): Task[] {
  return tasks.map((task) => {
    if (task.id !== id) return task
    const next: Task = { ...task }
    if (changes.name !== undefined) next.name = cleanTaskName(changes.name, limits) ?? task.name
    const current = timesADay(task)
    let timesChanged = false
    if (changes.timesADay !== undefined && current !== null) {
      const rules = rulesForTimesADay(changes.timesADay, limits)
      const wanted = rules.kind === 'maxPerDay' ? rules.max : 1
      if (wanted !== current) {
        next.rules = rules
        timesChanged = true
      }
    }
    // XP × times a day stays within the daily limit: a new XP is kept within it, and
    // more times a day brings the XP down to fit. Otherwise stored XP is left alone.
    const times = timesADay(next) ?? 1
    if (changes.xp !== undefined) next.xp = clampTaskXp(changes.xp, times, limits)
    else if (timesChanged && next.xp > maxXpFor(times, limits)) next.xp = maxXpFor(times, limits)
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
