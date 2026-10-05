// The Hatchling: a round baby dragon. Placeholder art, charming rather than detailed.

export function hatchlingSvg(): string {
  return `
<svg class="dragon-svg hatchling" data-stage="hatchling" data-evolution="neutral" viewBox="0 0 512 512" role="img" aria-label="A round baby dragon with big eyes">
  <g transform="translate(256 492) scale(0.84) translate(-256 -492)">
  <g class="hatchling-body dragon-body">
    <path class="hd-wing" d="M178 300 C120 240 60 262 66 330 C92 314 112 326 120 352 C138 330 160 334 176 344 Z" />
    <path class="hd-wing" d="M334 300 C392 240 452 262 446 330 C420 314 400 326 392 352 C374 330 352 334 336 344 Z" />
    <path class="hd-skin" d="M352 418 C410 432 446 410 452 360 C430 384 400 392 362 386 Z" />
    <ellipse class="hd-skin" cx="256" cy="360" rx="122" ry="112" />
    <ellipse class="hd-belly" cx="256" cy="386" rx="74" ry="70" />
    <ellipse class="hd-skin" cx="204" cy="466" rx="36" ry="20" />
    <ellipse class="hd-skin" cx="308" cy="466" rx="36" ry="20" />
    <path class="hd-horn" d="M190 128 C178 92 196 68 222 62 C218 86 220 104 228 120 Z" />
    <path class="hd-horn" d="M322 128 C334 92 316 68 290 62 C294 86 292 104 284 120 Z" />
    <ellipse class="hd-skin" cx="256" cy="214" rx="122" ry="106" />
    <ellipse class="hd-cheek" cx="176" cy="254" rx="22" ry="13" />
    <ellipse class="hd-cheek" cx="336" cy="254" rx="22" ry="13" />
    <g class="hatchling-eyes dragon-eyes">
      <ellipse class="hd-eye" cx="212" cy="214" rx="25" ry="31" />
      <ellipse class="hd-eye" cx="300" cy="214" rx="25" ry="31" />
      <circle cx="221" cy="201" r="9" fill="#fff" />
      <circle cx="309" cy="201" r="9" fill="#fff" />
      <circle cx="204" cy="228" r="4" fill="#fff" opacity="0.8" />
      <circle cx="292" cy="228" r="4" fill="#fff" opacity="0.8" />
    </g>
    <path class="hd-mouth" d="M240 262 Q256 276 272 262" />
  </g>
  </g>
</svg>`
}
