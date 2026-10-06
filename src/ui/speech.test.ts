import { describe, expect, it } from 'vitest'
import { placeSpeech, type Box } from './speech'

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
})
