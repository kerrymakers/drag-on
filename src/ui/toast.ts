// The small toast above the task buttons: "+40 XP · Gym / workout  [Undo]".

const SHOW_MS = 5000

/** A plain message, or a lead that always shows plus a name that may shorten to "…". */
export type ToastMessage = string | { lead: string; name: string }

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
    if (typeof message === 'string') {
      text.textContent = message
    } else {
      const doc = text.ownerDocument
      const lead = doc.createElement('span')
      lead.className = 'toast-lead'
      lead.textContent = message.lead
      const name = doc.createElement('span')
      name.className = 'toast-name'
      name.textContent = message.name
      text.replaceChildren(lead, name)
    }
    undoHandler = onUndo
    undo.hidden = !onUndo
    undo.disabled = !onUndo
    root.classList.remove('is-showing')
    void root.offsetWidth // replay the entrance when one toast replaces another
    root.classList.add('is-showing')
    timer = window.setTimeout(hide, SHOW_MS)
  }

  return { show, hide }
}
