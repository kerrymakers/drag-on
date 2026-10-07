// Rare items: the collectibles a rare reward roll can bring (see config/rewards.ts).
// Ids are stable: saved rewards refer to them, so never rename or reuse an id.
// The order is the pick order (a rare roll picks among the items not found yet).
// How each item looks lives in src/art/items.ts; `slot` is where it will sit once
// equipping arrives (Milestone 4 slice 3).

import type { Item } from '../game/types'

export const ITEMS: readonly Item[] = [
  { id: 'bow', name: 'Ribbon bow', slot: 'head' },
  { id: 'beanie', name: 'Woolly beanie', slot: 'head' },
  { id: 'crown', name: 'Paper crown', slot: 'head' },
  { id: 'flower', name: 'Daisy clip', slot: 'head' },
  { id: 'scarf', name: 'Stripy scarf', slot: 'neck' },
  { id: 'bell', name: 'Jingle bell', slot: 'neck' },
  { id: 'bandana', name: 'Spotty bandana', slot: 'neck' },
  { id: 'pendant', name: 'Star pendant', slot: 'neck' },
  { id: 'book', name: 'Tiny book', slot: 'held' },
  { id: 'gem', name: 'Shiny gem', slot: 'held' },
  { id: 'teacup', name: 'Little teacup', slot: 'held' },
  { id: 'lantern', name: 'Paper lantern', slot: 'held' },
  // Added 2026-10-07 (pool 12 -> 18). Appended, so earlier ids and pick order are unchanged.
  { id: 'partyhat', name: 'Party hat', slot: 'head' },
  { id: 'acorn', name: 'Acorn cap', slot: 'head' },
  { id: 'bowtie', name: 'Bow tie', slot: 'neck' },
  { id: 'shells', name: 'Shell necklace', slot: 'neck' },
  { id: 'mushroom', name: 'Little mushroom', slot: 'held' },
  { id: 'balloon', name: 'Heart balloon', slot: 'held' },
]
