// The full-screen stage-up moment. It appears after the log is already saved,
// so it's never part of the logging path. Tap anywhere (or the button) to close.

import { react, renderDragon } from '../art'
import type { Stage } from '../game/types'
import { STAGE_UP, STAGE_UP_FALLBACK } from './copy'

/** Ignore taps this soon after opening, so a quick double-tap on a task doesn't dismiss it unseen. */
const CLOSE_GUARD_MS = 600

export interface CelebrateOptions {
  from: Stage
  to: Stage
  reducedMotion: boolean
  /** Made inert while the dialog is open, so focus and taps can't reach it. */
  background?: HTMLElement | null
  /** Where focus goes when the dialog closes. */
  returnFocus?: () => HTMLElement | null
  onClose?: () => void
}

let overlayCount = 0

export function celebrate(
  doc: Document,
  { from, to, reducedMotion, background, returnFocus, onClose }: CelebrateOptions,
): void {
  const copy = STAGE_UP[to.id] ?? STAGE_UP_FALLBACK
  const messageId = `overlay-message-${++overlayCount}`
  const overlay = doc.createElement('div')
  overlay.className = 'overlay'
  overlay.tabIndex = -1
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-labelledby', messageId)

  const card = doc.createElement('div')
  card.className = 'overlay-card'
  const stageEl = doc.createElement('div')
  stageEl.className = 'overlay-art'
  const fromLayer = doc.createElement('div')
  fromLayer.className = 'overlay-layer is-from'
  const toLayer = doc.createElement('div')
  toLayer.className = 'overlay-layer is-to'
  stageEl.append(fromLayer, toLayer)

  const message = doc.createElement('p')
  message.className = 'overlay-message'
  message.id = messageId
  message.textContent = copy.message
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'overlay-button'
  button.textContent = copy.button

  card.append(stageEl, message, button)
  overlay.append(card)
  if (reducedMotion) overlay.classList.add('is-calm')

  renderDragon(fromLayer, { stage: from.id, progress: 1 })
  renderDragon(toLayer, { stage: to.id, progress: 0 })
  doc.body.append(overlay)
  if (background) background.inert = true
  overlay.focus({ preventScroll: true })

  const timers: number[] = []
  const later = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, ms))
  const reveal = () => overlay.classList.add('is-revealed')

  if (reducedMotion) {
    // A calm crossfade from the old look to the new one.
    later(600, reveal)
  } else if (from.id === 'egg') {
    react(fromLayer, 'hatch') // shake…
    later(720, () => overlay.classList.add('is-popping')) // …crack and pop…
    later(940, reveal) // …hello!
  } else {
    later(300, reveal)
  }

  const openedAt = performance.now()
  let closed = false
  function close() {
    if (closed || performance.now() - openedAt < CLOSE_GUARD_MS) return
    closed = true
    timers.forEach((t) => window.clearTimeout(t))
    doc.removeEventListener('keydown', onKey)
    overlay.classList.add('is-closing')
    window.setTimeout(() => overlay.remove(), reducedMotion ? 0 : 200)
    if (background) background.inert = false
    returnFocus?.()?.focus({ preventScroll: true })
    onClose?.()
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
  }
  overlay.addEventListener('click', close)
  doc.addEventListener('keydown', onKey)
}
