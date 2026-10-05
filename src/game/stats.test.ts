import { describe, expect, it } from 'vitest'
import { STATS } from '../config/stats'
import { TASKS } from '../config/tasks'
import { at, log, undo } from '../testing/helpers'
import { totalXp } from './state'
import { statTotals } from './stats'
import type { GameEvent, StatId, Task } from './types'

const task = (id: string): Task => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(`No task ${id}`)
  return t
}
const NOON = at('2026-10-05T12:00:00+01:00')
const asRecord = (events: readonly GameEvent[], tasks: readonly Task[] = TASKS) =>
  Object.fromEntries(statTotals(events, tasks, STATS).map((s) => [s.stat.id, s.xp])) as Record<StatId, number>

describe('statTotals', () => {
  it('starts every stat at 0, in config order, including Heart', () => {
    const totals = statTotals([], TASKS, STATS)
    expect(totals.map((s) => s.stat.id)).toEqual(['strength', 'discipline', 'wisdom', 'heart'])
    expect(totals.every((s) => s.xp === 0)).toBe(true)
  })

  it("totals each log's saved XP under its task's stat", () => {
    const events = [
      log(task('gym'), NOON),
      log(task('walk'), NOON + 1000),
      log(task('read'), NOON + 2000),
      log(task('wake'), NOON + 3000),
      log(task('avoided'), NOON + 4000),
      log(task('selfcare'), NOON + 5000),
    ]
    expect(asRecord(events)).toEqual({
      strength: task('gym').xp + task('walk').xp,
      discipline: task('wake').xp + task('avoided').xp,
      wisdom: task('read').xp,
      heart: task('selfcare').xp,
    })
  })

  it('uses xpAwarded, not the current task XP', () => {
    const events = [{ ...log(task('gym'), NOON), xpAwarded: 7 }]
    expect(asRecord(events).strength).toBe(7)
  })

  it('ignores undone logs', () => {
    const a = log(task('gym'), NOON)
    const b = log(task('selfcare'), NOON + 1000)
    const events = [a, b, undo(b, NOON + 2000)]
    expect(asRecord(events)).toMatchObject({ strength: task('gym').xp, heart: 0 })
  })

  it('still counts archived tasks', () => {
    const tasks = TASKS.map((t) => (t.id === 'read' ? { ...t, archived: true } : t))
    expect(asRecord([log(task('read'), NOON)], tasks).wisdom).toBe(task('read').xp)
  })

  it('counts a task under its current stat in config', () => {
    const tasks = TASKS.map((t) => (t.id === 'walk' ? { ...t, stat: 'heart' as const } : t))
    expect(asRecord([log(task('walk'), NOON)], tasks)).toMatchObject({ strength: 0, heart: task('walk').xp })
  })

  it('counts logs of tasks missing from config towards no stat, but still towards total XP', () => {
    const events = [log({ id: 'gone', xp: 50 }, NOON), log(task('gym'), NOON + 1000)]
    const totals = asRecord(events)
    expect(totals).toEqual({ strength: task('gym').xp, discipline: 0, wisdom: 0, heart: 0 })
    expect(totalXp(events)).toBe(50 + task('gym').xp)
  })

  it('ignores a stat that is not in the stats config', () => {
    const totals = statTotals([log(task('selfcare'), NOON)], TASKS, STATS.filter((s) => s.id !== 'heart'))
    expect(totals.map((s) => s.stat.id)).toEqual(['strength', 'discipline', 'wisdom'])
    expect(totals.every((s) => s.xp === 0)).toBe(true)
  })
})
