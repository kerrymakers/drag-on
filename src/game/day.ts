// The one shared date helper. Every "which day is this?" question goes through here.
//
// Days run from DAY_START_HOUR (04:00) to 03:59 on the Europe/London wall clock.
// We read the wall clock with Intl and step back a *calendar* day when the hour is
// before the boundary. We never subtract 4 hours from the instant, which goes wrong
// on clock-change days.

import { DAY_START_HOUR, TIME_ZONE } from '../config/time'
import type { Weekday } from './types'

interface WallClock {
  year: number
  month: number // 1-12
  day: number
  hour: number // 0-23
  minute: number
}

const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function wallClock(timestamp: number): WallClock {
  const parts: Record<string, number> = {}
  for (const p of formatter.formatToParts(timestamp)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    year: parts.year ?? 0,
    month: parts.month ?? 1,
    day: parts.day ?? 1,
    hour: (parts.hour ?? 0) % 24,
    minute: parts.minute ?? 0,
  }
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0')
}

/** Calendar date arithmetic on a Y-M-D, independent of any time zone. */
function shiftDate(year: number, month: number, day: number, deltaDays: number): string {
  const d = new Date(Date.UTC(year, month - 1, day + deltaDays))
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

/** The game day ("YYYY-MM-DD") a timestamp belongs to. 01:00 counts towards the previous day. */
export function dayKey(timestamp: number): string {
  const c = wallClock(timestamp)
  return shiftDate(c.year, c.month, c.day, c.hour < DAY_START_HOUR ? -1 : 0)
}

/**
 * Whole wall-clock minutes since the day started at 04:00 (0 to 1439).
 * Seconds are dropped, so 06:45:59 is the same minute as 06:45:00.
 */
export function minutesSinceDayStart(timestamp: number): number {
  const c = wallClock(timestamp)
  return toDayMinutes(c.hour * 60 + c.minute)
}

/** Converts a wall-clock "HH:MM" into minutes since the 04:00 day start, or null if malformed. */
export function clockToDayMinutes(hhmm: string): number | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return toDayMinutes(h * 60 + min)
}

/** The inverse of clockToDayMinutes: minutes since 04:00 back to a wall-clock "HH:MM". */
export function dayMinutesToClock(dayMinutes: number): string {
  const m = (((dayMinutes + DAY_START_HOUR * 60) % (24 * 60)) + 24 * 60) % (24 * 60)
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}

function toDayMinutes(minutesSinceMidnight: number): number {
  return (minutesSinceMidnight - DAY_START_HOUR * 60 + 24 * 60) % (24 * 60)
}

const DAY_MS = 24 * 60 * 60 * 1000

/** The London clock's lead over UTC at instant `t`, in ms (0 in GMT, 1 hour in BST). */
function offsetAt(t: number): number {
  const c = wallClock(t)
  return Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute) - Math.floor(t / 60_000) * 60_000
}

/**
 * The instant at which the London wall clock reads the given date and time.
 *
 * Clock changes make some wall times missing or doubled, and we map them like this:
 * - A missing time (01:00 to 01:59 on the spring-forward day) maps to the instant
 *   using the offset from before the change, which reads one hour later on the clock.
 *   So 01:30 becomes 01:30 UTC, which is 02:30 BST.
 * - A doubled time (01:00 to 01:59 on the fall-back day) maps to the later
 *   occurrence, in GMT.
 *
 * The day-start (04:00) and wake times are never missing or doubled in London, so
 * this only matters for completeness. There is at most one change in a 48-hour
 * window, so the offsets a day either side are the only two candidates.
 */
function instantOfWallClock(year: number, month: number, day: number, minutesSinceMidnight: number): number {
  const wall = Date.UTC(year, month - 1, day, 0, minutesSinceMidnight)
  const before = offsetAt(wall - DAY_MS)
  const after = offsetAt(wall + DAY_MS)
  const matches = [wall - before, wall - after].filter((t) => t + offsetAt(t) === wall)
  if (matches.length > 0) return Math.max(...matches) // doubled: the later one
  return wall - before // missing: carry on with the offset from before the change
}

/**
 * The instant at which game day `key` is `dayMinutes` minutes past its 04:00 start
 * on the wall clock. dayMinutes may run past midnight (up to 1439 = 03:59 next morning).
 */
export function instantInDay(key: string, dayMinutes: number): number {
  const [y, m, d] = key.split('-').map(Number)
  return instantOfWallClock(y ?? 1970, m ?? 1, d ?? 1, DAY_START_HOUR * 60 + dayMinutes)
}

function keyToUtc(key: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!m) throw new Error(`Bad day key: ${key}`)
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/**
 * Whole calendar days from one day key to another (negative if `to` is earlier).
 * Pure date arithmetic on the keys, so clock changes can't make a day 23 or 25 hours.
 */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / 86_400_000)
}

/** The game day after `key`. */
export function nextDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return shiftDate(y ?? 1970, m ?? 1, d ?? 1, 1)
}

/** The game day `delta` days after `key` (before it, if negative). Calendar arithmetic only. */
export function shiftDayKey(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number)
  return shiftDate(y ?? 1970, m ?? 1, d ?? 1, delta)
}

/** The next 04:00 day start strictly after `now`. */
export function nextDayStart(now: number): number {
  return instantInDay(nextDayKey(dayKey(now)), 0)
}

const WEEKDAYS: readonly Weekday[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Day of the week for a day key, worked out from the calendar date alone. */
export function weekdayOf(key: string): Weekday {
  const [y, m, d] = key.split('-').map(Number)
  const weekday = WEEKDAYS[new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()]
  if (!weekday) throw new Error(`Bad day key: ${key}`)
  return weekday
}
