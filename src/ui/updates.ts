// Applies app updates without ever interrupting a moment. The new service worker
// activates straight away; the page reload that picks it up waits until the page is
// hidden, or until nothing has happened for a little while and no overlay is open.

const IDLE_MS = 10_000
const CHECK_MS = 2_000

export interface UpdateGate {
  /** Call on every log or undo. */
  noteActivity(): void
  /** Call with true while an overlay is open, false when it closes. */
  setBusy(busy: boolean): void
  /** The new version is active and a reload would show it. */
  requestReload(): void
}

/** The bits of Document the gate needs, so it can be tested without a browser. */
export type VisibilitySource = Pick<Document, 'visibilityState' | 'addEventListener'>

export function createUpdateGate(
  doc: VisibilitySource,
  reload: () => void = () => location.reload(),
): UpdateGate {
  let lastActivity = Date.now()
  let busy = false
  let pending = false
  let reloaded = false
  let timer: ReturnType<typeof setInterval> | undefined

  function tryReload() {
    if (!pending) return
    const hidden = doc.visibilityState === 'hidden'
    const idle = !busy && Date.now() - lastActivity >= IDLE_MS
    if (hidden || idle) {
      pending = false
      reloaded = true
      clearInterval(timer)
      reload()
    }
  }

  doc.addEventListener('visibilitychange', tryReload)

  return {
    noteActivity() {
      lastActivity = Date.now()
    },
    setBusy(value) {
      busy = value
      if (!value) lastActivity = Date.now()
    },
    requestReload() {
      if (pending || reloaded) return
      pending = true
      timer = setInterval(tryReload, CHECK_MS)
      tryReload()
    },
  }
}
