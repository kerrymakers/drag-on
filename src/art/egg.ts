// The egg. Pure markup: colours come from CSS custom properties in art.css.
// Moods are overlays shown by CSS from the svg's data-mood:
// happy glows, content is calm, sleepy wears a nightcap with a zzz,
// and curled up is tucked into a little blanket, peeking out.

import { headBoxRect, heart, zzz } from './parts'

export type CrackLevel = 0 | 1 | 2

export function eggSvg(crack: CrackLevel, uid: string): string {
  const shell = `egg-shell-${uid}`
  const glow = `egg-glow-${uid}`
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
<svg class="dragon-svg egg" data-stage="egg" data-mood="content" viewBox="0 0 512 512" role="img" aria-label="${ariaLabel(crack)}">
  <defs>
    <radialGradient id="${glow}">
      <stop offset="0.45" stop-color="var(--egg-glow)" stop-opacity="0.9" />
      <stop offset="1" stop-color="var(--egg-glow)" stop-opacity="0" />
    </radialGradient>
    <radialGradient id="${shell}" cx="40%" cy="35%" r="70%">
      <stop offset="0" stop-color="var(--egg-light)" />
      <stop offset="1" stop-color="var(--egg-dark)" />
    </radialGradient>
  </defs>
  ${headBoxRect([80, 4, 432, 272])}
  <ellipse class="mood-part mood-happy egg-glow" cx="256" cy="270" rx="240" ry="256" fill="url(#${glow})" />
  <path d="M256 36c-92 0-170 150-170 262 0 100 76 178 170 178s170-78 170-178C426 186 348 36 256 36z"
    fill="url(#${shell})" stroke="var(--egg-outline)" stroke-width="14" />
  <ellipse cx="196" cy="214" rx="34" ry="26" fill="var(--egg-spot)" />
  <ellipse cx="320" cy="300" rx="44" ry="32" fill="var(--egg-spot)" />
  <ellipse cx="214" cy="374" rx="26" ry="20" fill="var(--egg-spot)" />
  ${small}
  ${big}
  <ellipse class="egg-glint" cx="190" cy="130" rx="18" ry="34" transform="rotate(30 190 130)" fill="#fff" />
  <g class="mood-part mood-sleepy">
    <path class="egg-cap" d="M206 100 C212 44 262 8 336 24 C306 40 296 68 310 100 Z" />
    <path class="egg-cap-band" d="M196 102 Q256 80 318 102 L314 118 Q256 98 200 118 Z" />
    <circle class="egg-cap-band" cx="340" cy="24" r="15" />
  </g>
  ${zzz(352, 150)}
  <g class="mood-part mood-grumpy">
    <ellipse class="hd-eye" cx="226" cy="238" rx="9" ry="11" />
    <ellipse class="hd-eye" cx="286" cy="238" rx="9" ry="11" />
    <circle cx="229" cy="234" r="3.5" fill="#fff" />
    <circle cx="289" cy="234" r="3.5" fill="#fff" />
    <ellipse class="hd-cheek" cx="204" cy="258" rx="12" ry="7" />
    <ellipse class="hd-cheek" cx="308" cy="258" rx="12" ry="7" />
    ${heart(356, 192, 1.8)}
    <path class="mood-blanket" d="M70 292 Q160 252 256 270 Q352 252 442 292 L452 470 Q452 494 430 494 L82 494 Q60 494 60 470 Z" />
    <path class="mood-blanket-stripe" d="M74 336 Q256 300 438 336" />
    <path class="mood-blanket-stripe" d="M78 380 Q256 344 434 380" />
  </g>
  <path class="egg-sparkle" d="M350 96 l8 22 l22 8 l-22 8 l-8 22 l-8 -22 l-22 -8 l22 -8 z" fill="#fff" />
</svg>`
}

function ariaLabel(crack: CrackLevel): string {
  if (crack === 2) return 'A speckled egg, cracking open'
  if (crack === 1) return 'A speckled egg with a little crack'
  return 'A speckled egg'
}
