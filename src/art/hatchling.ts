// The Hatchling: a round baby dragon. Placeholder art, charming rather than detailed.

import { dragonSvg, shine, wingPair, type Anchors, type WearLook } from './parts'

export const HATCHLING_SCALE = 0.84

export const HATCHLING: Anchors = {
  eyes: { y: 214, dx: 44, rx: 25, ry: 31 },
  headTop: 108,
  body: { cy: 360, rx: 122, ry: 112 },
  headBox: [130, 58, 382, 322],
  wear: {
    head: { x: 262, y: 118, size: 110, rotate: 6 },
    neck: { x: 256, y: 300, size: 160 },
    held: { x: 172, y: 402, size: 100, rotate: -8 },
  },
  neckY: 300,
  wingRoot: [176, 322],
}

/** `uid` makes the drawing's gradient ids unique: use a fresh one for each drawing on screen. */
export function hatchlingSvg(uid: string, wearing?: WearLook): string {
  return dragonSvg(
    {
      stage: 'hatchling',
      label: 'A round baby dragon with big eyes',
      scale: HATCHLING_SCALE,
      anchors: HATCHLING,
      bodyClass: 'hatchling-body',
      wearing,
      uid,
    },
    `
    ${wingPair('M178 300 C120 240 60 262 66 330 C92 314 112 326 120 352 C138 330 160 334 176 344 Z')}
    <g class="dragon-tail"><path class="hd-skin" d="M352 418 C410 432 446 410 452 360 C430 384 400 392 362 386 Z" /></g>
    <ellipse class="hd-skin" cx="256" cy="360" rx="122" ry="112" />
    <ellipse class="hd-belly" cx="256" cy="386" rx="74" ry="70" />
    ${shine(256, 386, 74, 70)}
    <ellipse class="hd-skin" cx="204" cy="466" rx="36" ry="20" />
    <ellipse class="hd-skin" cx="308" cy="466" rx="36" ry="20" />
    <g class="dragon-head dg-head-move">
    <path class="hd-horn" d="M190 128 C178 92 196 68 222 62 C218 86 220 104 228 120 Z" />
    <path class="hd-horn" d="M322 128 C334 92 316 68 290 62 C294 86 292 104 284 120 Z" />
    <ellipse class="hd-skin" cx="256" cy="214" rx="122" ry="106" />
    ${shine(256, 214, 122, 106)}
    <ellipse class="hd-cheek" cx="176" cy="254" rx="24" ry="15" />
    <ellipse class="hd-cheek" cx="336" cy="254" rx="24" ry="15" />
    <g class="dragon-gaze"><g class="hatchling-eyes dragon-eyes">
      <ellipse class="hd-eye" cx="212" cy="214" rx="25" ry="31" />
      <ellipse class="hd-eye" cx="300" cy="214" rx="25" ry="31" />
      <circle cx="221" cy="201" r="9" fill="#fff" />
      <circle cx="309" cy="201" r="9" fill="#fff" />
      <circle class="hd-eye-shine" cx="204" cy="228" r="4" fill="#fff" />
      <circle class="hd-eye-shine" cx="292" cy="228" r="4" fill="#fff" />
    </g></g>
    <path class="hd-mouth" d="M240 262 Q256 276 272 262" />
    </g>
`,
  ).replace('class="dragon-svg dragon-hatchling"', 'class="dragon-svg dragon-hatchling hatchling"')
}
