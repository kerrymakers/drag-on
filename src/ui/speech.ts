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
  /**
   * For an up or down tail, how far along the bubble (px from its left edge) the tail
   * sits, so a bubble moved to one side still points at the head. Unset: the middle.
   */
  tailAt?: number
  /** The smaller text size, used only when the normal size doesn't fit anywhere. */
  compact: boolean
}

/**
 * The lower part of a drawing with no room for a bubble below its "head" (the egg:
 * its keep-clear box is most of it). A bubble may sit in this part, its bottom on the
 * part's bottom, rather than over the middle of the drawing.
 */
export interface LowerPart {
  top: number
  bottom: number
}

/** The bubble's size at a given max width, in the normal or compact text size. */
export type Measure = (maxWidth: number, compact: boolean) => { width: number; height: number }

const GAP = 10
const MIN_WIDTH = 120
/**
 * The narrowest bubble beside the head or moved to one side below it: narrower than
 * this and the words wrap to a column of one or two words a line.
 */
const NARROW_MIN_WIDTH = 110
const MAX_WIDTH = 240
/** Steps when looking for a clear spot below the head. */
const WIDTH_STEP = 20
const DROP_STEP = 6
/** The tail is 14px across, with rounded corners: keep it this far in from each end. */
const TAIL_INSET = 18

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * The part of `area` above a toast whose top is at `toastTop` (null: no toast showing),
 * leaving a gap, so a bubble placed in it never sits under the toast. Every placement
 * stays inside its area, so this is all it takes. Never shorter than nothing.
 */
export function clearAbove(area: Box, toastTop: number | null): Box {
  if (toastTop === null || toastTop >= area.bottom) return { left: area.left, top: area.top, right: area.right, bottom: area.bottom }
  return { left: area.left, top: area.top, right: area.right, bottom: Math.max(area.top, toastTop - GAP) }
}

/**
 * Tries, in order: above the head, to its left or right (roomier side first), below
 * it (or, given a `lowerPart`, in that part instead), below it but moved to one side
 * or a little lower (clear of anything worn), then beside it in a narrower bubble.
 * Each must fit inside `area` without touching `avoid` (the head and everything on
 * it, plus the zzz) or any of `keepClear` (what the dragon wears at its neck and in
 * its paws). If none fits, it tries them all again in the compact size.
 * Only if that fails too: below the head over whatever is worn (never the face), and
 * failing that the roomier side, accepting a small overlap with the head. With a lower
 * part (the egg), it falls back to compact text at the very bottom of the area.
 */
export function placeSpeech(area: Box, avoid: Box, measure: Measure, keepClear: readonly Box[] = [], lowerPart?: LowerPart): Placement {
  for (const compact of [false, true]) {
    const p = cleanFit(area, avoid, (w) => measure(w, compact), compact, keepClear, lowerPart)
    if (p) return p
  }
  const areaW = area.right - area.left
  const areaH = area.bottom - area.top
  if (lowerPart) {
    // As low as the area allows, so it covers as little of the drawing as it can.
    const maxWidth = Math.min(MAX_WIDTH, areaW)
    const { width, height } = measure(maxWidth, true)
    const centreX = (avoid.left + avoid.right) / 2 - area.left
    return { left: clamp(centreX - width / 2, 0, Math.max(0, areaW - width)), top: Math.max(0, areaH - height), maxWidth, tail: 'up', compact: true }
  }
  // Over something worn rather than the face.
  const below = belowShifted(area, avoid, (w) => measure(w, true), true, [])
  if (below) return below
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

/** True if a bubble (relative to the area) stays off everything in keepClear. */
function clearOf(area: Box, keepClear: readonly Box[], left: number, top: number, size: { width: number; height: number }): boolean {
  const b = { left: area.left + left, top: area.top + top, right: area.left + left + size.width, bottom: area.top + top + size.height }
  return keepClear.every((k) => b.right <= k.left || b.left >= k.right || b.bottom <= k.top || b.top >= k.bottom)
}

/**
 * Below the head, as close under it as possible, but free to move to either side and
 * a little further down, and to narrow down to NARROW_MIN_WIDTH, to keep clear of
 * anything worn. The tail still points up at the head.
 */
function belowShifted(
  area: Box,
  avoid: Box,
  measure: (maxWidth: number) => { width: number; height: number },
  compact: boolean,
  keepClear: readonly Box[],
): Placement | null {
  const areaW = area.right - area.left
  const centreX = (avoid.left + avoid.right) / 2 - area.left
  const start = avoid.bottom - area.top + GAP
  for (let maxWidth = Math.floor(Math.min(MAX_WIDTH, areaW)); maxWidth >= NARROW_MIN_WIDTH; maxWidth -= WIDTH_STEP) {
    const size = measure(maxWidth)
    const lastTop = area.bottom - area.top - size.height
    for (let top = start; top <= lastTop; top += DROP_STEP) {
      const centred = clamp(centreX - size.width / 2, 0, areaW - size.width)
      // Nearest the head's middle first, then hard against either side.
      for (const left of [centred, 0, areaW - size.width]) {
        if (left < 0) continue
        if (!clearOf(area, keepClear, left, top, size)) continue
        const tailAt = clamp(centreX - left, TAIL_INSET, size.width - TAIL_INSET)
        return { left, top, maxWidth, tail: 'up', compact, ...(Math.abs(tailAt - size.width / 2) > 1 ? { tailAt } : {}) }
      }
    }
  }
  return null
}

/** The first placement that fits cleanly at one text size, or null. */
function cleanFit(
  area: Box,
  avoid: Box,
  measure: (maxWidth: number) => { width: number; height: number },
  compact: boolean,
  keepClear: readonly Box[],
  lowerPart?: LowerPart,
): Placement | null {
  const areaW = area.right - area.left
  const areaH = area.bottom - area.top
  const centreX = (avoid.left + avoid.right) / 2 - area.left
  const clear = (p: Placement, size: { width: number; height: number }) => clearOf(area, keepClear, p.left, p.top, size)

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
    // Whole pixels: the bubble's measured width is, so a fractional space never rejects a fit.
    const maxWidth = Math.floor(Math.min(MAX_WIDTH, space))
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

  if (lowerPart) {
    // In the lower part (the egg's base, above the nest), its bottom on the part's bottom,
    // or higher up the part if the area ends first; never above the part's top.
    const maxWidth = Math.min(MAX_WIDTH, areaW)
    const { width, height } = measure(maxWidth)
    const top = Math.min(lowerPart.bottom - height, area.bottom - height)
    if (top >= Math.max(lowerPart.top, area.top)) {
      const p: Placement = { left: clamp(centreX - width / 2, 0, areaW - width), top: top - area.top, maxWidth, tail: 'up', compact }
      if (clear(p, { width, height })) return p
    }
    return null
  }

  // Below the head (over the body, not the face), moved aside of anything worn if need be.
  const below = belowShifted(area, avoid, measure, compact, keepClear)
  if (below) return below

  // Beside the head again, narrower and taller, rather than over something worn.
  for (const side of sides) {
    const p = beside(side === 'left' ? leftSpace : rightSpace, side, NARROW_MIN_WIDTH)
    if (p) return p
  }
  return null
}
