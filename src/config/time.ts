import type { WakeSchedule } from '../game/types'

export const TIME_ZONE = 'Europe/London'

/** A day runs from this wall-clock hour to just before it the next morning. */
export const DAY_START_HOUR = 4

/** Minutes after the wake target during which "Got up on time" still counts. */
export const WAKE_GRACE_MINUTES = 15

export const DEFAULT_WAKE_SCHEDULE: WakeSchedule = {
  mon: '06:30',
  tue: '06:30',
  wed: '06:30',
  thu: '06:30',
  fri: '06:30',
  sat: null,
  sun: null,
}
