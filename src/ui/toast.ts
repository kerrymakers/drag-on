// The small toast above the task buttons: "+40 XP · Gym / workout  [Undo]".
// When the task name doesn't fit beside the lead, it moves to a second line (the
// toast grows upward, away from the task buttons) and only shortens if it's still too long.

const SHOW_MS = 5000
/** The separator at the end of a log toast's lead, e.g. the " · " in "+40 XP · ". */
const SEPARATOR = / · $/

/**
 * A plain message, or a lead that always shows plus a name that may wrap, then
 * shorten to "…", and an optional note on a line of its own underneath.
 */
export type ToastMessage = string | { lead: string; name: string; note?: string }

export interface Toast {
  show(message: ToastMessage, onUndo?: () => void): void
  hide(): void
}

export function createToast(root: HTMLElement, text: HTMLElement, undo: HTMLButtonElement): Toast {
  let timer: number | undefined
  let undoHandler: (() => void) | undefined

  undo.addEventListener('click', () => {
    const handler = undoHandler
    hide()
    handler?.()
  })

  function hide() {
    window.clearTimeout(timer)
    undoHandler = undefined
    root.classList.remove('is-showing')
    undo.disabled = true
  }

  function show(message: ToastMessage, onUndo?: () => void) {
    window.clearTimeout(timer)
    let wrapCheck: (() => boolean) | null = null
    if (typeof message === 'string') {
      text.textContent = message
    } else {
      const doc = text.ownerDocument
      const lead = doc.createElement('span')
      lead.className = 'toast-lead'
      // The " · " between lead and name goes invisible (keeping its space) when the
      // name wraps, so the first line doesn't end in a dangling dot.
      const sep = SEPARATOR.exec(message.lead)
      if (sep) {
        const dot = doc.createElement('span')
        dot.className = 'toast-sep'
        dot.textContent = sep[0]
        lead.append(message.lead.slice(0, sep.index), dot)
      } else {
        lead.textContent = message.lead
      }
      const name = doc.createElement('span')
      name.className = 'toast-name'
      name.textContent = message.name
      text.replaceChildren(lead, name)
      if (message.note) {
        const note = doc.createElement('span')
        note.className = 'toast-note'
        // A space first, so a screen reader doesn't run the name into the note.
        note.textContent = ` ${message.note}`
        text.append(note)
      }
      wrapCheck = () => name.offsetTop > lead.offsetTop
    }
    undoHandler = onUndo
    undo.hidden = !onUndo
    undo.disabled = !onUndo
    root.classList.remove('is-showing')
    root.classList.remove('is-wrapped')
    root.classList.toggle('is-wrapped', wrapCheck?.() ?? false)
    void root.offsetWidth // replay the entrance when one toast replaces another
    root.classList.add('is-showing')
    timer = window.setTimeout(hide, SHOW_MS)
  }

  return { show, hide }
}
