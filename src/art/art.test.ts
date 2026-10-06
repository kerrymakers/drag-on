import { describe, expect, it } from 'vitest'
import { EVOLVES_AT_STAGE } from '../config/evolution'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { adultSvg, elderSvg, juvenileSvg, whelpSvg } from './grown'
import { hatchlingSvg } from './hatchling'
import { CRACK_BIG_AT, CRACK_SMALL_AT, crackLevel, hasLookArt } from './index'
import { eggSvg } from './egg'
import { EVOLVED_LOOKS, knownLook } from './looks'
import { mirror } from './parts'

describe('crackLevel', () => {
  it('shows no crack below the small threshold', () => {
    expect(crackLevel(0)).toBe(0)
    expect(crackLevel(CRACK_SMALL_AT - 0.01)).toBe(0)
  })
  it('shows a small crack from the small threshold', () => {
    expect(crackLevel(CRACK_SMALL_AT)).toBe(1)
    expect(crackLevel(CRACK_BIG_AT - 0.01)).toBe(1)
  })
  it('shows a bigger crack from the big threshold', () => {
    expect(crackLevel(CRACK_BIG_AT)).toBe(2)
    expect(crackLevel(1)).toBe(2)
  })
})

describe('mirror', () => {
  it('flips x coordinates across the centre line and leaves y alone', () => {
    expect(mirror('M182 296 C136 206 54 214 42 292 Z')).toBe('M330 296 C376 206 458 214 470 292 Z')
    expect(mirror('M200 92 C164 52 166 12 202 -4 Z')).toBe('M312 92 C348 52 346 12 310 -4 Z')
    expect(mirror('M170 474 L166 486 M190 478 L188 490')).toBe('M342 474 L346 486 M322 478 L324 490')
    expect(mirror('M240 262 Q256 276 272 262')).toBe('M272 262 Q256 276 240 262')
  })

  it('refuses paths it would flip wrongly', () => {
    for (const d of ['m10 10 l5 5', 'M10 10 H40', 'M10 10 V40', 'M10 10 A5 5 0 0 1 20 20', 'M10 10 S20 20 30 30', 'M1e2 10 L5 5', 'M10 10 T20 20']) {
      expect(() => mirror(d), d).toThrow()
    }
  })
})

describe('stage art', () => {
  const drawings: Record<string, string> = {
    hatchling: hatchlingSvg(),
    whelp: whelpSvg(),
    juvenile: juvenileSvg(),
    adult: adultSvg(),
    elder: elderSvg(),
  }

  it('has a drawing for every stage after the egg', () => {
    for (const s of STAGES.slice(1)) expect(drawings[s.id], s.id).toBeTruthy()
  })

  it('tags each drawing with its stage and a neutral evolution look', () => {
    for (const [id, svg] of Object.entries(drawings)) {
      expect(svg).toContain(`data-stage="${id}"`)
      expect(svg).toContain('data-evolution="neutral"')
      expect(svg).toMatch(/class="[^"]*dragon-body/)
      expect(svg).toContain('dragon-eyes')
      expect(svg).toMatch(/aria-label="[^"]+"/)
      expect(svg).not.toContain('NaN')
    }
  })
})

describe('mood parts', () => {
  const drawings: Record<string, string> = {
    egg: eggSvg(0, 'test'),
    hatchling: hatchlingSvg(),
    whelp: whelpSvg(),
    juvenile: juvenileSvg(),
    adult: adultSvg(),
    elder: elderSvg(),
  }

  it('every stage, egg included, carries every mood overlay and starts content', () => {
    for (const [id, svg] of Object.entries(drawings)) {
      expect(svg, id).toContain('data-mood="content"')
      for (const cls of ['mood-happy', 'mood-sleepy', 'mood-grumpy', 'mood-zzz', 'mood-blanket']) {
        expect(svg, `${id} ${cls}`).toContain(cls)
      }
    }
  })

  it('dragon stages have sleepy and peeking lids, a wagging tail and a posture group', () => {
    for (const [id, svg] of Object.entries(drawings)) {
      if (id === 'egg') continue
      expect(svg, id).toMatch(/mood-sleepy mood-lid/)
      expect(svg, id).toContain('mood-lid-line')
      expect(svg, id).toContain('mood-heart')
      expect(svg, id).toContain('mood-tail')
      expect(svg, id).toContain('class="dragon-pose"')
      expect(svg, id).not.toContain('NaN')
    }
  })

  it('the egg has its nightcap and glow', () => {
    expect(drawings.egg).toContain('egg-cap')
    expect(drawings.egg).toContain('egg-glow')
  })
})

describe('evolution looks', () => {
  const LOOKS = ['strength', 'discipline', 'wisdom', 'heart'] as const
  const STAGE_SVGS = { juvenile: juvenileSvg, adult: adultSvg, elder: elderSvg }

  it('has a look for every stat in config', () => {
    expect([...EVOLVED_LOOKS].sort()).toEqual(STATS.map((s) => s.id).sort())
  })

  it('neutral draws exactly as before, with no look parts', () => {
    for (const [id, draw] of Object.entries(STAGE_SVGS)) {
      expect(draw('neutral'), id).toBe(draw())
      expect(draw(), id).not.toContain('look-part')
    }
  })

  it('every look on every evolving stage is tagged, adds its own parts and keeps every mood overlay', () => {
    for (const [id, draw] of Object.entries(STAGE_SVGS)) {
      for (const look of LOOKS) {
        const svg = draw(look)
        const name = `${id} ${look}`
        expect(svg, name).toContain(`data-evolution="${look}"`)
        expect(svg, name).toContain(`look-${look}`)
        for (const other of LOOKS) if (other !== look) expect(svg, name).not.toContain(`look-${other}`)
        for (const cls of ['mood-happy', 'mood-sleepy', 'mood-grumpy', 'mood-zzz', 'mood-blanket', 'mood-tail']) {
          expect(svg, `${name} ${cls}`).toContain(cls)
        }
        expect(svg, name).not.toContain('NaN')
        expect(svg, name).not.toContain('undefined')
      }
    }
  })

  it('draws glasses over the mood lids, and everything else under them', () => {
    const svg = juvenileSvg('wisdom')
    expect(svg.indexOf('look-glasses')).toBeGreaterThan(svg.lastIndexOf('mood-lid'))
    for (const look of ['strength', 'discipline', 'heart'] as const) {
      const s = juvenileSvg(look)
      expect(s.indexOf(`look-${look}`), look).toBeLessThan(s.indexOf('mood-lid'))
    }
  })

  it('has look art for every stage the game can evolve at (EVOLVES_AT_STAGE and later)', () => {
    const from = STAGES.findIndex((s) => s.id === EVOLVES_AT_STAGE)
    expect(from, EVOLVES_AT_STAGE).toBeGreaterThan(0)
    for (const s of STAGES.slice(from)) expect(hasLookArt(s.id), s.id).toBe(true)
    // A stage added to config later draws as the most grown-up look, which has look art.
    expect(hasLookArt('some-later-stage')).toBe(true)
  })

  it('treats unknown or missing looks as neutral', () => {
    expect(knownLook(undefined)).toBe('neutral')
    expect(knownLook('neutral')).toBe('neutral')
    expect(knownLook('charisma')).toBe('neutral')
    expect(knownLook('wisdom')).toBe('wisdom')
  })
})
