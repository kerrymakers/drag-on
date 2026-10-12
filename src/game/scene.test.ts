import { describe, expect, it } from 'vitest'
import { SCENE, type SceneConfig } from '../config/scene'
import { skyPeriod, sunOn } from './scene'
import { at } from '../testing/helpers'

const sky = (iso: string, config: SceneConfig = SCENE) => skyPeriod(at(iso), config)
const pad = (n: number) => String(n).padStart(2, '0')
const hhmm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
const mins = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3))
const T = SCENE.twilightMinutes

/** The four boundaries on a date, on the local clock, rounded up to whole minutes. */
function bounds(y: number, m: number, d: number, ahead: number) {
  const sun = sunOn(y, m, d, SCENE.sun)!
  const up = (n: number) => Math.ceil(n - 1e-9)
  return {
    dawn: up(sun.rise + ahead - T),
    day: up(sun.rise + ahead + T),
    evening: up(sun.set + ahead - T),
    night: up(sun.set + ahead + T),
  }
}

describe('sunOn', () => {
  it("is each row's own time on the 15th", () => {
    SCENE.sun.forEach((row, i) => {
      expect(sunOn(2026, i + 1, 15, SCENE.sun)).toEqual({ rise: mins(row.rise), set: mins(row.set) })
    })
  })

  it('blends in a straight line between the rows either side', () => {
    const [jan, feb] = [SCENE.sun[0]!, SCENE.sun[1]!]
    // 1 February is 17 of the 31 days from 15 January to 15 February.
    const s = sunOn(2026, 2, 1, SCENE.sun)!
    expect(s.rise).toBeCloseTo(mins(jan.rise) + ((mins(feb.rise) - mins(jan.rise)) * 17) / 31, 6)
    expect(s.set).toBeCloseTo(mins(jan.set) + ((mins(feb.set) - mins(jan.set)) * 17) / 31, 6)
    // 14 January is 30 of the 31 days from 15 December.
    const dec = SCENE.sun[11]!
    expect(sunOn(2026, 1, 14, SCENE.sun)!.rise).toBeCloseTo(mins(dec.rise) + ((mins(jan.rise) - mins(dec.rise)) * 30) / 31, 6)
  })

  it('never jumps at the turn of a month or a year', () => {
    for (let m = 1; m <= 12; m++) {
      const last = new Date(Date.UTC(2026, m, 0)).getUTCDate()
      const a = sunOn(2026, m, last, SCENE.sun)!
      const b = m === 12 ? sunOn(2027, 1, 1, SCENE.sun)! : sunOn(2026, m + 1, 1, SCENE.sun)!
      expect(Math.abs(b.rise - a.rise), `month ${m}`).toBeLessThan(4)
      expect(Math.abs(b.set - a.set), `month ${m}`).toBeLessThan(4)
    }
  })

  it('handles a leap February', () => {
    const s = sunOn(2028, 2, 29, SCENE.sun)!
    expect(Number.isFinite(s.rise) && Number.isFinite(s.set)).toBe(true)
  })

  it('gives null for a missing or malformed row', () => {
    expect(sunOn(2026, 1, 15, [])).toBeNull()
    expect(sunOn(2026, 1, 15, SCENE.sun.map(() => ({ rise: '8am', set: '16:00' })))).toBeNull()
  })
})

describe('skyPeriod', () => {
  // The 15th of each month in 2026; BST (UTC+1) from 29 March to 25 October.
  const months = SCENE.sun.map((sun, i) => {
    const month = i + 1
    const bst = month >= 4 && month <= 10
    return { month, sun, ahead: bst ? 60 : 0, zone: bst ? '+01:00' : 'Z' }
  })

  for (const { month, sun, ahead, zone } of months) {
    it(`switches at each boundary in month ${month}`, () => {
      const rise = mins(sun.rise) + ahead
      const set = mins(sun.set) + ahead
      const local = (m: number) => `2026-${pad(month)}-15T${hhmm(m)}:00${zone}`
      expect(sky(local(rise - T - 1))).toBe('night')
      expect(sky(local(rise - T))).toBe('dawn')
      expect(sky(local(rise))).toBe('dawn')
      expect(sky(local(rise + T - 1))).toBe('dawn')
      expect(sky(local(rise + T))).toBe('day')
      expect(sky(local(set - T - 1))).toBe('day')
      expect(sky(local(set - T))).toBe('evening')
      expect(sky(local(set + T - 1))).toBe('evening')
      expect(sky(local(set + T))).toBe('night')
    })
  }

  it('switches at the blended times between rows (1 February)', () => {
    const b = bounds(2026, 2, 1, 0)
    const local = (m: number) => `2026-02-01T${hhmm(m)}:00Z`
    expect(sky(local(b.dawn - 1))).toBe('night')
    expect(sky(local(b.dawn))).toBe('dawn')
    expect(sky(local(b.day))).toBe('day')
    expect(sky(local(b.evening - 1))).toBe('day')
    expect(sky(local(b.evening))).toBe('evening')
    expect(sky(local(b.night))).toBe('night')
  })

  it('drops seconds, like the rest of the clock', () => {
    // March 15th: dawn from 05:45 GMT.
    expect(sky('2026-03-15T05:44:59Z')).toBe('night')
    expect(sky('2026-03-15T05:45:00Z')).toBe('dawn')
  })

  it('is night at midnight and just either side of it, all year', () => {
    for (const { month, zone } of months) {
      expect(sky(`2026-${pad(month)}-15T00:00:00${zone}`), `month ${month}`).toBe('night')
      expect(sky(`2026-${pad(month)}-15T23:59:00${zone}`), `month ${month}`).toBe('night')
      expect(sky(`2026-${pad(month)}-15T00:01:00${zone}`), `month ${month}`).toBe('night')
    }
  })

  it('follows the real clock around 04:00, not the game day', () => {
    // 15 June: sunrise 03:45 GMT is 04:45 BST, so dawn starts at 04:15 BST.
    expect(sky('2026-06-15T03:59:00+01:00')).toBe('night')
    expect(sky('2026-06-15T04:00:00+01:00')).toBe('night')
    expect(sky('2026-06-15T04:14:00+01:00')).toBe('night')
    expect(sky('2026-06-15T04:15:00+01:00')).toBe('dawn')
    // 03:59 is still the previous game day, but the sky goes by the date on the clock:
    // just before and after 04:00 on 1 July it's the same night.
    expect(sky('2026-07-01T03:59:00+01:00')).toBe('night')
    expect(sky('2026-07-01T04:00:00+01:00')).toBe('night')
    // December: dark until well after the day starts.
    expect(sky('2026-12-15T04:00:00Z')).toBe('night')
    expect(sky('2026-12-15T07:29:00Z')).toBe('night')
    expect(sky('2026-12-15T07:30:00Z')).toBe('dawn')
  })

  it('moves sunrise onto BST on the spring changeover day (29 March 2026)', () => {
    // The day before (GMT).
    const before = bounds(2026, 3, 28, 0)
    expect(sky(`2026-03-28T${hhmm(before.dawn)}:00Z`)).toBe('dawn')
    expect(sky(`2026-03-28T${hhmm(before.day)}:00Z`)).toBe('day')
    // The clocks go forward at 01:00 GMT: the same sun now reads an hour later.
    const after = bounds(2026, 3, 29, 60)
    expect(after.dawn - before.dawn).toBeGreaterThan(55)
    const local = (m: number) => `2026-03-29T${hhmm(m)}:00+01:00`
    expect(sky(local(after.dawn - 1))).toBe('night')
    expect(sky(local(after.dawn))).toBe('dawn')
    expect(sky(local(after.day - 1))).toBe('dawn')
    expect(sky(local(after.day))).toBe('day')
    // Across the missing hour itself: night either side.
    expect(sky('2026-03-29T00:59:00Z')).toBe('night')
    expect(sky('2026-03-29T03:00:00+01:00')).toBe('night')
  })

  it('moves sunset back onto GMT on the autumn changeover day (25 October 2026)', () => {
    // The day before (BST).
    const before = bounds(2026, 10, 24, 60)
    const bst = (m: number) => `2026-10-24T${hhmm(m)}:00+01:00`
    expect(sky(bst(before.evening - 1))).toBe('day')
    expect(sky(bst(before.evening))).toBe('evening')
    expect(sky(bst(before.night))).toBe('night')
    // The clocks go back at 01:00 GMT: evening comes about an hour earlier on the clock.
    const after = bounds(2026, 10, 25, 0)
    expect(before.evening - after.evening).toBeGreaterThan(55)
    const gmt = (m: number) => `2026-10-25T${hhmm(m)}:00Z`
    expect(sky(gmt(after.evening - 1))).toBe('day')
    expect(sky(gmt(after.evening))).toBe('evening')
    expect(sky(gmt(after.night))).toBe('night')
    expect(sky(gmt(before.evening))).toBe('night') // the time evening started yesterday
    // The doubled 01:00 to 01:59 hour is night both times round.
    expect(sky('2026-10-25T01:30:00+01:00')).toBe('night')
    expect(sky('2026-10-25T01:30:00Z')).toBe('night')
  })

  it('uses whatever table it is given, so changing the config changes the sky', () => {
    const late: SceneConfig = { ...SCENE, sun: SCENE.sun.map(() => ({ rise: '10:00', set: '14:00' })), twilightMinutes: 60 }
    expect(sky('2026-01-15T08:30:00Z', late)).toBe('night')
    expect(sky('2026-01-15T09:00:00Z', late)).toBe('dawn')
    expect(sky('2026-01-15T12:00:00Z', late)).toBe('day')
    expect(sky('2026-01-15T14:59:00Z', late)).toBe('evening')
  })

  it('falls back to day for a missing or malformed row', () => {
    expect(sky('2026-01-15T02:00:00Z', { ...SCENE, sun: [] })).toBe('day')
    expect(sky('2026-01-15T02:00:00Z', { ...SCENE, sun: SCENE.sun.map(() => ({ rise: '8am', set: '16:00' })) })).toBe('day')
  })
})

describe('SCENE config', () => {
  it('has twelve well-formed rows', () => {
    expect(SCENE.sun).toHaveLength(12)
    for (const { rise, set } of SCENE.sun) {
      expect(rise).toMatch(/^\d{2}:\d{2}$/)
      expect(set).toMatch(/^\d{2}:\d{2}$/)
    }
  })

  it('keeps every row inside one clock day with its twilight, in GMT and in BST', () => {
    SCENE.sun.forEach(({ rise, set }, i) => {
      const r = mins(rise)
      const s = mins(set)
      expect(r, `row ${i + 1}`).toBeLessThan(s)
      expect(r - T, `row ${i + 1}: dawn starts after midnight`).toBeGreaterThanOrEqual(0)
      expect(s + T + 60, `row ${i + 1}: evening ends before midnight, even in BST`).toBeLessThan(1440)
      // A day sky between dawn and evening.
      expect(r + T, `row ${i + 1}`).toBeLessThan(s - T)
    })
  })
})
