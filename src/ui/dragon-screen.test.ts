import { describe, expect, it } from 'vitest'
import { DRAGON_SCREEN, dragonScreenLine, friendlyDay } from './copy'
import { barFractions } from './dragon-screen'
import { fadeEdges } from './scroll-fade'

describe('barFractions', () => {
  it('scales to the top stat', () => {
    expect(barFractions([300, 150, 60, 0])).toEqual([1, 0.5, 0.2, 0])
  })

  it('is all empty before anything is logged', () => {
    expect(barFractions([0, 0, 0, 0])).toEqual([0, 0, 0, 0])
    expect(barFractions([])).toEqual([])
  })

  it('keeps a tiny non-zero stat visible', () => {
    const [, small] = barFractions([10_000, 1])
    expect(small).toBeGreaterThan(0)
    expect(small).toBeLessThan(0.1)
  })

  it('fills every bar when stats are tied', () => {
    expect(barFractions([40, 40])).toEqual([1, 1])
  })
})

describe('friendlyDay', () => {
  it('says Today and Yesterday', () => {
    expect(friendlyDay('2026-10-05', '2026-10-05')).toBe('Today')
    expect(friendlyDay('2026-10-04', '2026-10-05')).toBe('Yesterday')
    expect(friendlyDay('2026-09-30', '2026-10-01')).toBe('Yesterday')
  })

  it('gives a short date this year, and the year for other years', () => {
    expect(friendlyDay('2026-10-03', '2026-10-05')).toBe('3 Oct')
    expect(friendlyDay('2026-01-15', '2026-10-05')).toBe('15 Jan')
    expect(friendlyDay('2025-12-30', '2026-01-02')).toBe('30 Dec 2025')
  })

  it('handles a date in the future (clock skew) without "Yesterday"', () => {
    expect(friendlyDay('2026-10-06', '2026-10-05')).toBe('6 Oct')
  })
})

describe('Dragon screen copy', () => {
  it('never names a locked stage', () => {
    expect(DRAGON_SCREEN.locked).toBe('???')
  })

  it('has a line for before and after the first stage-up', () => {
    expect(dragonScreenLine(1)).not.toBe(dragonScreenLine(2))
  })
})

describe('fadeEdges', () => {
  it('shows no fade when everything fits', () => {
    expect(fadeEdges(0, 400, 400)).toBe('')
  })

  it('fades the bottom at the top, both in the middle, the top at the end', () => {
    expect(fadeEdges(0, 500, 400)).toBe('bottom')
    expect(fadeEdges(50, 500, 400)).toBe('both')
    expect(fadeEdges(100, 500, 400)).toBe('top')
  })

  it('ignores sub-pixel scrolling', () => {
    expect(fadeEdges(0.5, 400.6, 400)).toBe('')
    expect(fadeEdges(99.5, 500, 400)).toBe('top')
  })
})
