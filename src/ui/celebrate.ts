// The full-screen stage-up moment, and the gentler one for a new evolution look.
// It appears after the log is already saved, so it's never part of the logging path.
// Tap anywhere (or the button) to close.

import { react, renderDragon, type WearLook } from '../art'
import type { LookId } from '../game/evolution'
import type { Stage, StatId } from '../game/types'
import { celebrationCopy } from './copy'
import { openOverlay } from './overlay'

/**
 * How each stage arrives. Built from shared pieces (the from/to layers, a glow and
 * a burst of sparkles); the CSS for each lives under .reveal-<kind> in styles.css.
 * The egg hatch has its own shake, crack and pop.
 */
export type RevealKind = 'hatch' | 'spring' | 'flutter' | 'soar' | 'radiant' | 'shimmer'

const REVEALS: Record<string, RevealKind> = {
  hatchling: 'hatch',
  whelp: 'spring',
  juvenile: 'flutter',
  adult: 'soar',
  elder: 'radiant',
}

const SPARKS = 10

export interface CelebrateOptions {
  /** The stage before and after. The same stage means a change of look only (a gentle shimmer). */
  from: Stage
  to: Stage
  /** The evolution look before and after ('neutral' before Juvenile). */
  fromLook?: LookId
  toLook?: LookId
  /** A look the dragon has never had before, to name in the message; otherwise null. */
  newLook?: StatId | null
  /** What the dragon is wearing, on both layers (the egg layer draws nothing worn). */
  wearing?: WearLook | undefined
  reducedMotion: boolean
  /** Made inert while the dialog is open, so focus and taps can't reach it. */
  background?: HTMLElement | null
  /** Where focus goes when the dialog closes. Leave out when another overlay follows. */
  returnFocus?: (() => HTMLElement | null) | undefined
  onClose?: () => void
}

let overlayCount = 0

export function celebrate(
  doc: Document,
  { from, to, fromLook, toLook, newLook = null, wearing, reducedMotion, background, returnFocus, onClose }: CelebrateOptions,
): void {
  const lookOnly = from.id === to.id
  const copy = celebrationCopy(lookOnly ? null : to.id, newLook)
  const messageId = `overlay-message-${++overlayCount}`
  const overlay = doc.createElement('div')
  overlay.className = 'overlay'
  overlay.tabIndex = -1
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', messageId)

  const kind: RevealKind = lookOnly ? 'shimmer' : from.id === 'egg' ? 'hatch' : (REVEALS[to.id] ?? 'spring')
  overlay.classList.add(`reveal-${kind}`)

  const card = doc.createElement('div')
  card.className = 'overlay-card'
  const stageEl = doc.createElement('div')
  stageEl.className = 'overlay-art'
  if (kind !== 'hatch') {
    const glow = doc.createElement('div')
    glow.className = 'overlay-glow'
    stageEl.append(glow)
    const sparks = doc.createElement('div')
    sparks.className = 'overlay-sparks'
    sparks.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < SPARKS; i++) {
      const spark = doc.createElement('span')
      const angle = (i / SPARKS) * Math.PI * 2
      spark.style.setProperty('--dx', `${Math.round(Math.cos(angle) * 130)}px`)
      spark.style.setProperty('--dy', `${Math.round(Math.sin(angle) * 130)}px`)
      spark.style.setProperty('--delay', `${(i % 3) * 60}ms`)
      sparks.append(spark)
    }
    stageEl.append(sparks)
  }
  const fromLayer = doc.createElement('div')
  fromLayer.className = 'overlay-layer is-from'
  const toLayer = doc.createElement('div')
  toLayer.className = 'overlay-layer is-to'
  stageEl.append(fromLayer, toLayer)

  const message = doc.createElement('p')
  message.className = 'overlay-message'
  message.id = messageId
  message.textContent = copy.message
  // A new look gets its own warm line, under the stage-up message.
  const sub = copy.sub ? doc.createElement('p') : null
  if (sub) {
    sub.className = 'overlay-sub'
    sub.id = `${messageId}-sub`
    sub.textContent = copy.sub
    overlay.setAttribute('aria-describedby', sub.id)
  }
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'overlay-button'
  button.textContent = copy.button

  card.append(stageEl, message, ...(sub ? [sub] : []), button)
  overlay.append(card)

  // Growing up is a happy moment, whatever the mood was before.
  renderDragon(fromLayer, { stage: from.id, progress: 1, mood: 'happy', look: fromLook, wearing })
  renderDragon(toLayer, { stage: to.id, progress: 0, mood: 'happy', look: toLook, wearing })

  const timers: number[] = []
  openOverlay(doc, overlay, {
    reducedMotion,
    background,
    returnFocus,
    onClosing: () => timers.forEach((t) => window.clearTimeout(t)),
    onClose,
  })
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
  const reveal = () => overlay.classList.add('is-revealed')

  if (reducedMotion) {
    // A calm crossfade from the old look to the new one.
    later(600, reveal)
  } else if (kind === 'shimmer') {
    // Same stage, new look: a soft shimmer from one to the other, no wiggle or pop.
    later(450, reveal)
  } else if (kind === 'hatch') {
    react(fromLayer, 'hatch') // shake…
    later(720, () => overlay.classList.add('is-popping')) // …crack and pop…
    later(940, reveal) // …hello!
  } else {
    react(fromLayer, 'log') // a happy wiggle…
    later(520, () => overlay.classList.add('is-popping')) // …the old look fades…
    later(640, reveal) // …and the new one arrives in its own way
  }
}
