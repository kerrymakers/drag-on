// How each rare item looks, for the Collection, the "found something" card and on
// the dragon itself. Keyed by item id (config/items.ts). Game logic never imports
// this, so the art can be replaced wholesale. An id with no drawing gets the soft "?"
// in a tile, and nothing at all on the dragon.
//
// Every drawing is on a 64×64 grid with soft, rounded shapes. Outlines and the
// shine use CSS custom properties (see art.css), so they suit light and dark mode.

import type { WearSlot, WearSpot } from './parts'

const ATTRS = `stroke="var(--item-line)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"`

const wrap = (id: string, body: string) =>
  `<svg class="item-svg" data-item="${id}" viewBox="0 0 64 64" aria-hidden="true" focusable="false" ${ATTRS}>${body}</svg>`

const DRAWINGS: Record<string, string> = {
  bow: `
    <path d="M32 32 C24 20 10 18 10 28 C10 38 24 40 32 32 Z" fill="#f59ab3" />
    <path d="M32 32 C40 20 54 18 54 28 C54 38 40 40 32 32 Z" fill="#f59ab3" />
    <path d="M29 34 L22 50 L28 47 L31 52 L32 36 Z" fill="#ef7f9f" />
    <path d="M35 34 L42 50 L36 47 L33 52 L32 36 Z" fill="#ef7f9f" />
    <circle cx="32" cy="32" r="5.5" fill="#fbc3d2" />
    <path d="M16 26 C18 24 21 24 23 25" fill="none" stroke="var(--item-shine)" />`,
  beanie: `
    <circle cx="32" cy="12" r="6" fill="#fff3e2" />
    <path d="M12 44 C12 24 20 16 32 16 C44 16 52 24 52 44 Z" fill="#8fc7b4" />
    <rect x="9" y="42" width="46" height="11" rx="5.5" fill="#6aae98" />
    <path d="M24 22 L24 40 M32 19 L32 40 M40 22 L40 40" fill="none" stroke="var(--item-shine)" />`,
  crown: `
    <path d="M12 46 L10 20 L22 32 L32 14 L42 32 L54 20 L52 46 Z" fill="#ffd36b" />
    <rect x="11" y="44" width="42" height="8" rx="4" fill="#f6b94a" />
    <circle cx="32" cy="36" r="3.5" fill="#f2899a" />
    <circle cx="21" cy="39" r="2.5" fill="#8fc7e8" />
    <circle cx="43" cy="39" r="2.5" fill="#8fc7e8" />`,
  flower: `
    <rect x="12" y="44" width="40" height="7" rx="3.5" fill="#c7a2e0" />
    <g fill="#fffaf2">
      <ellipse cx="32" cy="15" rx="7" ry="9" />
      <ellipse cx="32" cy="39" rx="7" ry="9" />
      <ellipse cx="20" cy="27" rx="9" ry="7" />
      <ellipse cx="44" cy="27" rx="9" ry="7" />
    </g>
    <circle cx="32" cy="27" r="7" fill="#ffd36b" />
    <circle cx="30" cy="25" r="2" fill="var(--item-shine)" stroke="none" />`,
  scarf: `
    <path d="M10 22 C20 30 44 30 54 22 L54 32 C44 40 20 40 10 32 Z" fill="#e2566e" />
    <path d="M38 34 L44 56 L34 56 L30 36 Z" fill="#e2566e" />
    <path d="M22 27 L22 37 M32 29 L32 39 M43 27 L43 37" fill="none" stroke="#fff3e2" stroke-width="4" />
    <path d="M36 44 L43 44 M38 51 L44 51" fill="none" stroke="#fff3e2" stroke-width="4" />
    <path d="M34 56 L33 61 M39 56 L39 61 M44 56 L45 61" fill="none" />`,
  bell: `
    <path d="M8 18 C20 26 44 26 56 18" fill="none" stroke="#f2899a" stroke-width="7" />
    <path d="M8 18 C20 26 44 26 56 18" fill="none" stroke="var(--item-line)" stroke-width="1.5" />
    <circle cx="32" cy="40" r="15" fill="#ffd36b" />
    <path d="M18 38 L46 38" fill="none" />
    <circle cx="32" cy="46" r="3" fill="var(--item-line)" stroke="none" />
    <path d="M32 49 L32 54" fill="none" />
    <path d="M24 32 C25 30 27 29 29 29" fill="none" stroke="var(--item-shine)" />`,
  bandana: `
    <path d="M8 16 C20 22 44 22 56 16 L32 54 Z" fill="#8fb8e8" />
    <g fill="#fffaf2" stroke="none">
      <circle cx="22" cy="24" r="2.6" />
      <circle cx="34" cy="26" r="2.6" />
      <circle cx="44" cy="22" r="2.6" />
      <circle cx="28" cy="34" r="2.6" />
      <circle cx="38" cy="36" r="2.6" />
      <circle cx="32" cy="45" r="2.6" />
    </g>`,
  pendant: `
    <path d="M10 10 C14 26 22 32 32 34 C42 32 50 26 54 10" fill="none" stroke-width="2" />
    <path d="M32 30 L37 40.5 L48.5 41.8 L40 49.6 L42.3 61 L32 55.2 L21.7 61 L24 49.6 L15.5 41.8 L27 40.5 Z" fill="#ffd36b" />
    <circle cx="32" cy="47" r="3.5" fill="#f2899a" />`,
  book: `
    <path d="M10 16 C18 13 26 14 32 19 C38 14 46 13 54 16 L54 50 C46 47 38 48 32 53 C26 48 18 47 10 50 Z" fill="#a8d5ba" />
    <path d="M14 19 C20 17 26 18 30 22 L30 47 C26 44 20 43 14 45 Z" fill="#fffaf2" />
    <path d="M50 19 C44 17 38 18 34 22 L34 47 C38 44 44 43 50 45 Z" fill="#fffaf2" />
    <path d="M18 26 L26 27 M18 32 L26 33 M38 27 L46 26 M38 33 L46 32" fill="none" stroke-width="1.8" />
    <path d="M42 14 L42 24 L45 21 L48 24 L48 14" fill="#f2899a" />`,
  gem: `
    <path d="M18 14 L46 14 L56 26 L32 56 L8 26 Z" fill="#b8b6e6" />
    <path d="M8 26 L56 26 M18 14 L26 26 L32 56 M46 14 L38 26 L32 56 M26 26 L32 14 L38 26" fill="none" stroke-width="1.8" />
    <path d="M20 19 L23 23" fill="none" stroke="var(--item-shine)" stroke-width="3" />`,
  teacup: `
    <path d="M46 30 C56 28 58 42 46 42" fill="none" stroke-width="4" />
    <path d="M46 30 C56 28 58 42 46 42" fill="none" stroke="#fffaf2" stroke-width="1.5" />
    <path d="M12 26 L50 26 C50 42 42 50 31 50 C20 50 12 42 12 26 Z" fill="#fffaf2" />
    <ellipse cx="31" cy="54" rx="22" ry="4.5" fill="#f7c48f" />
    <circle cx="31" cy="37" r="4.5" fill="#f2899a" />
    <path d="M24 10 C22 14 26 16 24 20 M33 8 C31 13 35 15 33 20" fill="none" stroke="var(--item-steam)" />`,
  lantern: `
    <path d="M32 4 L32 12" fill="none" />
    <rect x="24" y="11" width="16" height="6" rx="2" fill="#c9733f" />
    <ellipse cx="32" cy="34" rx="18" ry="18" fill="#f6a07a" />
    <path d="M32 16 C24 22 24 46 32 52 M32 16 C40 22 40 46 32 52" fill="none" stroke-width="1.8" />
    <ellipse cx="32" cy="34" rx="7" ry="9" fill="#ffe39a" stroke="none" opacity="0.9" />
    <rect x="25" y="50" width="14" height="5" rx="2" fill="#c9733f" />
    <path d="M32 55 L32 61" fill="none" />`,
  partyhat: `
    <path d="M14 50 C22 54 42 54 50 50" fill="none" stroke-width="2" />
    <path d="M32 10 L50 50 C42 54 22 54 14 50 Z" fill="#8fc7e8" />
    <path d="M26 24 L38 24 M21 36 L43 36" fill="none" stroke="#fff3e2" stroke-width="4" />
    <circle cx="32" cy="9" r="5.5" fill="#f2899a" />
    <circle cx="25" cy="44" r="2.2" fill="#ffd36b" stroke="none" />
    <circle cx="39" cy="45" r="2.2" fill="#ffd36b" stroke="none" />`,
  acorn: `
    <path d="M32 6 C33 9 33 12 32 15" fill="none" stroke-width="3.5" />
    <path d="M8 40 C8 24 18 14 32 14 C46 14 56 24 56 40 C48 44 16 44 8 40 Z" fill="#c9915c" />
    <path d="M17 26 L27 38 M27 19 L39 34 M38 18 L48 30 M47 26 L37 38 M37 19 L25 34 M26 18 L16 30" fill="none" stroke-width="1.6" />
    <path d="M14 46 C22 50 42 50 50 46" fill="none" stroke-width="2" />
    <path d="M18 24 C20 21 23 19 26 18" fill="none" stroke="var(--item-shine)" />`,
  bowtie: `
    <path d="M32 32 L10 18 C6 24 6 40 10 46 Z" fill="#7fbfa8" />
    <path d="M32 32 L54 18 C58 24 58 40 54 46 Z" fill="#7fbfa8" />
    <rect x="26" y="25" width="12" height="14" rx="4" fill="#5ea58c" />
    <g fill="#fffaf2" stroke="none">
      <circle cx="15" cy="28" r="2.2" />
      <circle cx="17" cy="38" r="2.2" />
      <circle cx="49" cy="28" r="2.2" />
      <circle cx="47" cy="38" r="2.2" />
    </g>`,
  shells: `
    <path d="M8 12 C14 30 22 38 32 40 C42 38 50 30 56 12" fill="none" stroke-width="2" />
    <circle cx="14" cy="26" r="3.5" fill="#fffaf2" />
    <circle cx="50" cy="26" r="3.5" fill="#fffaf2" />
    <circle cx="21" cy="34" r="3.5" fill="#b8e0e8" />
    <circle cx="43" cy="34" r="3.5" fill="#b8e0e8" />
    <path d="M32 58 C22 58 20 46 32 38 C44 46 42 58 32 58 Z" fill="#f9c6b8" />
    <path d="M32 40 L32 56 M32 41 L26 53 M32 41 L38 53" fill="none" stroke-width="1.6" />`,
  mushroom: `
    <path d="M24 36 C23 46 22 52 24 56 C28 58 36 58 40 56 C42 52 41 46 40 36 Z" fill="#fff3e2" />
    <path d="M8 36 C8 20 20 10 32 10 C44 10 56 20 56 36 C48 40 16 40 8 36 Z" fill="#f28a7a" />
    <g fill="#fffaf2" stroke="none">
      <circle cx="22" cy="22" r="4" />
      <circle cx="38" cy="18" r="3" />
      <circle cx="45" cy="29" r="3.5" />
      <circle cx="30" cy="31" r="2.6" />
    </g>
    <circle cx="28" cy="46" r="1.6" fill="var(--item-line)" stroke="none" />
    <circle cx="36" cy="46" r="1.6" fill="var(--item-line)" stroke="none" />`,
  balloon: `
    <path d="M32 44 C30 50 36 54 32 62" fill="none" stroke-width="2" />
    <path d="M32 42 C20 32 8 26 8 16 C8 8 14 4 20 4 C26 4 30 8 32 12 C34 8 38 4 44 4 C50 4 56 8 56 16 C56 26 44 32 32 42 Z" fill="#f59ab3" />
    <path d="M29 42 L35 42 L32 46 Z" fill="#ef7f9f" />
    <path d="M15 12 C16 10 18 9 20 9" fill="none" stroke="var(--item-shine)" stroke-width="3" />`,
}

/** The soft "?" for an item not found yet (and for an id with no drawing). */
export function unknownItemSvg(): string {
  return `<svg class="item-svg item-unknown" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><text x="32" y="44" text-anchor="middle" font-size="36" font-weight="800" fill="currentColor">?</text></svg>`
}

/** True if this id has its own drawing. */
export function hasItemArt(id: string): boolean {
  return Object.hasOwn(DRAWINGS, id)
}

/** An item's drawing, or the "?" for an id with no art yet. */
export function itemSvg(id: string): string {
  const body = Object.hasOwn(DRAWINGS, id) ? DRAWINGS[id] : undefined
  return body === undefined ? unknownItemSvg() : wrap(id, body)
}

/**
 * The point on the 64×64 grid that's pinned to a spot's anchor: the bottom of the brim
 * for a hat (it sits on the head), the collar line for a neck item, and the middle
 * for something held.
 */
export const WEAR_PIN: Record<WearSlot, readonly [number, number]> = {
  head: [32, 50],
  neck: [32, 22],
  held: [32, 32],
}

const r2 = (n: number) => Math.round(n * 100) / 100

/** An item drawn on the dragon at a spot, or '' for no item or an id with no drawing. */
export function wornItemSvg(id: string | null | undefined, slot: WearSlot, spot: WearSpot): string {
  if (typeof id !== 'string' || !Object.hasOwn(DRAWINGS, id)) return ''
  const [px, py] = WEAR_PIN[slot]
  const k = r2(spot.size / 64)
  const turn = spot.rotate ? ` rotate(${spot.rotate})` : ''
  return `<g class="worn-item worn-${slot}" data-worn="${id}" transform="translate(${spot.x} ${spot.y})${turn} scale(${k}) translate(${-px} ${-py})" ${ATTRS}>${DRAWINGS[id]}</g>`
}

/**
 * The box [x0, y0, x1, y1] a worn item can cover at a spot, in the stage's own units:
 * the whole 64×64 grid, turned and scaled, so it's never smaller than the drawing.
 */
export function wornItemBox(slot: WearSlot, spot: WearSpot): readonly [number, number, number, number] {
  const [px, py] = WEAR_PIN[slot]
  const k = spot.size / 64
  const a = ((spot.rotate ?? 0) * Math.PI) / 180
  const corners = [
    [0, 0],
    [64, 0],
    [0, 64],
    [64, 64],
  ].map(([gx, gy]) => {
    const dx = (gx! - px) * k
    const dy = (gy! - py) * k
    return [spot.x + dx * Math.cos(a) - dy * Math.sin(a), spot.y + dx * Math.sin(a) + dy * Math.cos(a)] as const
  })
  const xs = corners.map((c) => c[0])
  const ys = corners.map((c) => c[1])
  return [Math.floor(Math.min(...xs)), Math.floor(Math.min(...ys)), Math.ceil(Math.max(...xs)), Math.ceil(Math.max(...ys))]
}
