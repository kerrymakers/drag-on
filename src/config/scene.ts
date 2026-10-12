// The sky behind the dragon on Home follows the time of day in London.
// Not balancing: nothing here changes XP, stages or rewards.

export interface SunTimes {
  /** Sunrise, "HH:MM" on the GMT clock. */
  rise: string
  /** Sunset, "HH:MM" on the GMT clock. */
  set: string
}

export interface SceneConfig {
  /**
   * Roughly when the sun rises and sets in London on the 15th of each month, January
   * first (12 rows). Days in between are blended in a straight line between the rows
   * either side (game/scene.ts, sunOn). In GMT, so the clock change moves them by
   * itself: in summer the London clock reads an hour later (June's 03:45 is 04:45 BST).
   */
  sun: readonly SunTimes[]
  /** Dawn runs this long either side of sunrise, and evening either side of sunset. */
  twilightMinutes: number
}

export const SCENE: SceneConfig = {
  sun: [
    { rise: '08:00', set: '16:20' }, // Jan
    { rise: '07:20', set: '17:15' }, // Feb
    { rise: '06:15', set: '18:05' }, // Mar
    { rise: '05:10', set: '18:55' }, // Apr (06:10 and 19:55 BST)
    { rise: '04:15', set: '19:45' }, // May
    { rise: '03:45', set: '20:20' }, // Jun
    { rise: '04:05', set: '20:10' }, // Jul
    { rise: '04:50', set: '19:20' }, // Aug
    { rise: '05:40', set: '18:10' }, // Sep
    { rise: '06:25', set: '17:05' }, // Oct
    { rise: '07:20', set: '16:15' }, // Nov
    { rise: '08:00', set: '15:55' }, // Dec
  ],
  twilightMinutes: 30,
}
