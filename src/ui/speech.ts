// Where to put the welcome-back bubble: beside the dragon's head, never over it.
// Pure, so it can be tested with made-up rectangles.

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export type Tail = 'down' | 'up' | 'left' | 'right'

export interface Placement {
  /** Relative to the area's top-left. */
  left: number
  top: number
  maxWidth: number
  /** Which side of the bubble points at the dragon. */
  tail: Tail
  /** The smaller text size, used only when the normal size doesn't fit anywhere. */
  compact: boolean
}

/** The bubble's size at a given max width, in the normal or compact text size. */
export type Measure = (maxWidth: number, compact: boolean) => { width: number; height: number }

const GAP = 10
const MIN_WIDTH = 120
/** Beside the head in a narrower, taller bubble: only when the roomier spots would cover something worn. */
const NARROW_MIN_WIDTH = 90
const MAX_WIDTH = 240

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Tries, in order: above the head, to its left or right (roomier side first), below
 * it, then beside it in a narrower bubble. Each must fit inside `area` without
 * touching `avoid` (the head and everything on it, plus the zzz) or any of `keepClear`
 * (what the dragon wears at its neck and in its paws). If none fits, it tries them
 * all again in the compact size.
 * Only if that fails too does it fall back to the roomier side, still inside the area
 * (left to right and top to bottom wherever the area is big enough), accepting a
 * small overlap with the head rather than covering what's below the dragon.
 */
export function placeSpeech(area: Box, avoid: Box, measure: Measure, keepClear: readonly Box[] = []): Placement {
  for (const compact of [false, true]) {
    const p = cleanFit(area, avoid, (w) => measure(w, compact), compact, keepClear)
    if (p) return p
  }
  const areaW = area.right - area.left
  const areaH = area.bottom - area.top
  const leftSpace = avoid.left - area.left - GAP
  const rightSpace = area.right - avoid.right - GAP
  const side = leftSpace >= rightSpace ? 'left' : 'right'
  const maxWidth = Math.min(areaW, clamp(Math.max(leftSpace, rightSpace), MIN_WIDTH, MAX_WIDTH))
  const { width, height } = measure(maxWidth, true)
  const left = side === 'left' ? avoid.left - area.left - GAP - width : avoid.right - area.left + GAP
  return {
    left: clamp(left, 0, Math.max(0, areaW - width)),
    top: clamp(avoid.top - area.top, 0, Math.max(0, areaH - height)),
    maxWidth,
    tail: side === 'left' ? 'right' : 'left',
    compact: true,
  }
}

/** The first placement that fits cleanly at one text size, or null. */
function cleanFit(
  area: Box,
  avoid: Box,
  measure: (maxWidth: number) => { width: number; height: number },
  compact: boolean,
  keepClear: readonly Box[],
): Placement | null {
  const areaW = area.right - area.left
  const areaH = area.bottom - area.top
  const centreX = (avoid.left + avoid.right) / 2 - area.left
  /** True if a placement (relative to the area) stays off everything in keepClear. */
  const clear = (p: Placement, size: { width: number; height: number }) => {
    const b = { left: area.left + p.left, top: area.top + p.top, right: area.left + p.left + size.width, bottom: area.top + p.top + size.height }
    return keepClear.every((k) => b.right <= k.left || b.left >= k.right || b.bottom <= k.top || b.top >= k.bottom)
  }

  // Above the head
  {
    const maxWidth = Math.min(MAX_WIDTH, areaW)
    const { width, height } = measure(maxWidth)
    if (avoid.top - area.top >= height + GAP) {
      const p: Placement = {
        left: clamp(centreX - width / 2, 0, areaW - width),
        top: avoid.top - area.top - height - GAP,
        maxWidth,
        tail: 'down',
        compact,
      }
      if (clear(p, { width, height })) return p
    }
  }

  const leftSpace = avoid.left - area.left - GAP
  const rightSpace = area.right - avoid.right - GAP
  const beside = (space: number, side: 'left' | 'right', minWidth: number): Placement | null => {
    if (space < minWidth) return null
    const maxWidth = Math.min(MAX_WIDTH, space)
    const { width, height } = measure(maxWidth)
    if (height > areaH || width > space) return null
    const p: Placement = {
      left: side === 'left' ? avoid.left - area.left - GAP - width : avoid.right - area.left + GAP,
      top: clamp(avoid.top - area.top, 0, areaH - height),
      maxWidth,
      tail: side === 'left' ? 'right' : 'left',
      compact,
    }
    return clear(p, { width, height }) ? p : null
  }
  const sides = leftSpace >= rightSpace ? (['left', 'right'] as const) : (['right', 'left'] as const)
  for (const side of sides) {
    const p = beside(side === 'left' ? leftSpace : rightSpace, side, MIN_WIDTH)
    if (p) return p
  }

  // Below the head (over the body, not the face)
  {
    const maxWidth = Math.min(MAX_WIDTH, areaW)
    const { width, height } = measure(maxWidth)
    if (area.bottom - avoid.bottom >= height + GAP) {
      const p: Placement = {
        left: clamp(centreX - width / 2, 0, areaW - width),
        top: avoid.bottom - area.top + GAP,
        maxWidth,
        tail: 'up',
        compact,
      }
      if (clear(p, { width, height })) return p
    }
  }

  // Beside the head again, narrower and taller, rather than over something worn.
  // Only when something is worn, so a bare dragon places its bubble as before.
  if (keepClear.length > 0) for (const side of sides) {
    const p = beside(side === 'left' ? leftSpace : rightSpace, side, NARROW_MIN_WIDTH)
    if (p) return p
  }
  return null
}
