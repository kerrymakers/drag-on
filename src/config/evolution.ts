import type { StageId } from '../game/types'

/** The stage at which the dragon first takes on a look from its top stat. */
export const EVOLVES_AT_STAGE: StageId = 'juvenile'

/**
 * Once the dragon has a look, another stat has to lead the current look's stat by
 * more than this share before the look changes (0.10 = more than 10% ahead). Without
 * a margin, a balanced player's look would flip back and forth many times a year; at
 * 5% it still changed about 2–3 times a year in simulation, and at 10% about once.
 */
export const LOOK_CHANGE_MARGIN = 0.1
