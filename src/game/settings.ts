// Pure helpers for settings the user edits: the dragon's name and the wake schedule.
//
// Decided 2026-10-09: an edit to the wake schedule applies from the game day of the
// edit on. Past days keep the schedule that was in force then, so an edit can never
// end an existing wake-up streak. The history that makes this work lives on Settings
// (`wakeScheduleHistory`); `wakeSchedule` stays the schedule in force today, so code
// that only asks about today, and saves from before the history existed, work as before.

import { dayKey } from './day'
import type { DayKey, ScheduleEntry, Settings, WakeSchedule, Weekday } from './types'

/**
 * The `from` of the baseline entry written on the first edit: the schedule before it
 * covered every earlier day. Days before the first entry use the first entry anyway,
 * so this is only a readable "since the start".
 */
export const SCHEDULE_BASELINE_FROM: DayKey = '1970-01-01'

export const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

function copySchedule(schedule: WakeSchedule): WakeSchedule {
  return { ...schedule }
}

/** Whether two schedules have the same target on every day. */
export function sameSchedule(a: WakeSchedule, b: WakeSchedule): boolean {
  return WEEKDAYS.every((d) => a[d] === b[d])
}

/**
 * The wake schedule in force on game day `day`. The history must be sorted by `from`
 * (storage sorts it on load; withScheduleEdit keeps it sorted).
 * - No history (older saves, or never edited): `settings.wakeSchedule`, for every day.
 * - On or after the latest entry's day: `settings.wakeSchedule`, the one in force now.
 * - Otherwise: the latest entry starting on or before `day`. A day before every entry
 *   uses the first one, the baseline.
 */
export function scheduleOn(settings: Settings, day: DayKey): WakeSchedule {
  const history = settings.wakeScheduleHistory
  const last = history?.[history.length - 1]
  if (!history || !last || day >= last.from) return settings.wakeSchedule
  let found = history[0]?.schedule ?? settings.wakeSchedule
  for (const entry of history) {
    if (entry.from > day) break
    found = entry.schedule
  }
  return found
}

/**
 * Settings with the wake schedule changed to `schedule` from the game day of `now`
 * on. Earlier days keep the schedule they were judged by:
 * - the first edit records the schedule before it as the baseline for all earlier days;
 * - several edits on one game day replace that day's entry rather than piling up (and
 *   an entry dated after today, from a clock that ran ahead, is replaced too);
 * - an edit back to the schedule that was in force yesterday drops today's entry.
 * An edit at 01:00 belongs to the previous game day, like everything else (dayKey).
 */
export function withScheduleEdit(settings: Settings, schedule: WakeSchedule, now: number): Settings {
  const today = dayKey(now)
  const next = copySchedule(schedule)
  const existing = settings.wakeScheduleHistory ?? []
  // Every day so far, written out as it has been judged: the latest entry's days used
  // `wakeSchedule` (see scheduleOn), so that's what it holds from here on.
  const history: ScheduleEntry[] =
    existing.length > 0
      ? existing.map((e, i) => ({
          from: e.from,
          schedule: copySchedule(i === existing.length - 1 ? settings.wakeSchedule : e.schedule),
        }))
      : [{ from: SCHEDULE_BASELINE_FROM, schedule: copySchedule(settings.wakeSchedule) }]
  const kept = history.filter((e) => e.from < today)
  // Days before the first entry use it, so with nothing kept that's yesterday's schedule.
  const yesterday = kept[kept.length - 1]?.schedule ?? history[0]?.schedule ?? next
  if (kept.length === 0) kept.push({ from: SCHEDULE_BASELINE_FROM, schedule: yesterday })
  if (!sameSchedule(yesterday, next)) kept.push({ from: today, schedule: next })
  return { ...settings, wakeSchedule: next, wakeScheduleHistory: kept }
}

/**
 * The characters of `text` as a person would count them. With Intl.Segmenter (every
 * current browser) that's grapheme clusters, so a flag or a family emoji is one. Without
 * it, Unicode code points: an emoji is never cut in half, but a flag or family emoji
 * counts as several and could be cut between its parts.
 */
function characters(text: string): string[] {
  if (typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment)
  }
  return Array.from(text)
}

/**
 * A typed dragon name, tidied for saving: trimmed, and cut to `max` characters,
 * counted as `characters` does. Blank means no name (null), which the UI shows as
 * "your dragon".
 */
export function cleanDragonName(raw: string, max: number): string | null {
  return cleanText(raw, max)
}

/**
 * `text` cut to at most `max` characters (counted as `characters` does), untrimmed:
 * for keeping a field within its limit while it's being typed.
 */
export function cutText(text: string, max: number): string {
  const chars = characters(text)
  return chars.length <= max ? text : chars.slice(0, Math.max(0, max)).join('')
}

/**
 * Typed text tidied for saving: trimmed, and cut to `max` characters (counted as
 * `characters` does, so an emoji is never cut in half). Blank gives null. Used for the
 * dragon's name and task names.
 */
export function cleanText(raw: string, max: number): string | null {
  const text = characters(raw.trim()).slice(0, Math.max(0, max)).join('').trim()
  return text === '' ? null : text
}
