// The shared behaviour of a full-screen moment (the stage-up and the "found
// something" card): it opens over the app, takes focus, makes the app inert, and
// closes on a tap anywhere or Escape, with a guard so a quick double-tap on a task
// can't dismiss it unseen. Each overlay builds its own content.

/** Ignore taps this soon after opening, so a quick double-tap on a task doesn't dismiss it unseen. */
export const CLOSE_GUARD_MS = 600

/** How long the closing fade lasts (none under reduced motion). */
const CLOSE_FADE_MS = 200

export interface OverlayOptions {
  /** Under reduced motion the overlay gets .is-calm and is removed without a fade. */
  reducedMotion: boolean
  /** Made inert while the overlay is open, so focus and taps can't reach it. */
  background?: HTMLElement | null | undefined
  /** Where focus goes when it closes. Leave out to leave focus alone (another overlay follows). */
  returnFocus?: (() => HTMLElement | null) | undefined
  /** Called as it starts closing, before focus returns: clear the overlay's own timers here. */
  onClosing?: () => void
  onClose?: (() => void) | undefined
}

/**
 * Shows `overlay` (already built, with role="dialog" and tabIndex -1) and wires up
 * closing. Behaviour only: the content and styling are the caller's.
 */
export function openOverlay(doc: Document, overlay: HTMLElement, opts: OverlayOptions): void {
  const { reducedMotion, background, returnFocus, onClosing, onClose } = opts
  if (reducedMotion) overlay.classList.add('is-calm')
  doc.body.append(overlay)
  if (background) background.inert = true
  overlay.focus({ preventScroll: true })

  const openedAt = performance.now()
  let closed = false
  function close() {
    if (closed || performance.now() - openedAt < CLOSE_GUARD_MS) return
    closed = true
    onClosing?.()
    doc.removeEventListener('keydown', onKey)
    overlay.classList.add('is-closing')
    window.setTimeout(() => overlay.remove(), reducedMotion ? 0 : CLOSE_FADE_MS)
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
