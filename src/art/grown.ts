// Whelp, Juvenile, Adult and Elder. Placeholder art in the same soft, round style
// as the Hatchling; each is bigger and more confident than the last.
// Juvenile and later take an evolution look (looks.ts); neutral draws them as they are.

import { lookFeatures, type EvolutionLook, type LookAnchors } from './looks'
import { dragonSvg, eyes, pair, type Anchors } from './parts'

const WHELP: Anchors = { eyes: { y: 204, dx: 46, rx: 22, ry: 28 }, headTop: 110, body: { cy: 362, rx: 118, ry: 110 }, headBox: [100, 36, 412, 306] }

export function whelpSvg(): string {
  return dragonSvg(
    { stage: 'whelp', label: 'A young dragon with growing wings', scale: 0.9, anchors: WHELP },
    `
    ${pair('hd-wing', 'M182 296 C136 206 54 214 42 292 C72 282 92 294 100 318 C114 302 134 302 148 314 C154 298 168 292 182 302 Z')}
    <path class="hd-skin" d="M344 420 C404 440 452 418 462 368 C440 390 404 398 360 392 Z" />
    <path class="hd-skin" d="M456 372 C452 350 462 334 478 326 C480 346 474 362 460 376 Z" />
    <ellipse class="hd-skin" cx="256" cy="362" rx="118" ry="110" />
    <ellipse class="hd-belly" cx="256" cy="386" rx="70" ry="72" />
    <path class="hd-plate" d="M204 362 Q256 374 308 362" />
    <path class="hd-plate" d="M198 394 Q256 406 314 394" />
    <path class="hd-plate" d="M208 426 Q256 436 304 426" />
    <ellipse class="hd-skin" cx="200" cy="468" rx="38" ry="20" />
    <ellipse class="hd-skin" cx="312" cy="468" rx="38" ry="20" />
    ${pair('hd-wing', 'M146 204 C114 190 104 162 110 140 C132 156 148 172 158 190 Z')}
    ${pair('hd-horn', 'M188 130 C166 86 180 50 210 38 C206 68 210 96 226 118 Z')}
    <path class="hd-horn" d="M240 112 L250 88 L260 112 Z" />
    <ellipse class="hd-skin" cx="256" cy="208" rx="114" ry="98" />
    <ellipse class="hd-cheek" cx="178" cy="246" rx="20" ry="12" />
    <ellipse class="hd-cheek" cx="334" cy="246" rx="20" ry="12" />
    ${eyes(WHELP.eyes)}
    <circle class="hd-nostril" cx="246" cy="240" r="3.5" />
    <circle class="hd-nostril" cx="266" cy="240" r="3.5" />
    <path class="hd-mouth" d="M236 256 Q256 272 276 256" />
    <path class="hd-fang" d="M262 263 L266 274 L271 261 Z" />
  `,
  )
}

const JUVENILE: Anchors = { eyes: { y: 166, dx: 42, rx: 18, ry: 23 }, headTop: 86, body: { cy: 372, rx: 112, ry: 104 }, headBox: [120, 10, 392, 252] }

const JUVENILE_LOOK: LookAnchors = { snoutTop: 180, forehead: 112, flower: [212, 100], wingSpots: [[92, 214], [134, 238]], size: 1 }

export function juvenileSvg(look: EvolutionLook = 'neutral'): string {
  return dragonSvg(
    { evolution: look, features: lookFeatures(look, JUVENILE, JUVENILE_LOOK), stage: 'juvenile', label: 'A confident young dragon with strong wings', scale: 0.95, anchors: JUVENILE },
    `
    ${pair('hd-wing', 'M192 286 C152 172 62 150 22 212 C52 216 68 232 72 256 C90 242 112 246 122 264 C136 252 158 256 168 274 Z')}
    ${pair('hd-wing-line', 'M190 284 C154 196 92 170 30 206')}
    <path class="hd-skin" d="M330 432 C410 460 470 430 470 370 C470 334 446 318 424 330 C442 340 448 362 434 382 C414 406 372 412 340 404 Z" />
    <path class="hd-skin" d="M424 334 C410 312 414 292 426 280 C438 296 440 316 428 336 Z" />
    <path class="hd-skin" d="M210 300 C208 252 218 222 232 200 L280 200 C294 222 304 252 302 300 Z" />
    <ellipse class="hd-skin" cx="256" cy="372" rx="112" ry="104" />
    <ellipse class="hd-belly" cx="256" cy="392" rx="64" ry="72" />
    <path class="hd-plate" d="M206 360 Q256 372 306 360" />
    <path class="hd-plate" d="M200 392 Q256 404 312 392" />
    <path class="hd-plate" d="M208 424 Q256 434 304 424" />
    <ellipse class="hd-skin" cx="198" cy="470" rx="42" ry="20" />
    <ellipse class="hd-skin" cx="314" cy="470" rx="42" ry="20" />
    ${pair('hd-claw', 'M170 474 L166 486 M190 478 L188 490 M210 478 L210 490')}
    ${pair('hd-wing', 'M166 166 C136 156 124 132 128 110 C148 124 164 138 174 154 Z')}
    ${pair('hd-horn', 'M194 112 C168 66 176 28 210 12 C204 48 210 78 226 100 Z')}
    <path class="hd-horn" d="M238 96 L248 70 L258 96 Z" />
    <path class="hd-horn" d="M256 92 L266 68 L276 92 Z" />
    <ellipse class="hd-skin" cx="256" cy="172" rx="100" ry="86" />
    <ellipse class="hd-skin" cx="256" cy="214" rx="56" ry="38" />
    <ellipse class="hd-cheek" cx="186" cy="206" rx="18" ry="10" />
    <ellipse class="hd-cheek" cx="326" cy="206" rx="18" ry="10" />
    ${eyes(JUVENILE.eyes)}
    ${pair('hd-brow', 'M194 136 Q212 128 230 136')}
    <circle class="hd-nostril" cx="244" cy="206" r="4" />
    <circle class="hd-nostril" cx="268" cy="206" r="4" />
    <path class="hd-mouth" d="M232 226 Q256 242 280 226" />
  `,
  )
}

const ADULT: Anchors = { eyes: { y: 134, dx: 38, rx: 16, ry: 20 }, headTop: 66, body: { cy: 374, rx: 124, ry: 108 }, headBox: [136, -6, 376, 212] }

const ADULT_LOOK: LookAnchors = { snoutTop: 148, forehead: 84, flower: [218, 84], wingSpots: [[78, 146], [124, 180]], size: 1 }

export function adultSvg(look: EvolutionLook = 'neutral'): string {
  return dragonSvg(
    { evolution: look, features: lookFeatures(look, ADULT, ADULT_LOOK), stage: 'adult', label: 'A strong, proud dragon with wide wings', scale: 1, anchors: ADULT },
    `
    ${pair('hd-wing', 'M198 270 C152 118 44 76 8 148 C32 154 46 170 48 196 C68 180 94 186 104 206 C120 194 144 198 152 218 C166 210 186 216 192 238 Z')}
    ${pair('hd-wing-line', 'M196 268 C160 150 90 110 14 150 M190 250 C150 186 104 176 54 194 M186 236 C160 206 130 200 104 206')}
    <path class="hd-skin" d="M320 440 C420 472 500 430 492 360 C488 326 458 314 440 332 C462 340 466 366 452 384 C430 410 380 420 340 412 Z" />
    <path class="hd-skin" d="M440 336 C424 312 428 288 442 274 C456 292 458 316 444 340 Z" />
    <path class="hd-skin" d="M212 304 C208 238 220 196 236 166 L276 166 C292 196 304 238 300 304 Z" />
    ${pair('hd-spine', 'M214 250 L196 240 L212 228 Z')}
    <ellipse class="hd-skin" cx="256" cy="374" rx="124" ry="108" />
    <ellipse class="hd-belly" cx="256" cy="392" rx="70" ry="76" />
    <path class="hd-belly" d="M234 300 C236 260 244 222 256 204 C268 222 276 260 278 300 Z" />
    <path class="hd-plate" d="M240 262 Q256 268 272 262" />
    <path class="hd-plate" d="M204 356 Q256 368 308 356" />
    <path class="hd-plate" d="M196 390 Q256 402 316 390" />
    <path class="hd-plate" d="M206 424 Q256 434 306 424" />
    <ellipse class="hd-skin" cx="194" cy="472" rx="46" ry="21" />
    <ellipse class="hd-skin" cx="318" cy="472" rx="46" ry="21" />
    ${pair('hd-claw', 'M162 476 L158 489 M184 480 L182 493 M206 480 L206 493')}
    ${pair('hd-wing', 'M180 136 C152 128 138 106 140 86 C160 98 176 112 186 126 Z')}
    ${pair('hd-horn', 'M200 92 C164 52 166 12 202 -4 C198 34 206 62 224 82 Z')}
    ${pair('hd-horn', 'M186 112 C170 98 164 82 168 66 C180 78 190 90 198 104 Z')}
    <path class="hd-horn" d="M246 70 L256 44 L266 70 Z" />
    <ellipse class="hd-skin" cx="256" cy="140" rx="90" ry="74" />
    <ellipse class="hd-skin" cx="256" cy="178" rx="52" ry="34" />
    <ellipse class="hd-cheek" cx="194" cy="170" rx="16" ry="9" />
    <ellipse class="hd-cheek" cx="318" cy="170" rx="16" ry="9" />
    ${eyes(ADULT.eyes)}
    ${pair('hd-brow', 'M200 108 Q218 98 236 106')}
    <circle class="hd-nostril" cx="244" cy="172" r="4" />
    <circle class="hd-nostril" cx="268" cy="172" r="4" />
    <path class="hd-mouth" d="M230 190 Q256 206 282 190" />
  `,
  )
}

const ELDER: Anchors = { eyes: { y: 132, dx: 38, rx: 15, ry: 17 }, headTop: 62, body: { cy: 374, rx: 128, ry: 110 }, headBox: [126, -8, 386, 260] }

const ELDER_LOOK: LookAnchors = { snoutTop: 146, forehead: 88, flower: [216, 80], wingSpots: [[72, 124], [118, 158]], size: 1 }

export function elderSvg(look: EvolutionLook = 'neutral'): string {
  return dragonSvg(
    { evolution: look, features: lookFeatures(look, ELDER, ELDER_LOOK), stage: 'elder', label: 'A wise, gentle old dragon', scale: 1, anchors: ELDER },
    `
    ${pair('hd-wing', 'M200 264 C150 104 40 54 2 128 C28 134 42 152 44 178 C64 162 92 166 102 188 C118 174 144 178 152 200 C168 192 188 200 194 224 Z')}
    ${pair('hd-wing-line', 'M198 262 C160 136 86 90 8 128 M192 246 C150 176 102 162 50 176 M188 232 C160 196 128 188 102 190')}
    <path class="hd-skin" d="M314 446 C430 482 508 432 498 352 C492 314 456 302 436 324 C462 332 468 362 450 384 C426 414 374 424 334 416 Z" />
    <path class="hd-skin" d="M436 328 C420 302 424 276 440 260 C456 280 458 306 442 332 Z" />
    <path class="hd-skin" d="M212 304 C208 236 220 192 236 160 L276 160 C292 192 304 236 300 304 Z" />
    ${pair('hd-spine', 'M214 250 L194 240 L212 226 Z')}
    ${pair('hd-spine', 'M218 210 L200 200 L218 188 Z')}
    <ellipse class="hd-skin" cx="256" cy="374" rx="128" ry="110" />
    <ellipse class="hd-belly" cx="256" cy="392" rx="72" ry="78" />
    <path class="hd-plate" d="M204 356 Q256 368 308 356" />
    <path class="hd-plate" d="M196 390 Q256 402 316 390" />
    <path class="hd-plate" d="M206 424 Q256 434 306 424" />
    <path class="hd-mane" d="M188 268 Q256 306 324 268 L326 288 Q292 316 256 316 Q220 316 186 288 Z" />
    <ellipse class="hd-skin" cx="192" cy="474" rx="48" ry="21" />
    <ellipse class="hd-skin" cx="320" cy="474" rx="48" ry="21" />
    ${pair('hd-claw', 'M158 478 L154 491 M182 482 L180 495 M206 482 L206 495')}
    ${pair('hd-wing', 'M180 130 C150 122 136 98 138 78 C160 92 176 106 186 120 Z')}
    ${pair('hd-horn', 'M204 90 C150 70 128 24 150 -6 C160 32 182 58 222 76 Z')}
    ${pair('hd-horn', 'M188 110 C168 100 158 84 160 66 C174 78 186 90 196 102 Z')}
    <ellipse class="hd-skin" cx="256" cy="136" rx="90" ry="74" />
    <ellipse class="hd-skin" cx="256" cy="176" rx="54" ry="34" />
    <circle class="hd-gem" cx="256" cy="88" r="11" />
    ${pair('hd-whisker-edge', 'M222 182 C186 192 158 214 146 246')}
    ${pair('hd-whisker', 'M222 182 C186 192 158 214 146 246')}
    <path class="hd-mane" d="M234 202 C238 238 256 258 256 258 C256 258 274 238 278 202 Z" />
    ${eyes(ELDER.eyes)}
    ${pair('hd-lid', 'M206 122 Q218 110 232 120')}
    <circle class="hd-nostril" cx="244" cy="170" r="4" />
    <circle class="hd-nostril" cx="268" cy="170" r="4" />
    <path class="hd-mouth" d="M232 188 Q256 202 280 188" />
  `,
  )
}
