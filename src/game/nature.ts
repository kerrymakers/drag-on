// Walks and nature (Milestone 10): every log of the walk task brings back a seasonal
// nature find, picked once at log time and saved on the log. Finds are worth no XP.
// Pure: the caller passes the time and the random pick in.

import { activeLogs } from './active'
import { dayKey, gameMonth } from './day'
import type { GameEvent, LogEvent, NatureFind } from './types'

/**
 * The finds in season at `now`: those whose months include the month of the game day
 * (days run 04:00 to 03:59, London), so a walk at 02:00 on 1 Nov brings an October find.
 */
export function natureInSeason(finds: readonly NatureFind[], now: number): NatureFind[] {
  const month = gameMonth(now)
  return finds.filter((f) => f.months.includes(month))
}

/**
 * The find for a new walk log at `now`, or null if nothing is in season (config always
 * has some). Finds in season that haven't been found yet (judged from active logs, so
 * undoing a find puts it back) come first; once they're all found, any find in season
 * can turn up again. `pick` in [0, 1) chooses among them in config order:
 * floor(pick × count). NaN and negatives pick the first; 1 or more picks the last.
 */
export function rollNatureFind(
  events: readonly GameEvent[],
  finds: readonly NatureFind[],
  now: number,
  pick: number,
): string | null {
  const season = natureInSeason(finds, now)
  if (season.length === 0) return null
  const found = new Set(foundNature(events, finds).map((f) => f.find.id))
  const fresh = season.filter((f) => !found.has(f.id))
  const pool = fresh.length > 0 ? fresh : season
  const p = pick >= 0 ? pick : 0
  return pool[Math.min(pool.length - 1, Math.floor(p * pool.length))]!.id
}

/**
 * The nature find id a log brought, or null. Checks the shape at run time, like
 * missionOf: anything but an object with a non-empty string id is null. It doesn't
 * check the id is in config (see natureFor).
 */
export function natureOf(log: LogEvent): string | null {
  const nature: unknown = log.nature
  if (typeof nature !== 'object' || nature === null) return null
  const { id } = nature as { id?: unknown }
  return typeof id === 'string' && id !== '' ? id : null
}

/** The configured find a log brought, or null (none, a malformed one, or an id not in `finds`). */
export function natureFor(log: LogEvent, finds: readonly NatureFind[]): NatureFind | null {
  const id = natureOf(log)
  return id === null ? null : (finds.find((f) => f.id === id) ?? null)
}

export interface FoundNature {
  find: NatureFind
  /** The log that first brought it. */
  logId: string
  timestamp: number
  /** The game day it was first found ("YYYY-MM-DD"). */
  dayKey: string
}

/**
 * The nature finds so far, in the order first found: one entry per find, from the
 * first active log that brought it. Undoing that log takes it away (or moves it to a
 * later log that brought it too). Unknown ids and malformed shapes are ignored.
 */
export function foundNature(events: readonly GameEvent[], finds: readonly NatureFind[]): FoundNature[] {
  const found: FoundNature[] = []
  const seen = new Set<string>()
  for (const log of activeLogs(events)) {
    const find = natureFor(log, finds)
    if (!find || seen.has(find.id)) continue
    seen.add(find.id)
    found.push({ find, logId: log.id, timestamp: log.timestamp, dayKey: dayKey(log.timestamp) })
  }
  return found
}
