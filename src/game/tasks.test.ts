import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { STREAKS } from '../config/streaks'
import { NEW_TASK_ID_PREFIX, TASK_LIMITS, TASKS } from '../config/tasks'
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
  clampTaskXp,
  cleanTaskName,
  effectiveTasks,
  hasRoomForTask,
  isReadableTask,
  maxXpFor,
  newTaskId,
  rulesForTimesADay,
  stepTaskXp,
  timesADay,
  unarchiveTask,
  updateTask,
  withTasks,
  type TaskLimits,
} from './tasks'
import type { GameEvent, Settings, Task } from './types'

const LIMITS: TaskLimits = { xpMin: 5, xpMax: 50, xpStep: 5, nameMax: 40, timesADayMax: 3, dailyXpMax: 50, maxActive: 8 }
const settings: Settings = { ...DEFAULT_SETTINGS }
const byId = (tasks: readonly Task[], id: string): Task => {
  const t = tasks.find((x) => x.id === id)
  if (!t) throw new Error(`No task ${id}`)
  return t
}
const ids = (tasks: readonly Task[]) => tasks.map((t) => t.id)
// Fri 9 Oct 2026 (BST): a weekday, so the wake-up task has a target.
const FRI = (hm: string) => at(`2026-10-09T${hm}:00+01:00`)
const RULES = { stages: STAGES, rewards: REWARDS, streaks: STREAKS }

function logAll(tasks: readonly Task[], taps: [string, number][], events: GameEvent[] = []): GameEvent[] {
  let out = events
  taps.forEach(([id, time], i) => {
    const e = createLogEvent(byId(tasks, id), out, settings, time, `e${out.length}-${i}`, NO_REWARD, RULES)
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
      expect(t.xp).toBeGreaterThanOrEqual(TASK_LIMITS.xpMin)
      expect(t.xp).toBeLessThanOrEqual(TASK_LIMITS.xpMax)
      // XP × times a day within the daily limit (wake-up is once a day).
      expect(t.xp * (timesADay(t) ?? 1), t.id).toBeLessThanOrEqual(TASK_LIMITS.dailyXpMax)
      expect(t.xp, t.id).toBeLessThanOrEqual(maxXpFor(timesADay(t) ?? 1, TASK_LIMITS))
      expect(t.name.length).toBeLessThanOrEqual(TASK_LIMITS.nameMax)
    }
    expect(activeTaskCount(TASKS)).toBeLessThanOrEqual(TASK_LIMITS.maxActive)
  })

  it('lets the smallest XP fit the daily limit at the most times a day', () => {
    // Otherwise maxXpFor would fall back to xpMin and quietly break the daily rule.
    expect(TASK_LIMITS.xpMin * TASK_LIMITS.timesADayMax).toBeLessThanOrEqual(TASK_LIMITS.dailyXpMax)
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

  it('are left out of the list in use, and carried through every edit untouched, in place', () => {
    const s: Settings = { ...settings, tasks: [later, custom, junk] }
    const tasks = effectiveTasks(s, TASKS)
    expect(ids(tasks)).toEqual(['my-1', ...ids(TASKS)])
    const edits: ((t: readonly Task[]) => Task[] | null)[] = [
      (t) => updateTask(t, 'my-1', { name: 'Stretch more', xp: 20 }, LIMITS),
      (t) => archiveTask(t, 'gym'),
      (t) => unarchiveTask(archiveTask(t, 'my-1'), 'my-1', LIMITS),
      (t) => addTask(t, { name: 'New', stat: 'wisdom', xp: 15, timesADay: 1 }, 'my-2', LIMITS),
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
    const saved = withTasks(s, updateTask(tasks, 'my-1', { name: 'Edited' }, LIMITS), TASKS).tasks!
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
    const other = withTasks(s, updateTask(tasks, 'read', { xp: 30 }, LIMITS), TASKS).tasks!
    expect(other[1]).toBe(badGym)
    // Editing the restored task itself replaces it there.
    const own = withTasks(s, updateTask(tasks, 'gym', { name: 'Lifting' }, LIMITS), TASKS).tasks!
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

  it('keeps XP within bounds', () => {
    expect(clampTaskXp(0, 1, LIMITS)).toBe(5)
    expect(clampTaskXp(999, 1, LIMITS)).toBe(50)
    expect(clampTaskXp(22.6, 1, LIMITS)).toBe(23)
    expect(clampTaskXp(Number.NaN, 1, LIMITS)).toBe(5)
  })

  it('keeps XP × times a day within the daily limit, rounded down to the step', () => {
    expect([1, 2, 3].map((n) => maxXpFor(n, LIMITS))).toEqual([50, 25, 15])
    expect(clampTaskXp(50, 2, LIMITS)).toBe(25)
    expect(clampTaskXp(50, 3, LIMITS)).toBe(15)
    expect(clampTaskXp(20, 2, LIMITS)).toBe(20)
    // Never below the minimum, even with a tiny daily limit.
    expect(maxXpFor(3, { ...LIMITS, dailyXpMax: 6 })).toBe(5)
    // The XP maximum still applies once a day.
    expect(maxXpFor(1, { ...LIMITS, dailyXpMax: 80 })).toBe(50)
  })

  it('steps XP by the step, stopping at the bounds for times a day', () => {
    expect(stepTaskXp(15, 1, 1, LIMITS)).toBe(20)
    expect(stepTaskXp(15, -1, 1, LIMITS)).toBe(10)
    expect(stepTaskXp(5, -1, 1, LIMITS)).toBe(5)
    expect(stepTaskXp(50, 1, 1, LIMITS)).toBe(50)
    expect(stepTaskXp(25, 1, 2, LIMITS)).toBe(25)
    expect(stepTaskXp(15, 1, 3, LIMITS)).toBe(15)
    expect(stepTaskXp(10, 1, 3, LIMITS)).toBe(15)
    // Between steps (older data): to the nearest step that way.
    expect(stepTaskXp(33, 1, 1, LIMITS)).toBe(35)
    expect(stepTaskXp(33, -1, 1, LIMITS)).toBe(30)
    // Over the limit (older data, or the old 60 cap): down goes to the limit first.
    expect(stepTaskXp(60, -1, 1, LIMITS)).toBe(50)
    expect(stepTaskXp(40, -1, 2, LIMITS)).toBe(25)
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
  const draft = { name: ' Stretch ', stat: 'heart' as const, xp: 15, timesADay: 1 }

  it('adds an active task at the end, tidied', () => {
    const tasks = addTask(TASKS, draft, 'my-1', LIMITS)
    expect(tasks).not.toBeNull()
    expect(ids(tasks!)).toEqual([...ids(TASKS), 'my-1'])
    expect(byId(tasks!, 'my-1')).toEqual({
      id: 'my-1',
      name: 'Stretch',
      stat: 'heart',
      xp: 15,
      rules: { kind: 'oncePerDay' },
      archived: false,
    })
  })

  it('maps times a day and keeps XP in bounds', () => {
    const tasks = addTask(TASKS, { ...draft, xp: 500, timesADay: 3 }, 'my-1', LIMITS)!
    expect(byId(tasks, 'my-1')).toMatchObject({ xp: 15, rules: { kind: 'maxPerDay', max: 3 } })
    expect(byId(addTask(TASKS, { ...draft, xp: 40, timesADay: 2 }, 'my-1', LIMITS)!, 'my-1').xp).toBe(25)
    expect(byId(addTask(TASKS, { ...draft, xp: 50, timesADay: 1 }, 'my-1', LIMITS)!, 'my-1').xp).toBe(50)
  })

  it('refuses a blank name or an id already in use', () => {
    expect(addTask(TASKS, { ...draft, name: '  ' }, 'my-1', LIMITS)).toBeNull()
    expect(addTask(TASKS, draft, 'gym', LIMITS)).toBeNull()
  })

  it('refuses once the active-task cap is reached, and archived tasks do not count', () => {
    let tasks: Task[] = [...TASKS]
    for (let i = 0; activeTaskCount(tasks) < LIMITS.maxActive; i++) tasks = addTask(tasks, draft, `my-${i}`, LIMITS)!
    expect(activeTaskCount(tasks)).toBe(LIMITS.maxActive)
    expect(hasRoomForTask(tasks, LIMITS)).toBe(false)
    expect(addTask(tasks, draft, 'my-extra', LIMITS)).toBeNull()
    // Archiving one makes room again.
    const archived = archiveTask(tasks, 'gym')
    expect(hasRoomForTask(archived, LIMITS)).toBe(true)
    expect(addTask(archived, draft, 'my-extra', LIMITS)).not.toBeNull()
  })
})

describe('updateTask', () => {
  it('changes the name, XP and times a day', () => {
    const tasks = updateTask(TASKS, 'walk', { name: ' Long walk ', xp: 20, timesADay: 2 }, LIMITS)
    expect(byId(tasks, 'walk')).toEqual({
      ...byId(TASKS, 'walk'),
      name: 'Long walk',
      xp: 20,
      rules: { kind: 'maxPerDay', max: 2 },
    })
    // Back to once a day.
    expect(byId(updateTask(tasks, 'walk', { timesADay: 1 }, LIMITS), 'walk').rules).toEqual({ kind: 'oncePerDay' })
  })

  it('never changes the id or stat, even if asked', () => {
    const sneaky = { name: 'x', stat: 'heart', id: 'other' } as unknown as Parameters<typeof updateTask>[2]
    const t = byId(updateTask(TASKS, 'gym', sneaky, LIMITS), 'gym')
    expect(t.id).toBe('gym')
    expect(t.stat).toBe('strength')
  })

  it('never changes the wake-up task’s rules', () => {
    const t = byId(updateTask(TASKS, 'wake', { name: 'Up and at it', xp: 35, timesADay: 3 }, LIMITS), 'wake')
    expect(t).toMatchObject({ name: 'Up and at it', xp: 35, rules: { kind: 'wakeUp' } })
  })

  it('keeps XP × times a day within the daily limit', () => {
    // More times a day brings the XP down to fit.
    expect(byId(updateTask(TASKS, 'gym', { timesADay: 3 }, LIMITS), 'gym')).toMatchObject({ xp: 15, rules: { kind: 'maxPerDay', max: 3 } })
    expect(byId(updateTask(TASKS, 'gym', { timesADay: 2 }, LIMITS), 'gym').xp).toBe(25)
    // A small XP is left alone.
    expect(byId(updateTask(TASKS, 'avoided', { timesADay: 3 }, LIMITS), 'avoided').xp).toBe(15)
    // A new XP is kept within it, for the new times a day if that changes too.
    expect(byId(updateTask(TASKS, 'avoided', { xp: 45 }, LIMITS), 'avoided').xp).toBe(25)
    expect(byId(updateTask(TASKS, 'avoided', { xp: 45, timesADay: 1 }, LIMITS), 'avoided').xp).toBe(45)
    // Wake-up is once a day.
    expect(byId(updateTask(TASKS, 'wake', { xp: 99, timesADay: 3 }, LIMITS), 'wake').xp).toBe(50)
  })

  it('leaves stored XP over the limit alone until the XP or times a day is edited', () => {
    const over: Task = { ...byId(TASKS, 'gym'), xp: 60, rules: { kind: 'maxPerDay', max: 2 } }
    expect(byId(updateTask([over], 'gym', { name: 'Lifting' }, LIMITS), 'gym').xp).toBe(60)
    expect(byId(updateTask([over], 'gym', { xp: 60 }, LIMITS), 'gym').xp).toBe(25)
    expect(byId(updateTask([over], 'gym', { timesADay: 3 }, LIMITS), 'gym').xp).toBe(15)
  })

  it('keeps the old name for a blank one, and keeps XP in bounds', () => {
    const t = byId(updateTask(TASKS, 'gym', { name: '   ', xp: 0 }, LIMITS), 'gym')
    expect(t.name).toBe(byId(TASKS, 'gym').name)
    expect(t.xp).toBe(5)
  })

  it('leaves rules alone when times a day is unchanged, and keeps unknown fields', () => {
    const odd = { ...byId(TASKS, 'avoided'), rules: { kind: 'maxPerDay', max: 2, extra: 1 }, colour: 'blue' } as Task
    const t = byId(updateTask([odd], 'avoided', { name: 'Hard thing', timesADay: 2 }, LIMITS), 'avoided')
    expect(t.rules).toBe(odd.rules)
    expect((t as Task & { colour?: string }).colour).toBe('blue')
  })

  it('changes nothing for an unknown id, and never touches the input', () => {
    const before = structuredClone(TASKS)
    expect(updateTask(TASKS, 'nope', { name: 'x' }, LIMITS)).toEqual(TASKS)
    updateTask(TASKS, 'gym', { name: 'x', xp: 10 }, LIMITS)
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

describe('editing XP only affects future logs', () => {
  it('leaves past XP, stats and stage as they were, and the next log uses the new XP', () => {
    // Enough gym logs over several days to hatch.
    const days = ['2026-10-05', '2026-10-06', '2026-10-07']
    let events = logAll(TASKS, days.map((d): [string, number] => ['gym', at(`${d}T18:00:00+01:00`)]))
    const xpBefore = totalXp(events)
    const statsBefore = statTotals(events, TASKS, STATS)
    const stageBefore = dragonStage(events, STAGES)

    const edited = updateTask(TASKS, 'gym', { xp: 5, name: 'Lifting' }, LIMITS)
    expect(totalXp(events)).toBe(xpBefore)
    expect(statTotals(events, edited, STATS)).toEqual(statsBefore)
    expect(dragonStage(events, STAGES)).toEqual(stageBefore)

    events = logAll(edited, [['gym', FRI('18:00')]], events)
    expect(events.at(-1)).toMatchObject({ taskId: 'gym', xpAwarded: 5 })
    expect(totalXp(events)).toBe(xpBefore + 5)
  })

  it('a stored list is read the same way after the edit (XP is saved on each log)', () => {
    const events = logAll(TASKS, [['walk', FRI('08:00')]])
    const s = withTasks(settings, updateTask(TASKS, 'walk', { xp: 50 }, LIMITS), TASKS)
    const tasks = effectiveTasks(s, TASKS)
    expect(statTotals(events, tasks, STATS).find((t) => t.stat.id === 'strength')!.xp).toBe(byId(TASKS, 'walk').xp)
  })
})

describe('lowering times a day', () => {
  it('below today’s count just means no more logs today', () => {
    const tasks = updateTask(TASKS, 'walk', { timesADay: 3 }, LIMITS)
    const events = logAll(tasks, [['walk', FRI('08:00')], ['walk', FRI('09:00')]])
    const lowered = byId(updateTask(tasks, 'walk', { timesADay: 1 }, LIMITS), 'walk')
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
    const tasks = addTask(TASKS, { name: 'Call Mum', stat: 'heart', xp: 20, timesADay: 2 }, 'my-1', LIMITS)!
    const events = logAll(tasks, [['my-1', FRI('09:00')], ['my-1', FRI('19:00')]])
    expect(events.map((e) => e.type === 'log' && e.xpAwarded)).toEqual([20, 20])
    expect(taskAvailability(byId(tasks, 'my-1'), events, settings, FRI('20:00')).canLog).toBe(false)
    expect(statTotals(events, tasks, STATS).find((s) => s.stat.id === 'heart')!.xp).toBe(40)
    expect(weeklyCounts(events, [byId(tasks, 'my-1')], FRI('20:00'), STREAKS)[0]).toMatchObject({ thisWeek: 1 })
  })
})
