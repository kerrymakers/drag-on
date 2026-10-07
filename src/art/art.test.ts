import { describe, expect, it } from 'vitest'
import { EVOLVES_AT_STAGE } from '../config/evolution'
import { ITEMS } from '../config/items'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { ADULT, ADULT_SCALE, ELDER, ELDER_SCALE, JUVENILE, JUVENILE_SCALE, WHELP, WHELP_SCALE, adultSvg, elderSvg, juvenileSvg, whelpSvg } from './grown'
import { HATCHLING, HATCHLING_SCALE, hatchlingSvg } from './hatchling'
import { CRACK_BIG_AT, CRACK_SMALL_AT, crackLevel, hasLookArt } from './index'
import { eggSvg } from './egg'
import { WEAR_PIN, hasItemArt, itemSvg, unknownItemSvg, wornItemBox, wornItemSvg } from './items'
import { EVOLVED_LOOKS, knownLook, type EvolutionLook } from './looks'
import { mirror, type Anchors, type WearLook, type WearSlot } from './parts'

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

describe('item art', () => {
  it('has a drawing for every item in config, tagged with its id', () => {
    for (const item of ITEMS) {
      expect(hasItemArt(item.id), item.id).toBe(true)
      const svg = itemSvg(item.id)
      expect(svg, item.id).toContain(`data-item="${item.id}"`)
      expect(svg, item.id).toContain('viewBox="0 0 64 64"')
      expect(svg, item.id).toContain('aria-hidden="true"')
    }
  })

  it('draws the soft "?" for an id it has no art for', () => {
    for (const id of ['nope', '', 'toString', '__proto__', 'constructor']) {
      expect(hasItemArt(id), id).toBe(false)
      expect(itemSvg(id), id).toBe(unknownItemSvg())
    }
    expect(unknownItemSvg()).toContain('>?<')
  })

  it('draws each item differently', () => {
    const bodies = ITEMS.map((i) => itemSvg(i.id).replace(/data-item="[^"]*"/, ''))
    expect(new Set(bodies).size).toBe(ITEMS.length)
  })
})

describe('worn items', () => {
  const SLOTS: readonly WearSlot[] = ['head', 'neck', 'held']
  const ALL_LOOKS: readonly EvolutionLook[] = ['neutral', ...EVOLVED_LOOKS]
  const STAGES_ART: Record<string, { draw: (look: EvolutionLook, w?: WearLook) => string; anchors: Anchors; scale: number; looks: boolean }> = {
    hatchling: { draw: (_l, w) => hatchlingSvg(w), anchors: HATCHLING, scale: HATCHLING_SCALE, looks: false },
    whelp: { draw: (_l, w) => whelpSvg(w), anchors: WHELP, scale: WHELP_SCALE, looks: false },
    juvenile: { draw: juvenileSvg, anchors: JUVENILE, scale: JUVENILE_SCALE, looks: true },
    adult: { draw: adultSvg, anchors: ADULT, scale: ADULT_SCALE, looks: true },
    elder: { draw: elderSvg, anchors: ELDER, scale: ELDER_SCALE, looks: true },
  }
  // The curled-up posture in art.css (--curl-pose); keep the two in step: translateY(12px) scale(1.05, 0.9) about (256, 492).
  const CURL = { dy: 12, sx: 1.05, sy: 0.9 }
  /** A stage-unit point on screen (viewBox units), at rest or curled up. */
  const place = (x: number, y: number, scale: number, curled: boolean) => {
    let px = 256 + (x - 256) * scale
    let py = 492 + (y - 492) * scale
    if (curled) {
      px = 256 + (px - 256) * CURL.sx
      py = 492 + (py - 492) * CURL.sy + CURL.dy
    }
    return [px, py] as const
  }

  it('draws every item in its spot on every stage and look, without errors', () => {
    for (const [stage, art] of Object.entries(STAGES_ART)) {
      for (const look of art.looks ? ALL_LOOKS : (['neutral'] as const)) {
        for (const item of ITEMS) {
          const svg = art.draw(look, { [item.slot]: item.id })
          const name = `${stage} ${look} ${item.id}`
          expect(svg, name).toContain(`data-worn="${item.id}"`)
          expect(svg, name).toContain(`worn-${item.slot}`)
          expect(svg, name).not.toContain('NaN')
          expect(svg, name).not.toContain('undefined')
          // Every mood still there, and the worn item rides in the pose and body groups.
          for (const cls of ['mood-happy', 'mood-sleepy', 'mood-grumpy', 'mood-blanket']) expect(svg, `${name} ${cls}`).toContain(cls)
          const pose = svg.indexOf('class="dragon-pose"')
          expect(pose, name).toBeGreaterThan(-1)
          expect(svg.indexOf('data-worn'), name).toBeGreaterThan(pose)
        }
      }
    }
  })

  it('draws every worn item above every part of the stage drawing and its look', () => {
    for (const [stage, art] of Object.entries(STAGES_ART)) {
      for (const look of art.looks ? ALL_LOOKS : (['neutral'] as const)) {
        const svg = art.draw(look, { head: 'crown', neck: 'scarf', held: 'book' })
        // Everything the stage draws, and its look features; the glasses sit over the
        // mood lids by design, on the face, so they're left out.
        const glasses = svg.indexOf('look-glasses')
        const beforeGlasses = glasses === -1 ? svg : svg.slice(0, glasses)
        const lastStagePart = Math.max(beforeGlasses.lastIndexOf('class="hd-'), beforeGlasses.lastIndexOf('class="lk-'))
        expect(svg.lastIndexOf('class="hd-'), `${stage} ${look}`).toBeLessThan(svg.indexOf('data-worn'))
        for (const id of ['crown', 'scarf', 'book']) {
          expect(svg.indexOf(`data-worn="${id}"`), `${stage} ${look} ${id}`).toBeGreaterThan(lastStagePart)
        }
      }
    }
  })

  it('wears all three spots at once', () => {
    const svg = adultSvg('wisdom', { head: 'crown', neck: 'scarf', held: 'book' })
    for (const id of ['crown', 'scarf', 'book']) expect(svg).toContain(`data-worn="${id}"`)
    // Neck and held tuck under the blanket; the hat sits on top of everything, glasses included.
    expect(svg.indexOf('data-worn="scarf"')).toBeLessThan(svg.indexOf('mood-blanket'))
    expect(svg.indexOf('data-worn="book"')).toBeLessThan(svg.indexOf('mood-blanket'))
    expect(svg.indexOf('data-worn="crown"')).toBeGreaterThan(svg.indexOf('look-glasses'))
  })

  it('keeps every spot inside the viewBox on every stage, at rest and curled up', () => {
    for (const [stage, art] of Object.entries(STAGES_ART)) {
      for (const slot of SLOTS) {
        const [x0, y0, x1, y1] = wornItemBox(slot, art.anchors.wear[slot])
        for (const curled of [false, true]) {
          for (const [x, y] of [[x0, y0], [x1, y1]] as const) {
            const [px, py] = place(x, y, art.scale, curled)
            const name = `${stage} ${slot}${curled ? ' curled' : ''}`
            expect(px, name).toBeGreaterThanOrEqual(0)
            expect(px, name).toBeLessThanOrEqual(512)
            expect(py, name).toBeGreaterThanOrEqual(0)
            expect(py, name).toBeLessThanOrEqual(512)
          }
        }
      }
    }
  })

  it('grows the speech bubble keep-clear box to cover a hat', () => {
    for (const [stage, art] of Object.entries(STAGES_ART)) {
      const svg = art.draw('neutral', { head: 'partyhat' })
      const m = /class="dragon-head-box follows-pose" x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg)
      expect(m, stage).not.toBeNull()
      const [x, y, w, h] = m!.slice(1).map(Number) as [number, number, number, number]
      const [hx0, hy0, hx1, hy1] = wornItemBox('head', art.anchors.wear.head)
      expect(x, stage).toBeLessThanOrEqual(hx0)
      expect(y, stage).toBeLessThanOrEqual(hy0)
      expect(x + w, stage).toBeGreaterThanOrEqual(hx1)
      expect(y + h, stage).toBeGreaterThanOrEqual(hy1)
      // No hat, no change.
      expect(art.draw('neutral', { neck: 'scarf' })).toContain(
        `x="${art.anchors.headBox[0]}" y="${art.anchors.headBox[1]}"`,
      )
    }
  })

  it('draws nothing for an unknown, empty or missing id', () => {
    for (const id of ['nope', '', 'toString', '__proto__', null, undefined]) {
      expect(wornItemSvg(id, 'head', HATCHLING.wear.head), String(id)).toBe('')
      expect(hatchlingSvg({ head: id, neck: id, held: id }), String(id)).toBe(hatchlingSvg())
    }
    expect(juvenileSvg('heart', { head: 'nope' })).toBe(juvenileSvg('heart'))
  })

  it('draws nothing worn without an outfit, so the plain drawings are unchanged', () => {
    for (const [stage, art] of Object.entries(STAGES_ART)) expect(art.draw('neutral'), stage).not.toContain('data-worn')
  })

  it('pins each spot inside the 64 grid', () => {
    for (const slot of SLOTS) {
      const [x, y] = WEAR_PIN[slot]
      expect(x).toBeGreaterThanOrEqual(0)
      expect(y).toBeLessThanOrEqual(64)
    }
  })
})
