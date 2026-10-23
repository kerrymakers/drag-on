import { describe, expect, it } from 'vitest'
import { GOAL } from '../config/goal'
import { DEFAULT_SETTINGS, DRAGON_NAME_MAX } from '../config/settings'
import { TASKS } from '../config/tasks'
import { at } from '../testing/helpers'
import { scheduleOn } from './settings'
import { applySetup } from './setup'
import { effectiveTasks } from './tasks'
import type { Settings, WakeSchedule } from './types'

const RULES = { defaults: TASKS, nameMax: DRAGON_NAME_MAX, goal: GOAL }
const base: Settings = { ...DEFAULT_SETTINGS, missionSeed: 'seed' }
// Fri 23 Oct 2026, 01:30 BST: still Thursday's game day (days start at 04:00).
const LATE = at('2026-10-23T01:30:00+01:00')
const NOON = at('2026-10-23T12:00:00+01:00')
const EARLY: WakeSchedule = { ...DEFAULT_SETTINGS.wakeSchedule, mon: '06:00', sat: '09:00' }
const active = (s: Settings) => effectiveTasks(s, TASKS).filter((t) => !t.archived).map((t) => t.id)

describe('applySetup', () => {
  it('changes nothing when every step is skipped', () => {
    expect(applySetup(base, {}, NOON, RULES)).toEqual(base)
  })

  it('saves a tidied name (blank is no name) and the colour', () => {
    const s = applySetup(base, { name: '  Ember  ', colour: 'mint' }, NOON, RULES)
    expect(s.dragonName).toBe('Ember')
    expect(s.dragonColour).toBe('mint')
    expect(applySetup({ ...base, dragonName: 'Old' }, { name: '   ' }, NOON, RULES).dragonName).toBeNull()
    expect(applySetup(base, { name: 'x'.repeat(40) }, NOON, RULES).dragonName).toHaveLength(DRAGON_NAME_MAX)
  })

  it('archives the unticked tasks, never deleting them, and stores nothing with all ticked', () => {
    const s = applySetup(base, { keepTasks: ['gym', 'read'] }, NOON, RULES)
    expect(active(s)).toEqual(['gym', 'read'])
    expect(effectiveTasks(s, TASKS).map((t) => t.id)).toEqual(TASKS.map((t) => t.id))
    expect(applySetup(base, { keepTasks: TASKS.map((t) => t.id) }, NOON, RULES).tasks).toBeUndefined()
  })

  it('keeps every task when the choice would leave none on', () => {
    expect(applySetup(base, { keepTasks: [] }, NOON, RULES)).toEqual(base)
    expect(applySetup(base, { keepTasks: ['not-a-task'] }, NOON, RULES)).toEqual(base)
  })

  it('saves the wake-up times from the game day of setup, even after midnight', () => {
    const s = applySetup(base, { wakeSchedule: EARLY }, LATE, RULES)
    expect(s.wakeSchedule).toEqual(EARLY)
    expect(scheduleOn(s, '2026-10-22')).toEqual(EARLY)
    expect(scheduleOn(s, '2026-10-21')).toEqual(DEFAULT_SETTINGS.wakeSchedule)
  })

  it('ignores the wake-up times while the wake-up task is off', () => {
    const s = applySetup(base, { keepTasks: ['gym'], wakeSchedule: EARLY }, NOON, RULES)
    expect(s.wakeSchedule).toEqual(DEFAULT_SETTINGS.wakeSchedule)
    expect(s.wakeScheduleHistory).toBeUndefined()
  })

  it('sets a goal on a task that is on, and rejects one on an unticked task or out of bounds', () => {
    expect(applySetup(base, { goal: { taskId: 'gym', daysPerWeek: 3 } }, NOON, RULES).goal).toEqual({ taskId: 'gym', daysPerWeek: 3 })
    expect(applySetup(base, { keepTasks: ['read'], goal: { taskId: 'gym', daysPerWeek: 3 } }, NOON, RULES).goal).toBeNull()
    expect(applySetup(base, { goal: { taskId: 'gym', daysPerWeek: 9 } }, NOON, RULES).goal).toBeNull()
    expect(applySetup(base, { goal: { taskId: 'nope', daysPerWeek: 2 } }, NOON, RULES).goal).toBeNull()
    expect(applySetup(base, { goal: null }, NOON, RULES).goal).toBeNull()
  })
})
