// The dragon's colour, chosen in Settings. The game only knows it as an opaque id
// (Settings.dragonColour); this list is what the art can draw. The colours
// themselves are tokens in art.css ([data-colour='…'], light and dark), so the art
// can be replaced wholesale. Peach is today's colour, the :root tokens.
//
// No colour chosen ("classic") draws exactly as before: peach, with each evolution
// look recolouring the body. With a colour chosen, the body keeps it at every stage
// and a look only adds its features, accents and cheeks. The egg takes the colour
// in its spots and glow.

export const DRAGON_COLOURS = [
  { id: 'peach', label: 'Peach' },
  { id: 'mint', label: 'Mint' },
  { id: 'sky', label: 'Sky' },
  { id: 'lilac', label: 'Lilac' },
  { id: 'rose', label: 'Rose' },
  { id: 'butter', label: 'Butter' },
] as const

export type ColourId = (typeof DRAGON_COLOURS)[number]['id']

/** True for an id the art has a colour for. */
export function isDragonColour(id: unknown): id is ColourId {
  return DRAGON_COLOURS.some((c) => c.id === id)
}

/** The svg attribute for a colour, or nothing for none or an id the art doesn't know. */
export function colourAttr(colour: string | undefined): string {
  return isDragonColour(colour) ? ` data-colour="${colour}"` : ''
}
