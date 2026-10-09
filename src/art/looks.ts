// Evolution looks: from Juvenile on, the dragon's top stat recolours it (art.css,
// [data-evolution]) and adds one or two features drawn here from each stage's anchors.
// The neutral look adds nothing.

import { onHead, onWings, pair, type Anchors } from './parts'

export type EvolutionLook = 'neutral' | 'strength' | 'discipline' | 'wisdom' | 'heart'

export const EVOLVED_LOOKS = ['strength', 'discipline', 'wisdom', 'heart'] as const

/** An unknown look draws as neutral, so a stat added to config later can't break the art. */
export function knownLook(look: string | undefined): EvolutionLook {
  return (EVOLVED_LOOKS as readonly string[]).includes(look ?? '') ? (look as EvolutionLook) : 'neutral'
}

/** Where a stage's look features sit, in the stage's own (unscaled) svg units. */
export interface LookAnchors {
  /** y of the top of the snout, between the nostrils. */
  snoutTop: number
  /** y of the middle of the forehead. */
  forehead: number
  /** Centre of a flower tucked at the base of the left horn. */
  flower: readonly [number, number]
  /** Two spots on the left wing's membrane (mirrored for the right wing). */
  wingSpots: readonly [readonly [number, number], readonly [number, number]]
  /** Size of the features relative to the Juvenile. */
  size: number
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** A five-pointed star centred on (x, y). Absolute M/L/Z only, so pair() can mirror it. */
function starPath(x: number, y: number, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 === 0 ? r : r * 0.48
    pts.push(`${r1(x + rr * Math.cos(a))} ${r1(y + rr * Math.sin(a))}`)
  }
  return `M${pts.join(' L')} Z`
}

/** A small heart centred on (x, y). Absolute M/C/Z only. */
function heartPath(x: number, y: number, s: number): string {
  const p = (dx: number, dy: number) => `${r1(x + dx * s)} ${r1(y + dy * s)}`
  return `M${p(0, 10)} C${p(-18, -2)} ${p(-12, -20)} ${p(0, -10)} C${p(12, -20)} ${p(18, -2)} ${p(0, 10)} Z`
}

/** Sturdy: rounded shoulder plates and a little nose horn; heavier brows in CSS. */
function strength(a: Anchors, l: LookAnchors): string {
  const { cy, rx, ry } = a.body
  const x = r1(256 - rx * 0.7)
  const y = r1(cy - ry * 0.56)
  const s = l.size
  const plate = `M${r1(x - 30 * s)} ${r1(y + 12 * s)} C${r1(x - 32 * s)} ${r1(y - 22 * s)} ${r1(x + 24 * s)} ${r1(y - 30 * s)} ${r1(x + 32 * s)} ${r1(y + 2 * s)} Q${r1(x + 4 * s)} ${r1(y + 26 * s)} ${r1(x - 30 * s)} ${r1(y + 12 * s)} Z`
  const ridge = `M${r1(x - 18 * s)} ${r1(y + 4 * s)} Q${r1(x)} ${r1(y - 12 * s)} ${r1(x + 20 * s)} ${r1(y - 4 * s)}`
  const t = l.snoutTop
  const horn = `M${r1(256 - 11 * s)} ${r1(t + 10 * s)} Q${r1(256 - 8 * s)} ${r1(t - 12 * s)} ${r1(256 + 3 * s)} ${r1(t - 22 * s)} Q${r1(256 + 6 * s)} ${r1(t - 4 * s)} ${r1(256 + 11 * s)} ${r1(t + 10 * s)} Z`
  return `<g class="look-part look-strength">
    ${pair('lk-plate', plate)}
    ${pair('lk-plate-ridge', ridge)}
    ${onHead(`<path class="lk-nosehorn" d="${horn}" />`)}
  </g>`
}

/** Steadfast: a neat sash with a star badge, and a star on the forehead. */
function discipline(a: Anchors, l: LookAnchors): string {
  const { cy, rx, ry } = a.body
  const at = (deg: number, k: number) => {
    const t = (deg * Math.PI) / 180
    return [r1(256 + rx * k * Math.cos(t)), r1(cy + ry * k * Math.sin(t))] as const
  }
  const [x0, y0] = at(218, 0.9)
  const [x1, y1] = at(38, 0.9)
  const [qx, qy] = [r1((x0 + x1) / 2 - 10), r1((y0 + y1) / 2 + 14)]
  const sash = `M${x0} ${y0} Q${qx} ${qy} ${x1} ${y1}`
  // The badge sits a third of the way along the sash.
  const t = 0.34
  const bx = r1((1 - t) ** 2 * x0 + 2 * (1 - t) * t * qx + t ** 2 * x1)
  const by = r1((1 - t) ** 2 * y0 + 2 * (1 - t) * t * qy + t ** 2 * y1)
  const s = l.size
  return `<g class="look-part look-discipline">
    <path class="lk-sash" d="${sash}" />
    <path class="lk-sash-stripe" d="${sash}" />
    <circle class="lk-badge" cx="${bx}" cy="${by}" r="${r1(19 * s)}" />
    <path class="lk-star" d="${starPath(bx, by, 12 * s)}" />
    ${onHead(`<path class="lk-star lk-forehead" d="${starPath(256, l.forehead, 15 * s)}" />`)}
  </g>`
}

/** Scholarly: round reading glasses (drawn over the mood lids) and little stars on the wings. */
function wisdomUnder(_a: Anchors, l: LookAnchors): string {
  const s = l.size
  const [[ax, ay], [bx, by]] = l.wingSpots
  return `<g class="look-part look-wisdom">
    ${onWings('lk-wingmark', starPath(ax, ay, 13 * s))}
    ${onWings('lk-wingmark', starPath(bx, by, 9 * s))}
  </g>`
}

function wisdomOver(a: Anchors, l: LookAnchors): string {
  const { y, dx, rx, ry } = a.eyes
  const r = Math.max(rx, ry) + 6
  const lx = 256 - dx
  const bridgeY = r1(y - r * 0.25)
  const arm = `M${r1(lx - r)} ${r1(y - 2)} L${r1(lx - r - 20 * l.size)} ${r1(y - 8)}`
  return onHead(`<g class="look-part look-wisdom look-glasses">
    <circle class="lk-lens" cx="${lx}" cy="${y}" r="${r}" />
    <circle class="lk-lens" cx="${256 + dx}" cy="${y}" r="${r}" />
    <path class="lk-frame" d="M${r1(lx + r * 0.96)} ${bridgeY} Q256 ${r1(bridgeY - 10)} ${r1(256 + dx - r * 0.96)} ${bridgeY}" />
    ${pair('lk-frame', arm)}
  </g>`)
}

/** Warm-hearted: a flower tucked by a horn and little hearts on the wings. */
function heart(_a: Anchors, l: LookAnchors): string {
  const s = l.size
  const [fx, fy] = l.flower
  const petals = [0, 72, 144, 216, 288]
    .map((deg) => {
      const t = ((deg - 90) * Math.PI) / 180
      return `<circle class="lk-petal" cx="${r1(fx + 10 * s * Math.cos(t))}" cy="${r1(fy + 10 * s * Math.sin(t))}" r="${r1(8 * s)}" />`
    })
    .join('')
  const [[ax, ay], [bx, by]] = l.wingSpots
  return `<g class="look-part look-heart">
    ${onWings('lk-wingmark', heartPath(ax, ay, 0.9 * s))}
    ${onWings('lk-wingmark', heartPath(bx, by, 0.65 * s))}
    ${onHead(`<g class="lk-flower">${petals}<circle class="lk-flower-centre" cx="${r1(fx)}" cy="${r1(fy)}" r="${r1(6 * s)}" /></g>`)}
  </g>`
}

/** The extra drawing for a look on one stage. Neutral (or unknown) adds nothing. */
export function lookFeatures(look: EvolutionLook, a: Anchors, l: LookAnchors): { under: string; over: string } {
  switch (look) {
    case 'strength':
      return { under: strength(a, l), over: '' }
    case 'discipline':
      return { under: discipline(a, l), over: '' }
    case 'wisdom':
      return { under: wisdomUnder(a, l), over: wisdomOver(a, l) }
    case 'heart':
      return { under: heart(a, l), over: '' }
    default:
      return { under: '', over: '' }
  }
}
