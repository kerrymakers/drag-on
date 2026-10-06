// Shared pieces for the dragon drawings. Every colour is a CSS custom property
// (see art.css), and each svg carries data-stage and data-evolution, so an evolution
// look can recolour a stage and add features (looks.ts) without redrawing it.

/**
 * Mirrors a path drawn on the left across the centre line (x = 256).
 * Only absolute M, L, C, Q and Z are allowed, where every coordinate is an x y pair,
 * so flipping every other number is exactly right. Anything else (relative commands,
 * H, V, A, S, T, or exponent notation) throws rather than drawing something wrong.
 */
export function mirror(d: string): string {
  if (/[eE]/.test(d)) throw new Error(`mirror: exponent notation isn't supported: ${d}`)
  const bad = d.match(/[A-Za-z]/g)?.find((c) => !'MLCQZ'.includes(c))
  if (bad) throw new Error(`mirror: only absolute M, L, C, Q and Z are supported, got "${bad}"`)
  let isX = true
  return d.replace(/-?\d+(\.\d+)?|[MLCQZ]/g, (token) => {
    if (/[MLCQZ]/.test(token)) {
      isX = true
      return token
    }
    const out = isX ? String(512 - Number(token)) : token
    isX = !isX
    return out
  })
}

/** Both sides of a symmetric part. */
export const pair = (cls: string, d: string) =>
  `<path class="${cls}" d="${d}" /><path class="${cls}" d="${mirror(d)}" />`

export interface Eyes {
  y: number
  dx: number // distance of each eye from the centre line
  rx: number
  ry: number
}

/** Eyes with highlights, grouped so they blink together. */
export function eyes({ y, dx, rx, ry }: Eyes): string {
  const l = 256 - dx
  const r = 256 + dx
  const hr = Math.max(4, Math.round(rx * 0.36))
  return `<g class="dragon-eyes">
    <ellipse class="hd-eye" cx="${l}" cy="${y}" rx="${rx}" ry="${ry}" />
    <ellipse class="hd-eye" cx="${r}" cy="${y}" rx="${rx}" ry="${ry}" />
    <circle cx="${l + rx * 0.35}" cy="${y - ry * 0.4}" r="${hr}" fill="#fff" />
    <circle cx="${r + rx * 0.35}" cy="${y - ry * 0.4}" r="${hr}" fill="#fff" />
  </g>`
}

/** Where a stage's features are, so the shared mood parts can be placed on any stage. */
export interface Anchors {
  eyes: Eyes
  /** y of the top of the head. */
  headTop: number
  /** The main body ellipse (centred on x = 256). */
  body: { cy: number; rx: number; ry: number }
  /**
   * [x0, y0, x1, y1] around the head and everything on it (horns, frills, face
   * features), before the stage scale. The UI keeps speech bubbles clear of it.
   */
  headBox: readonly [number, number, number, number]
}

/**
 * An invisible rectangle marking the area a speech bubble must not cover. With
 * `followsPose`, CSS moves it with the mood posture (curled up sits lower).
 */
export function headBoxRect([x0, y0, x1, y1]: readonly [number, number, number, number], followsPose = false): string {
  return `<rect class="dragon-head-box${followsPose ? ' follows-pose' : ''}" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="none" stroke="none" pointer-events="none" />`
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** A lid over one eye, from `edge` (y) up over the top of the eye. */
function lid(cx: number, cy: number, rx: number, ry: number, edge: number, cls: string): string {
  // Where the lid's lower edge meets the eye outline, on each side.
  const t = Math.max(-1, Math.min(1, (edge - cy) / (ry + 3)))
  const half = (rx + 3) * Math.sqrt(1 - t * t)
  const large = edge > cy ? 1 : 0
  return `<path class="mood-part ${cls} mood-lid" d="M${r1(cx - half)} ${r1(edge)} A${rx + 3} ${ry + 3} 0 ${large} 1 ${r1(cx + half)} ${r1(edge)} Z" />`
}

/** A smiling lower lid: the eye squints happily, like a contented peek over a blanket. */
function smileLid(cx: number, cy: number, rx: number, ry: number): string {
  const x0 = cx - rx - 3
  const x1 = cx + rx + 3
  const edge = r1(cy + ry * 0.2)
  const peak = r1(cy - ry * 0.35)
  const bottom = r1(cy + ry + 3)
  return `<path class="mood-lid-fill" d="M${x0} ${bottom} L${x0} ${edge} Q${cx} ${peak} ${x1} ${edge} L${x1} ${bottom} Z" />
    <path class="mood-lid-line" d="M${x0} ${edge} Q${cx} ${peak} ${x1} ${edge}" />`
}

/** A small heart centred on (x, y). */
export function heart(x: number, y: number, s = 1): string {
  const p = (dx: number, dy: number) => `${r1(x + dx * s)} ${r1(y + dy * s)}`
  return `<path class="mood-heart" d="M${p(0, 10)} C${p(-18, -2)} ${p(-12, -20)} ${p(0, -10)} C${p(12, -20)} ${p(18, -2)} ${p(0, 10)} Z" />`
}

/** A gentle "z z z", rising from (x, y). */
export function zzz(x: number, y: number): string {
  return `<g class="mood-part mood-sleepy mood-zzz" aria-hidden="true">
    <text x="${x}" y="${y}" font-size="34">z</text>
    <text x="${x + 26}" y="${y - 30}" font-size="42">z</text>
    <text x="${x + 58}" y="${y - 66}" font-size="52">z</text>
  </g>`
}

/**
 * The mood overlays for a dragon stage. All are drawn; CSS shows the ones that match
 * the svg's data-mood, so a mood change fades smoothly rather than redrawing.
 * - happy: twinkles by the eyes (and a livelier idle with the odd hop, in CSS)
 * - sleepy: droopy half-lids and a floating zzz
 * - grumpy ("curled up"): snuggled under a blanket, eyes smiling over the top,
 *   a little heart and a slow tail wag. Cosy and fond, never cross.
 */
export function moodParts({ eyes: e, headTop, body }: Anchors): string {
  const l = 256 - e.dx
  const r = 256 + e.dx
  const twinkle = (x: number, y: number, s: number) =>
    `<path class="mood-twinkle" d="M${x} ${y - s} L${r1(x + s * 0.3)} ${r1(y - s * 0.3)} L${x + s} ${y} L${r1(x + s * 0.3)} ${r1(y + s * 0.3)} L${x} ${y + s} L${r1(x - s * 0.3)} ${r1(y + s * 0.3)} L${x - s} ${y} L${r1(x - s * 0.3)} ${r1(y - s * 0.3)} Z" />`
  const sleepyEdge = e.y - e.ry * 0.05
  const top = Math.round(body.cy - body.ry * 0.4)
  const x0 = Math.round(256 - body.rx - 24)
  const x1 = Math.round(256 + body.rx + 24)
  const bottom = 496
  return `
    <g class="mood-part mood-happy" aria-hidden="true">
      ${twinkle(l - e.rx - 16, e.y - e.ry - 6, 12)}
      ${twinkle(r + e.rx + 18, e.y - e.ry - 2, 9)}
    </g>
    ${lid(l, e.y, e.rx, e.ry, sleepyEdge, 'mood-sleepy')}
    ${lid(r, e.y, e.rx, e.ry, sleepyEdge, 'mood-sleepy')}
    ${zzz(r + e.rx + 26, headTop + 40)}
    <g class="mood-part mood-grumpy">
      ${smileLid(l, e.y, e.rx, e.ry)}
      ${smileLid(r, e.y, e.rx, e.ry)}
      ${heart(l - e.rx - 36, headTop + 30, 1.8)}
      <path class="mood-tail" d="M${x1 - 18} ${top + 34} C${x1 + 10} ${top + 10} ${x1 + 14} ${top - 18} ${x1 + 2} ${top - 34} C${x1 + 26} ${top - 26} ${x1 + 34} ${top + 4} ${x1 - 6} ${top + 44} Z" />
      <path class="mood-blanket" d="M${x0} ${top + 10} Q${x0 + 40} ${top - 22} 256 ${top - 6} Q${x1 - 40} ${top - 22} ${x1} ${top + 10} L${x1 + 8} ${bottom - 14} Q${x1 + 8} ${bottom} ${x1 - 8} ${bottom} L${x0 + 8} ${bottom} Q${x0 - 8} ${bottom} ${x0 - 8} ${bottom - 14} Z" />
      <path class="mood-blanket-stripe" d="M${x0 + 2} ${top + 46} Q256 ${top + 30} ${x1 - 2} ${top + 46}" />
      <path class="mood-blanket-stripe" d="M${x0 + 4} ${top + 86} Q256 ${top + 70} ${x1 - 4} ${top + 86}" />
    </g>`
}

export interface StageSvgOptions {
  stage: string
  label: string
  /** Size relative to the frame; later stages are bigger. */
  scale: number
  anchors: Anchors
  /** Extra classes on the breathing group (e.g. hatchling-body). */
  bodyClass?: string
  /** The evolution look, for data-evolution (default 'neutral'). */
  evolution?: string
  /** Look features: `under` sits below the mood overlays, `over` on top of them (e.g. glasses). */
  features?: { under: string; over: string }
}

/**
 * Wraps a drawing so it sits on the ground line and grows by `scale` from there.
 * Structure: scale (attribute) > .dragon-pose (mood posture, hop) > .dragon-body
 * (breathing) > drawing + mood parts.
 */
export function dragonSvg(
  { stage, label, scale, anchors, bodyClass, evolution = 'neutral', features }: StageSvgOptions,
  body: string,
): string {
  return `
<svg class="dragon-svg dragon-${stage}" data-stage="${stage}" data-evolution="${evolution}" data-mood="content" viewBox="0 0 512 512" role="img" aria-label="${label}">
  <g transform="translate(256 492) scale(${scale}) translate(-256 -492)">
    ${headBoxRect(anchors.headBox, true)}
    <g class="dragon-pose">
      <g class="${bodyClass ? `${bodyClass} ` : ''}dragon-body">${body}${features?.under ?? ''}${moodParts(anchors)}${features?.over ?? ''}</g>
    </g>
  </g>
</svg>`
}
