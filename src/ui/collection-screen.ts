// The Collection screen, in two sections. Items: every rare item, found or not. A
// found item shows its drawing, name and when it was found, and is a button: tap to
// wear it, tap again to take it off (one item per spot). Nature: every nature find a
// walk can bring; a found one shows its picture, name and when it was first spotted,
// and tapping it reopens its card (it isn't worn). In both, one not found yet is a
// plain "?" that gives nothing away (no name, no silhouette, no season). A small
// preview of the dragon in its outfit sits at the top.

import { itemSvg, natureSvg, react, renderDragon, type DragonLook } from '../art'
import { dayKey } from '../game/day'
import { foundNature, type FoundNature } from '../game/nature'
import { foundItems, type FoundItem } from '../game/rewards'
import type { GameEvent, Item, NatureFind } from '../game/types'
import { isWorn, type WornItems } from '../game/wearing'
import { COLLECTION, collectionCount, collectionLine, foundTileLabel, friendlyDay, natureTileLabel, wearToast } from './copy'
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
  /** Every nature find, in config order. */
  nature: readonly NatureFind[]
  /** A found nature tile was tapped: reopen its card, returning focus to `tile` after. */
  onNature(find: NatureFind, tile: HTMLElement): void
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

/** The nature tiles: found ones first, in the order first spotted, then one "?" per find still to spot. */
export function natureTiles(events: readonly GameEvent[], finds: readonly NatureFind[]): (FoundNature | null)[] {
  const found = foundNature(events, finds)
  return [...found, ...Array.from({ length: finds.length - found.length }, () => null)]
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
  header.append(preview, title)

  // Items: the rare finds, worn from here.
  const itemsSection = el(doc, 'section', 'cs-section cs-items')
  const itemsHead = el(doc, 'div', 'cs-section-head')
  const itemsTitle = el(doc, 'h2', 'cs-section-title', COLLECTION.itemsHeading)
  itemsTitle.id = 'cs-items-title'
  const count = el(doc, 'p', 'cs-count')
  itemsHead.append(itemsTitle, count)
  const line = el(doc, 'p', 'cs-line')
  const hint = el(doc, 'p', 'cs-hint')
  const grid = el(doc, 'ul', 'item-grid')
  grid.setAttribute('aria-labelledby', 'cs-items-title')
  itemsSection.append(itemsHead, line, hint, grid)

  // Nature: what walks have spotted. Tapping one reopens its card.
  const natureSection = el(doc, 'section', 'cs-section cs-nature')
  const natureHead = el(doc, 'div', 'cs-section-head')
  const natureTitle = el(doc, 'h2', 'cs-section-title', COLLECTION.natureHeading)
  natureTitle.id = 'cs-nature-title'
  const natureCount = el(doc, 'p', 'cs-nature-count')
  natureHead.append(natureTitle, natureCount)
  const natureLine = el(doc, 'p', 'cs-section-line cs-nature-line')
  const natureGrid = el(doc, 'ul', 'item-grid nature-grid')
  natureGrid.setAttribute('aria-labelledby', 'cs-nature-title')
  natureSection.append(natureHead, natureLine, natureGrid)

  scroller.append(header, itemsSection, natureSection)

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
  let natureSignature = ''
  const natureById = new Map(config.nature.map((f) => [f.id, f]))

  natureGrid.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button.nature-tile')
    const find = button?.dataset.nature ? natureById.get(button.dataset.nature) : undefined
    if (button && find) config.onNature(find, button)
  })

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
      const natureFound = natureTiles(events, config.nature)
      const spotted = natureFound.filter((t) => t !== null).length
      const natureSig = `${today}|${natureFound.map((t) => (t ? `${t.find.id}@${t.dayKey}` : '?')).join(',')}`
      if (natureSig !== natureSignature) {
        natureSignature = natureSig
        natureCount.textContent = collectionCount(spotted, config.nature.length)
        natureLine.textContent = spotted > 0 ? COLLECTION.natureHint : COLLECTION.natureEmpty
        natureGrid.replaceChildren(...natureFound.map((f) => natureTile(f, today)))
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

  function natureTile(found: FoundNature | null, today: string): HTMLLIElement {
    const li = el(doc, 'li', 'item-cell')
    const art = el(doc, 'div', 'item-tile-art')
    art.setAttribute('aria-hidden', 'true')
    if (!found) {
      const box = el(doc, 'div', 'nature-tile is-unknown')
      art.textContent = COLLECTION.unknown
      box.append(art, el(doc, 'span', 'visually-hidden', COLLECTION.unknownLabel))
      li.append(box)
      return li
    }
    const button = el(doc, 'button', 'nature-tile is-found')
    button.type = 'button'
    button.dataset.nature = found.find.id
    art.innerHTML = natureSvg(found.find.id, found.find.picture)
    const friendly = friendlyDay(found.dayKey, today)
    const name = el(doc, 'span', 'item-tile-name', found.find.name)
    const date = el(doc, 'span', 'item-tile-date', friendly)
    for (const e of [name, date]) e.setAttribute('aria-hidden', 'true')
    button.append(art, name, date, el(doc, 'span', 'visually-hidden', natureTileLabel(found.find.name, friendly)))
    li.append(button)
    return li
  }
}
