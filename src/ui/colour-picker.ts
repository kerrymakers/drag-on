// The dragon's colour swatches: one round swatch per colour, as a radio group. A tap
// chooses straight away; arrow keys move along the swatches and choose as they go,
// like any radio group, and only the chosen one (or the first, with none chosen) is in
// the tab order. Used by the Settings card and first-run setup; the caller saves.

import { DRAGON_COLOURS } from '../art'
import { SETTINGS } from './copy'

export interface ColourPicker {
  el: HTMLElement
  /** `colour`: the chosen id, or undefined for none ("classic"). */
  render(colour: string | undefined, readOnly: boolean): void
}

export function createColourPicker(doc: Document, id: string, onChoose: (colour: string) => void): ColourPicker {
  const group = doc.createElement('div')
  group.className = 'ss-swatches'
  group.id = id
  group.setAttribute('role', 'radiogroup')
  group.setAttribute('aria-label', SETTINGS.colourLabel)
  const swatches = DRAGON_COLOURS.map(({ id: colour, label }) => {
    const swatch = doc.createElement('button')
    swatch.type = 'button'
    swatch.className = 'ss-swatch colour-swatch'
    swatch.dataset.colour = colour
    swatch.setAttribute('role', 'radio')
    swatch.setAttribute('aria-checked', 'false')
    swatch.setAttribute('aria-label', label)
    group.append(swatch)
    return swatch
  })

  let shown: string | undefined
  function show(colour: string | undefined, readOnly: boolean) {
    shown = colour
    const tabbable = swatches.find((s) => s.dataset.colour === colour) ?? swatches[0]
    for (const swatch of swatches) {
      swatch.setAttribute('aria-checked', String(swatch.dataset.colour === colour))
      swatch.tabIndex = swatch === tabbable ? 0 : -1
      swatch.disabled = readOnly
    }
  }
  function choose(swatch: HTMLButtonElement) {
    const colour = swatch.dataset.colour
    if (!colour || swatch.disabled || colour === shown) return
    show(colour, false)
    onChoose(colour)
  }
  group.addEventListener('click', (e) => {
    const swatch = (e.target as Element).closest<HTMLButtonElement>('.ss-swatch')
    if (swatch) choose(swatch)
  })
  group.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    const at = swatches.indexOf(e.target as HTMLButtonElement)
    if (step === undefined || at < 0) return
    e.preventDefault()
    const next = swatches[(at + step + swatches.length) % swatches.length]!
    next.focus()
    choose(next)
  })

  return { el: group, render: show }
}
