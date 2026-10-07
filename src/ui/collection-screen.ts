// The Collection screen: every rare item, found or not. A found item shows its
// drawing, name and when it was found. One not found yet is a plain "?" that gives
// nothing away (no name, no silhouette).

import { itemSvg } from '../art'
import { dayKey } from '../game/day'
import { foundItems, type FoundItem } from '../game/rewards'
import type { GameEvent, Item } from '../game/types'
import { COLLECTION, collectionCount, collectionLine, foundTileLabel, friendlyDay } from './copy'
import { watchScrollFade } from './scroll-fade'

export interface CollectionScreenState {
  events: readonly GameEvent[]
  now: number
}

export interface CollectionScreen {
  render(state: CollectionScreenState): void
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string) {
  const e = doc.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

export interface CollectionTile {
  /** Null for an item not found yet: the tile must not reveal which item it is. */
  found: FoundItem | null
}

/**
 * The tiles in display order: found items first, in the order they were found, then
 * one "?" per item still to find. Unfound tiles carry nothing about their item, so
 * their position can't hint at which item is left.
 */
export function collectionTiles(events: readonly GameEvent[], items: readonly Item[]): CollectionTile[] {
  const found = foundItems(events, items)
  const tiles: CollectionTile[] = found.map((f) => ({ found: f }))
  for (let i = found.length; i < items.length; i++) tiles.push({ found: null })
  return tiles
}

export function createCollectionScreen(
  doc: Document,
  root: HTMLElement,
  config: { items: readonly Item[] },
): CollectionScreen {
  const scroller = el(doc, 'div', 'cs-scroll scroll-fade')
  const header = el(doc, 'header', 'cs-header')
  const title = el(doc, 'h1', 'cs-title', COLLECTION.title)
  title.id = 'cs-title'
  const count = el(doc, 'p', 'cs-count')
  const line = el(doc, 'p', 'cs-line')
  header.append(title, count, line)
  const grid = el(doc, 'ul', 'item-grid')
  grid.setAttribute('aria-labelledby', 'cs-title')
  scroller.append(header, grid)
  root.replaceChildren(scroller)
  const refreshFade = watchScrollFade(scroller)

  let signature = ''

  return {
    render({ events, now }) {
      const today = dayKey(now)
      const tiles = collectionTiles(events, config.items)
      const sig = `${today}|${tiles.map((t) => (t.found ? `${t.found.item.id}@${t.found.dayKey}` : '?')).join(',')}`
      if (sig === signature) return
      signature = sig

      const foundCount = tiles.filter((t) => t.found).length
      count.textContent = collectionCount(foundCount, config.items.length)
      line.textContent = collectionLine(foundCount, config.items.length)

      grid.replaceChildren(
        ...tiles.map(({ found }) => {
          const li = el(doc, 'li', 'item-tile')
          const art = el(doc, 'div', 'item-tile-art')
          art.setAttribute('aria-hidden', 'true')
          if (!found) {
            li.classList.add('is-unknown')
            art.textContent = COLLECTION.unknown
            const label = el(doc, 'span', 'visually-hidden', COLLECTION.unknownLabel)
            li.append(art, label)
            return li
          }
          li.classList.add('is-found')
          li.dataset.item = found.item.id
          art.innerHTML = itemSvg(found.item.id)
          const friendly = friendlyDay(found.dayKey, today)
          const name = el(doc, 'span', 'item-tile-name', found.item.name)
          const date = el(doc, 'span', 'item-tile-date', friendly)
          // One clear sentence for screen readers instead of two fragments.
          const label = el(doc, 'span', 'visually-hidden', foundTileLabel(found.item.name, friendly))
          name.setAttribute('aria-hidden', 'true')
          date.setAttribute('aria-hidden', 'true')
          li.append(art, name, date, label)
          return li
        }),
      )
      refreshFade()
    },
  }
}
