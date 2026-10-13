import { describe, expect, it } from 'vitest'
import { clearAbove, placeSpeech, type Box } from './speech'

/** A bubble whose text wraps: narrower max widths make it taller. */
const measure = (maxWidth: number) => {
  const width = Math.min(maxWidth, 220)
  const lines = Math.ceil(220 / width)
  return { width, height: 18 + lines * 22 }
}
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
const toPage = (area: Box, p: ReturnType<typeof placeSpeech>): Box => {
  const { width, height } = measure(p.maxWidth)
  return { left: area.left + p.left, top: area.top + p.top, right: area.left + p.left + width, bottom: area.top + p.top + height }
}
const inside = (inner: Box, outer: Box) =>
  inner.left >= outer.left && inner.top >= outer.top && inner.right <= outer.right && inner.bottom <= outer.bottom

describe('clearAbove (a showing toast)', () => {
  it('keeps every placement above the toast, the egg and the short-screen fallbacks included', () => {
    const area = { left: 16, top: 100, right: 394, bottom: 420 }
    expect(clearAbove(area, null)).toEqual(area)
    expect(clearAbove(area, 500)).toEqual(area)
    expect(clearAbove(area, 50)).toEqual({ ...area, bottom: 100 })
    const toastTop = 330
    const room = clearAbove(area, toastTop)
    const heads: Box[] = [
      { left: 120, top: 260, right: 290, bottom: 380 }, // low: above it is the only room
      { left: 60, top: 102, right: 350, bottom: 250 }, // wide and high: below it, now short
      { left: 150, top: 102, right: 260, bottom: 200 },
    ]
    for (const head of heads) {
      for (const lower of [undefined, { top: 300, bottom: 400 }]) {
        const bubble = toPage(room, placeSpeech(room, head, measure, [], lower))
        expect(bubble.bottom, JSON.stringify({ head, lower })).toBeLessThanOrEqual(toastTop - 10)
      }
    }
  })
})

describe('placeSpeech', () => {
  it('sits just above the head when there is room, pointing down at it', () => {
    const area = { left: 16, top: 100, right: 394, bottom: 500 }
    const head = { left: 120, top: 260, right: 290, bottom: 380 }
    const p = placeSpeech(area, head, measure)
    expect(p.tail).toBe('down')
    const bubble = toPage(area, p)
    expect(overlaps(bubble, head)).toBe(false)
    expect(inside(bubble, area)).toBe(true)
    expect(head.top - bubble.bottom).toBe(10)
  })

  it('goes beside the head on a short screen, on the roomier side', () => {
    const area = { left: 16, top: 80, right: 344, bottom: 240 }
    const head = { left: 150, top: 82, right: 250, bottom: 170 }
    const p = placeSpeech(area, head, measure)
    expect(p.tail).toBe('right') // bubble on the left, pointing right at the head
    const bubble = toPage(area, p)
    expect(overlaps(bubble, head)).toBe(false)
    expect(inside(bubble, area)).toBe(true)
  })

  it('uses the right side when the left is too narrow', () => {
    const area = { left: 0, top: 0, right: 400, bottom: 160 }
    const head = { left: 60, top: 5, right: 200, bottom: 120 }
    const p = placeSpeech(area, head, measure)
    expect(p.tail).toBe('left')
    expect(overlaps(toPage(area, p), head)).toBe(false)
  })

  it('goes below the head if neither above nor beside fits', () => {
    const area = { left: 0, top: 0, right: 300, bottom: 400 }
    const head = { left: 40, top: 0, right: 260, bottom: 150 }
    const p = placeSpeech(area, head, measure)
    expect(p.tail).toBe('up')
    expect(overlaps(toPage(area, p), head)).toBe(false)
  })

  it('uses the normal size whenever it fits', () => {
    const area = { left: 16, top: 100, right: 394, bottom: 500 }
    const head = { left: 120, top: 260, right: 290, bottom: 380 }
    expect(placeSpeech(area, head, measure).compact).toBe(false)
  })

  it('switches to the compact size when the normal one would run out of the area', () => {
    // A short area with the head in the middle: beside it, the normal bubble is too tall.
    const sized = (maxWidth: number, compact: boolean) => {
      const width = Math.min(maxWidth, 220)
      const lines = Math.ceil(220 / width)
      return { width, height: compact ? 10 + lines * 16 : 18 + lines * 22 }
    }
    const area = { left: 0, top: 0, right: 328, bottom: 60 }
    const head = { left: 70, top: 0, right: 180, bottom: 50 }
    expect(sized(328 - 180 - 10, false).height).toBeGreaterThan(60) // the normal size is too tall
    const p = placeSpeech(area, head, sized)
    expect(p.compact).toBe(true)
    const { width, height } = sized(p.maxWidth, true)
    const bubble = { left: p.left, top: p.top, right: p.left + width, bottom: p.top + height }
    expect(overlaps(bubble, head)).toBe(false)
    expect(inside(bubble, area)).toBe(true)
  })

  it('keeps the fallback inside the area, so it never covers what is below the dragon', () => {
    const area = { left: 0, top: 0, right: 300, bottom: 100 }
    const head = { left: 100, top: 0, right: 200, bottom: 100 }
    const p = placeSpeech(area, head, measure)
    expect(p.compact).toBe(true)
    const bubble = toPage(area, p)
    expect(bubble.bottom).toBeLessThanOrEqual(area.bottom)
    expect(bubble.left).toBeGreaterThanOrEqual(area.left)
    expect(bubble.right).toBeLessThanOrEqual(area.right)
  })

  it('always stays inside the area, even when nothing fits', () => {
    const area = { left: 0, top: 0, right: 200, bottom: 60 }
    const head = { left: 10, top: 0, right: 190, bottom: 60 }
    const bubble = toPage(area, placeSpeech(area, head, measure))
    expect(bubble.left).toBeGreaterThanOrEqual(area.left)
    expect(bubble.right).toBeLessThanOrEqual(area.right + 1)
    expect(bubble.top).toBeGreaterThanOrEqual(area.top)
  })

  describe('keeping clear of worn items', () => {
    // Real numbers from a 410px phone: the head box leaves about 106px each side, so
    // with nothing worn the bubble goes below the head, over the neck.
    const area = { left: 16, top: 77, right: 394, bottom: 418 }
    const head = { left: 127, top: 113, right: 283, bottom: 253 }
    const neck = { left: 179, top: 258, right: 231, bottom: 303 }
    const held = { left: 139, top: 325, right: 181, bottom: 363 }

    it('with nothing worn, goes below the head as before', () => {
      expect(placeSpeech(area, head, measure).tail).toBe('up')
    })

    it('moves aside below the head, still pointing at it, rather than cover a neck or held item', () => {
      const p = placeSpeech(area, head, measure, [neck, held])
      const bubble = toPage(area, p)
      expect(overlaps(bubble, neck)).toBe(false)
      expect(overlaps(bubble, held)).toBe(false)
      expect(overlaps(bubble, head)).toBe(false)
      expect(inside(bubble, area)).toBe(true)
      expect(p.compact).toBe(false)
      expect(p.tail).toBe('up')
      expect(bubble.top).toBeGreaterThanOrEqual(head.bottom + 10)
      // Wide enough to read: never squeezed to a column of single words.
      expect(bubble.right - bubble.left).toBeGreaterThanOrEqual(110)
      // The tail sits under the head, not in the bubble's middle.
      const tailAt = p.tailAt ?? (bubble.right - bubble.left) / 2
      expect(bubble.left + tailAt).toBeGreaterThan(head.left)
      expect(bubble.left + tailAt).toBeLessThan(head.right)
      expect(tailAt).toBeGreaterThanOrEqual(18)
      expect(tailAt).toBeLessThanOrEqual(bubble.right - bubble.left - 18)
    })

    it('only goes beside the head in a narrow bubble when nothing below is clear, and never under 110px', () => {
      // 115px to the left of the head: too little for the usual 120, enough for 110.
      const wide = { left: 141, top: 113, right: 283, bottom: 253 }
      const short = { ...area, bottom: wide.bottom + 30 }
      const p = placeSpeech(short, wide, measure, [neck, held])
      const bubble = toPage(short, p)
      expect(p.tail).toBe('right')
      expect(bubble.right - bubble.left).toBeGreaterThanOrEqual(110)
      expect(overlaps(bubble, wide)).toBe(false)
      // With only 101px, it doesn't squeeze in at all.
      const q = placeSpeech({ ...short, left: 30 }, wide, measure, [neck, held])
      expect(q.maxWidth).toBeGreaterThanOrEqual(110)
    })

    it('still goes below the head when that spot is clear of what is worn', () => {
      const lowHeld = { left: 139, top: 395, right: 181, bottom: 418 }
      const p = placeSpeech(area, head, measure, [lowHeld])
      expect(p.tail).toBe('up')
      expect(overlaps(toPage(area, p), lowHeld)).toBe(false)
    })

    it('keeps above the head first when there is room', () => {
      const tall = { ...area, top: 0 }
      const p = placeSpeech(tall, head, measure, [neck, held])
      expect(p.tail).toBe('down')
    })

    it('fits on a 360px phone and a short 410px one, clear of head and worn items', () => {
      const cases = [
        { area: { left: 16, top: 77, right: 344, bottom: 299 }, head: { left: 124, top: 92, right: 236, bottom: 192 }, worn: [{ left: 162, top: 195, right: 198, bottom: 228 }, { left: 133, top: 244, right: 163, bottom: 271 }] },
        { area: { left: 16, top: 77, right: 394, bottom: 344 }, head: { left: 132, top: 117, right: 278, bottom: 247 }, worn: [{ left: 181, top: 242, right: 229, bottom: 285 }, { left: 149, top: 277, right: 184, bottom: 309 }] },
      ]
      for (const c of cases) {
        const p = placeSpeech(c.area, c.head, measure, c.worn)
        const bubble = toPage(c.area, p)
        expect(inside(bubble, c.area)).toBe(true)
        expect(overlaps(bubble, c.head)).toBe(false)
        for (const w of c.worn) expect(overlaps(bubble, w)).toBe(false)
      }
    })
  })

  describe('with a lower part (the egg)', () => {
    // Measured on Home: the egg's keep-clear box (cap to middle) and its base.
    const phone = { area: { left: 16, top: 77, right: 394, bottom: 418 }, head: { left: 98, top: 95, right: 312, bottom: 257 }, lower: { top: 293, bottom: 381 } }
    const narrow = { area: { left: 16, top: 77, right: 344, bottom: 299 }, head: { left: 104, top: 79, right: 256, bottom: 195 }, lower: { top: 220, bottom: 283 } }

    it('sits across the bottom edge of the base, never over the middle, pointing up', () => {
      for (const c of [phone, narrow]) {
        const p = placeSpeech(c.area, c.head, measure, [], c.lower)
        const bubble = toPage(c.area, p)
        expect(p.tail).toBe('up')
        expect(inside(bubble, c.area)).toBe(true)
        expect(overlaps(bubble, c.head)).toBe(false)
        expect(bubble.top).toBeGreaterThanOrEqual(c.lower.top)
        expect(bubble.top).toBeLessThan(c.lower.bottom)
      }
    })

    it("sits on the base, its bottom on the part's bottom, leaving the nest below in view", () => {
      const p = placeSpeech(phone.area, phone.head, measure, [], phone.lower)
      const { height } = measure(p.maxWidth)
      expect(phone.area.top + p.top + height).toBe(phone.lower.bottom)
    })

    it('still prefers above the egg when there is room', () => {
      const tall = { ...phone.area, top: 0 }
      expect(placeSpeech(tall, phone.head, measure, [], phone.lower).tail).toBe('down')
    })

    it('falls back to compact text at the bottom of a very short area', () => {
      const area = { left: 16, top: 77, right: 344, bottom: 200 }
      const head = { left: 104, top: 79, right: 256, bottom: 150 }
      const p = placeSpeech(area, head, measure, [], { top: 175, bottom: 196 })
      expect(p.compact).toBe(true)
      expect(p.tail).toBe('up')
      expect(inside(toPage(area, p), area)).toBe(true)
      expect(overlaps(toPage(area, p), head)).toBe(false)
    })
  })

  it('fits a bubble beside the head when the space there is a fraction of a pixel', () => {
    // The room left of the head is 119.99px, and a bubble asked for that measures a
    // whole 120px; nothing fits above or below.
    const area = { left: 16, top: 77, right: 394, bottom: 270 }
    const head = { left: 145.99, top: 83, right: 305, bottom: 231 }
    const whole = (maxWidth: number, compact: boolean) => ({ width: Math.ceil(maxWidth), height: compact ? 61 : 98 })
    const p = placeSpeech(area, head, whole)
    expect(p.compact).toBe(false)
    expect(p.tail).toBe('right')
    expect(area.left + p.left + Math.ceil(p.maxWidth)).toBeLessThanOrEqual(head.left - 10)
  })
})
