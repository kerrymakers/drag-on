// What the art needs to draw the outfit: just the item ids by spot. The game decides
// what's worn (wornItems); the art never imports game code.

import type { WearLook } from '../art'
import type { WornItems } from '../game/wearing'

export function outfitOf(worn: WornItems): WearLook {
  return { head: worn.head?.id ?? null, neck: worn.neck?.id ?? null, held: worn.held?.id ?? null }
}
