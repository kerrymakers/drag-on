import { describe, expect, it } from 'vitest'
import { ITEMS } from '../config/items'
import { at, itemLog, log, undo } from '../testing/helpers'
import { collectionTiles } from './collection-screen'

const T = { id: 'read', xp: 25 }
const NOON = at('2026-10-05T12:00:00+01:00')

describe('collectionTiles', () => {
  it('is all "?" before anything is found, one per item', () => {
    const tiles = collectionTiles([log(T, NOON)], ITEMS)
    expect(tiles).toHaveLength(ITEMS.length)
    expect(tiles.every((t) => t.found === null)).toBe(true)
  })

  it('puts finds first, in the order found, then "?" tiles that say nothing about their item', () => {
    const [a, b] = [ITEMS[3]!, ITEMS[0]!]
    const tiles = collectionTiles([itemLog(T, NOON, a.id), itemLog(T, NOON + 1, b.id)], ITEMS)
    expect(tiles.slice(0, 2).map((t) => t.found?.item.id)).toEqual([a.id, b.id])
    expect(tiles.slice(2)).toEqual(Array.from({ length: ITEMS.length - 2 }, () => ({ found: null })))
  })

  it('drops a find when its log is undone', () => {
    const l = itemLog(T, NOON, ITEMS[0]!.id)
    expect(collectionTiles([l, undo(l, NOON + 1)], ITEMS).every((t) => t.found === null)).toBe(true)
  })

  it('ignores unknown ids, keeping one tile per configured item', () => {
    const tiles = collectionTiles([itemLog(T, NOON, 'from-the-future')], ITEMS)
    expect(tiles).toHaveLength(ITEMS.length)
    expect(tiles.every((t) => t.found === null)).toBe(true)
  })
})
