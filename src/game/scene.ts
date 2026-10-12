// Which sky to show behind the dragon: dawn, day, evening or night, from the time of
// day in London. Pure: the caller passes the time in.

import type { SceneConfig, SunTimes } from '../config/scene'
import { clockMinutes, daysInMonth, londonClock } from './day'

export type SkyPeriod = 'dawn' | 'day' | 'evening' | 'night'

/**
 * Sunrise and sunset (GMT minutes since midnight) on a calendar date, blended in a
 * straight line between the mid-month rows either side (each row is the 15th), so the
 * sky never jumps at the turn of a month. Null if a row it needs is missing or broken.
 */
export function sunOn(year: number, month: number, day: number, sun: readonly SunTimes[]): { rise: number; set: number } | null {
  const row = (m: number) => {
    const r = sun[(((m - 1) % 12) + 12) % 12]
    const rise = r ? clockMinutes(r.rise) : null
    const set = r ? clockMinutes(r.set) : null
    return rise === null || set === null ? null : { rise, set }
  }
  // From the 15th of one month to the 15th of the next is as many days as the first month has.
  const [from, span, into] =
    day >= 15
      ? [month, daysInMonth(year, month), day - 15]
      : [month - 1, daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1), day - 15 + daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1)]
  const a = row(from)
  const b = row(from + 1)
  if (!a || !b) return null
  const t = into / span
  return { rise: a.rise + (b.rise - a.rise) * t, set: a.set + (b.set - a.set) * t }
}

/**
 * The sky period at `now`, from that day's sunrise and sunset (sunOn, from the config's
 * GMT table, moved onto the London clock). Dawn is from `twilightMinutes` before
 * sunrise to as long after; evening the same around sunset; day in between; night the
 * rest. Follows the real clock, not the 04:00 game day.
 */
export function skyPeriod(now: number, config: SceneConfig): SkyPeriod {
  const { year, month, day, minutes, aheadOfGmt } = londonClock(now)
  const sun = sunOn(year, month, day, config.sun)
  if (!sun) return 'day' // a broken row: a calm, ordinary sky
  const t = config.twilightMinutes
  const r = sun.rise + aheadOfGmt
  const s = sun.set + aheadOfGmt
  if (minutes >= r - t && minutes < r + t) return 'dawn'
  if (minutes >= r + t && minutes < s - t) return 'day'
  if (minutes >= s - t && minutes < s + t) return 'evening'
  return 'night'
}
