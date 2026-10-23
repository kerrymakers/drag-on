// How each nature find looks, for its card and its Collection tile. Slice 1 draws one
// soft picture per category (config/nature.ts `picture`), tinted per find; a drawing
// per find can replace these one for one later. Game logic never imports this.
//
// Same 64×64 grid, outline and shine as the item drawings (src/art/items.ts), so they
// suit light and dark mode (the line colours are CSS custom properties in art.css).

const ATTRS = `stroke="var(--item-line)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"`

/** The main colour of each category's drawing, where a find has no tint of its own. */
const CATEGORY_TINT: Record<string, string> = {
  bird: '#c8a27a',
  flower: '#f3b6c8',
  blossom: '#fbe7ef',
  leaf: '#9fd08e',
  berry: '#e2596b',
  nut: '#b9774a',
  fungus: '#e8a06a',
  creature: '#9cc6ec',
}

/** Per-find tints, so finds sharing a picture still look like themselves. */
const FIND_TINT: Record<string, string> = {
  'robin-song': '#f08a5d',
  'hazel-catkins': '#f2dc7a',
  snowdrops: '#ffffff',
  'wren-song': '#b58a62',
  'blackbird-song': '#6b625e',
  frogspawn: '#a9c99a',
  daffodils: '#ffd84d',
  'blackthorn-blossom': '#fffaf2',
  primroses: '#fbeb9a',
  bumblebee: '#f6c445',
  bluebells: '#8f9de8',
  'orange-tip': '#ffb067',
  cuckoo: '#a3a9b4',
  'new-beech-leaves': '#b9e48c',
  'hawthorn-blossom': '#fff3df',
  swifts: '#77706d',
  'cow-parsley': '#fffaf2',
  elderflower: '#fbf0c9',
  'dog-rose': '#f7c1cf',
  foxgloves: '#e48cc0',
  damselfly: '#6fb6f0',
  'bramble-flowers': '#f6d3dc',
  poppies: '#ef5a4c',
  'meadow-brown': '#c18a5a',
  'house-martins': '#5d6f9a',
  heather: '#b98ad8',
  'rowan-berries': '#f2703f',
  blackberries: '#6a4a7a',
  conkers: '#9a5a32',
  acorns: '#c99a5a',
  'sycamore-keys': '#d8c27a',
  'ivy-flowers': '#c9d977',
  'fly-agaric': '#e8453c',
  squirrel: '#a9a3a0',
  'golden-leaves': '#f2a83c',
  redwings: '#b98a62',
  murmuration: '#5e5a72',
  'bracket-fungus': '#d9a066',
  'holly-berries': '#e0424f',
  'old-mans-beard': '#e9e4dc',
}

const DRAWINGS: Record<string, string> = {
  // A round little songbird on a twig.
  bird: `
    <path d="M10 50 L54 50" fill="none" stroke="#9a6a48" stroke-width="3.5" />
    <path d="M14 34 C14 22 24 16 34 18 C44 20 50 28 48 38 C46 46 38 49 30 48 C20 47 14 42 14 34 Z" fill="var(--nature-tint)" />
    <path d="M47 34 C52 30 58 30 60 32 C56 36 52 37 47 37 Z" fill="var(--nature-tint)" />
    <path d="M20 36 C24 44 32 46 38 42" fill="#fff3e2" />
    <path d="M24 30 C28 26 34 26 38 30" fill="none" stroke="var(--item-shine)" />
    <circle cx="22" cy="27" r="2.2" fill="var(--item-line)" stroke="none" />
    <path d="M12 28 L6 30 L12 32 Z" fill="#f6b94a" />
    <path d="M28 48 L27 52 M34 48 L35 52" fill="none" />`,
  // A five-petal flower on a stem with a leaf.
  flower: `
    <path d="M32 36 L32 58" fill="none" stroke="#6aae5a" stroke-width="3.5" />
    <path d="M32 50 C38 44 46 44 48 46 C44 52 38 53 32 52 Z" fill="#9fd08e" />
    <g fill="var(--nature-tint)">
      <ellipse cx="32" cy="12" rx="7" ry="8" />
      <ellipse cx="45" cy="21" rx="8" ry="7" transform="rotate(30 45 21)" />
      <ellipse cx="40" cy="35" rx="7" ry="8" transform="rotate(-30 40 35)" />
      <ellipse cx="24" cy="35" rx="7" ry="8" transform="rotate(30 24 35)" />
      <ellipse cx="19" cy="21" rx="8" ry="7" transform="rotate(-30 19 21)" />
    </g>
    <circle cx="32" cy="24" r="6.5" fill="#ffd36b" />
    <path d="M29 22 C30 21 32 21 33 21" fill="none" stroke="var(--item-shine)" />`,
  // A twig with little blossoms and a dangling catkin.
  blossom: `
    <path d="M8 44 C20 40 32 34 56 18" fill="none" stroke="#9a6a48" stroke-width="3.5" />
    <path d="M26 37 C25 44 27 52 24 58" fill="none" stroke="#c9b25a" stroke-width="5" stroke-dasharray="0.1 4.5" />
    <g fill="var(--nature-tint)">
      <circle cx="16" cy="36" r="4" /><circle cx="22" cy="34" r="4" /><circle cx="20" cy="28" r="4" /><circle cx="13" cy="29" r="4" />
      <circle cx="38" cy="26" r="4.5" /><circle cx="45" cy="25" r="4.5" /><circle cx="43" cy="18" r="4.5" /><circle cx="35" cy="19" r="4.5" />
      <circle cx="52" cy="12" r="3.5" /><circle cx="57" cy="10" r="3.5" />
    </g>
    <circle cx="17.5" cy="32" r="2.4" fill="#ffd36b" />
    <circle cx="40" cy="22" r="2.6" fill="#ffd36b" />`,
  // A single soft leaf with veins.
  leaf: `
    <path d="M12 54 C10 30 26 10 54 10 C54 38 38 54 12 54 Z" fill="var(--nature-tint)" />
    <path d="M8 58 L44 22" fill="none" />
    <path d="M22 44 L22 34 M30 36 L30 26 M38 28 L38 20 M22 44 L32 44 M30 36 L40 36" fill="none" stroke="var(--item-shine)" />`,
  // A bunch of round berries with a leaf.
  berry: `
    <path d="M30 8 C30 16 26 22 22 30 M30 8 C34 16 40 22 44 30 M30 8 L32 30" fill="none" stroke="#7a8a4a" />
    <path d="M30 10 C20 4 10 8 8 14 C18 18 26 16 30 10 Z" fill="#7fbf6e" />
    <g fill="var(--nature-tint)">
      <circle cx="22" cy="36" r="8" /><circle cx="40" cy="36" r="8" /><circle cx="31" cy="44" r="8" />
      <circle cx="20" cy="51" r="7" /><circle cx="42" cy="51" r="7" />
    </g>
    <path d="M18 33 C19 31 21 31 22 31 M36 33 C37 31 39 31 40 31 M27 41 C28 39 30 39 31 39" fill="none" stroke="var(--item-shine)" />`,
  // A plump nut or seed in its cap.
  nut: `
    <path d="M14 30 C14 46 22 58 32 58 C42 58 50 46 50 30 Z" fill="var(--nature-tint)" />
    <path d="M10 30 C10 18 20 12 32 12 C44 12 54 18 54 30 C54 33 50 34 32 34 C14 34 10 33 10 30 Z" fill="#a8845a" />
    <path d="M32 12 L32 5" fill="none" stroke="#7a5a3a" stroke-width="3.5" />
    <path d="M18 22 L22 26 M28 18 L30 24 M38 18 L36 24 M46 22 L42 26" fill="none" stroke="#7a5a3a" stroke-width="2" />
    <path d="M22 40 C22 46 25 50 28 52" fill="none" stroke="var(--item-shine)" />`,
  // A round-capped toadstool with soft spots.
  fungus: `
    <path d="M10 56 C20 52 44 52 54 56" fill="none" stroke="#7fbf6e" stroke-width="3.5" />
    <path d="M25 34 C24 42 23 50 22 55 L42 55 C41 50 40 42 39 34 Z" fill="#fff3e2" />
    <path d="M6 34 C6 18 18 8 32 8 C46 8 58 18 58 34 C58 38 52 38 32 38 C12 38 6 38 6 34 Z" fill="var(--nature-tint)" />
    <g fill="#fffaf2" stroke="none">
      <ellipse cx="20" cy="22" rx="4" ry="3" /><ellipse cx="34" cy="16" rx="4.5" ry="3.2" /><ellipse cx="46" cy="25" rx="3.5" ry="2.6" /><ellipse cx="29" cy="29" rx="3" ry="2.2" />
    </g>`,
  // A little butterfly: the friendly stand-in for every small creature.
  creature: `
    <path d="M30 26 C22 10 6 10 8 22 C10 32 22 34 30 32 Z" fill="var(--nature-tint)" />
    <path d="M34 26 C42 10 58 10 56 22 C54 32 42 34 34 32 Z" fill="var(--nature-tint)" />
    <path d="M30 34 C20 36 12 44 18 50 C24 54 30 46 31 38 Z" fill="var(--nature-tint)" />
    <path d="M34 34 C44 36 52 44 46 50 C40 54 34 46 33 38 Z" fill="var(--nature-tint)" />
    <rect x="29" y="20" width="6" height="30" rx="3" fill="#8a6a5a" />
    <path d="M30 20 C28 14 25 11 22 10 M34 20 C36 14 39 11 42 10" fill="none" />
    <path d="M14 20 C16 17 20 16 23 17 M50 20 C48 17 44 16 41 17" fill="none" stroke="var(--item-shine)" />`,
}

/** The categories that have a drawing (the keys config's `picture` may use). */
export const NATURE_PICTURES: readonly string[] = Object.keys(DRAWINGS)

/**
 * The drawing for a find: its category picture in its own tint. An unknown picture
 * draws as a leaf, so a find from a later version still shows something soft.
 */
export function natureSvg(id: string, picture: string): string {
  const key = Object.hasOwn(DRAWINGS, picture) ? picture : 'leaf'
  const tint = (Object.hasOwn(FIND_TINT, id) ? FIND_TINT[id] : undefined) ?? CATEGORY_TINT[key]!
  return `<svg class="item-svg nature-svg" data-nature="${id.replace(/[^a-z0-9-]/gi, '')}" data-picture="${key}" style="--nature-tint:${tint}" viewBox="0 0 64 64" aria-hidden="true" focusable="false" ${ATTRS}>${DRAWINGS[key]}</svg>`
}
