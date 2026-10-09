import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { STREAKS } from '../config/streaks'
import { EFFORT_LEVELS, NEW_TASK_EFFORT, NEW_TASK_ID_PREFIX, TASK_LIMITS, TASKS } from '../config/tasks'
import { REWARDS } from '../config/rewards'
import { at, NO_REWARD } from '../testing/helpers'
import { createLogEvent } from './log'
import { dragonStage, taskAvailability, totalXp } from './state'
import { statTotals } from './stats'
import { weeklyCounts } from './streaks'
import {
  activeTaskCount,
  addTask,
  archiveTask,
  cleanTaskName,
  effectiveTasks,
  effortLevel,
  hasRoomForTask,
  isReadableTask,
  maxTimesADay,
  newTaskId,
  rulesForTimesADay,
  shownEffort,
  taskXp,
  timesADay,
  unarchiveTask,
  updateTask,
  withTasks,
  type TaskLimits,
} from './tasks'
import type { EffortLevel, GameEvent, LogEvent, Settings, Task } from './types'

const LIMITS: TaskLimits = { nameMax: 40, timesADayMax: 3, dailyXpMax: 50, maxActive: 8 }
// The levels as agreed on 2026-10-09, fixed here so these tests don't move with config.
const LEVELS: readonly EffortLevel[] = [
  { id: 'nudge', label: 'A little nudge', xp: 15, maxTimesADay: 3 },
  { id: 'effort', label: 'Takes effort', xp: 25, maxTimesADay: 2 },
  { id: 'hard', label: 'Really hard', xp: 40, maxTimesADay: 1 },
]
/** An older task, saved before effort levels: XP and times a day of its own, no level. */
const legacy = (xp: number, times = 1, extra: Partial<Task> = {}): Task => ({
  id: 'my-old',
  name: 'Old habit',
  stat: 'wisdom',
  xp,
  rules: rulesForTimesADay(times, LIMITS),
  archived: false,
  ...extra,
})
const settings: Settings = { ...DEFAULT_SETTINGS }
const byId = (tasks: readonly Task[], id: string): Task => {
  const t = tasks.find((x) => x.id === id)
  if (!t) throw new Error(`No task ${id}`)
  return t
}
const ids = (tasks: readonly Task[]) => tasks.map((t) => t.id)
// Fri 9 Oct 2026 (BST): a weekday, so the wake-up task has a target.
const FRI = (hm: string) => at(`2026-10-09T${hm}:00+01:00`)
const RULES = { stages: STAGES, rewards: REWARDS, streaks: STREAKS, effortLevels: LEVELS }

function logAll(tasks: readonly Task[], taps: [string, number][], events: GameEvent[] = [], levels = LEVELS): GameEvent[] {
  let out = events
  taps.forEach(([id, time], i) => {
    const e = createLogEvent(byId(tasks, id), out, settings, time, `e${out.length}-${i}`, NO_REWARD, { ...RULES, effortLevels: levels })
    if (!e) throw new Error(`Could not log ${id}`)
    out = [...out, e]
  })
  return out
}

describe('config', () => {
  it('has no built-in id that a new task could take', () => {
    expect(TASKS.some((t) => t.id.startsWith(NEW_TASK_ID_PREFIX))).toBe(false)
  })

  it('has every built-in task inside the editing bounds', () => {
    for (const t of TASKS) {
      // XP × times a day within the daily limit (wake-up is once a day).
      expect(t.xp * (timesADay(t) ?? 1), t.id).toBeLessThanOrEqual(TASK_LIMITS.dailyXpMax)
      expect(timesADay(t) ?? 1, t.id).toBeLessThanOrEqual(maxTimesADay(t, EFFORT_LEVELS, TASK_LIMITS))
      expect(t.name.length).toBeLessThanOrEqual(TASK_LIMITS.nameMax)
    }
    expect(activeTaskCount(TASKS)).toBeLessThanOrEqual(TASK_LIMITS.maxActive)
  })

  it('gives a built-in task a level only where it matches its XP exactly', () => {
    for (const t of TASKS) {
      if (t.effort === undefined) continue
      expect(effortLevel(t.effort, EFFORT_LEVELS)?.xp, t.id).toBe(t.xp)
    }
    expect(Object.fromEntries(TASKS.map((t) => [t.id, t.effort ?? null]))).toEqual({
      wake: null,
      gym: 'hard',
      walk: 'nudge',
      read: 'effort',
      selfcare: 'effort',
      avoided: 'nudge',
    })
  })

  it('has levels that fit the daily limit and the times-a-day limit', () => {
    expect(new Set(EFFORT_LEVELS.map((l) => l.id)).size).toBe(EFFORT_LEVELS.length)
    for (const l of EFFORT_LEVELS) {
      expect(l.xp, l.id).toBeGreaterThan(0)
      expect(l.maxTimesADay, l.id).toBeGreaterThanOrEqual(1)
      expect(l.maxTimesADay, l.id).toBeLessThanOrEqual(TASK_LIMITS.timesADayMax)
      expect(l.xp * l.maxTimesADay, l.id).toBeLessThanOrEqual(TASK_LIMITS.dailyXpMax)
      expect(l.label.trim(), l.id).not.toBe('')
    }
    // Harder levels are worth more, and allow no more times a day.
    for (let i = 1; i < EFFORT_LEVELS.length; i++) {
      expect(EFFORT_LEVELS[i]!.xp).toBeGreaterThan(EFFORT_LEVELS[i - 1]!.xp)
      expect(EFFORT_LEVELS[i]!.maxTimesADay).toBeLessThanOrEqual(EFFORT_LEVELS[i - 1]!.maxTimesADay)
    }
    expect(effortLevel(NEW_TASK_EFFORT, EFFORT_LEVELS)).not.toBeNull()
  })
})

describe('effectiveTasks', () => {
  it('uses the config defaults when nothing is stored (older saves)', () => {
    expect(effectiveTasks(settings, TASKS)).toBe(TASKS)
    expect(effectiveTasks({}, TASKS)).toBe(TASKS)
  })

  it('uses the stored list, in its order, with its edits', () => {
    const stored = [...TASKS].reverse().map((t) => (t.id === 'gym' ? { ...t, name: 'Lifting' } : t))
    const tasks = effectiveTasks({ tasks: stored }, TASKS)
    expect(ids(tasks)).toEqual(ids(stored))
    expect(byId(tasks, 'gym').name).toBe('Lifting')
  })

  it('appends a built-in task the stored list does not have yet, at the end', () => {
    const stored = TASKS.filter((t) => t.id !== 'read')
    const custom: Task = { id: 'my-1', name: 'Stretch', stat: 'strength', xp: 10, rules: { kind: 'oncePerDay' }, archived: false }
    const tasks = effectiveTasks({ tasks: [...stored, custom] }, TASKS)
    expect(ids(tasks)).toEqual([...ids(stored), 'my-1', 'read'])
  })

  it('an empty stored list still gives every built-in task', () => {
    expect(ids(effectiveTasks({ tasks: [] }, TASKS))).toEqual(ids(TASKS))
  })

  it('withTasks stores the full list, as copies', () => {
    const s = withTasks(settings, TASKS, TASKS)
    expect(s.tasks).toEqual(TASKS)
    expect(s.tasks?.[0]).not.toBe(TASKS[0])
    expect(s.dragonName).toBe(settings.dragonName)
  })
})

describe('stored entries this version cannot read', () => {
  const custom: Task = { id: 'my-1', name: 'Stretch', stat: 'heart', xp: 10, rules: { kind: 'oncePerDay' }, archived: false }
  const later = { ...custom, id: 'my-later', rules: { kind: 'weekly', days: 3 } }
  const junk = 'not a task'

  it('isReadableTask checks the shape', () => {
    expect(TASKS.every(isReadableTask)).toBe(true)
    expect(isReadableTask(custom)).toBe(true)
    for (const bad of [later, junk, null, { ...custom, archived: undefined }, { ...custom, stat: 'luck' }, { ...custom, xp: 0 }]) {
      expect(isReadableTask(bad), JSON.stringify(bad)).toBe(false)
    }
  })

  it('isReadableTask accepts a missing, known or unknown effort level (an unknown one is ignored, not a reason to drop the task)', () => {
    for (const effort of [undefined, 'nudge', 'mega', 42, null]) {
      expect(isReadableTask({ ...custom, effort }), String(effort)).toBe(true)
    }
    const s: Settings = { ...settings, tasks: [{ ...custom, effort: 'mega' }] }
    const t = byId(effectiveTasks(s, TASKS), 'my-1')
    expect(taskXp(t, LEVELS)).toBe(custom.xp)
  })

  it('are left out of the list in use, and carried through every edit untouched, in place', () => {
    const s: Settings = { ...settings, tasks: [later, custom, junk] }
    const tasks = effectiveTasks(s, TASKS)
    expect(ids(tasks)).toEqual(['my-1', ...ids(TASKS)])
    const edits: ((t: readonly Task[]) => Task[] | null)[] = [
      (t) => updateTask(t, 'my-1', { name: 'Stretch more', effort: 'effort' }, LIMITS, LEVELS),
      (t) => archiveTask(t, 'gym'),
      (t) => unarchiveTask(archiveTask(t, 'my-1'), 'my-1', LIMITS),
      (t) => addTask(t, { name: 'New', stat: 'wisdom', effort: 'nudge', timesADay: 1 }, 'my-2', LIMITS, LEVELS),
    ]
    for (const edit of edits) {
      const saved = withTasks(s, edit(tasks)!, TASKS).tasks!
      expect(saved[0]).toBe(later)
      expect(saved[2]).toBe(junk)
      expect(saved[1]).toMatchObject({ id: 'my-1' })
    }
  })

  it('a later duplicate of an id is kept but not used, and edits go to the first', () => {
    const dup = { ...custom, name: 'Second' }
    const s: Settings = { ...settings, tasks: [custom, dup] }
    const tasks = effectiveTasks(s, TASKS)
    expect(tasks.filter((t) => t.id === 'my-1')).toEqual([custom])
    const saved = withTasks(s, updateTask(tasks, 'my-1', { name: 'Edited' }, LIMITS, LEVELS), TASKS).tasks!
    expect(saved[0]).toMatchObject({ name: 'Edited' })
    expect(saved[1]).toBe(dup)
  })

  it('an unreadable built-in gets its default, in its place; the raw entry stays until that task is edited', () => {
    const badGym = { ...byId(TASKS, 'gym'), rules: { kind: 'fortnightly' } }
    const s: Settings = { ...settings, tasks: [custom, badGym, byId(TASKS, 'read')] }
    const tasks = effectiveTasks(s, TASKS)
    expect(ids(tasks).slice(0, 3)).toEqual(['my-1', 'gym', 'read'])
    expect(byId(tasks, 'gym')).toEqual(byId(TASKS, 'gym'))
    // Editing something else keeps the raw entry.
    const other = withTasks(s, updateTask(tasks, 'read', { effort: 'hard' }, LIMITS, LEVELS), TASKS).tasks!
    expect(other[1]).toBe(badGym)
    // Editing the restored task itself replaces it there.
    const own = withTasks(s, updateTask(tasks, 'gym', { name: 'Lifting' }, LIMITS, LEVELS), TASKS).tasks!
    expect(own[1]).toEqual({ ...byId(TASKS, 'gym'), name: 'Lifting' })
    expect(ids(effectiveTasks({ tasks: own }, TASKS)).slice(0, 3)).toEqual(['my-1', 'gym', 'read'])
  })

  it('built-ins missing from the stored list go at the end when saved', () => {
    const s: Settings = { ...settings, tasks: [custom] }
    const saved = withTasks(s, effectiveTasks(s, TASKS), TASKS).tasks!
    expect(saved.map((t) => (t as Task).id)).toEqual(['my-1', ...ids(TASKS)])
  })
})

describe('small helpers', () => {
  it('times a day: null for wake-up, 1 for once a day, the max otherwise', () => {
    expect(timesADay(byId(TASKS, 'wake'))).toBeNull()
    expect(timesADay(byId(TASKS, 'gym'))).toBe(1)
    expect(timesADay(byId(TASKS, 'avoided'))).toBe(2)
  })

  it('maps times a day to rules, within 1 and the limit', () => {
    expect(rulesForTimesADay(1, LIMITS)).toEqual({ kind: 'oncePerDay' })
    expect(rulesForTimesADay(2, LIMITS)).toEqual({ kind: 'maxPerDay', max: 2 })
    expect(rulesForTimesADay(3, LIMITS)).toEqual({ kind: 'maxPerDay', max: 3 })
    expect(rulesForTimesADay(9, LIMITS)).toEqual({ kind: 'maxPerDay', max: 3 })
    expect(rulesForTimesADay(0, LIMITS)).toEqual({ kind: 'oncePerDay' })
    expect(rulesForTimesADay(Number.NaN, LIMITS)).toEqual({ kind: 'oncePerDay' })
  })

  it('finds an effort level by id; none for a missing, unknown or odd one', () => {
    expect(effortLevel('hard', LEVELS)).toBe(LEVELS[2])
    for (const odd of [undefined, null, 'mega', 'Hard', 42, {}]) expect(effortLevel(odd, LEVELS), String(odd)).toBeNull()
  })

  it("taskXp: the level's XP when there is one, else the stored XP", () => {
    expect(taskXp(byId(TASKS, 'gym'), LEVELS)).toBe(40)
    // The level wins over a stored XP that's out of step (e.g. a level rebalanced in config).
    expect(taskXp({ ...byId(TASKS, 'walk'), xp: 99 }, LEVELS)).toBe(15)
    expect(taskXp(byId(TASKS, 'walk'), [{ ...LEVELS[0]!, xp: 20 }])).toBe(20)
    // No level (an older task, or wake-up), or one this version doesn't know: the stored XP.
    expect(taskXp(byId(TASKS, 'wake'), LEVELS)).toBe(30)
    expect(taskXp(legacy(35), LEVELS)).toBe(35)
    expect(taskXp(legacy(35, 1, { effort: 'mega' }), LEVELS)).toBe(35)
    expect(taskXp(byId(TASKS, 'gym'), [])).toBe(40)
  })

  it('shownEffort: the saved level, else the one worth exactly the stored XP, else none', () => {
    expect(shownEffort(byId(TASKS, 'gym'), LEVELS)?.id).toBe('hard')
    // A saved level wins over the XP.
    expect(shownEffort({ ...byId(TASKS, 'walk'), xp: 40 }, LEVELS)?.id).toBe('nudge')
    // Exact match only.
    expect(shownEffort(legacy(25), LEVELS)?.id).toBe('effort')
    expect(shownEffort(legacy(15), LEVELS)?.id).toBe('nudge')
    for (const xp of [20, 24, 26, 39, 50]) expect(shownEffort(legacy(xp), LEVELS), String(xp)).toBeNull()
    // Wake-up's 30 XP matches none.
    expect(shownEffort(byId(TASKS, 'wake'), LEVELS)).toBeNull()
    // An unknown saved level falls back to the match.
    expect(shownEffort(legacy(40, 1, { effort: 'mega' }), LEVELS)?.id).toBe('hard')
    expect(shownEffort(legacy(30, 1, { effort: 'mega' }), LEVELS)).toBeNull()
    // Only for showing: what a log is worth and the cap still go by the saved level.
    expect(taskXp(legacy(25, 3), LEVELS)).toBe(25)
    expect(maxTimesADay(legacy(25, 3), LEVELS, LIMITS)).toBe(2)
    expect(maxTimesADay(legacy(15, 3), LEVELS, LIMITS)).toBe(3)
  })

  it("maxTimesADay: the level's cap; with no level, as many as the stored XP allows", () => {
    expect(['nudge', 'effort', 'hard'].map((effort) => maxTimesADay({ xp: 1, effort }, LEVELS, LIMITS))).toEqual([3, 2, 1])
    // Never above the overall limit.
    expect(maxTimesADay({ xp: 15, effort: 'nudge' }, LEVELS, { ...LIMITS, timesADayMax: 2 })).toBe(2)
    // No level: XP × times a day within the daily limit, at least once.
    expect([10, 15, 20, 25, 30, 50, 60].map((xp) => maxTimesADay(legacy(xp), LEVELS, LIMITS))).toEqual([3, 3, 2, 2, 1, 1, 1])
    expect(maxTimesADay(legacy(20, 1, { effort: 'mega' }), LEVELS, LIMITS)).toBe(2)
  })

  it('tidies a name: trimmed, cut to the limit by characters, blank is null', () => {
    expect(cleanTaskName('  Stretch  ', LIMITS)).toBe('Stretch')
    expect(cleanTaskName('   ', LIMITS)).toBeNull()
    expect(cleanTaskName('a'.repeat(50), LIMITS)).toBe('a'.repeat(40))
    // An emoji counts as one character and is never cut in half.
    expect(cleanTaskName(`${'a'.repeat(39)}🐉🐉`, LIMITS)).toBe(`${'a'.repeat(39)}🐉`)
  })

  it('prefixes a new id', () => {
    expect(newTaskId(NEW_TASK_ID_PREFIX, 'abc')).toBe('my-abc')
  })
})

describe('addTask', () => {
  const draft = { name: ' Stretch ', stat: 'heart' as const, effort: 'nudge', timesADay: 1 }

  it("adds an active task at the end, tidied, with its level and the level's XP", () => {
    const tasks = addTask(TASKS, draft, 'my-1', LIMITS, LEVELS)
    expect(tasks).not.toBeNull()
    expect(ids(tasks!)).toEqual([...ids(TASKS), 'my-1'])
    expect(byId(tasks!, 'my-1')).toEqual({
      id: 'my-1',
      name: 'Stretch',
      stat: 'heart',
      xp: 15,
      rules: { kind: 'oncePerDay' },
      archived: false,
      effort: 'nudge',
    })
  })

  it("keeps times a day within the level's cap", () => {
    const add = (effort: string, timesADay: number) => byId(addTask(TASKS, { ...draft, effort, timesADay }, 'my-1', LIMITS, LEVELS)!, 'my-1')
    expect(add('nudge', 3)).toMatchObject({ xp: 15, rules: { kind: 'maxPerDay', max: 3 } })
    expect(add('effort', 3)).toMatchObject({ xp: 25, rules: { kind: 'maxPerDay', max: 2 } })
    expect(add('hard', 3)).toMatchObject({ xp: 40, rules: { kind: 'oncePerDay' } })
    expect(add('hard', 0)).toMatchObject({ rules: { kind: 'oncePerDay' } })
  })

  it('refuses an effort level it does not know', () => {
    expect(addTask(TASKS, { ...draft, effort: 'mega' }, 'my-1', LIMITS, LEVELS)).toBeNull()
  })

  it('refuses a blank name or an id already in use', () => {
    expect(addTask(TASKS, { ...draft, name: '  ' }, 'my-1', LIMITS, LEVELS)).toBeNull()
    expect(addTask(TASKS, draft, 'gym', LIMITS, LEVELS)).toBeNull()
  })

  it('refuses once the active-task cap is reached, and archived tasks do not count', () => {
    let tasks: Task[] = [...TASKS]
    for (let i = 0; activeTaskCount(tasks) < LIMITS.maxActive; i++) tasks = addTask(tasks, draft, `my-${i}`, LIMITS, LEVELS)!
    expect(activeTaskCount(tasks)).toBe(LIMITS.maxActive)
    expect(hasRoomForTask(tasks, LIMITS)).toBe(false)
    expect(addTask(tasks, draft, 'my-extra', LIMITS, LEVELS)).toBeNull()
    // Archiving one makes room again.
    const archived = archiveTask(tasks, 'gym')
    expect(hasRoomForTask(archived, LIMITS)).toBe(true)
    expect(addTask(archived, draft, 'my-extra', LIMITS, LEVELS)).not.toBeNull()
  })
})

describe('updateTask', () => {
  const edit = (tasks: readonly Task[], id: string, changes: Parameters<typeof updateTask>[2]) => byId(updateTask(tasks, id, changes, LIMITS, LEVELS), id)

  it("changes the name, level and times a day; the level sets the task's XP too", () => {
    expect(edit(TASKS, 'walk', { name: ' Long walk ', effort: 'effort', timesADay: 2 })).toEqual({
      ...byId(TASKS, 'walk'),
      name: 'Long walk',
      effort: 'effort',
      xp: 25,
      rules: { kind: 'maxPerDay', max: 2 },
    })
    // Back to once a day.
    const twice = updateTask(TASKS, 'walk', { timesADay: 2 }, LIMITS, LEVELS)
    expect(edit(twice, 'walk', { timesADay: 1 }).rules).toEqual({ kind: 'oncePerDay' })
  })

  it('never changes the id or stat, even if asked', () => {
    const sneaky = { name: 'x', stat: 'heart', id: 'other' } as unknown as Parameters<typeof updateTask>[2]
    const t = edit(TASKS, 'gym', sneaky)
    expect(t.id).toBe('gym')
    expect(t.stat).toBe('strength')
  })

  it("never changes the wake-up task's rules, but it can have a level", () => {
    const t = edit(TASKS, 'wake', { name: 'Up and at it', effort: 'hard', timesADay: 3 })
    expect(t).toMatchObject({ name: 'Up and at it', effort: 'hard', xp: 40, rules: { kind: 'wakeUp' } })
  })

  it("keeps times a day within the level's cap", () => {
    expect(edit(TASKS, 'walk', { timesADay: 9 }).rules).toEqual({ kind: 'maxPerDay', max: 3 })
    expect(edit(TASKS, 'read', { timesADay: 3 }).rules).toEqual({ kind: 'maxPerDay', max: 2 })
    expect(edit(TASKS, 'gym', { timesADay: 3 }).rules).toBe(byId(TASKS, 'gym').rules)
    expect(edit(TASKS, 'walk', { timesADay: 0 }).rules).toEqual({ kind: 'oncePerDay' })
    expect(edit(TASKS, 'walk', { timesADay: Number.NaN }).rules).toBe(byId(TASKS, 'walk').rules)
  })

  it('a harder level lowers times a day to fit; an easier one leaves it', () => {
    // Avoided: a little nudge, twice a day.
    expect(edit(TASKS, 'avoided', { effort: 'hard' })).toMatchObject({ effort: 'hard', xp: 40, rules: { kind: 'oncePerDay' } })
    expect(edit(TASKS, 'avoided', { effort: 'effort' })).toMatchObject({ xp: 25, rules: { kind: 'maxPerDay', max: 2 } })
    const thrice = updateTask(TASKS, 'walk', { timesADay: 3 }, LIMITS, LEVELS)
    expect(edit(thrice, 'walk', { effort: 'effort' })).toMatchObject({ xp: 25, rules: { kind: 'maxPerDay', max: 2 } })
    // Asking for more times a day than the new level allows gives its cap.
    expect(edit(TASKS, 'walk', { effort: 'effort', timesADay: 3 }).rules).toEqual({ kind: 'maxPerDay', max: 2 })
    // Easier never raises times a day by itself.
    expect(edit(TASKS, 'gym', { effort: 'nudge' })).toMatchObject({ xp: 15, rules: { kind: 'oncePerDay' } })
  })

  it('ignores an effort level it does not know', () => {
    expect(edit(TASKS, 'gym', { effort: 'mega' })).toEqual(byId(TASKS, 'gym'))
    expect(edit(TASKS, 'gym', { effort: 'mega', name: 'Lifting' })).toEqual({ ...byId(TASKS, 'gym'), name: 'Lifting' })
  })

  it('an older task with no level keeps its XP and times a day until a level is picked', () => {
    const old = legacy(30)
    expect(edit([old], 'my-old', { name: 'Still old' })).toEqual({ ...old, name: 'Still old' })
    // Times a day stays within what its XP allows: 30 XP is once a day.
    expect(edit([old], 'my-old', { timesADay: 2 })).toEqual(old)
    expect(edit([legacy(20)], 'my-old', { timesADay: 3 })).toMatchObject({ xp: 20, rules: { kind: 'maxPerDay', max: 2 } })
    // Picking a level gives it the level's XP, and the level's cap.
    expect(edit([legacy(20, 2)], 'my-old', { effort: 'hard' })).toMatchObject({ effort: 'hard', xp: 40, rules: { kind: 'oncePerDay' } })
    expect(edit([old], 'my-old', { effort: 'nudge', timesADay: 3 })).toMatchObject({ effort: 'nudge', xp: 15, rules: { kind: 'maxPerDay', max: 3 } })
  })

  it('stored values over the limits stay until they are changed', () => {
    // From before the limits (or edited by hand): 60 XP twice a day.
    const over = legacy(60, 2)
    expect(edit([over], 'my-old', { name: 'Big one' })).toMatchObject({ xp: 60, rules: { kind: 'maxPerDay', max: 2 } })
    expect(edit([over], 'my-old', { timesADay: 2 })).toEqual(over)
    expect(edit([over], 'my-old', { timesADay: 1 })).toMatchObject({ xp: 60, rules: { kind: 'oncePerDay' } })
    expect(edit([over], 'my-old', { effort: 'effort' })).toMatchObject({ xp: 25, rules: { kind: 'maxPerDay', max: 2 } })
    // A level with too many times a day comes into line once anything about times or level changes.
    const tooMany: Task = { ...byId(TASKS, 'gym'), rules: { kind: 'maxPerDay', max: 3 } }
    expect(edit([tooMany], 'gym', { name: 'Lifting' }).rules).toEqual({ kind: 'maxPerDay', max: 3 })
    expect(edit([tooMany], 'gym', { timesADay: 2 }).rules).toEqual({ kind: 'oncePerDay' })
    expect(edit([tooMany], 'gym', { effort: 'hard' }).rules).toEqual({ kind: 'oncePerDay' })
  })

  it('an unknown stored level is replaced once a known one is picked', () => {
    const odd = legacy(30, 1, { effort: 'mega' })
    expect(edit([odd], 'my-old', { name: 'x' })).toMatchObject({ effort: 'mega', xp: 30 })
    expect(edit([odd], 'my-old', { effort: 'effort' })).toMatchObject({ effort: 'effort', xp: 25 })
  })

  it('leaves rules alone when times a day is unchanged, and keeps unknown fields', () => {
    const odd = { ...byId(TASKS, 'avoided'), rules: { kind: 'maxPerDay', max: 2, extra: 1 }, colour: 'blue' } as Task
    const t = edit([odd], 'avoided', { name: 'Hard thing', timesADay: 2 })
    expect(t.rules).toBe(odd.rules)
    expect((t as Task & { colour?: string }).colour).toBe('blue')
  })

  it('changes nothing for an unknown id, and never touches the input', () => {
    const before = structuredClone(TASKS)
    expect(updateTask(TASKS, 'nope', { name: 'x' }, LIMITS, LEVELS)).toEqual(TASKS)
    updateTask(TASKS, 'gym', { name: 'x', effort: 'nudge', timesADay: 3 }, LIMITS, LEVELS)
    expect(TASKS).toEqual(before)
  })
})

describe('archive and unarchive', () => {
  it('archives and brings back a task', () => {
    const archived = archiveTask(TASKS, 'read')
    expect(byId(archived, 'read').archived).toBe(true)
    expect(activeTaskCount(archived)).toBe(TASKS.length - 1)
    const back = unarchiveTask(archived, 'read', LIMITS)!
    expect(byId(back, 'read')).toEqual(byId(TASKS, 'read'))
  })

  it('will not unarchive past the cap', () => {
    const full = Array.from({ length: LIMITS.maxActive }, (_, i): Task => ({ ...byId(TASKS, 'gym'), id: `my-${i}` }))
    const tasks = [...full, { ...byId(TASKS, 'read'), archived: true }]
    expect(unarchiveTask(tasks, 'read', LIMITS)).toBeNull()
    expect(unarchiveTask(archiveTask(tasks, 'my-0'), 'read', LIMITS)).not.toBeNull()
  })

  it('changes nothing for an unknown or already active id', () => {
    expect(unarchiveTask(TASKS, 'gym', LIMITS)).toEqual(TASKS)
    expect(unarchiveTask(TASKS, 'nope', LIMITS)).toEqual(TASKS)
  })

  it('hides an archived task on Home, wake-up included', () => {
    for (const id of ['gym', 'avoided', 'wake']) {
      const task = byId(archiveTask(TASKS, id), id)
      expect(taskAvailability(task, [], settings, FRI('06:00'))).toMatchObject({ visible: false, canLog: false })
    }
  })

  it("still counts an archived task's past XP under its stat and in the total", () => {
    const events = logAll(TASKS, [['read', FRI('09:00')], ['gym', FRI('10:00')]])
    const archived = archiveTask(TASKS, 'read')
    const wisdom = (tasks: readonly Task[]) => statTotals(events, tasks, STATS).find((s) => s.stat.id === 'wisdom')!.xp
    expect(wisdom(archived)).toBe(byId(TASKS, 'read').xp)
    expect(totalXp(events)).toBe(byId(TASKS, 'read').xp + byId(TASKS, 'gym').xp)
  })

  it('unarchiving brings its history back into the weekly counts', () => {
    const events = logAll(TASKS, [['read', at('2026-10-06T09:00:00+01:00')], ['read', FRI('09:00')]])
    const archived = archiveTask(TASKS, 'read')
    const back = unarchiveTask(archived, 'read', LIMITS)!
    expect(weeklyCounts(events, [byId(back, 'read')], FRI('12:00'), STREAKS)[0]).toMatchObject({ thisWeek: 2, bestWeek: 2 })
  })
})

describe('changing how hard a task is only affects future logs', () => {
  it('leaves past XP, stats and stage as they were, and the next log uses the new level', () => {
    // Enough gym logs over several days to hatch.
    const days = ['2026-10-05', '2026-10-06', '2026-10-07']
    let events = logAll(TASKS, days.map((d): [string, number] => ['gym', at(`${d}T18:00:00+01:00`)]))
    const xpBefore = totalXp(events)
    const statsBefore = statTotals(events, TASKS, STATS)
    const stageBefore = dragonStage(events, STAGES)

    const edited = updateTask(TASKS, 'gym', { effort: 'nudge', name: 'Lifting' }, LIMITS, LEVELS)
    expect(totalXp(events)).toBe(xpBefore)
    expect(statTotals(events, edited, STATS)).toEqual(statsBefore)
    expect(dragonStage(events, STAGES)).toEqual(stageBefore)

    events = logAll(edited, [['gym', FRI('18:00')]], events)
    expect(events.at(-1)).toMatchObject({ taskId: 'gym', xpAwarded: 15 })
    expect(totalXp(events)).toBe(xpBefore + 15)
  })

  it("a log saves the level's XP, not the stored XP, and an older task's stored XP", () => {
    const tasks = [{ ...byId(TASKS, 'read'), xp: 99 }, legacy(35), legacy(20, 1, { id: 'my-odd', effort: 'mega' })]
    const events = logAll(tasks, [['read', FRI('09:00')], ['my-old', FRI('09:01')], ['my-odd', FRI('09:02')]])
    expect(events.map((e) => (e as LogEvent).xpAwarded)).toEqual([25, 35, 20])
  })

  it("rebalancing a level in config changes future logs only: past logs keep the XP they were made with", () => {
    const events = logAll(TASKS, [['walk', FRI('08:00')]])
    expect(totalXp(events)).toBe(15)
    const rebalanced = LEVELS.map((l) => (l.id === 'nudge' ? { ...l, xp: 20 } : l))
    expect(totalXp(events)).toBe(15)
    const next = logAll(TASKS, [['avoided', FRI('09:00')]], events, rebalanced)
    expect(next.at(-1)).toMatchObject({ xpAwarded: 20 })
    expect(totalXp(next)).toBe(35)
  })

  it('a stored list is read the same way after the edit (XP is saved on each log)', () => {
    const events = logAll(TASKS, [['walk', FRI('08:00')]])
    const s = withTasks(settings, updateTask(TASKS, 'walk', { effort: 'hard' }, LIMITS, LEVELS), TASKS)
    const tasks = effectiveTasks(s, TASKS)
    expect(byId(tasks, 'walk')).toMatchObject({ effort: 'hard', xp: 40 })
    expect(statTotals(events, tasks, STATS).find((t) => t.stat.id === 'strength')!.xp).toBe(byId(TASKS, 'walk').xp)
  })

  it('undoing a log after a level change takes off the XP it was made with', () => {
    const events = logAll(TASKS, [['walk', FRI('08:00')]])
    const edited = updateTask(TASKS, 'walk', { effort: 'effort' }, LIMITS, LEVELS)
    const more = logAll(edited, [['read', FRI('08:05')]], events)
    const undo: GameEvent = { id: 'u', type: 'undo', targetEventId: events[0]!.id, timestamp: FRI('08:10') }
    expect(totalXp([...more, undo])).toBe(25)
  })
})

describe('lowering times a day', () => {
  it('below today’s count just means no more logs today', () => {
    const tasks = updateTask(TASKS, 'walk', { timesADay: 3 }, LIMITS, LEVELS)
    const events = logAll(tasks, [['walk', FRI('08:00')], ['walk', FRI('09:00')]])
    const lowered = byId(updateTask(tasks, 'walk', { timesADay: 1 }, LIMITS, LEVELS), 'walk')
    expect(taskAvailability(lowered, events, settings, FRI('10:00'))).toEqual({
      visible: true,
      canLog: false,
      countToday: 2,
      limit: 1,
    })
    expect(totalXp(events)).toBe(2 * byId(TASKS, 'walk').xp)
    // A new day: once again.
    expect(taskAvailability(lowered, events, settings, at('2026-10-10T10:00:00+01:00')).canLog).toBe(true)
  })
})

describe('a new task', () => {
  it('can be logged, counts under its chosen stat, and shows in the weekly counts', () => {
    const tasks = addTask(TASKS, { name: 'Call Mum', stat: 'heart', effort: 'effort', timesADay: 2 }, 'my-1', LIMITS, LEVELS)!
    const events = logAll(tasks, [['my-1', FRI('09:00')], ['my-1', FRI('19:00')]])
    expect(events.map((e) => e.type === 'log' && e.xpAwarded)).toEqual([25, 25])
    expect(taskAvailability(byId(tasks, 'my-1'), events, settings, FRI('20:00')).canLog).toBe(false)
    expect(statTotals(events, tasks, STATS).find((s) => s.stat.id === 'heart')!.xp).toBe(50)
    expect(weeklyCounts(events, [byId(tasks, 'my-1')], FRI('20:00'), STREAKS)[0]).toMatchObject({ thisWeek: 1 })
  })
})
