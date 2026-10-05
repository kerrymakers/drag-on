// How the dragon looks. The UI maps game state to `DragonLook`; nothing in
// src/game/ or src/config/ imports this module, so the art can be replaced wholesale.

import './art.css'
import { eggSvg, type CrackLevel } from './egg'
import { adultSvg, elderSvg, juvenileSvg, whelpSvg } from './grown'
import { hatchlingSvg } from './hatchling'

/** Visual only, not balancing: how far toward hatching the egg shows each crack. */
export const CRACK_SMALL_AT = 0.5
export const CRACK_BIG_AT = 0.8

export interface DragonLook {
  /** A stage id from config, e.g. 'egg' or 'hatchling'. Unknown ids get the most grown-up look. */
  stage: string
  /** 0 to 1 toward the next stage. */
  progress: number
}

export type Reaction = 'log' | 'hatch' | 'tap'

export function crackLevel(progress: number): CrackLevel {
  if (progress >= CRACK_BIG_AT) return 2
  if (progress >= CRACK_SMALL_AT) return 1
  return 0
}

let uidCounter = 0

/** The markup for a look, plus a key that changes only when the picture does. */
function art(look: DragonLook): { key: string; svg: string } {
  if (look.stage === 'egg') {
    const crack = crackLevel(look.progress)
    return { key: `egg-${crack}`, svg: eggSvg(crack, String(++uidCounter)) }
  }
  const draw = STAGE_ART[look.stage]
  if (draw) return { key: look.stage, svg: draw() }
  // An id the art doesn't know (a stage added to config later): the most grown-up look.
  return { key: 'elder', svg: elderSvg() }
}

const STAGE_ART: Record<string, () => string> = {
  hatchling: hatchlingSvg,
  whelp: whelpSvg,
  juvenile: juvenileSvg,
  adult: adultSvg,
  elder: elderSvg,
}

/**
 * Draws the dragon into `container`. Calling it again with a look that draws the
 * same picture does nothing, so idle animations don't restart on every render.
 */
export function renderDragon(container: HTMLElement, look: DragonLook): void {
  const { key, svg } = art(look)
  const current = container.querySelector<HTMLElement>(':scope > .dragon-react')
  if (current?.dataset.look === key) return
  const wrap = container.ownerDocument.createElement('div')
  wrap.className = 'dragon-react'
  wrap.dataset.look = key
  wrap.innerHTML = svg
  container.replaceChildren(wrap)
}

/** A short one-off animation: a happy wiggle on log, a bounce on tap, a shake before hatching. */
export function react(container: HTMLElement, kind: Reaction): void {
  const wrap = container.querySelector<HTMLElement>(':scope > .dragon-react')
  if (!wrap) return
  // Under reduced motion there's no animation, so animationend would never clear the class.
  const view = container.ownerDocument.defaultView
  if (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  wrap.classList.remove('react-log', 'react-hatch', 'react-tap')
  void wrap.offsetWidth // restart the animation if it's already running
  wrap.classList.add(`react-${kind}`)
  wrap.addEventListener(
    'animationend',
    (e) => {
      if (e.target === wrap) wrap.classList.remove(`react-${kind}`)
    },
    { once: true },
  )
}
