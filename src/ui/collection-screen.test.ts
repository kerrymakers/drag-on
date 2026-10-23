import { describe, expect, it } from 'vitest'
import { ITEMS } from '../config/items'
import { at, itemLog, log, undo } from '../testing/helpers'
import { NATURE } from '../config/nature'
import { collectionTiles, natureTiles } from './collection-screen'

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

describe('natureTiles', () => {
  const walk = (t: number, id: unknown) => ({ ...log({ id: 'walk', xp: 15 }, t), nature: { id } }) as ReturnType<typeof log>
  it('puts spotted finds first, once each, then a bare "?" per find left; undo and unknown ids drop out', () => {
    const [a, b] = [NATURE[5]!, NATURE[1]!]
    const first = walk(NOON, a.id)
    const tiles = natureTiles([first, walk(NOON + 1, b.id), walk(NOON + 2, a.id), walk(NOON + 3, 'from-later')], NATURE)
    expect(tiles).toHaveLength(NATURE.length)
    expect(tiles.slice(0, 2).map((t) => t?.find.id)).toEqual([a.id, b.id])
    expect(tiles.slice(2).every((t) => t === null)).toBe(true)
    expect(natureTiles([first, undo(first, NOON + 5)], NATURE).every((t) => t === null)).toBe(true)
  })
})
