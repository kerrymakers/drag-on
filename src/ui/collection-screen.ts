// The Collection screen: every rare item, found or not. A found item shows its
// drawing, name and when it was found, and is a button: tap to wear it, tap again to
// take it off (one item per spot). One not found yet is a plain "?" that gives
// nothing away (no name, no silhouette). A small preview of the dragon in its outfit
// sits at the top.

import { itemSvg, react, renderDragon, type DragonLook } from '../art'
import { dayKey } from '../game/day'
import { foundItems, type FoundItem } from '../game/rewards'
import type { GameEvent, Item } from '../game/types'
import { isWorn, type WornItems } from '../game/wearing'
import { COLLECTION, collectionCount, collectionLine, foundTileLabel, friendlyDay, wearToast } from './copy'
import { watchScrollFade } from './scroll-fade'
import { createToast } from './toast'

export interface CollectionScreenState {
  events: readonly GameEvent[]
  now: number
  /** What's worn right now (derived: see wornItems). */
  worn: WornItems
  /** The dragon as it looks now, outfit included, for the preview. */
  dragon: DragonLook
}

export interface CollectionScreenConfig {
  items: readonly Item[]
  /**
   * A found tile was tapped: put the item on or take it off, save, and re-render.
   * Returns true if the item is now worn.
   */
  onWear(item: Item): boolean
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

export function createCollectionScreen(doc: Document, root: HTMLElement, config: CollectionScreenConfig): CollectionScreen {
  const scroller = el(doc, 'div', 'cs-scroll scroll-fade')
  const header = el(doc, 'header', 'cs-header')
  // The dragon in its outfit. Decorative: the tiles say what's worn.
  const preview = el(doc, 'div', 'cs-art')
  preview.setAttribute('aria-hidden', 'true')
  preview.addEventListener('click', () => react(preview, 'tap'))
  const title = el(doc, 'h1', 'cs-title', COLLECTION.title)
  title.id = 'cs-title'
  const count = el(doc, 'p', 'cs-count')
  const line = el(doc, 'p', 'cs-line')
  const hint = el(doc, 'p', 'cs-hint')
  header.append(preview, title, count, line, hint)
  const grid = el(doc, 'ul', 'item-grid')
  grid.setAttribute('aria-labelledby', 'cs-title')
  scroller.append(header, grid)

  // A gentle toast after wearing or taking something off, above the tab bar.
  const dock = el(doc, 'div', 'cs-toast-dock')
  const toastEl = el(doc, 'div', 'toast cs-toast')
  toastEl.setAttribute('role', 'status')
  toastEl.setAttribute('aria-live', 'polite')
  const toastText = el(doc, 'span', 'toast-text')
  const toastUndo = el(doc, 'button', 'toast-undo', 'Undo')
  toastUndo.type = 'button'
  toastUndo.hidden = true
  toastUndo.disabled = true
  toastEl.append(toastText, toastUndo)
  dock.append(toastEl)
  root.replaceChildren(scroller, dock)
  const toast = createToast(toastEl, toastText, toastUndo)
  const refreshFade = watchScrollFade(scroller)

  let signature = ''
  let egg = false
  let buttons = new Map<string, { button: HTMLButtonElement; item: Item }>()

  grid.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button.item-tile')
    const entry = button?.dataset.item ? buttons.get(button.dataset.item) : undefined
    if (!entry) return
    const on = config.onWear(entry.item)
    react(preview, 'perk')
    toast.show(wearToast(entry.item.name, on, egg))
  })

  return {
    render({ events, now, worn, dragon }) {
      renderDragon(preview, dragon)
      egg = dragon.stage === 'egg'
      const today = dayKey(now)
      const tiles = collectionTiles(events, config.items)
      const foundCount = tiles.filter((t) => t.found).length
      hint.textContent = egg ? COLLECTION.eggLine : foundCount > 0 ? COLLECTION.wearHint : ''
      hint.hidden = hint.textContent === ''

      // Rebuild the tiles only when the finds change, so a tap never swaps a button
      // out from under a finger or drops focus. What's worn is updated in place.
      const sig = `${today}|${tiles.map((t) => (t.found ? `${t.found.item.id}@${t.found.dayKey}` : '?')).join(',')}`
      if (sig !== signature) {
        signature = sig
        count.textContent = collectionCount(foundCount, config.items.length)
        line.textContent = collectionLine(foundCount, config.items.length)
        buttons = new Map()
        grid.replaceChildren(...tiles.map(({ found }) => tile(found, today)))
        refreshFade()
      }
      for (const { button, item } of buttons.values()) {
        const wearing = isWorn(worn, item)
        button.setAttribute('aria-pressed', String(wearing))
        button.classList.toggle('is-worn', wearing)
      }
    },
  }

  function tile(found: FoundItem | null, today: string): HTMLLIElement {
    const li = el(doc, 'li', 'item-cell')
    const art = el(doc, 'div', 'item-tile-art')
    art.setAttribute('aria-hidden', 'true')
    if (!found) {
      const box = el(doc, 'div', 'item-tile is-unknown')
      art.textContent = COLLECTION.unknown
      const label = el(doc, 'span', 'visually-hidden', COLLECTION.unknownLabel)
      box.append(art, label)
      li.append(box)
      return li
    }
    const button = el(doc, 'button', 'item-tile is-found')
    button.type = 'button'
    button.dataset.item = found.item.id
    button.setAttribute('aria-pressed', 'false')
    art.innerHTML = itemSvg(found.item.id)
    const friendly = friendlyDay(found.dayKey, today)
    const name = el(doc, 'span', 'item-tile-name', found.item.name)
    const date = el(doc, 'span', 'item-tile-date', friendly)
    const badge = el(doc, 'span', 'item-tile-badge', COLLECTION.wearing)
    // One clear sentence for screen readers instead of fragments; aria-pressed says if it's worn.
    const label = el(doc, 'span', 'visually-hidden', foundTileLabel(found.item.name, friendly))
    for (const e of [name, date, badge]) e.setAttribute('aria-hidden', 'true')
    button.append(art, name, date, badge, label)
    buttons.set(found.item.id, { button, item: found.item })
    li.append(button)
    return li
  }
}
