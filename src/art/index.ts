// How the dragon looks. The UI maps game state to `DragonLook`; nothing in
// src/game/ or src/config/ imports this module, so the art can be replaced wholesale.

import './art.css'
import { eggSvg, type CrackLevel } from './egg'
import { adultSvg, elderSvg, juvenileSvg, whelpSvg } from './grown'
import { hatchlingSvg } from './hatchling'
import { knownLook, type EvolutionLook } from './looks'

export { EVOLVED_LOOKS, type EvolutionLook } from './looks'
export { hasItemArt, itemSvg, unknownItemSvg } from './items'

/** Visual only, not balancing: how far toward hatching the egg shows each crack. */
export const CRACK_SMALL_AT = 0.5
export const CRACK_BIG_AT = 0.8

export interface DragonLook {
  /** A stage id from config, e.g. 'egg' or 'hatchling'. Unknown ids get the most grown-up look. */
  stage: string
  /** 0 to 1 toward the next stage. */
  progress: number
  /** How the dragon feels. Shown with overlays and posture, not separate drawings. */
  mood?: MoodLook
  /**
   * The evolution look (a stat id). The game decides when the dragon has one; the art
   * draws it on any stage that has look art, and draws neutral for 'neutral', unknown
   * ids and stages without look art.
   */
  look?: string | undefined
}

export type MoodLook = 'happy' | 'content' | 'sleepy' | 'grumpy'

export type Reaction = 'log' | 'treat' | 'hatch' | 'tap' | 'perk'

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
  const known = STAGE_ART[look.stage]
  const stage = known ? look.stage : 'elder' // an id the art doesn't know (a stage added later): the most grown-up look
  const { draw, looks } = known ?? STAGE_ART.elder!
  const evolved = looks ? knownLook(look.look) : 'neutral'
  return { key: evolved === 'neutral' ? stage : `${stage}-${evolved}`, svg: draw(evolved) }
}

/**
 * Each stage's drawing, and whether it has art for the evolution looks. Which stage
 * the dragon first evolves at is game config (EVOLVES_AT_STAGE), not decided here.
 */
const STAGE_ART: Record<string, { draw: (look: EvolutionLook) => string; looks: boolean }> = {
  hatchling: { draw: hatchlingSvg, looks: false },
  whelp: { draw: whelpSvg, looks: false },
  juvenile: { draw: juvenileSvg, looks: true },
  adult: { draw: adultSvg, looks: true },
  elder: { draw: elderSvg, looks: true },
}

/** True if a stage id has art for the evolution looks (unknown ids draw as the most grown-up stage). */
export function hasLookArt(stage: string): boolean {
  return (STAGE_ART[stage] ?? STAGE_ART.elder!).looks
}

/**
 * Draws the dragon into `container`. Calling it again with a look that draws the
 * same picture keeps the drawing, so idle animations don't restart on every render.
 * A mood change only updates data-mood, so CSS can fade between moods smoothly.
 */
export function renderDragon(container: HTMLElement, look: DragonLook): void {
  const { key, svg } = art(look)
  let wrap = container.querySelector<HTMLElement>(':scope > .dragon-react')
  if (wrap?.dataset.look !== key) {
    wrap = container.ownerDocument.createElement('div')
    wrap.className = 'dragon-react'
    wrap.dataset.look = key
    wrap.innerHTML = svg
    container.replaceChildren(wrap)
  }
  const mood = look.mood ?? 'content'
  const drawing = wrap.querySelector('.dragon-svg')
  if (drawing && drawing.getAttribute('data-mood') !== mood) drawing.setAttribute('data-mood', mood)
}

/**
 * The on-screen area a speech bubble should stay clear of: the head and anything on
 * it, plus the zzz while it's showing. Null if nothing is drawn yet.
 */
export function speechAnchor(container: HTMLElement): DOMRect | null {
  const head = container.querySelector('.dragon-head-box')
  if (!head) return null
  const rects = [head.getBoundingClientRect()]
  const svg = container.querySelector('.dragon-svg')
  if (svg?.getAttribute('data-mood') === 'sleepy') {
    const zzz = container.querySelector('.mood-zzz')
    if (zzz) rects.push(zzz.getBoundingClientRect())
  }
  const left = Math.min(...rects.map((r) => r.left))
  const top = Math.min(...rects.map((r) => r.top))
  const right = Math.max(...rects.map((r) => r.right))
  const bottom = Math.max(...rects.map((r) => r.bottom))
  return new DOMRect(left, top, right - left, bottom - top)
}

/**
 * A short one-off animation: a happy wiggle on log, a delighted double hop on a treat,
 * a bounce on tap, a shake before hatching.
 */
export function react(container: HTMLElement, kind: Reaction): void {
  const wrap = container.querySelector<HTMLElement>(':scope > .dragon-react')
  if (!wrap) return
  // Under reduced motion there's no animation, so animationend would never clear the class.
  const view = container.ownerDocument.defaultView
  if (view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  wrap.classList.remove('react-log', 'react-treat', 'react-hatch', 'react-tap', 'react-perk')
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
