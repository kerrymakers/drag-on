// How far the dragon's idle motions (art.css) can carry its head, so the speech
// bubble's keep-clear box covers every pose the head can reach, in every mood.
//
// The numbers below mirror art.css. art.test.ts reads art.css and checks they match,
// so retuning a motion there without updating this file fails the tests rather than
// silently letting a bubble overlap the head.

export type MotionMood = 'happy' | 'content' | 'sleepy' | 'grumpy'
export const MOTION_MOODS: readonly MotionMood[] = ['happy', 'content', 'sleepy', 'grumpy']

/** How much each idle motion moves in a mood: the custom properties set per mood on .dragon-svg. */
export interface MoodMotion {
  /** --idle-sway, degrees. */
  sway: number
  /** --idle-rock, degrees. */
  rock: number
  /** --idle-bob, svg units. */
  bob: number
  /** --idle-huff */
  huff: number
  /** --hop and --hop-extra */
  hop: number
  hopExtra: number
  /** --ear-flick and --ear-droop */
  earFlick: number
  earDroop: number
  /** --look, --nod and --snuggle */
  look: number
  nod: number
  snuggle: number
}

const CONTENT: MoodMotion = {
  sway: 0.9,
  rock: 0,
  bob: 0,
  huff: 0,
  hop: 0.4,
  hopExtra: 0,
  earFlick: 1,
  earDroop: 0,
  look: 1,
  nod: 0,
  snuggle: 0,
}

/** art.css: `.dragon-svg` (content) and `.dragon-svg[data-mood=…]`. */
export const MOOD_MOTION: Record<MotionMood, MoodMotion> = {
  content: CONTENT,
  happy: { ...CONTENT, sway: 0.4, rock: 1.4, bob: 3, hop: 1, hopExtra: 1, earFlick: 1.3 },
  sleepy: { ...CONTENT, sway: 0.7, hop: 0, earFlick: 0, earDroop: 1, look: 0, nod: 1 },
  grumpy: { ...CONTENT, sway: 0.3, huff: 1, hop: 0, earFlick: 0.7, look: 0, snuggle: 1 },
}

/**
 * The largest amount in each keyframe rule, per unit of its mood amount (art.css
 * @keyframes of the same name). Angles in degrees, lengths in svg units. For the
 * left ear a negative angle swings its tip outwards (the right ear is mirrored).
 */
export const KEYFRAMES = {
  /** ear-flick: out to -14deg, back to +4deg. */
  earFlick: { out: 14, back: 4 },
  /** ear-droop: rests at -12deg, sags to -16deg. */
  earDroop: { rest: 12, sag: 16 },
  /** head-look: -2.5deg one way, +2deg the other. */
  headLook: { left: 2.5, right: 2 },
  /** head-nod: dips 8 and turns 1.5deg, then starts back up 2. */
  headNod: { down: 8, turn: 1.5, up: 2 },
  /** head-snuggle: 3deg, then -1deg. */
  headSnuggle: { turn: 3, back: 1 },
  /** idle-hop: up 16; stretch 3% tall and squash 4% short, 3% wide. */
  idleHop: { lift: 16, tall: 0.03, short: 0.04, wide: 0.03 },
  /** idle-huff: 3.5% wide and short, then 2% tall. */
  idleHuff: { wide: 0.035, short: 0.035, tall: 0.02 },
  /** hatchling-breathe (on .dragon-body): up 5, 1% wide, 1% short. */
  breathe: { lift: 5, wide: 0.01, short: 0.01 },
  /**
   * react-perk, on the drawing's wrapper (the welcome perk-up, which plays while the
   * bubble shows): up 1% of the wrapper's height, 4% taller, 2% wider and shorter.
   */
  reactPerk: { liftPercent: 1, tall: 0.04, wide: 0.02, short: 0.02, narrow: 0.02 },
} as const

/**
 * The perk-up turns about the wrapper's 50% 90% (art.css .dragon-react), which in the
 * drawing's units depends on how the square drawing sits in its box: y 461 when the
 * box is square, further down when it's taller than wide. Home's box is at most about
 * 1.4 times taller than wide (340px tall, 82% of a 300px-wide area), so the origin is
 * between these, and 1% of its height is at most PERK_LIFT units.
 */
export const PERK_ORIGINS_Y: readonly number[] = [461, 545]
export const PERK_LIFT = 8

/** Where the body moves about: the ground line (art.css transform-origin 256px 492px). */
export const GROUND: readonly [number, number] = [256, 492]

/** A little extra all round, for the small cross-terms of stacking the motions. */
export const MOTION_PAD = 1

export type Box = readonly [number, number, number, number]
type Pt = readonly [number, number]

const rad = (deg: number) => (deg * Math.PI) / 180

function rotate([x, y]: Pt, [cx, cy]: Pt, deg: number): Pt {
  const a = rad(deg)
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]
}

const corners = ([x0, y0, x1, y1]: Box): Pt[] => [
  [x0, y0],
  [x1, y0],
  [x0, y1],
  [x1, y1],
]

/** Angles from lo to hi in steps of at most 1 degree (rotated corners can peak in between). */
function sweep(lo: number, hi: number): number[] {
  const n = Math.max(1, Math.ceil(hi - lo))
  return Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n)
}

/**
 * The box (svg units) around a path's points. With only M, L, C, Q and Z every curve
 * stays inside its control points, so this covers the curve (a little generously).
 */
export function pathBox(d: string): Box {
  const n = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
  const xs = n.filter((_, i) => i % 2 === 0)
  const ys = n.filter((_, i) => i % 2 === 1)
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/**
 * The box of each shape in some markup (ellipses, circles and paths), as the browser
 * measures them: its own box before any motion. Shapes with their own transform (the
 * shines, which sit inside the skin) and `skip`ped classes are left out.
 */
export function shapeBoxes(markup: string, skip: readonly string[] = []): Box[] {
  const out: Box[] = []
  for (const m of markup.matchAll(/<(ellipse|circle|path)\b([^>]*)>/g)) {
    const attrs = m[2]!
    if (/\btransform=/.test(attrs)) continue
    const cls = /class="([^"]*)"/.exec(attrs)?.[1]?.split(' ') ?? []
    if (skip.some((c) => cls.includes(c))) continue
    const num = (a: string) => Number(new RegExp(`\\b${a}="(-?[\\d.]+)"`).exec(attrs)?.[1])
    if (m[1] === 'path') {
      const d = /\bd="([^"]*)"/.exec(attrs)?.[1]
      if (d) out.push(pathBox(d))
    } else {
      const rx = m[1] === 'circle' ? num('r') : num('rx')
      const ry = m[1] === 'circle' ? num('r') : num('ry')
      const cx = num('cx')
      const cy = num('cy')
      if ([rx, ry, cx, cy].every(Number.isFinite)) out.push([cx - rx, cy - ry, cx + rx, cy + ry])
    }
  }
  return out
}

export interface HeadMotionInput {
  /** The keep-clear box at rest: the head and everything on it (a worn hat included). */
  rest: Box
  /** The box of each shape that moves with the head (the hat's too), ears aside. */
  parts: readonly Box[]
  /** The left ear frill's path, if the stage has ears (the right is its mirror). */
  ear?: string | undefined
  /** y of the point the head tilts about (x = 256). */
  neckY: number
}

/**
 * The rest box, grown to everywhere the head's shapes can reach in one mood: each ear
 * swept through its flick and droop about its root, then everything on the head
 * through its tilt, nod and snuggle about the neck, then the whole dragon's sway,
 * rock, bob, hop, huff and breathing about the ground, then the welcome perk-up. Each shape's own box is moved
 * corner by corner, which is how the browser measures a turned shape's box too.
 */
export function headReach({ rest, parts, ear, neckY }: HeadMotionInput, m: MoodMotion): Box {
  const K = KEYFRAMES
  let pts: Pt[] = parts.flatMap(corners)
  if (ear) {
    const e = pathBox(ear)
    // Ears turn about their root: the bottom-right of the left ear's box (art.css .dg-ear.dg-l).
    const lo = -(K.earFlick.out * m.earFlick + K.earDroop.sag * m.earDroop)
    const hi = K.earFlick.back * m.earFlick - K.earDroop.rest * m.earDroop
    for (const a of sweep(lo, hi))
      for (const p of corners(e)) {
        const [x, y] = rotate(p, [e[2], e[3]], a)
        pts.push([x, y], [512 - x, y])
      }
  }
  // The head, about the neck.
  const pivot: Pt = [256, neckY]
  const headLo = -K.headLook.left * m.look - K.headSnuggle.back * m.snuggle
  const headHi = K.headLook.right * m.look + K.headNod.turn * m.nod + K.headSnuggle.turn * m.snuggle
  const dips = [-K.headNod.up * m.nod, K.headNod.down * m.nod]
  pts = pts.flatMap((p) => sweep(headLo, headHi).flatMap((a) => dips.map((dy): Pt => {
    const [x, y] = rotate(p, pivot, a)
    return [x, y + dy]
  })))
  // The whole dragon, about the ground.
  const turn = m.sway + m.rock
  const hop = Math.max(m.hop, m.hopExtra)
  const lift = m.bob + K.idleHop.lift * hop + K.breathe.lift
  const wide = (1 + K.idleHuff.wide * m.huff) * (1 + K.idleHop.wide * hop) * (1 + K.breathe.wide)
  const tall = (1 + K.idleHuff.tall * m.huff) * (1 + K.idleHop.tall * hop)
  const short = (1 - K.idleHuff.short * m.huff) * (1 - K.idleHop.short * hop) * (1 - K.breathe.short)
  if (pts.length === 0) return rest
  // The whole dragon's box (scaling and moving straight up keep a box a box, so the
  // perk-up below only needs its corners).
  let bx0 = Infinity
  let by0 = Infinity
  let bx1 = -Infinity
  let by1 = -Infinity
  for (const p of pts)
    for (const a of sweep(-turn, turn)) {
      const [rx, ry] = rotate(p, GROUND, a)
      for (const sx of [1 / wide, wide])
        for (const sy of [short, tall])
          for (const dy of [-lift, 0]) {
            const x = GROUND[0] + (rx - GROUND[0]) * sx
            const y = GROUND[1] + (ry - GROUND[1]) * sy + dy
            bx0 = Math.min(bx0, x)
            bx1 = Math.max(bx1, x)
            by0 = Math.min(by0, y)
            by1 = Math.max(by1, y)
          }
    }
  // The perk-up, on top of everything (any mood: a freeze line perks up too).
  const P = K.reactPerk
  let [x0, y0, x1, y1] = rest
  for (const [bx, by] of corners([bx0, by0, bx1, by1]))
    for (const oy of PERK_ORIGINS_Y)
      for (const sx of [1 - P.narrow, 1 + P.wide])
        for (const sy of [1 - P.short, 1 + P.tall])
          for (const dy of [-PERK_LIFT, 0]) {
            const x = 256 + (bx - 256) * sx
            const y = oy + (by - oy) * sy + dy
            x0 = Math.min(x0, x - MOTION_PAD)
            x1 = Math.max(x1, x + MOTION_PAD)
            y0 = Math.min(y0, y - MOTION_PAD)
            y1 = Math.max(y1, y + MOTION_PAD)
          }
  const r1 = (n: number) => Math.round(n * 10) / 10
  return [r1(x0), r1(y0), r1(x1), r1(y1)]
}
