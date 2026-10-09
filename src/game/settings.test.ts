import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { at } from '../testing/helpers'
import { cleanDragonName, SCHEDULE_BASELINE_FROM, sameSchedule, scheduleOn, withScheduleEdit } from './settings'
import type { Settings, WakeSchedule } from './types'

const WEEKDAYS_ONLY: WakeSchedule = { ...DEFAULT_SETTINGS.wakeSchedule } // weekdays 06:30, weekends none
const SAT_TOO: WakeSchedule = { ...WEEKDAYS_ONLY, sat: '08:00' }
const LATER: WakeSchedule = { ...WEEKDAYS_ONLY, mon: '07:00' }
const base: Settings = { ...DEFAULT_SETTINGS, wakeSchedule: WEEKDAYS_ONLY }

// Fri 9 Oct 2026 (BST).
const FRI_NOON = at('2026-10-09T12:00:00+01:00')

describe('scheduleOn', () => {
  it('uses the current schedule for every day when there is no history (older saves)', () => {
    expect(scheduleOn(base, '2020-01-01')).toEqual(WEEKDAYS_ONLY)
    expect(scheduleOn(base, '2026-10-09')).toEqual(WEEKDAYS_ONLY)
    expect(scheduleOn(base, '2030-01-01')).toEqual(WEEKDAYS_ONLY)
    expect(scheduleOn({ ...base, wakeScheduleHistory: [] }, '2026-10-09')).toEqual(WEEKDAYS_ONLY)
  })

  it('keeps the old schedule before the first edit, and the new one on and after its day', () => {
    const edited = withScheduleEdit(base, SAT_TOO, FRI_NOON)
    expect(scheduleOn(edited, '2026-10-08')).toEqual(WEEKDAYS_ONLY)
    expect(scheduleOn(edited, '2020-01-01')).toEqual(WEEKDAYS_ONLY)
    expect(scheduleOn(edited, '2026-10-09')).toEqual(SAT_TOO)
    expect(scheduleOn(edited, '2026-10-10')).toEqual(SAT_TOO)
  })

  it('follows several edits on different days', () => {
    const a = withScheduleEdit(base, SAT_TOO, FRI_NOON)
    const b = withScheduleEdit(a, LATER, at('2026-10-14T09:00:00+01:00'))
    expect(scheduleOn(b, '2026-10-08')).toEqual(WEEKDAYS_ONLY)
    expect(scheduleOn(b, '2026-10-09')).toEqual(SAT_TOO)
    expect(scheduleOn(b, '2026-10-13')).toEqual(SAT_TOO)
    expect(scheduleOn(b, '2026-10-14')).toEqual(LATER)
    expect(scheduleOn(b, '2026-12-25')).toEqual(LATER)
    expect(b.wakeScheduleHistory?.map((e) => e.from)).toEqual([SCHEDULE_BASELINE_FROM, '2026-10-09', '2026-10-14'])
  })

  it('counts an edit at 01:00 towards the previous game day', () => {
    // 01:00 on Sat 10 Oct is still Friday's game day.
    const edited = withScheduleEdit(base, SAT_TOO, at('2026-10-10T01:00:00+01:00'))
    expect(edited.wakeScheduleHistory?.at(-1)?.from).toBe('2026-10-09')
    expect(scheduleOn(edited, '2026-10-08')).toEqual(WEEKDAYS_ONLY)
    expect(scheduleOn(edited, '2026-10-09')).toEqual(SAT_TOO)
    // And 04:00 starts the new day.
    const later = withScheduleEdit(base, SAT_TOO, at('2026-10-10T04:00:00+01:00'))
    expect(later.wakeScheduleHistory?.at(-1)?.from).toBe('2026-10-10')
    expect(scheduleOn(later, '2026-10-09')).toEqual(WEEKDAYS_ONLY)
  })

  it('uses the first entry for a day before every entry', () => {
    const s: Settings = {
      ...base,
      wakeSchedule: LATER,
      wakeScheduleHistory: [
        { from: '2026-09-01', schedule: SAT_TOO },
        { from: '2026-10-01', schedule: LATER },
      ],
    }
    expect(scheduleOn(s, '2026-08-01')).toEqual(SAT_TOO)
    expect(scheduleOn(s, '2026-09-30')).toEqual(SAT_TOO)
  })

  it('treats the current schedule as the one in force from the latest entry on', () => {
    const s: Settings = {
      ...base,
      wakeSchedule: LATER,
      wakeScheduleHistory: [
        { from: SCHEDULE_BASELINE_FROM, schedule: WEEKDAYS_ONLY },
        { from: '2026-10-01', schedule: SAT_TOO }, // out of step with wakeSchedule
      ],
    }
    expect(scheduleOn(s, '2026-10-05')).toEqual(LATER)
    expect(scheduleOn(s, '2026-09-30')).toEqual(WEEKDAYS_ONLY)
  })
})

describe('withScheduleEdit', () => {
  it('sets the schedule in force today and records the old one as the baseline', () => {
    const edited = withScheduleEdit(base, SAT_TOO, FRI_NOON)
    expect(edited.wakeSchedule).toEqual(SAT_TOO)
    expect(edited.wakeScheduleHistory).toEqual([
      { from: SCHEDULE_BASELINE_FROM, schedule: WEEKDAYS_ONLY },
      { from: '2026-10-09', schedule: SAT_TOO },
    ])
  })

  it('leaves the other settings alone and never changes its input', () => {
    const before = structuredClone(base)
    const edited = withScheduleEdit({ ...base, dragonName: 'Ember' }, SAT_TOO, FRI_NOON)
    expect(edited.dragonName).toBe('Ember')
    expect(edited.wearing).toEqual(base.wearing)
    expect(base).toEqual(before)
  })

  it('copies the schedule, so later changes to the object passed in do nothing', () => {
    const passed = { ...SAT_TOO }
    const edited = withScheduleEdit(base, passed, FRI_NOON)
    passed.sun = '09:00'
    expect(edited.wakeSchedule.sun).toBeNull()
    expect(edited.wakeScheduleHistory?.at(-1)?.schedule.sun).toBeNull()
  })

  it('replaces the same day’s entry instead of piling up', () => {
    const a = withScheduleEdit(base, SAT_TOO, FRI_NOON)
    const b = withScheduleEdit(a, LATER, FRI_NOON + 60_000)
    const c = withScheduleEdit(b, { ...LATER, tue: '07:15' }, at('2026-10-10T02:00:00+01:00'))
    expect(c.wakeScheduleHistory).toEqual([
      { from: SCHEDULE_BASELINE_FROM, schedule: WEEKDAYS_ONLY },
      { from: '2026-10-09', schedule: { ...LATER, tue: '07:15' } },
    ])
    expect(scheduleOn(c, '2026-10-08')).toEqual(WEEKDAYS_ONLY)
  })

  it('drops today’s entry when an edit goes back to yesterday’s schedule', () => {
    const a = withScheduleEdit(base, SAT_TOO, FRI_NOON)
    const back = withScheduleEdit(a, WEEKDAYS_ONLY, FRI_NOON + 60_000)
    expect(back.wakeSchedule).toEqual(WEEKDAYS_ONLY)
    expect(back.wakeScheduleHistory).toEqual([{ from: SCHEDULE_BASELINE_FROM, schedule: WEEKDAYS_ONLY }])
  })

  it('keeps earlier days as they were judged when the latest entry was out of step', () => {
    const s: Settings = {
      ...base,
      wakeSchedule: LATER,
      wakeScheduleHistory: [
        { from: SCHEDULE_BASELINE_FROM, schedule: WEEKDAYS_ONLY },
        { from: '2026-10-01', schedule: SAT_TOO },
      ],
    }
    const judged = scheduleOn(s, '2026-10-05')
    const edited = withScheduleEdit(s, WEEKDAYS_ONLY, FRI_NOON)
    expect(scheduleOn(edited, '2026-10-05')).toEqual(judged)
    expect(scheduleOn(edited, '2026-10-09')).toEqual(WEEKDAYS_ONLY)
  })

  it('replaces an entry dated after today (from a clock that ran ahead)', () => {
    const ahead = withScheduleEdit(base, SAT_TOO, at('2026-10-20T12:00:00+01:00'))
    const edited = withScheduleEdit(ahead, LATER, FRI_NOON)
    expect(edited.wakeScheduleHistory?.map((e) => e.from)).toEqual([SCHEDULE_BASELINE_FROM, '2026-10-09'])
    expect(scheduleOn(edited, '2026-10-08')).toEqual(WEEKDAYS_ONLY)
    expect(scheduleOn(edited, '2026-10-25')).toEqual(LATER)
  })
})

describe('sameSchedule', () => {
  it('compares every day', () => {
    expect(sameSchedule(WEEKDAYS_ONLY, { ...WEEKDAYS_ONLY })).toBe(true)
    expect(sameSchedule(WEEKDAYS_ONLY, SAT_TOO)).toBe(false)
  })
})

describe('cleanDragonName', () => {
  it('trims spaces from both ends', () => {
    expect(cleanDragonName('  Ember  ', 20)).toBe('Ember')
  })

  it('cuts a long name to the cap, then trims again', () => {
    expect(cleanDragonName('A'.repeat(25), 20)).toBe('A'.repeat(20))
    expect(cleanDragonName('Sir Puffington Smoke', 20)).toBe('Sir Puffington Smoke')
    expect(cleanDragonName('Sir Puffington Smoke the Third', 20)).toBe('Sir Puffington Smoke')
    expect(cleanDragonName('Nineteen letters ab cd', 20)).toBe('Nineteen letters ab')
  })

  it('counts an emoji as one character and never splits it', () => {
    expect(cleanDragonName('🐉'.repeat(25), 20)).toBe('🐉'.repeat(20))
  })

  it('counts a flag or a family emoji as one character (grapheme clusters)', () => {
    const flag = '🇬🇧'
    const family = '👨‍👩‍👧'
    expect(cleanDragonName(flag.repeat(25), 20)).toBe(flag.repeat(20))
    expect(cleanDragonName(`Puff${family.repeat(20)}`, 20)).toBe(`Puff${family.repeat(16)}`)
  })

  it('falls back to code points without Intl.Segmenter', () => {
    // Simulating an engine without it.
    const intl = Intl as unknown as Record<string, unknown>
    const segmenter = intl.Segmenter
    try {
      intl.Segmenter = undefined
      expect(cleanDragonName('🐉'.repeat(25), 20)).toBe('🐉'.repeat(20))
      expect(cleanDragonName('  Ember  ', 20)).toBe('Ember')
    } finally {
      intl.Segmenter = segmenter
    }
  })

  it('makes a blank name null', () => {
    expect(cleanDragonName('', 20)).toBeNull()
    expect(cleanDragonName('   ', 20)).toBeNull()
  })
})
