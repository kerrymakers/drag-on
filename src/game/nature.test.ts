import { describe, expect, it } from 'vitest'
import { NATURE } from '../config/nature'
import { at, log, undo } from '../testing/helpers'
import { foundNature, natureFor, natureInSeason, natureOf, rollNatureFind } from './nature'
import type { GameEvent, LogEvent, NatureFind } from './types'

const find = (id: string, months: number[]): NatureFind => ({ id, name: id, months, lookFor: '', picture: 'leaf' })
const FINDS = [find('oct-a', [10]), find('oct-b', [10]), find('nov', [11]), find('apr', [4]), find('may', [5])]
const WALK = { id: 'walk', xp: 15 }
const walkLog = (timestamp: number, natureId: unknown, id?: string): LogEvent =>
  ({ ...log(WALK, timestamp, id), nature: { id: natureId } }) as LogEvent
const OCT = at('2026-10-13T10:00:00+01:00')
const ids = (finds: readonly NatureFind[]) => finds.map((f) => f.id)

describe('natureInSeason', () => {
  it('follows the month of the game day, turning over at 04:00 on the 1st, in GMT and BST', () => {
    // GMT: 1 Nov 00:00 and 03:59 are still game day 31 Oct, so October; 04:00 is November.
    expect(ids(natureInSeason(FINDS, at('2026-10-31T23:59:00Z')))).toEqual(['oct-a', 'oct-b'])
    expect(ids(natureInSeason(FINDS, at('2026-11-01T00:00:00Z')))).toEqual(['oct-a', 'oct-b'])
    expect(ids(natureInSeason(FINDS, at('2026-11-01T03:59:00Z')))).toEqual(['oct-a', 'oct-b'])
    expect(ids(natureInSeason(FINDS, at('2026-11-01T04:00:00Z')))).toEqual(['nov'])
    // BST: 04:00 London on 1 May is 03:00 UTC.
    expect(ids(natureInSeason(FINDS, at('2026-05-01T02:59:00Z')))).toEqual(['apr'])
    expect(ids(natureInSeason(FINDS, at('2026-05-01T03:00:00Z')))).toEqual(['may'])
  })
})

describe('rollNatureFind', () => {
  it('picks among unfound finds in season by pick, clamping odd picks', () => {
    expect(rollNatureFind([], FINDS, OCT, 0)).toBe('oct-a')
    expect(rollNatureFind([], FINDS, OCT, 0.6)).toBe('oct-b')
    expect(rollNatureFind([], FINDS, OCT, Number.NaN)).toBe('oct-a')
    expect(rollNatureFind([], FINDS, OCT, -1)).toBe('oct-a')
    expect(rollNatureFind([], FINDS, OCT, 1)).toBe('oct-b')
  })

  it('prefers what is still unfound, then repeats any find in season once all are found', () => {
    const a = walkLog(OCT - 86_400_000, 'oct-a')
    expect(rollNatureFind([a], FINDS, OCT, 0)).toBe('oct-b')
    expect(rollNatureFind([a], FINDS, OCT, 0.99)).toBe('oct-b')
    const b = walkLog(OCT - 3_600_000, 'oct-b')
    expect(rollNatureFind([a, b], FINDS, OCT, 0)).toBe('oct-a')
    expect(rollNatureFind([a, b], FINDS, OCT, 0.99)).toBe('oct-b')
  })

  it('counts an undone find as unfound again, and ignores unknown or malformed ids', () => {
    const a = walkLog(OCT - 86_400_000, 'oct-a')
    expect(rollNatureFind([a, undo(a, OCT - 1)], FINDS, OCT, 0)).toBe('oct-a')
    const odd: GameEvent[] = [walkLog(OCT - 3, 'from-later'), walkLog(OCT - 2, 7), walkLog(OCT - 1, '')]
    expect(rollNatureFind(odd, FINDS, OCT, 0)).toBe('oct-a')
  })

  it('is null with nothing in season', () => {
    expect(rollNatureFind([], [find('jan', [1])], OCT, 0)).toBeNull()
  })
})

describe('natureOf, natureFor and foundNature', () => {
  it('reads only a well-formed id, and natureFor only a configured one', () => {
    expect(natureOf(walkLog(OCT, 'oct-a'))).toBe('oct-a')
    expect(natureOf(log(WALK, OCT))).toBeNull()
    for (const bad of [null, 'oct-a', 3, {}, { id: '' }, { id: 4 }]) {
      expect(natureOf({ ...log(WALK, OCT), nature: bad } as unknown as LogEvent), JSON.stringify(bad)).toBeNull()
    }
    expect(natureFor(walkLog(OCT, 'oct-a'), FINDS)?.id).toBe('oct-a')
    expect(natureFor(walkLog(OCT, 'from-later'), FINDS)).toBeNull()
  })

  it('lists each find once, from its first active log, and undo moves or removes it', () => {
    const first = walkLog(at('2026-10-05T12:00:00+01:00'), 'oct-a', 'w1')
    const again = walkLog(at('2026-10-06T12:00:00+01:00'), 'oct-a', 'w2')
    const other = walkLog(at('2026-10-07T12:00:00+01:00'), 'from-later', 'w3')
    const all = [first, again, other]
    expect(foundNature(all, FINDS)).toEqual([
      { find: FINDS[0], logId: 'w1', timestamp: first.timestamp, dayKey: '2026-10-05' },
    ])
    expect(foundNature([...all, undo(first, OCT)], FINDS).map((f) => f.logId)).toEqual(['w2'])
    expect(foundNature([...all, undo(first, OCT), undo(again, OCT)], FINDS)).toEqual([])
  })
})

describe('NATURE config', () => {
  it('has unique ids, valid months, a name, a look-for line and a picture for every find', () => {
    expect(new Set(NATURE.map((f) => f.id)).size).toBe(NATURE.length)
    for (const f of NATURE) {
      expect(f.months.length, f.id).toBeGreaterThan(0)
      expect(f.months.every((m) => Number.isInteger(m) && m >= 1 && m <= 12), f.id).toBe(true)
      expect(f.name && f.lookFor && f.picture, f.id).toBeTruthy()
    }
  })

  it('has at least 3 finds in season every month', () => {
    for (let m = 1; m <= 12; m++) expect(NATURE.filter((f) => f.months.includes(m)).length, `month ${m}`).toBeGreaterThanOrEqual(3)
  })

  it('only ever talks about looking and listening, never picking, eating or touching', () => {
    const banned = /\b(pluck\w*|grab\w*|take|takes|taking|took|smell\w*|sniff\w*|hold\w*|handl\w*|dig\w* up|bring\w* home|eat\w*|edible|pick\w*|forag\w*|tast\w*|cook\w*|recipes?|jams?|jelly|pies?|cordial|harvest\w*|gather\w*|collect\w*|snack\w*|munch\w*|nibbl\w*|chew\w*|bite|delicious|yummy|tasty|safe to|medicin\w*|tea)\b/i
    for (const f of NATURE) {
      for (const text of [f.name, f.lookFor]) expect(text, f.id).not.toMatch(banned)
      // "touch" only in "don't touch".
      expect(f.lookFor.replace(/don[’']t touch/gi, ''), f.id).not.toMatch(/\btouch/i)
    }
  })
})
