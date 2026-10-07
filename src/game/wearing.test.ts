import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { ITEMS } from '../config/items'
import { at, itemLog, log, undo } from '../testing/helpers'
import { foundItems } from './rewards'
import type { GameEvent, Item, Wearing } from './types'
import { NOTHING_WORN, WEAR_SLOTS, isWorn, toggleWear, wearOnFind, wornItems, wornList } from './wearing'

const POOL: readonly Item[] = [
  { id: 'hat', name: 'Hat', slot: 'head' },
  { id: 'cap', name: 'Cap', slot: 'head' },
  { id: 'scarf', name: 'Scarf', slot: 'neck' },
  { id: 'book', name: 'Book', slot: 'held' },
]
const [HAT, CAP, SCARF, BOOK] = POOL as [Item, Item, Item, Item]
const T = { id: 'read', xp: 25 }
const NOON = at('2026-10-05T12:00:00+01:00')
const NONE: Wearing = { head: null, neck: null, held: null }

/** Logs that found each of these items, a minute apart. */
const finds = (...items: Item[]): GameEvent[] => items.map((it, k) => itemLog(T, NOON + k * 60_000, it.id, `f-${it.id}`))
const found = (events: readonly GameEvent[]) => foundItems(events, POOL)
const worn = (wearing: unknown, events: readonly GameEvent[]) =>
  wornItems(wearing as Partial<Wearing>, found(events), POOL)

describe('wornItems', () => {
  it('wears nothing by default', () => {
    expect(worn(NONE, finds(HAT, SCARF, BOOK))).toEqual({ head: null, neck: null, held: null })
    expect(worn(DEFAULT_SETTINGS.wearing, finds(HAT))).toEqual({ head: null, neck: null, held: null })
    expect(NOTHING_WORN).toEqual(NONE)
  })

  it('wears a found item in its own spot, one per spot', () => {
    const events = finds(HAT, SCARF, BOOK)
    expect(worn({ head: 'hat', neck: 'scarf', held: 'book' }, events)).toEqual({ head: HAT, neck: SCARF, held: BOOK })
    expect(worn({ head: 'hat', neck: null, held: null }, events)).toEqual({ head: HAT, neck: null, held: null })
  })

  it('ignores an item chosen for the wrong spot', () => {
    const events = finds(HAT, SCARF, BOOK)
    expect(worn({ head: 'scarf', neck: 'book', held: 'hat' }, events)).toEqual({ head: null, neck: null, held: null })
  })

  it('ignores an unknown id, even one a log claims to have found', () => {
    const events = [...finds(HAT), itemLog(T, NOON + 1, 'from-the-future')]
    expect(worn({ head: 'from-the-future', neck: 'nope', held: '' }, events)).toEqual(NONE)
  })

  it('ignores an item that has not been found', () => {
    expect(worn({ head: 'hat', neck: 'scarf', held: 'book' }, finds(HAT))).toEqual({ head: HAT, neck: null, held: null })
    expect(worn({ head: 'hat', neck: null, held: null }, [log(T, NOON)])).toEqual(NONE)
  })

  it('takes an item off when its find is undone', () => {
    const [f] = finds(HAT)
    const events = [f!, undo(f!, NOON + 120_000)]
    expect(worn({ head: 'hat', neck: null, held: null }, events)).toEqual(NONE)
  })

  it('puts it back on if the same item is found again after the undo', () => {
    const [f] = finds(HAT)
    const events = [f!, undo(f!, NOON + 120_000), itemLog(T, NOON + 180_000, 'hat')]
    expect(worn({ head: 'hat', neck: null, held: null }, events)).toEqual({ head: HAT, neck: null, held: null })
  })

  it('is safe with malformed saved choices', () => {
    const events = finds(HAT, SCARF, BOOK)
    for (const bad of [undefined, null, {}, { head: 42 }, { head: ['hat'] }, { head: { id: 'hat' } }, { neck: true }]) {
      expect(worn(bad, events), JSON.stringify(bad)).toEqual(NONE)
    }
    // Prototype names are not items.
    expect(worn({ head: 'toString', neck: '__proto__', held: 'constructor' }, events)).toEqual(NONE)
  })

  it('works with the real item list, where every item has a spot', () => {
    const events = ITEMS.map((it, k) => itemLog(T, NOON + k, it.id))
    const all = foundItems(events, ITEMS)
    for (const item of ITEMS) {
      const w = wornItems({ ...NONE, [item.slot]: item.id }, all, ITEMS)
      expect(w[item.slot], item.id).toBe(item)
    }
  })
})

describe('wornList', () => {
  it('lists the worn items in spot order', () => {
    expect(wornList({ head: HAT, neck: null, held: BOOK })).toEqual([HAT, BOOK])
    expect(wornList({ head: null, neck: null, held: null })).toEqual([])
    expect(WEAR_SLOTS).toEqual(['head', 'neck', 'held'])
  })
})

describe('isWorn', () => {
  it('is true only for the item in its spot', () => {
    const w = { head: HAT, neck: null, held: null }
    expect(isWorn(w, HAT)).toBe(true)
    expect(isWorn(w, CAP)).toBe(false)
    expect(isWorn(w, SCARF)).toBe(false)
  })
})

describe('toggleWear', () => {
  it('puts an item on in its own spot', () => {
    expect(toggleWear(NONE, HAT)).toEqual({ head: 'hat', neck: null, held: null })
    expect(toggleWear(NONE, BOOK)).toEqual({ head: null, neck: null, held: 'book' })
  })

  it('takes it off when tapped again', () => {
    expect(toggleWear(toggleWear(NONE, SCARF), SCARF)).toEqual(NONE)
  })

  it('swaps within a spot, leaving the other spots alone', () => {
    const start: Wearing = { head: 'hat', neck: 'scarf', held: 'book' }
    expect(toggleWear(start, CAP)).toEqual({ head: 'cap', neck: 'scarf', held: 'book' })
  })

  it('does not change the original', () => {
    const start: Wearing = { head: null, neck: null, held: null }
    toggleWear(start, HAT)
    expect(start).toEqual(NONE)
  })
})

describe('wearOnFind', () => {
  it('puts a new find on when its spot is free', () => {
    const events = finds(HAT)
    expect(wearOnFind(NONE, HAT, found(events), POOL)).toEqual({ head: 'hat', neck: null, held: null })
  })

  it('never replaces what is already worn in that spot', () => {
    const events = finds(HAT, CAP)
    const wearing: Wearing = { head: 'hat', neck: null, held: null }
    expect(wearOnFind(wearing, CAP, found(events), POOL)).toBe(wearing)
  })

  it('fills a free spot even when other spots are taken', () => {
    const events = finds(HAT, SCARF)
    const wearing: Wearing = { head: 'hat', neck: null, held: null }
    expect(wearOnFind(wearing, SCARF, found(events), POOL)).toEqual({ head: 'hat', neck: 'scarf', held: null })
  })

  it('counts a spot as free when its chosen item was undone', () => {
    const [h] = finds(HAT)
    const events = [h!, undo(h!, NOON + 120_000), itemLog(T, NOON + 180_000, 'cap')]
    const wearing: Wearing = { head: 'hat', neck: null, held: null }
    expect(wearOnFind(wearing, CAP, found(events), POOL)).toEqual({ head: 'cap', neck: null, held: null })
  })

  it('counts a spot holding something malformed as free', () => {
    const events = finds(BOOK)
    const wearing = { head: null, neck: null, held: 'from-the-future' }
    expect(wearOnFind(wearing, BOOK, found(events), POOL)).toEqual({ head: null, neck: null, held: 'book' })
  })

  it('leaves things alone when the find is already the choice for its spot', () => {
    const events = finds(HAT)
    const wearing: Wearing = { head: 'hat', neck: null, held: null }
    expect(wearOnFind(wearing, HAT, found(events), POOL)).toBe(wearing)
  })
})
