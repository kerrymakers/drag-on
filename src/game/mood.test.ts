import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { MOODS } from '../config/mood'
import { at, log, undo } from '../testing/helpers'
import { moodFor, nextRefreshAt } from './state'
import type { MoodId, MoodLevel } from './types'

const gym = { id: 'gym', xp: 40 }
// October 2026 is BST (+01:00) until the 25th.
const day = (d: number, time = '12:00') => at(`2026-10-${String(d).padStart(2, '0')}T${time}:00+01:00`)
const startOf = (id: MoodId) => {
  const m = MOODS.find((x) => x.id === id)
  if (!m) throw new Error(id)
  return m.fromDays
}

describe('moodFor', () => {
  it('is happy with no logs at all', () => {
    expect(moodFor([], day(10), MOODS)).toEqual({ mood: 'happy', daysSinceLog: null, lastLogDay: null })
  })

  it('is happy on the day of a log, and reports where the gap starts', () => {
    expect(moodFor([log(gym, day(10, '08:00'))], day(10, '23:00'), MOODS)).toEqual({
      mood: 'happy',
      daysSinceLog: 0,
      lastLogDay: '2026-10-10',
    })
  })

  it('changes mood exactly at each configured boundary', () => {
    const events = [log(gym, day(1))]
    const sorted = [...MOODS].sort((a, b) => a.fromDays - b.fromDays)
    sorted.forEach((m, i) => {
      expect(moodFor(events, day(1 + m.fromDays), MOODS)).toMatchObject({ mood: m.id, daysSinceLog: m.fromDays })
      const prev = sorted[i - 1]
      if (prev) expect(moodFor(events, day(m.fromDays), MOODS).mood).toBe(prev.id) // one day earlier
    })
    expect(moodFor(events, day(25), MOODS).mood).toBe('grumpy')
  })

  it('uses the agreed thresholds: content 1–2, sleepy 3–4, curled up from 5', () => {
    const events = [log(gym, day(10))]
    const moodAfter = (days: number) => moodFor(events, day(10 + days), MOODS).mood
    expect([0, 1, 2, 3, 4, 5, 6].map(moodAfter)).toEqual([
      'happy',
      'content',
      'content',
      'sleepy',
      'sleepy',
      'grumpy',
      'grumpy',
    ])
  })

  it('counts game days, so a log at 03:59 belongs to the day before', () => {
    // Logged in the small hours of the 11th: still the 10th's game day.
    expect(moodFor([log(gym, day(11, '03:59'))], day(11, '12:00'), MOODS).daysSinceLog).toBe(1)
    expect(moodFor([log(gym, day(11, '04:00'))], day(11, '12:00'), MOODS).daysSinceLog).toBe(0)
  })

  it('changes at 04:00, not midnight', () => {
    const events = [log(gym, day(10, '20:00'))]
    expect(moodFor(events, day(11, '03:59'), MOODS).mood).toBe('happy')
    expect(moodFor(events, day(11, '04:00'), MOODS).mood).toBe('content')
  })

  it('changes when the screen refreshes at the next day start', () => {
    const events = [log(gym, day(10, '20:00'))]
    const refresh = nextRefreshAt(DEFAULT_SETTINGS, day(10, '22:00'))
    expect(moodFor(events, refresh - 1, MOODS).mood).toBe('happy')
    expect(moodFor(events, refresh, MOODS).mood).toBe('content')
  })

  it('uses the newest active log, so undo can change the mood', () => {
    const gap = startOf('grumpy')
    const old = log(gym, day(1))
    const today = log({ id: 'walk', xp: 15 }, day(1 + gap, '09:00'))
    const now = day(1 + gap, '10:00')
    expect(moodFor([old, today], now, MOODS).mood).toBe('happy')
    const undone = [old, today, undo(today, day(1 + gap, '09:01'))]
    expect(moodFor(undone, now, MOODS)).toEqual({ mood: 'grumpy', daysSinceLog: gap, lastLogDay: '2026-10-01' })
  })

  it('is happy again with no logs once every log is undone', () => {
    const only = log(gym, day(1))
    expect(moodFor([only, undo(only, day(1, '13:00'))], day(12), MOODS).mood).toBe('happy')
  })

  it('picks the newest log by timestamp, not append order', () => {
    const events = [log(gym, day(12)), log({ id: 'walk', xp: 15 }, day(9))]
    expect(moodFor(events, day(12, '20:00'), MOODS)).toMatchObject({ mood: 'happy', lastLogDay: '2026-10-12' })
  })

  it('clamps a future-dated log (clock skew) to today', () => {
    expect(moodFor([log(gym, day(15))], day(12), MOODS)).toMatchObject({ mood: 'happy', daysSinceLog: 0 })
  })

  it('follows the configured table, in any order', () => {
    const custom: MoodLevel[] = [
      { id: 'grumpy', fromDays: 10 },
      { id: 'happy', fromDays: 0 },
      { id: 'sleepy', fromDays: 3 },
    ]
    const events = [log(gym, day(1))]
    expect(moodFor(events, day(3), custom).mood).toBe('happy')
    expect(moodFor(events, day(4), custom).mood).toBe('sleepy')
    expect(moodFor(events, day(11), custom).mood).toBe('grumpy')
  })

  it('counts across a clock change by calendar day', () => {
    const events = [log(gym, at('2026-10-24T20:00:00+01:00'))]
    // Sat evening BST to Mon morning GMT: two game days.
    expect(moodFor(events, at('2026-10-26T09:00:00Z'), MOODS).daysSinceLog).toBe(2)
  })
})
