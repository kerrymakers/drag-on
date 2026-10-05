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
}

const GAP = 10
const MIN_WIDTH = 120
const MAX_WIDTH = 240

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/**
 * Tries, in order: above the head, to its left, to its right, below it. Each must fit
 * inside `area` without touching `avoid` (the head, headgear and zzz). If nothing fits,
 * it uses the roomier side and accepts a small overlap. `measure` returns the bubble's
 * size at a given max width.
 */
export function placeSpeech(
  area: Box,
  avoid: Box,
  measure: (maxWidth: number) => { width: number; height: number },
): Placement {
  const areaW = area.right - area.left
  const areaH = area.bottom - area.top
  const centreX = (avoid.left + avoid.right) / 2 - area.left

  // Above the head
  {
    const maxWidth = Math.min(MAX_WIDTH, areaW)
    const { width, height } = measure(maxWidth)
    if (avoid.top - area.top >= height + GAP) {
      return {
        left: clamp(centreX - width / 2, 0, areaW - width),
        top: avoid.top - area.top - height - GAP,
        maxWidth,
        tail: 'down',
      }
    }
  }

  const leftSpace = avoid.left - area.left - GAP
  const rightSpace = area.right - avoid.right - GAP
  const beside = (space: number, side: 'left' | 'right'): Placement | null => {
    if (space < MIN_WIDTH) return null
    const maxWidth = Math.min(MAX_WIDTH, space)
    const { width, height } = measure(maxWidth)
    if (height > areaH) return null
    return {
      left: side === 'left' ? avoid.left - area.left - GAP - width : avoid.right - area.left + GAP,
      top: clamp(avoid.top - area.top, 0, areaH - height),
      maxWidth,
      tail: side === 'left' ? 'right' : 'left',
    }
  }
  const sides = leftSpace >= rightSpace ? (['left', 'right'] as const) : (['right', 'left'] as const)
  for (const side of sides) {
    const p = beside(side === 'left' ? leftSpace : rightSpace, side)
    if (p) return p
  }

  // Below the head (over the body, not the face)
  {
    const maxWidth = Math.min(MAX_WIDTH, areaW)
    const { width, height } = measure(maxWidth)
    if (area.bottom - avoid.bottom >= height + GAP) {
      return {
        left: clamp(centreX - width / 2, 0, areaW - width),
        top: avoid.bottom - area.top + GAP,
        maxWidth,
        tail: 'up',
      }
    }
  }

  // Nothing fits cleanly: the roomier side, at the top.
  const side = leftSpace >= rightSpace ? 'left' : 'right'
  const maxWidth = clamp(Math.max(leftSpace, rightSpace), MIN_WIDTH, MAX_WIDTH)
  const { width, height } = measure(maxWidth)
  return {
    left: side === 'left' ? Math.max(0, avoid.left - area.left - GAP - width) : Math.min(areaW - width, avoid.right - area.left + GAP),
    top: clamp(avoid.top - area.top, 0, Math.max(0, areaH - height)),
    maxWidth,
    tail: side === 'left' ? 'right' : 'left',
  }
}
