// What the dragon wears: one found item per spot (head, neck, held). The choice is a
// setting, not a game event; what's actually worn is derived from it and the event
// log, so undoing a find takes the item off, and malformed saved choices show nothing.
// Pure: no DOM, no storage, no clock.

import type { FoundItem } from './rewards'
import type { Item, ItemSlot, Wearing } from './types'

/** Every spot, in the order they're listed. */
export const WEAR_SLOTS: readonly ItemSlot[] = ['head', 'neck', 'held']

/** Nothing worn anywhere. */
export const NOTHING_WORN: Readonly<Wearing> = Object.freeze({ head: null, neck: null, held: null })

/** The item worn in each spot, or null. */
export type WornItems = Record<ItemSlot, Item | null>

/**
 * What the dragon is actually wearing. A spot shows its chosen item only if the id
 * is a configured item (in `items`), that item belongs in this spot, and it's found
 * right now (in `found`, so undoing its find takes it off, and finding it again puts
 * it back). Anything else in a spot (an unknown id, the wrong spot, a non-string from
 * hand-edited data, a missing `wearing`) counts as nothing.
 */
export function wornItems(
  wearing: Partial<Record<ItemSlot, unknown>> | null | undefined,
  found: readonly FoundItem[],
  items: readonly Item[],
): WornItems {
  const foundIds = new Set(found.map((f) => f.item.id))
  const worn: WornItems = { head: null, neck: null, held: null }
  for (const slot of WEAR_SLOTS) {
    const id: unknown = wearing?.[slot]
    if (typeof id !== 'string' || !foundIds.has(id)) continue
    const item = items.find((i) => i.id === id)
    if (item && item.slot === slot) worn[slot] = item
  }
  return worn
}

/** The worn items, in spot order (head, neck, held). */
export function wornList(worn: WornItems): Item[] {
  return WEAR_SLOTS.map((slot) => worn[slot]).filter((i): i is Item => i !== null)
}

/**
 * Tapping an item: puts it on, replacing whatever was chosen for its spot, or takes it
 * off if it's already the choice for that spot. Other spots are left alone.
 */
export function toggleWear(wearing: Wearing, item: Item): Wearing {
  return { ...wearing, [item.slot]: wearing[item.slot] === item.id ? null : item.id }
}

/**
 * A new find goes on by itself only if its spot is free: nothing is worn there right
 * now (see wornItems, so a choice whose find was undone counts as free). It never
 * replaces something being worn. `found` is the finds including this one. Returns
 * `wearing` itself when nothing changes.
 */
export function wearOnFind(
  wearing: Wearing,
  item: Item,
  found: readonly FoundItem[],
  items: readonly Item[],
): Wearing {
  if (wearing[item.slot] === item.id) return wearing
  if (wornItems(wearing, found, items)[item.slot] !== null) return wearing
  return { ...wearing, [item.slot]: item.id }
}

/** True if this item is being worn. */
export function isWorn(worn: WornItems, item: Item): boolean {
  return worn[item.slot]?.id === item.id
}
