import { describe, expect, it } from 'vitest'
import { EVOLVES_AT_STAGE } from '../config/evolution'
import { ITEMS } from '../config/items'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { ADULT, ADULT_SCALE, ELDER, ELDER_SCALE, JUVENILE, JUVENILE_SCALE, WHELP, WHELP_SCALE, adultSvg, elderSvg, juvenileSvg, whelpSvg } from './grown'
import { HATCHLING, HATCHLING_SCALE, hatchlingSvg } from './hatchling'
import { CRACK_BIG_AT, CRACK_SMALL_AT, WISH_BURST_SPARKS, crackLevel, drawLook, hasLookArt, wishBurstHtml, wishSparkleHtml, type MoodLook } from './index'
import { eggSvg } from './egg'
import { WEAR_PIN, hasItemArt, itemSvg, unknownItemSvg, wornItemBox, wornItemSvg } from './items'
import { EVOLVED_LOOKS, knownLook, type EvolutionLook } from './looks'
import artCss from './art.css?raw'
import { headGroup, mirror, type Anchors, type WearLook, type WearSlot } from './parts'
import { GROUND, KEYFRAMES, MOOD_MOTION, MOTION_MOODS, PERK_LIFT, PERK_ORIGINS_Y, headReach, pathBox, shapeBoxes, type Box, type HeadMotionInput } from './motion'

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
    hatchling: hatchlingSvg('t'),
    whelp: whelpSvg('t'),
    juvenile: juvenileSvg('t'),
    adult: adultSvg('t'),
    elder: elderSvg('t'),
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
    hatchling: hatchlingSvg('t'),
    whelp: whelpSvg('t'),
    juvenile: juvenileSvg('t'),
    adult: adultSvg('t'),
    elder: elderSvg('t'),
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

  it('every stage, egg included, carries the wistful sigh puff, hidden until data-goal says so, and riding with the head', () => {
    for (const [id, svg] of Object.entries(drawings)) {
      expect(svg, id).toContain('goal-part goal-sigh')
      expect(svg, id).not.toContain('data-goal')
      if (id !== 'egg') expect(svg, id).toMatch(/<g class="dg-head-move"><g class="goal-part goal-sigh"/)
    }
    // Shown by data-goal alone, never by a mood, so mood looks are unchanged.
    expect(artCss).toMatch(/\[data-goal='wistful'\] \.goal-part \{\s*opacity/)
    expect(artCss).not.toMatch(/\[data-mood=[^\]]+\][^{]*\.goal-/)
  })

  it('the egg has its nightcap and glow', () => {
    expect(drawings.egg).toContain('egg-cap')
    expect(drawings.egg).toContain('egg-glow')
  })
})

describe('evolution looks', () => {
  const LOOKS = ['strength', 'discipline', 'wisdom', 'heart'] as const
  const STAGE_SVGS: Record<string, (look?: EvolutionLook) => string> = {
    juvenile: (look) => juvenileSvg('t', look),
    adult: (look) => adultSvg('t', look),
    elder: (look) => elderSvg('t', look),
  }

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
    const svg = juvenileSvg('t', 'wisdom')
    expect(svg.indexOf('look-glasses')).toBeGreaterThan(svg.lastIndexOf('mood-lid'))
    for (const look of ['strength', 'discipline', 'heart'] as const) {
      const s = juvenileSvg('t', look)
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

  it('draws the 2026-10-09 items in a 64 grid tile, with shared outlines for light and dark mode', () => {
    for (const id of ['sunhat', 'beret', 'garland', 'moon', 'teddy', 'cookie']) {
      expect(ITEMS.some((i) => i.id === id), id).toBe(true)
      const svg = itemSvg(id)
      expect(svg, id).toContain('class="item-svg"')
      expect(svg, id).toContain('stroke="var(--item-line)"')
      expect(svg, id).not.toContain('NaN')
      expect(svg, id).not.toContain('undefined')
      // Every number in the drawing stays on the 64 grid (colours and rotation angles aside).
      const body = svg.replace(/^<svg[^>]*>/, '').replace(/#[0-9a-f]+/gi, '').replace(/rotate\(-?\d+/g, '')
      for (const n of body.match(/-?\d+(\.\d+)?/g) ?? []) {
        expect(Number(n), `${id} ${n}`).toBeGreaterThanOrEqual(0)
        expect(Number(n), `${id} ${n}`).toBeLessThanOrEqual(64)
      }
    }
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
    hatchling: { draw: (_l, w) => hatchlingSvg('t', w), anchors: HATCHLING, scale: HATCHLING_SCALE, looks: false },
    whelp: { draw: (_l, w) => whelpSvg('t', w), anchors: WHELP, scale: WHELP_SCALE, looks: false },
    juvenile: { draw: (l, w) => juvenileSvg('t', l, w), anchors: JUVENILE, scale: JUVENILE_SCALE, looks: true },
    adult: { draw: (l, w) => adultSvg('t', l, w), anchors: ADULT, scale: ADULT_SCALE, looks: true },
    elder: { draw: (l, w) => elderSvg('t', l, w), anchors: ELDER, scale: ELDER_SCALE, looks: true },
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

  it('wears the 2026-10-09 items together on every stage and look', () => {
    for (const outfit of [
      { head: 'sunhat', neck: 'garland', held: 'teddy' },
      { head: 'beret', neck: 'moon', held: 'cookie' },
    ]) {
      for (const [stage, art] of Object.entries(STAGES_ART)) {
        for (const look of art.looks ? ALL_LOOKS : (['neutral'] as const)) {
          const svg = art.draw(look, outfit)
          for (const id of Object.values(outfit)) expect(svg, `${stage} ${look} ${id}`).toContain(`data-worn="${id}"`)
          expect(svg, `${stage} ${look}`).not.toContain('NaN')
        }
      }
    }
  })

  it('wears all three spots at once', () => {
    const svg = adultSvg('t', 'wisdom', { head: 'crown', neck: 'scarf', held: 'book' })
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
      // No hat: just the head, with room for its idle motion in each mood.
      const plain = art.draw('neutral')
      const reach = headReach({ rest: art.anchors.headBox, parts: shapeBoxes(headGroup(plain), ['dg-ear']), ear: art.anchors.ear, neckY: art.anchors.neckY }, MOOD_MOTION.content)
      const [bx0, by0, bx1, by1] = reach
      const r1 = (n: number) => Math.round(n * 10) / 10
      expect(art.draw('neutral', { neck: 'scarf' })).toContain(`x="${bx0}" y="${by0}" width="${r1(bx1 - bx0)}" height="${r1(by1 - by0)}"`)
    }
  })

  it('draws nothing for an unknown, empty or missing id', () => {
    for (const id of ['nope', '', 'toString', '__proto__', null, undefined]) {
      expect(wornItemSvg(id, 'head', HATCHLING.wear.head), String(id)).toBe('')
      expect(hatchlingSvg('t', { head: id, neck: id, held: id }), String(id)).toBe(hatchlingSvg('t'))
    }
    expect(juvenileSvg('t', 'heart', { head: 'nope' })).toBe(juvenileSvg('t', 'heart'))
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

describe('richer look and idle life', () => {
  const ALL_LOOKS = ['neutral', ...EVOLVED_LOOKS] as const
  const MOODS: readonly MoodLook[] = ['content', 'happy', 'sleepy', 'grumpy']
  const OUTFIT = { head: 'crown', neck: 'scarf', held: 'book' }
  const ids = (svg: string) => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!)
  const refs = (svg: string) => [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!)
  /** Every drawing the art can make: each stage and crack, each look, with and without an outfit. */
  const everyDrawing = () => {
    const out: [string, string][] = []
    for (const progress of [0, CRACK_SMALL_AT, CRACK_BIG_AT]) out.push([`egg ${progress}`, drawLook({ stage: 'egg', progress }).svg])
    for (const s of STAGES.slice(1)) {
      for (const look of ALL_LOOKS) {
        for (const wearing of [undefined, OUTFIT]) {
          for (const mood of MOODS) out.push([`${s.id} ${look} ${mood}${wearing ? ' worn' : ''}`, drawLook({ stage: s.id, progress: 0, mood, look, wearing }).svg])
        }
      }
    }
    return out
  }

  it('draws every stage, look and outfit with no NaN or undefined, and every gradient it uses defined in the same drawing', () => {
    for (const [name, svg] of everyDrawing()) {
      expect(svg, name).not.toContain('NaN')
      expect(svg, name).not.toContain('undefined')
      const own = ids(svg)
      expect(new Set(own).size, `${name} duplicate ids`).toBe(own.length)
      for (const r of refs(svg)) expect(own, `${name} url(#${r})`).toContain(r)
    }
  })

  it('tags every look at every grown stage with its stage and look, and has a keep-clear box for every mood', () => {
    // The e2e fit check only draws a few of these; the tagging for all of them is checked here.
    const grown = STAGES.map((s) => s.id).filter((id) => id !== 'egg' && hasLookArt(id))
    expect(grown.length).toBeGreaterThan(0)
    for (const stage of grown) {
      for (const look of EVOLVED_LOOKS) {
        for (const mood of MOODS) {
          const name = `${stage} ${look} ${mood}`
          const { key, svg } = drawLook({ stage, progress: 0, mood, look })
          expect(key, name).toBe(`${stage}-${look}`)
          expect(svg, name).toContain(`data-stage="${stage}"`)
          expect(svg, name).toContain(`data-evolution="${look}"`)
          // renderDragon sets data-mood and swaps in this box for the mood.
          expect(svg, name).toMatch(new RegExp(`data-box-${mood}="(-?[\\d.]+ ){3}-?[\\d.]+"`))
        }
      }
    }
  })

  it('gives every rendered drawing its own gradient ids, so two dragons on screen never clash', () => {
    for (const stage of ['egg', ...STAGES.slice(1).map((s) => s.id)]) {
      const a = ids(drawLook({ stage, progress: 0.9, look: 'heart' }).svg)
      const b = ids(drawLook({ stage, progress: 0.9, look: 'heart' }).svg)
      expect(a.length, stage).toBeGreaterThan(0)
      for (const id of a) expect(b, `${stage} ${id}`).not.toContain(id)
    }
  })

  it('shades every dragon stage: skin, belly, wings, horns, blush and shine all painted with gradients', () => {
    for (const s of STAGES.slice(1)) {
      const svg = drawLook({ stage: s.id, progress: 0 }).svg
      for (const part of ['skin', 'belly', 'wing', 'horn', 'blush', 'shine']) expect(svg, `${s.id} ${part}`).toMatch(new RegExp(`fill="url\\(#dg-${part}-`))
      expect(svg, s.id).toContain('hd-eye-shine')
      expect(svg, s.id).toContain('dragon-shadow')
    }
  })

  it('gives every stage the moving parts: idle group, tail, both wings, gaze and a head that carries its lids', () => {
    for (const s of STAGES.slice(1)) {
      const svg = drawLook({ stage: s.id, progress: 0, look: 'wisdom', wearing: OUTFIT }).svg
      for (const cls of ['class="dragon-idle"', 'class="dragon-tail"', 'class="dg-wing dg-l"', 'class="dg-wing dg-r"', 'class="dragon-gaze"', 'dragon-head dg-head-move'])
        expect(svg, `${s.id} ${cls}`).toContain(cls)
      expect(svg, s.id).toMatch(/style="--head-pivot: 256px \d+px; --wing-l: \d+px \d+px; --wing-r: \d+px \d+px"/)
    }
  })

  it('moves everything worn or drawn on the head with the head, and wing marks with the wings', () => {
    // The hat, glasses, lids and happy twinkles each sit inside a .dg-head-move group.
    const inHeadMove = (svg: string, marker: string) => {
      const at = svg.lastIndexOf('<', svg.indexOf(marker)) // the start of the marker's own tag
      const open = svg.lastIndexOf('dg-head-move', at)
      if (at < 0 || open < 0) return false
      // Inside if the head group (opened just before `open`) is still open at the marker.
      const between = svg.slice(open, at)
      return 1 + between.split('<g').length - 1 > between.split('</g>').length - 1
    }
    for (const s of ['juvenile', 'adult', 'elder']) {
      const wise = drawLook({ stage: s, progress: 0, look: 'wisdom', wearing: OUTFIT }).svg
      for (const m of ['data-worn="crown"', 'look-glasses', 'mood-sleepy mood-lid', 'mood-lid-fill', 'mood-twinkle']) expect(inHeadMove(wise, m), `${s} ${m}`).toBe(true)
      expect(inHeadMove(drawLook({ stage: s, progress: 0, look: 'heart' }).svg, 'lk-flower'), s).toBe(true)
      expect(inHeadMove(drawLook({ stage: s, progress: 0, look: 'discipline' }).svg, 'lk-forehead'), s).toBe(true)
      expect(inHeadMove(drawLook({ stage: s, progress: 0, look: 'strength' }).svg, 'lk-nosehorn'), s).toBe(true)
      // Neck and held items stay with the body.
      expect(inHeadMove(wise, 'data-worn="scarf"'), s).toBe(false)
      expect(wise.match(/<g class="dg-wing dg-[lr]"><path class="lk-wingmark"/g)?.length, s).toBe(4)
    }
  })

  describe('art.css', () => {
    const css = artCss.replace(/\/\*[\s\S]*?\*\//g, '')
    const reducedAt = css.indexOf('@media (prefers-reduced-motion: reduce)')
    /** Top-level and @media rules as [selector, body], skipping @keyframes. */
    const rules = (text: string) => {
      const out: [string, string][] = []
      const re = /([^{}]+)\{([^{}]*)\}/g
      for (const m of text.matchAll(re)) out.push([m[1]!.trim(), m[2]!])
      return out
    }
    const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)]
    const withoutKeyframes = css.replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '')

    it('animates transform and opacity only, so idle life stays cheap on a phone', () => {
      expect(keyframes.length).toBeGreaterThan(10)
      for (const [, name, body] of keyframes) {
        for (const decl of body!.matchAll(/([\w-]+)\s*:/g)) expect(['transform', 'opacity'], `${name}: ${decl[1]}`).toContain(decl[1])
      }
    })

    it('stills every animation under reduced motion', () => {
      expect(reducedAt).toBeGreaterThan(-1)
      const reduced = css.slice(reducedAt, css.indexOf('}', css.indexOf('}', reducedAt) + 1) + 1)
      for (const sel of ['.dragon-svg,', '.dragon-svg *', '.dragon-react']) expect(reduced, sel).toContain(sel)
      // Every class drawn inside a dragon svg is covered by `.dragon-svg *`; the svg itself by `.dragon-svg`.
      const drawn = new Set<string>()
      for (const [, svg] of everyDrawing()) for (const m of svg.matchAll(/class="([^"]+)"/g)) for (const c of m[1]!.split(' ')) drawn.add(c)
      const named = new Set(keyframes.map((k) => k[1]))
      for (const [sel, body] of rules(withoutKeyframes.slice(0, withoutKeyframes.indexOf('@media (prefers-reduced-motion: reduce)')))) {
        const anim = /(?:^|;)\s*animation(?:-name)?\s*:\s*([^;]+)/.exec(body)
        if (!anim || anim[1]!.trim() === 'none') continue
        for (const one of sel.split(',')) {
          const parts = one.trim().split(/\s+/)
          let subject = parts.pop()!
          // An element-only subject (e.g. `.mood-zzz text`) is covered through the class it sits in.
          while (!subject.includes('.') && parts.length) subject = parts.pop()!
          const classes = [...subject.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!)
          const covered = classes.some((c) => drawn.has(c) || /^react-/.test(c) && reduced.includes(`.${c}`)) || subject.includes('.dragon-svg') || subject.includes('.egg')
          expect(covered, `${one.trim()} is animated but not stilled under reduced motion`).toBe(true)
        }
        const name = anim[1]!.trim().split(/\s+/).find((w) => named.has(w))
        if (!/animation-name/.test(anim[0]) || name) expect(name, `${sel}: keyframes defined`).toBeTruthy()
      }
    })
  })
})

describe('head reach (speech keep-clear box)', () => {
  const css = artCss.replace(/\/\*[\s\S]*?\*\//g, '')
  const block = (selector: string) => {
    const i = css.indexOf(`${selector} {`)
    expect(i, selector).toBeGreaterThan(-1)
    return css.slice(i, css.indexOf('}', i))
  }
  const prop = (body: string, name: string) => {
    const m = new RegExp(`--${name}:\\s*(-?[\\d.]+)`).exec(body)
    return m ? Number(m[1]) : undefined
  }
  const keyframe = (name: string) => {
    const m = new RegExp(`@keyframes ${name}\\s*\\{((?:[^{}]*\\{[^{}]*\\})*)\\s*\\}`).exec(css)
    expect(m, name).not.toBeNull()
    return m![1]!
  }
  /** Every `[+-] var(--v) * n` in a keyframe, signed. */
  const coeffs = (name: string, v: string, unit = '') =>
    [...keyframe(name).matchAll(new RegExp(`(?:([+-])\\s*)?var\\(--${v}\\)\\s*\\*\\s*(-?[\\d.]+)${unit}`, 'g'))].map((m) => (m[1] === '-' ? -1 : 1) * Number(m[2]))
  const VARS: Record<string, keyof (typeof MOOD_MOTION)['content']> = {
    'idle-sway': 'sway', 'idle-rock': 'rock', 'idle-bob': 'bob', 'idle-huff': 'huff', hop: 'hop', 'hop-extra': 'hopExtra',
    'ear-flick': 'earFlick', 'ear-droop': 'earDroop', look: 'look', nod: 'nod', snuggle: 'snuggle',
  }

  it('uses the same mood amounts as art.css', () => {
    // The .dragon-svg rule that sets the idle amounts (there are several .dragon-svg rules).
    const base = [...css.matchAll(/(?:^|\})\s*\.dragon-svg\s*\{([^{}]*)\}/g)].map((m) => m[1]!).find((b) => b.includes('--idle-sway:')) ?? ''
    expect(base).toContain('--idle-sway:')
    for (const mood of MOTION_MOODS) {
      const own = mood === 'content' ? '' : block(`.dragon-svg[data-mood='${mood}']`)
      for (const [cssName, key] of Object.entries(VARS)) {
        const v = prop(own, cssName) ?? prop(base, cssName)
        expect(v, `${mood} --${cssName}`).toBe(MOOD_MOTION[mood][key])
      }
    }
  })

  it('covers the largest move in each art.css keyframe', () => {
    const K = KEYFRAMES
    const maxOut = (ns: number[]) => Math.max(0, ...ns.map((n) => -n))
    const maxIn = (ns: number[]) => Math.max(0, ...ns)
    expect(maxOut(coeffs('ear-flick', 'ear-flick', 'deg'))).toBe(K.earFlick.out)
    expect(maxIn(coeffs('ear-flick', 'ear-flick', 'deg'))).toBe(K.earFlick.back)
    expect(maxOut(coeffs('ear-droop', 'ear-droop', 'deg'))).toBe(K.earDroop.sag)
    expect(Math.min(...coeffs('ear-droop', 'ear-droop', 'deg').map(Math.abs))).toBe(K.earDroop.rest)
    expect(maxOut(coeffs('head-look', 'look', 'deg'))).toBe(K.headLook.left)
    expect(maxIn(coeffs('head-look', 'look', 'deg'))).toBe(K.headLook.right)
    expect(maxIn(coeffs('head-nod', 'nod', 'px'))).toBe(K.headNod.down)
    expect(maxOut(coeffs('head-nod', 'nod', 'px'))).toBe(K.headNod.up)
    expect(maxIn(coeffs('head-nod', 'nod', 'deg'))).toBe(K.headNod.turn)
    expect(maxOut(coeffs('head-nod', 'nod', 'deg'))).toBe(0)
    expect(maxIn(coeffs('head-snuggle', 'snuggle', 'deg'))).toBe(K.headSnuggle.turn)
    expect(maxOut(coeffs('head-snuggle', 'snuggle', 'deg'))).toBe(K.headSnuggle.back)
    for (const v of ['hop', 'hop-extra']) {
      expect(maxOut(coeffs('idle-hop', v, 'px')), v).toBe(K.idleHop.lift)
      const scales = coeffs('idle-hop', v).filter((n) => Math.abs(n) < 1)
      expect(Math.max(K.idleHop.wide, K.idleHop.tall), v).toBeGreaterThanOrEqual(maxIn(scales))
      expect(K.idleHop.short, v).toBeGreaterThanOrEqual(maxOut(scales))
    }
    const huff = coeffs('idle-huff', 'idle-huff')
    expect(Math.max(K.idleHuff.wide, K.idleHuff.tall)).toBeGreaterThanOrEqual(maxIn(huff))
    expect(K.idleHuff.short).toBeGreaterThanOrEqual(maxOut(huff))
    // The sway and rock are plain angles, times one; the bob a plain length.
    expect(coeffs('idle-sway', 'idle-sway').length + keyframe('idle-sway').split('var(--idle-sway)').length - 1).toBeGreaterThan(0)
    expect(keyframe('idle-sway')).not.toMatch(/var\(--idle-sway\)\s*\*\s*-?(?!1\))[\d.]+/)
    expect(keyframe('idle-rock')).not.toMatch(/var\(--idle-(rock|bob)\)\s*\*\s*-?(?!1\))[\d.]+/)
    expect(keyframe('hatchling-breathe')).toContain(`translateY(-${K.breathe.lift}px) scale(${1 + K.breathe.wide}, ${1 - K.breathe.short})`)
    // The perk-up: exactly these numbers, with no overshooting easing.
    const P = KEYFRAMES.reactPerk
    expect(keyframe('react-perk')).toContain(`translateY(-${P.liftPercent}%) scale(${1 - P.narrow}, ${1 + P.tall})`)
    expect(keyframe('react-perk')).toContain(`scale(${1 + P.wide}, ${1 - P.short})`)
    expect(block('.react-perk')).toMatch(/react-perk 600ms ease-in-out/)
    expect(block('.dragon-react')).toContain('transform-origin: 50% 90%')
    // 1% of a box up to 1.4 times taller than the square drawing is within PERK_LIFT units.
    expect(0.01 * 1.4 * 512).toBeLessThanOrEqual(PERK_LIFT)
    // The origin, 90% down a box from square to 1.4 times taller than wide, in drawing units.
    for (const ratio of [1, 1.4]) {
      const y = (0.9 * ratio - (ratio - 1) / 2) * 512
      expect(y).toBeGreaterThanOrEqual(PERK_ORIGINS_Y[0]! - 1)
      expect(y).toBeLessThanOrEqual(PERK_ORIGINS_Y[1]! + 1)
    }
    // The ears turn about their root, the body about the ground.
    expect(block('.dg-ear.dg-l')).toContain('transform-origin: 100% 100%')
    expect(block('.dg-ear.dg-r')).toContain('transform-origin: 0% 100%')
    expect(block('.dragon-idle')).toContain(`transform-origin: ${GROUND[0]}px ${GROUND[1]}px`)
    expect(block('.dragon-body')).toContain(`transform-origin: ${GROUND[0]}px ${GROUND[1]}px`)
  })

  const STAGE_DRAW: Record<string, [Anchors, () => string]> = {
    hatchling: [HATCHLING, () => hatchlingSvg('t')],
    whelp: [WHELP, () => whelpSvg('t')],
    juvenile: [JUVENILE, () => juvenileSvg('t')],
    adult: [ADULT, () => adultSvg('t')],
    elder: [ELDER, () => elderSvg('t')],
  }
  const input = (a: Anchors, svg: string): HeadMotionInput => ({ rest: a.headBox, parts: shapeBoxes(headGroup(svg), ['dg-ear']), ear: a.ear, neckY: a.neckY })
  const contains = (outer: Box, inner: Box) => outer[0] <= inner[0] && outer[1] <= inner[1] && outer[2] >= inner[2] && outer[3] >= inner[3]
  const rot = ([x, y]: readonly [number, number], [cx, cy]: readonly [number, number], deg: number) => {
    const a = (deg * Math.PI) / 180
    return [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)] as const
  }

  it('finds the shapes on the head', () => {
    const svg = juvenileSvg('t')
    const head = headGroup(svg)
    expect(head.startsWith('<g class="dragon-head')).toBe(true)
    expect(head).toContain('hd-mouth')
    expect(head).not.toContain('dragon-tail')
    const boxes = shapeBoxes(head, ['dg-ear'])
    // The head ellipse, cx 256 cy 172 rx 100 ry 86; a horn's control points; no ears.
    expect(boxes).toContainEqual([156, 86, 356, 258])
    expect(boxes).toContainEqual(pathBox('M194 112 C168 66 176 28 210 12 C204 48 210 78 226 100 Z'))
    expect(boxes).not.toContainEqual(pathBox(JUVENILE.ear!))
    expect(boxes.flat().every(Number.isFinite)).toBe(true)
  })

  it('covers the head at rest, and the fully drooped ears, nodding, when sleepy', () => {
    for (const [stage, [a, draw]] of Object.entries(STAGE_DRAW)) {
      const inp = input(a, draw())
      for (const mood of MOTION_MOODS) {
        const reach = headReach(inp, MOOD_MOTION[mood])
        expect(contains(reach, a.headBox), `${stage} ${mood}`).toBe(true)
        expect(reach.every(Number.isFinite), `${stage} ${mood}`).toBe(true)
      }
      const sleepy = headReach(inp, MOOD_MOTION.sleepy)
      expect(sleepy[3], stage).toBeGreaterThanOrEqual(Math.max(...inp.parts.map((b) => b[3])) + KEYFRAMES.headNod.down)
      if (!a.ear) continue
      // Each ear's outer corners sagged to the full droop, on a head turned by the nod.
      const e = pathBox(a.ear)
      for (const corner of [[e[0], e[1]], [e[0], e[3]]] as const) {
        const [x] = rot(rot(corner, [e[2], e[3]], -KEYFRAMES.earDroop.sag), [256, a.neckY], KEYFRAMES.headNod.turn)
        expect(sleepy[0], stage).toBeLessThanOrEqual(x)
        expect(sleepy[2], stage).toBeGreaterThanOrEqual(512 - x)
      }
    }
  })

  it('covers the welcome perk-up on top of the idle motion, in every mood', () => {
    const inp = input(WHELP, whelpSvg('t'))
    const top = Math.min(...inp.parts.map((b) => b[1]))
    const P = KEYFRAMES.reactPerk
    for (const mood of MOTION_MOODS) {
      const reach = headReach(inp, MOOD_MOTION[mood])
      // The top stretched 4% up from the lowest origin, then lifted.
      expect(reach[1], mood).toBeLessThanOrEqual(PERK_ORIGINS_Y[1]! - (PERK_ORIGINS_Y[1]! - top) * (1 + P.tall) - PERK_LIFT)
    }
  })

  it('pivots each ear on points of its outline, so the box of its points is its own box', () => {
    // transform-box: fill-box turns the ear about the corner of its drawn outline; the
    // reach uses the box of the path's points. They agree when the largest x and y are
    // both ends of segments (on the outline), not control points.
    for (const [stage, [a]] of Object.entries(STAGE_DRAW)) {
      if (!a.ear) continue
      const ends: [number, number][] = []
      for (const seg of a.ear.matchAll(/[MLCQ]([^MLCQZ]*)/g)) {
        const n = seg[1]!.trim().split(/[\s,]+/).map(Number)
        ends.push([n[n.length - 2]!, n[n.length - 1]!])
      }
      const box = pathBox(a.ear)
      expect(Math.max(...ends.map((e) => e[0])), stage).toBe(box[2])
      expect(Math.max(...ends.map((e) => e[1])), stage).toBe(box[3])
    }
  })

  it('understands every shape on every head (no shape it skips, no turned groups)', () => {
    const looks: EvolutionLook[] = ['neutral', 'strength', 'discipline', 'wisdom', 'heart']
    for (const stage of ['hatchling', 'whelp', 'juvenile', 'adult', 'elder'])
      for (const look of looks) {
        const head = headGroup(drawLook({ stage, progress: 0, look, wearing: { head: 'crown', neck: 'scarf', held: 'teddy' } }).svg)
        expect(head, stage).not.toBe('')
        const tags = [...head.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)]
        for (const [, tag, attrs] of tags) {
          expect(['g', 'ellipse', 'circle', 'path'], `${stage}/${look}: <${tag}>`).toContain(tag)
          if (tag === 'g') expect(attrs, `${stage}/${look}: a turned group`).not.toMatch(/\btransform=/)
          // Only the soft shines (which sit inside the skin) carry their own turn.
          if (/\btransform=/.test(attrs!)) expect(attrs, `${stage}/${look}`).toContain('hd-shine')
        }
        const drawable = tags.filter(([, t]) => t !== 'g').length
        const skipped = tags.filter(([, t, at]) => t !== 'g' && (/\btransform=/.test(at!) || /dg-ear/.test(at!))).length
        expect(shapeBoxes(head, ['dg-ear']).length, `${stage}/${look}`).toBe(drawable - skipped)
      }
  })

  it('lifts the top for a happy hop and for the head tilt', () => {
    const inp = input(JUVENILE, juvenileSvg('t'))
    const top = Math.min(...inp.parts.map((b) => b[1]))
    const happy = headReach(inp, MOOD_MOTION.happy)
    expect(happy[1]).toBeLessThanOrEqual(top - KEYFRAMES.idleHop.lift - MOOD_MOTION.happy.bob - KEYFRAMES.breathe.lift)
    // A tilt lifts a shape's top corner by its distance from the neck's centre line times sin(angle).
    const content = headReach(inp, MOOD_MOTION.content)
    const horn = pathBox('M194 112 C168 66 176 28 210 12 C204 48 210 78 226 100 Z')
    const [, y] = rot([horn[2], horn[1]], [256, JUVENILE.neckY], -KEYFRAMES.headLook.left)
    expect(content[1]).toBeLessThanOrEqual(Math.min(y, mirrorY(horn, JUVENILE.neckY)))
  })
  const mirrorY = (b: Box, neckY: number) => rot([512 - b[0], b[1]], [256, neckY], KEYFRAMES.headLook.right)[1]

  it('draws a box for each mood on the svg, content first', () => {
    const svg = juvenileSvg('t', 'neutral')
    for (const mood of MOTION_MOODS) {
      const m = new RegExp(`data-box-${mood}="(-?[\\d.]+) (-?[\\d.]+) ([\\d.]+) ([\\d.]+)"`).exec(svg)
      expect(m, mood).not.toBeNull()
      expect(m!.slice(1).map(Number).every(Number.isFinite), mood).toBe(true)
    }
    expect(svg).not.toMatch(/NaN|undefined/)
    const content = /data-box-content="([^"]+)"/.exec(svg)![1]!.split(' ')
    expect(svg).toContain(`x="${content[0]}" y="${content[1]}" width="${content[2]}" height="${content[3]}"`)
  })
})

describe('the secret-wish burst', () => {
  it('is decorative twinkles at their own angles, untappable, and still under reduced motion', () => {
    const html = wishBurstHtml()
    expect(html).toMatch(/^<div class="wish-burst" aria-hidden="true">/)
    expect(html.match(/class="wish-spark"/g)).toHaveLength(WISH_BURST_SPARKS)
    expect(new Set(html.match(/--a:\d+deg/g)).size).toBe(WISH_BURST_SPARKS)
    expect(artCss).toMatch(/\.wish-burst \{[^}]*pointer-events: none/)
    expect(artCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.wish-spark \{\s*animation: none/)
  })

  it('the sparkle button inside is a decorative golden twinkle in a bubble that keeps still under reduced motion', () => {
    const html = wishSparkleHtml()
    expect(html).toMatch(/^<span class="wish-sparkle-bubble" aria-hidden="true">/)
    expect(html).toContain('class="wish-sparkle-big"')
    expect(html).not.toMatch(/NaN|\d\.\d{3}/)
    expect(artCss).toMatch(/\.wish-sparkle-bubble path \{[^}]*fill: var\(--twinkle\)/)
    expect(artCss).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.wish-sparkle-big,\s*\.wish-sparkle-small \{\s*animation: none/)
  })
})
