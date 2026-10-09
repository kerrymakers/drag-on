import type { Settings } from '../game/types'
import { DEFAULT_WAKE_SCHEDULE } from './time'

export const DEFAULT_SETTINGS: Settings = {
  wakeSchedule: { ...DEFAULT_WAKE_SCHEDULE },
  dragonName: null,
  // Nothing worn to start with. Older saves without `wearing` load as this.
  wearing: { head: null, neck: null, held: null },
}

/** The longest dragon name, in characters. Longer names are cut to this. */
export const DRAGON_NAME_MAX = 20
