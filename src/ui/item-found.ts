// The "found something" card after a log brings a rare item. It appears after the log
// is already saved, so it's never part of the logging path. Tap anywhere to close,
// with the same double-tap guard and focus return as the stage-up overlay (overlay.ts).

import { itemSvg } from '../art'
import type { Item } from '../game/types'
import { ITEM_FOUND, itemFoundLine, itemFoundSaved, milestoneFound } from './copy'
import { openOverlay } from './overlay'

/** When the words and button arrive, after the item pops in. */
const REVEAL_MS = 220

export interface ItemFoundOptions {
  item: Item
  /** True if the find went straight on (its spot was free). */
  wearing?: boolean
  /** True before hatching: the egg wears nothing yet, so the card says it's kept for later. */
  egg?: boolean
  /** The streak milestone (e.g. 7) this find celebrates, or null for a lucky find. */
  milestone?: number | null
  reducedMotion: boolean
  /** Made inert while the card is open, so focus and taps can't reach it. */
  background?: HTMLElement | null
  /** Where focus goes when the card closes. */
  returnFocus?: () => HTMLElement | null
  onClose?: () => void
}

let cardCount = 0

export function showItemFound(
  doc: Document,
  { item, wearing = false, egg = false, milestone = null, reducedMotion, background, returnFocus, onClose }: ItemFoundOptions,
): void {
  const n = ++cardCount
  const nameId = `item-found-name-${n}`
  const lineId = `item-found-line-${n}`

  const overlay = doc.createElement('div')
  overlay.className = 'overlay item-found'
  overlay.tabIndex = -1
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', nameId)
  overlay.setAttribute('aria-describedby', lineId)
  overlay.dataset.item = item.id
  const celebrating = milestone !== null ? milestoneFound(milestone) : null
  if (milestone !== null) overlay.dataset.milestone = String(milestone)

  const card = doc.createElement('div')
  card.className = 'item-card'

  const heading = doc.createElement('p')
  heading.className = 'item-found-heading'
  heading.textContent = celebrating?.heading ?? ITEM_FOUND.heading

  const art = doc.createElement('div')
  art.className = 'item-found-art'
  art.innerHTML = itemSvg(item.id)

  const name = doc.createElement('h2')
  name.className = 'item-found-name'
  name.id = nameId
  name.textContent = item.name

  const line = doc.createElement('p')
  line.className = 'overlay-sub item-found-line'
  line.id = lineId
  line.textContent = celebrating?.line ?? itemFoundLine(item.id)

  const saved = doc.createElement('p')
  saved.className = 'item-found-saved'
  saved.textContent = itemFoundSaved(wearing, egg)

  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'overlay-button'
  button.textContent = ITEM_FOUND.button

  card.append(heading, art, name, line, saved, button)
  overlay.append(card)

  let revealTimer: number | undefined
  openOverlay(doc, overlay, {
    reducedMotion,
    background,
    returnFocus,
    onClosing: () => window.clearTimeout(revealTimer),
    onClose,
  })
  revealTimer = window.setTimeout(() => overlay.classList.add('is-revealed'), reducedMotion ? 0 : REVEAL_MS)
}
