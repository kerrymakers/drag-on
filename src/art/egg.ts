// The egg. Pure markup: colours come from CSS custom properties in art.css.

export type CrackLevel = 0 | 1 | 2

export function eggSvg(crack: CrackLevel, uid: string): string {
  const shell = `egg-shell-${uid}`
  const small =
    crack >= 1
      ? `<path class="egg-crack" d="M232 112 l16 24 l-14 18 l20 22" />`
      : ''
  const big =
    crack >= 2
      ? `<path class="egg-crack" d="M254 176 l26 -4 l12 18 l24 -2" />
         <path class="egg-crack" d="M330 236 l-16 22 l14 16 l-10 18" />`
      : ''
  return `
<svg class="dragon-svg egg" viewBox="0 0 512 512" role="img" aria-label="${ariaLabel(crack)}">
  <defs>
    <radialGradient id="${shell}" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="var(--egg-light)" />
      <stop offset="1" stop-color="var(--egg-dark)" />
    </radialGradient>
  </defs>
  <path d="M256 36c-92 0-170 150-170 262 0 100 76 178 170 178s170-78 170-178C426 186 348 36 256 36z"
    fill="url(#${shell})" stroke="var(--egg-outline)" stroke-width="14" />
  <ellipse cx="196" cy="214" rx="34" ry="26" fill="var(--egg-spot)" />
  <ellipse cx="320" cy="300" rx="44" ry="32" fill="var(--egg-spot)" />
  <ellipse cx="214" cy="374" rx="26" ry="20" fill="var(--egg-spot)" />
  ${small}
  ${big}
  <ellipse class="egg-glint" cx="190" cy="130" rx="18" ry="34" transform="rotate(30 190 130)" fill="#fff" />
  <path class="egg-sparkle" d="M350 96 l8 22 l22 8 l-22 8 l-8 22 l-8 -22 l-22 -8 l22 -8 z" fill="#fff" />
</svg>`
}

function ariaLabel(crack: CrackLevel): string {
  if (crack === 2) return 'A speckled egg, cracking open'
  if (crack === 1) return 'A speckled egg with a little crack'
  return 'A speckled egg'
}
