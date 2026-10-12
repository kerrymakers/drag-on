// The cosy scene behind the dragon on Home: a sky that follows the time of day, soft
// rolling hills, and a patch of ground (or, for the egg, a nest) under the dragon.
// Every sky is drawn once; CSS (scene.css) shows the one named by data-sky and
// cross-fades between them, so a change of sky never redraws or shifts anything.
// The UI decides the sky (game/scene.ts) and passes it in.

import './scene.css'

/** The sky, in the art's own words (the UI maps the game's period onto it). */
export type SkyLook = 'dawn' | 'day' | 'evening' | 'night'
export const SKY_LOOKS: readonly SkyLook[] = ['dawn', 'day', 'evening', 'night']

export interface SceneLook {
  sky: SkyLook
  /** The stage id: the egg sits in a nest, every other stage on a soft grassy patch. */
  stage: string
}

let uidCounter = 0

/** A soft four-pointed twinkle, centred on (0, 0). */
const sparkle = (r: number) =>
  `<path d="M0 ${-r} Q${r * 0.18} ${-r * 0.18} ${r} 0 Q${r * 0.18} ${r * 0.18} 0 ${r} Q${-r * 0.18} ${r * 0.18} ${-r} 0 Q${-r * 0.18} ${-r * 0.18} 0 ${-r} Z" />`

/** Where the stars sit, as % of the scene (x, y), their size (px) and twinkle delay (s). Clear of the heading's middle. */
const STARS: readonly (readonly [number, number, number, number])[] = [
  [8, 9, 9, -0.4],
  [30, 22, 6, -2.1],
  [27, 6, 7, -3.3],
  [85, 7, 8, -1.2],
  [93, 22, 6, -2.8],
  [76, 27, 7, -0.9],
  [6, 38, 6, -3.7],
  [94, 41, 7, -1.7],
  [71, 3, 5, -2.5],
]

/** A soft, rounded cloud, 120 × 44. */
const CLOUD = 'M20 40 Q2 40 4 28 Q6 16 22 18 Q26 4 44 6 Q56 -2 70 8 Q86 2 94 16 Q114 14 116 28 Q118 40 102 40 Z'

/** The backdrop: skies, sun, moon, stars, clouds and hills. Decorative only. */
export function sceneBackdrop(uid: string): string {
  const id = (n: string) => `scene-${n}-${uid}`
  const skies = SKY_LOOKS.map((s) => `<div class="scene-sky scene-for-${s}"></div>`).join('')
  const stars = STARS.map(
    ([x, y, size, delay]) =>
      // The outer span fades in and out with the night; the inner one twinkles.
      `<span class="scene-star scene-for-night" style="left:${x}%;top:${y}%;width:${size}px;height:${size}px"><span class="scene-star-twinkle" style="animation-delay:${delay}s"><svg viewBox="-10 -10 20 20">${sparkle(10)}</svg></span></span>`,
  ).join('')
  const sun = (cls: string, r: number) =>
    `<div class="scene-sun ${cls}"><svg viewBox="-50 -50 100 100">
      <circle class="scene-sun-glow" r="50" fill="url(#${id('glow')})" />
      <circle class="scene-sun-disc" r="${r}" />
    </svg></div>`
  const cloud = (cls: string) => `<div class="scene-cloud ${cls}"><svg viewBox="0 0 120 44"><path d="${CLOUD}" /></svg></div>`
  return `
  <svg class="scene-defs" width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="${id('glow')}"><stop offset="0.3" class="scene-glow-stop" /><stop offset="1" class="scene-glow-stop scene-glow-clear" /></radialGradient>
    </defs>
  </svg>
  ${skies}
  ${stars}
  <div class="scene-moon scene-for-night"><svg viewBox="-50 -50 100 100">
    <circle class="scene-moon-glow" r="50" fill="url(#${id('glow')})" />
    <path class="scene-moon-disc" d="M8 -24 A26 26 0 1 0 22 14 A20 20 0 1 1 8 -24 Z" />
  </svg></div>
  ${sun('scene-sun-high scene-for-day', 18)}
  ${sun('scene-sun-low scene-sun-dawn scene-for-dawn', 20)}
  ${sun('scene-sun-low scene-sun-evening scene-for-evening', 20)}
  ${cloud('scene-cloud-a')}
  ${cloud('scene-cloud-b')}
  <svg class="scene-hills" viewBox="0 0 400 100" preserveAspectRatio="none">
    <path class="scene-hill-far" d="M0 42 Q60 14 128 34 Q190 52 252 26 Q324 0 400 30 L400 100 L0 100 Z" />
    <path class="scene-hill-near" d="M0 66 Q80 46 168 62 Q240 74 306 56 Q360 44 400 54 L400 100 L0 100 Z" />
  </svg>`
}

/**
 * The ground under the dragon, in the dragon drawing's own units (512 square, ground
 * line at y 492), so it lines up with any stage's feet. The dragon's own soft shadow
 * falls on it. Both kinds are drawn; CSS shows the one in data-ground.
 */
export function sceneFloor(): string {
  const tuft = (x: number, y: number, s = 1) =>
    `<path class="scene-tuft" d="M${x - 9 * s} ${y} Q${x - 8 * s} ${y - 12 * s} ${x - 14 * s} ${y - 20 * s} Q${x - 2 * s} ${y - 12 * s} ${x} ${y - 4 * s} Q${x + 2 * s} ${y - 16 * s} ${x + 10 * s} ${y - 22 * s} Q${x + 6 * s} ${y - 10 * s} ${x + 9 * s} ${y} Z" />`
  return `<svg class="scene-floor-svg" viewBox="0 0 512 512">
    <g class="scene-patch">
      <ellipse class="scene-patch-ground" cx="256" cy="488" rx="200" ry="22" />
      ${tuft(78, 494)}${tuft(104, 500, 0.8)}${tuft(420, 496, 0.9)}${tuft(444, 490)}
    </g>
    <g class="scene-nest">
      <ellipse class="scene-patch-ground" cx="256" cy="490" rx="196" ry="20" />
      <path class="scene-nest-hollow" d="M72 458 Q78 422 256 418 Q434 422 440 458 Z" />
      <path class="scene-nest-straw" d="M96 440 Q170 428 236 430 M282 430 Q350 430 414 442" />
    </g>
  </svg>`
}

/**
 * What sits in front of the drawing, in the same units: the nest's front lip, so the
 * egg sits down in the nest rather than on top of it. Nothing for the dragon stages.
 */
export function sceneFront(): string {
  return `<svg class="scene-floor-svg" viewBox="0 0 512 512">
    <g class="scene-nest">
      <path class="scene-nest-rim" d="M66 452 Q256 494 446 452 Q452 484 256 506 Q60 484 66 452 Z" />
      <path class="scene-nest-straw" d="M92 470 Q170 492 240 494 M276 494 Q350 490 420 470 M150 488 Q256 506 360 488" />
    </g>
  </svg>`
}

/**
 * Draws the scene into its places on Home (once), and shows `look`: the backdrop
 * behind the heading and dragon, the floor behind the dragon, and what sits in front
 * of it (the nest's lip), both the same size as the drawing.
 */
export function renderScene(backdrop: HTMLElement, floor: HTMLElement, front: HTMLElement, look: SceneLook): void {
  const first = !backdrop.hasChildNodes()
  if (first) backdrop.innerHTML = sceneBackdrop(String(++uidCounter))
  if (!floor.hasChildNodes()) floor.innerHTML = sceneFloor()
  if (!front.hasChildNodes()) front.innerHTML = sceneFront()
  const sky = SKY_LOOKS.includes(look.sky) ? look.sky : 'day'
  const ground = look.stage === 'egg' ? 'nest' : 'patch'
  for (const el of [backdrop, floor, front]) {
    if (el.dataset.sky !== sky) el.dataset.sky = sky
  }
  for (const el of [floor, front]) {
    if (el.dataset.ground !== ground) el.dataset.ground = ground
  }
  // From the next frame on, a change of sky cross-fades (see scene.css).
  if (first) {
    const ready = () => {
      for (const el of [backdrop, floor, front]) el.dataset.sceneReady = ''
    }
    const view = backdrop.ownerDocument?.defaultView
    if (view) view.requestAnimationFrame(() => view.requestAnimationFrame(ready))
    else ready()
  }
}
