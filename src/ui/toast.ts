// The small toast above the task buttons: "+40 XP · Gym / workout  [Undo]".

const SHOW_MS = 5000

export interface Toast {
  show(text: string, onUndo?: () => void): void
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

  function show(message: string, onUndo?: () => void) {
    window.clearTimeout(timer)
    text.textContent = message
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
