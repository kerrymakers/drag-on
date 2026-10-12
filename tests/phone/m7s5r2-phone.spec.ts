// Round 2 phone-tester checks for M7 slice 5 (scene behind the dragon on Home, speech bubble
// placement from motion-derived keep-clear boxes, egg bubble across the egg's base).
// Screenshots: tests/screenshots/m7s5r2-phone-*
import { test, expect, settle, type Page } from '../e2e/fixtures'
import * as fs from 'node:fs'
import { ITEMS } from '../../src/config/items'
import { STAGES } from '../../src/config/stages'
import { MOODS } from '../../src/config/mood'
import { SCENE } from '../../src/config/scene'
import { sunOn } from '../../src/game/scene'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = 'm7s5r2-phone'
const DAY = 86_400_000
type Sky = 'dawn' | 'day' | 'evening' | 'night'
const SKIES: readonly Sky[] = ['dawn', 'day', 'evening', 'night']
// 13 October's sun, blended between the mid-month rows (game/scene.ts), in GMT minutes.
const OCT = sunOn(2026, 10, 13, SCENE.sun)!
const RISE = Math.ceil(OCT.rise) + 60
const SET = Math.ceil(OCT.set) + 60
const T = SCENE.twilightMinutes
const pad = (n: number) => String(n).padStart(2, '0')
const at = (m: number) => new Date(`2026-10-13T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00+01:00`)
const TIME: Record<Sky, Date> = { dawn: at(RISE), day: at(12 * 60), evening: at(SET), night: at(22 * 60) }

const OUTFITS = [
  { head: 'sunhat', neck: 'garland', held: 'teddy' },
  { head: 'crown', neck: 'scarf', held: 'balloon' },
  { head: 'partyhat', neck: 'bell', held: 'lantern' },
  { head: 'crown', neck: 'garland', held: 'lantern' },
]
const LOOK_TASK = { neutral: 'gym', strength: 'gym', discipline: 'avoided', wisdom: 'read', heart: 'selfcare' } as const
const from = (s: string) => STAGES.find((x) => x.id === s)!.xpFrom
const MOOD_DAYS: Record<string, number> = {
  happy: 0,
  content: MOODS.find((m) => m.id === 'content')!.fromDays,
  sleepy: MOODS.find((m) => m.id === 'sleepy')!.fromDays,
  grumpy: MOODS.find((m) => m.id === 'grumpy')!.fromDays + 1,
}
const MOOD_SKY: Record<string, Sky> = { happy: 'dawn', content: 'day', sleepy: 'evening', grumpy: 'night' }
const STAGE_LOOKS = [
  { stage: 'egg', look: 'neutral' },
  { stage: 'hatchling', look: 'neutral' },
  { stage: 'whelp', look: 'neutral' },
  { stage: 'juvenile', look: 'strength' },
  { stage: 'juvenile', look: 'heart' },
  { stage: 'adult', look: 'discipline' },
  { stage: 'adult', look: 'wisdom' },
  { stage: 'elder', look: 'heart' },
  { stage: 'elder', look: 'strength' },
]

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

/** Keeps the bubble up while we measure: the 4 s / 8 s hush timers never fire. */
async function holdSpeech(page: Page) {
  await page.addInitScript(() => {
    const st = window.setTimeout.bind(window)
    ;(window as unknown as { setTimeout: unknown }).setTimeout = (fn: TimerHandler, ms?: number, ...a: unknown[]) =>
      st(fn, ms === 4000 || ms === 8000 ? 1e9 : ms, ...a)
  })
}

/** No lastBackupAt, so happy/content dragons get the backup bubble, sleepy/grumpy the welcome. */
function data(now: Date, { stage, look, mood, outfit, backup = false }: { stage: string; look: string; mood: string; outfit?: object; backup?: boolean }) {
  const last = now.getTime() - MOOD_DAYS[mood] * DAY - 60 * 60_000
  const events: object[] = []
  const xp = stage === 'egg' ? 20 : from(stage) + 10
  const taskId = LOOK_TASK[look as keyof typeof LOOK_TASK]
  events.push({ id: 'xp', type: 'log', taskId, timestamp: last - 20 * DAY, xpAwarded: xp, ...(stage !== 'egg' ? { stageReached: stage } : {}) })
  ITEMS.forEach((it, k) =>
    events.push({ id: `f${k}`, type: 'log', taskId: 'avoided', timestamp: last - 20 * DAY + (k + 1) * 1000, xpAwarded: 0, reward: { kind: 'item', itemId: it.id } }),
  )
  events.push({ id: 'y', type: 'log', taskId, timestamp: last - DAY, xpAwarded: 0 })
  events.push({ id: 'last', type: 'log', taskId, timestamp: last, xpAwarded: 0 })
  return { schemaVersion: 1, events, settings: { ...(backup ? { lastBackupAt: now.getTime() } : {}), ...(outfit ? { wearing: outfit } : {}) } }
}

async function open(page: Page, now: Date, d: object, install = false) {
  if (install) await page.clock.install({ time: now })
  else await page.clock.setFixedTime(now)
  await page.goto('./')
  await page.evaluate((d) => {
    localStorage.clear()
    localStorage.setItem('drag-on:v1', JSON.stringify(d))
  }, d)
  await page.reload()
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
}

type R = { l: number; t: number; r: number; b: number }

/**
 * Freezes the dragon's motion and steps through poses (shared clock, then random
 * phases per animation, then with the perk reaction), measuring the bubble against the
 * eyes and the head. Leaves the dragon at rest after.
 */
async function bubbleProbe(page: Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector<HTMLElement>('#dragon-art > .dragon-react')!
    const svg = wrap.querySelector('svg')!
    const bubble = document.querySelector<HTMLElement>('#speech')!
    const bb = bubble.getBoundingClientRect()
    const tail = bubble.dataset.tail
    const b: R = { l: bb.left - (tail === 'left' ? 6 : 0), t: bb.top - (tail === 'up' ? 6 : 0), r: bb.right + (tail === 'right' ? 6 : 0), b: bb.bottom + (tail === 'down' ? 6 : 0) }
    const shown = (e: Element) => {
      for (let p: Element | null = e; p && p !== svg; p = p.parentElement) {
        const cs = getComputedStyle(p)
        if (cs.display === 'none' || cs.visibility === 'hidden') return false
        if (p.classList.contains('mood-part') && Number(cs.opacity) < 0.05) return false
      }
      return true
    }
    const isEgg = svg.classList.contains('egg')
    const eyeEls = [...svg.querySelectorAll(isEgg ? '.hd-eye' : '.dragon-eyes *, .mood-lid, .mood-lid-fill')].filter(
      (e) => e instanceof SVGGeometryElement && shown(e),
    ) as SVGGraphicsElement[]
    const headEls = [...svg.querySelectorAll(isEgg ? '.hd-eye, .hd-cheek' : '.dragon-head *')].filter((e) => e instanceof SVGGeometryElement && shown(e) && !e.closest('[data-worn]')) as SVGGraphicsElement[]
    const union = (els: Element[]): R | null => {
      const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0)
      if (!rs.length) return null
      return { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) }
    }
    // Overlap counted per shape, so a hollow union doesn't count.
    // Painted pixels (fill or stroke) of these shapes under the bubble, sampled on a 1px grid.
    const hits = new Set<string>()
    const pt = svg.createSVGPoint()
    const ov = (els: SVGGraphicsElement[]) => {
      const cand = els
        .map((e) => ({ e, r: e.getBoundingClientRect() }))
        .filter(({ r }) => r.left < b.r && b.l < r.right && r.top < b.b && b.t < r.bottom)
        .map(({ e, r }) => {
          const cs = getComputedStyle(e)
          return { e: e as SVGGeometryElement, r, inv: e.getScreenCTM()!.inverse(), fill: cs.fill !== 'none', stroke: cs.stroke !== 'none' }
        })
      if (!cand.length) return 0
      const done = new Set<string>()
      for (const c of cand) {
        const x0 = Math.max(b.l, c.r.left), x1 = Math.min(b.r, c.r.right), y0 = Math.max(b.t, c.r.top), y1 = Math.min(b.b, c.r.bottom)
        for (let y = Math.floor(y0) + 0.5; y < y1; y += 1)
          for (let x = Math.floor(x0) + 0.5; x < x1; x += 1) {
            const k = `${x},${y}`
            if (done.has(k)) continue
            pt.x = x
            pt.y = y
            const lp = pt.matrixTransform(c.inv)
            if ((c.fill && c.e.isPointInFill(lp)) || (c.stroke && c.e.isPointInStroke(lp))) {
              done.add(k)
              hits.add(`${c.e.tagName}.${c.e.getAttribute('class') ?? ''}<${(c.e.parentElement?.getAttribute('class') ?? '').slice(0, 30)}`)
            }
          }
      }
      return done.size
    }
    const gap = (u: R | null) => {
      if (!u) return null
      const dx = Math.max(u.l - b.r, b.l - u.r, 0)
      const dy = Math.max(u.t - b.b, b.t - u.b, 0)
      return Math.round(Math.hypot(dx, dy) * 10) / 10
    }
    let eyes = 0
    let head = 0
    let minEyeGap = 1e9
    let minHeadGap = 1e9
    const sample = () => {
      const near = (els: SVGGraphicsElement[]) => {
        const u = union(els)
        return u && u.l < b.r && b.l < u.r && u.t < b.b && b.t < u.b
      }
      if (near(eyeEls)) eyes = Math.max(eyes, ov(eyeEls))
      if (near(headEls)) head = Math.max(head, ov(headEls))
      const eg = gap(union(eyeEls))
      const hg = gap(union(headEls))
      if (eg !== null) minEyeGap = Math.min(minEyeGap, eg)
      if (hg !== null) minHeadGap = Math.min(minHeadGap, hg)
    }
    const run = (react: string | null) => {
      wrap.classList.remove('react-log', 'react-treat', 'react-hatch', 'react-tap', 'react-perk')
      if (react) {
        void wrap.offsetWidth
        wrap.classList.add(`react-${react}`)
      }
      const anims = document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target
        return t instanceof Element && wrap.contains(t)
      })
      anims.forEach((a) => a.pause())
      const dur = (a: Animation) => {
        const t = a.effect!.getComputedTiming()
        return Number.isFinite(t.endTime as number) ? (t.endTime as number) : (a.effect!.getTiming().duration as number) * 2
      }
      if (react) {
        // Real timeline: every animation at the same time since the reaction started.
        const base = anims.map((a) => (a.currentTime as number) ?? 0)
        const end = Math.max(...anims.filter((a) => Number.isFinite(a.effect!.getComputedTiming().endTime as number)).map((a) => a.effect!.getComputedTiming().endTime as number), 0)
        let worstT = 0
        let worstV = -1
        for (let t = 0; t <= end; t += 10) {
          anims.forEach((a, k) => (a.currentTime = Number.isFinite(a.effect!.getComputedTiming().endTime as number) ? t : base[k] + t))
          const before = head
          head = 0
          sample()
          if (head > worstV) {
            worstV = head
            worstT = t
          }
          head = Math.max(before, head)
        }
        anims.forEach((a, k) => (a.currentTime = Number.isFinite(a.effect!.getComputedTiming().endTime as number) ? worstT : base[k] + worstT))
        ;(window as unknown as { __resume: () => void }).__resume = () => {
          anims.forEach((a) => a.play())
          wrap.classList.remove('react-perk')
        }
        ;(window as unknown as { __worstT: number }).__worstT = worstT
        return
      }
      for (let i = 0; i < 120; i++) {
        anims.forEach((a) => (a.currentTime = (i / 119) * dur(a)))
        sample()
      }
      for (let i = 0; i < 150; i++) {
        anims.forEach((a) => (a.currentTime = Math.random() * dur(a)))
        sample()
      }
      anims.forEach((a) => a.play())
      wrap.classList.remove('react-log', 'react-treat', 'react-hatch', 'react-tap', 'react-perk')
    }
    sample()
    run(null)
    const idle = { eyes, head, hits: [...hits] }
    eyes = 0
    head = 0
    hits.clear()
    run('perk')
    const perk = { eyes, head, hits: [...hits], atMs: (window as unknown as { __worstT: number }).__worstT }
    eyes = Math.max(idle.eyes, perk.eyes)
    head = Math.max(idle.head, perk.head)
    const top = document.querySelector('.top')!.getBoundingClientRect()
    const growth = document.querySelector('.growth')!.getBoundingClientRect()
    const cs = getComputedStyle(bubble)
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.2
    const inner = bubble.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)
    let lower: R | null = null
    const lp = svg.querySelector('.speech-lower-part')
    if (lp) {
      const r = lp.getBoundingClientRect()
      lower = { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }
    }
    const svgR = svg.getBoundingClientRect()
    // Where the tail's tip is, and the head (at rest) it should point at.
    const tailX = bubble.style.getPropertyValue('--tail-x')
    const tipX = tail === 'up' || tail === 'down' ? bb.left + (tailX ? parseFloat(tailX) : bb.width / 2) : tail === 'left' ? bb.left - 6 : bb.right + 6
    const tipY = tail === 'up' ? bb.top - 6 : tail === 'down' ? bb.bottom + 6 : bb.top + 23
    const hu = union(headEls)
    const lip = [...document.querySelectorAll('#scene-front .scene-nest-rim')].find((e) => e.getBoundingClientRect().width > 0)?.getBoundingClientRect()
    return {
      tailX: tailX || null,
      tip: { x: Math.round(tipX), y: Math.round(tipY) },
      headSpan: hu ? { l: Math.round(hu.l), r: Math.round(hu.r), t: Math.round(hu.t), b: Math.round(hu.b) } : null,
      tipOverHead: hu ? tipX >= hu.l - 4 && tipX <= hu.r + 4 : null,
      nestLip: lip ? { t: Math.round(lip.top), b: Math.round(lip.bottom) } : null,
      text: bubble.textContent,
      tail,
      compact: bubble.classList.contains('is-compact'),
      lines: Math.round(inner / lh),
      box: { l: Math.round(b.l), t: Math.round(b.t), r: Math.round(b.r), b: Math.round(b.b) },
      width: Math.round(bb.width),
      eyesOverlapPx2: eyes,
      headOverlapPx2: head,
      minEyeGap: Math.round(minEyeGap * 10) / 10,
      minHeadGap: Math.round(minHeadGap * 10) / 10,
      idle,
      perk,
      overTop: bb.top < top.bottom - 1 && bb.bottom > top.top,
      overGrowth: bb.bottom > growth.top + 1,
      offscreen: bb.left < 0 || bb.right > innerWidth,
      lower,
      art: { t: Math.round(svgR.top), b: Math.round(svgR.bottom) },
    }
  })
}

/** Where the dragon's shadow and lowest painted point sit against the floor's ground. */
async function groundProbe(page: Page) {
  return page.evaluate(() => {
    const svg = document.querySelector('#dragon-art svg')!
    const anims = document.getAnimations().filter((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target
      return t instanceof Element && svg.contains(t)
    })
    anims.forEach((a) => {
      a.pause()
      a.currentTime = 0
    })
    const shadow = svg.querySelector('.dragon-shadow, .egg-shadow')!.getBoundingClientRect()
    const floor = document.querySelector('#scene-floor')!
    const g = [...floor.querySelectorAll('.scene-patch-ground')].find((e) => e.getBoundingClientRect().width > 0)!.getBoundingClientRect()
    const skip = '.dragon-shadow, .egg-shadow, .dragon-head-box, .speech-lower-part, .egg-glow, defs *, [data-worn] *'
    let feet = -1e9
    for (const e of svg.querySelectorAll('path,ellipse,circle,rect,polygon')) {
      if (e.matches(skip) || e.closest('defs')) continue
      const cs = getComputedStyle(e)
      if (cs.display === 'none' || cs.visibility === 'hidden') continue
      let hidden = false
      for (let p: Element | null = e; p && p !== svg; p = p.parentElement) if (p.classList.contains('mood-part') && Number(getComputedStyle(p).opacity) < 0.05) hidden = true
      if (hidden) continue
      const r = e.getBoundingClientRect()
      if (r.width > 0) feet = Math.max(feet, r.bottom)
    }
    anims.forEach((a) => a.play())
    const shadowCy = (shadow.top + shadow.bottom) / 2
    const r1 = (n: number) => Math.round(n * 10) / 10
    return {
      groundTop: r1(g.top),
      groundBottom: r1(g.bottom),
      groundW: r1(g.width),
      shadowCy: r1(shadowCy),
      shadowW: r1(shadow.width),
      shadowInsideGround: shadowCy >= g.top && shadowCy <= g.bottom && shadow.left >= g.left && shadow.right <= g.right,
      feetBottom: r1(feet),
      feetVsGroundCentre: r1(feet - (g.top + g.bottom) / 2),
    }
  })
}

async function sheet(page: Page, name: string, list: { label: string; file: string }[], cols = 4) {
  const html = `<html><body style="margin:0;background:#888;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},1fr);gap:3px">${list
    .map((s) => `<div><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><div style="background:#fff">${s.label}</div></div>`)
    .join('')}</body></html>`
  const p2 = await page.context().newPage()
  await p2.setViewportSize({ width: 1600, height: 900 })
  await p2.setContent(html)
  await p2.screenshot({ path: `${dir}/${PFX}-sheet-${name}.png`, fullPage: true })
  await p2.close()
}

// 1. Every stage/look x mood (with and without an outfit), each mood in its own sky,
// light and dark: bubble vs face, ground vs feet, screenshots.
for (const { stage, look } of STAGE_LOOKS)
  test(`matrix ${stage}/${look}`, async ({ page }, info) => {
    test.setTimeout(600_000)
    const P = info.project.name
    const msgs = collectConsole(page)
    await holdSpeech(page)
    const problems: string[] = []
    const shots: Record<string, { label: string; file: string }[]> = { light: [], dark: [] }
    let o = 0
    for (const mood of ['happy', 'content', 'sleepy', 'grumpy'])
      for (const dressed of stage === 'egg' ? [false] : [false, true]) {
        const outfit = dressed ? OUTFITS[o++ % OUTFITS.length] : undefined
        const sky = MOOD_SKY[mood]
        const now = TIME[sky]
        await page.emulateMedia({ colorScheme: 'light' })
        await open(page, now, data(now, { stage, look, mood, outfit }))
        await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-mood', mood)
        await expect(page.locator('#scene')).toHaveAttribute('data-sky', sky)
        await expect(page.locator('#speech')).toHaveClass(/is-showing/)
        await settle(page)
        const tag = `${P} ${stage}/${look} ${mood} ${dressed ? 'outfit' : 'bare'} ${sky}`
        const sp = await bubbleProbe(page)
        if (sp.perk.head > 0) await page.screenshot({ path: `${dir}/${PFX}-${P}-perkworst-${stage}-${look}-${mood}-${dressed ? 'outfit' : 'bare'}.png`, clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 440 }, scale: 'css' })
        await page.evaluate(() => (window as unknown as { __resume: () => void }).__resume())
        const gr = await groundProbe(page)
        console.log('BUBBLE', tag, JSON.stringify(sp))
        console.log('GROUND', tag, JSON.stringify(gr))
        if (sp.eyesOverlapPx2 > 0) problems.push(`${tag}: bubble over eyes ${sp.eyesOverlapPx2}px2`)
        if (stage !== 'egg' && sp.idle.head > 0) problems.push(`${tag}: bubble over head while idle ${sp.idle.head}px2 ${sp.idle.hits}`)
        if (stage !== 'egg' && sp.perk.head > 0) problems.push(`${tag}: bubble over head during perk-up ${sp.perk.head}px2 ${sp.perk.hits}`)
        if ((sp.tail === 'left' || sp.tail === 'right') && sp.width < 110) problems.push(`${tag}: beside bubble only ${sp.width}px wide, ${sp.lines} lines`)
        if (sp.lines > 5) problems.push(`${tag}: bubble wraps to ${sp.lines} lines (${sp.width}px)`)
        if (stage !== 'egg' && (sp.tail === 'up' || sp.tail === 'down') && sp.tipOverHead === false) problems.push(`${tag}: tail tip x ${sp.tip.x} not under/over head ${JSON.stringify(sp.headSpan)}`)
        if (stage === 'egg' && sp.nestLip && sp.box.b > sp.nestLip.t + 2) problems.push(`${tag}: egg bubble bottom ${sp.box.b} below nest lip top ${sp.nestLip.t}`)
        if (sp.overTop || sp.overGrowth || sp.offscreen) problems.push(`${tag}: bubble over heading/growth/offscreen ${JSON.stringify(sp)}`)
        if (!gr.shadowInsideGround) problems.push(`${tag}: shadow not on ground ${JSON.stringify(gr)}`)
        if (Math.abs(gr.feetVsGroundCentre) > 14) problems.push(`${tag}: feet ${gr.feetVsGroundCentre}px from ground centre`)
        {
          for (const scheme of ['light', 'dark'] as const) {
            await page.emulateMedia({ colorScheme: scheme })
            await settle(page)
            const file = `${dir}/${PFX}-${P}-${scheme}-${stage}-${look}-${mood}-${dressed ? 'outfit' : 'bare'}-${sky}.png`
            await page.screenshot({ path: file, scale: 'css' })
            shots[scheme].push({ label: `${stage} ${look} ${mood} ${dressed ? 'outfit' : 'bare'} ${sky}`, file })
          }
        }
      }
    for (const scheme of ['light', 'dark'] as const) await sheet(page, `${P}-${scheme}-${stage}-${look}`, shots[scheme], 4)
    console.log('PROBLEMS', P, stage, look, JSON.stringify(problems, null, 1))
    expect.soft(problems).toEqual([])
    expect(msgs).toEqual([])
  })

// 2. Every sky, bare hatchling and elder, light and dark, with bubble (closer shots of the dragon area too).
test('skies sheet', async ({ page }, info) => {
  test.setTimeout(300_000)
  const P = info.project.name
  const msgs = collectConsole(page)
  await holdSpeech(page)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    const list: { label: string; file: string }[] = []
    for (const s of [{ stage: 'egg', look: 'neutral' }, { stage: 'hatchling', look: 'neutral' }, { stage: 'elder', look: 'wisdom' }])
      for (const sky of SKIES) {
        const now = TIME[sky]
        await open(page, now, data(now, { stage: s.stage, look: s.look, mood: 'content' }))
        await expect(page.locator('#scene')).toHaveAttribute('data-sky', sky)
        await expect(page.locator('#speech')).toHaveClass(/is-showing/)
        await settle(page)
        const file = `${dir}/${PFX}-${P}-sky-${scheme}-${s.stage}-${sky}.png`
        await page.screenshot({ path: file, scale: 'css' })
        list.push({ label: `${s.stage} ${sky}`, file })
      }
    await sheet(page, `${P}-skies-${scheme}`, list, 4)
  }
  expect(msgs).toEqual([])
})

// 3. Each sky change, live: cross-fade with no layout shift.
for (const [label, start, from, to] of [
  ['night-dawn', RISE - T - 2, 'night', 'dawn'],
  ['dawn-day', RISE + T - 2, 'dawn', 'day'],
  ['day-evening', SET - T - 2, 'day', 'evening'],
  ['evening-night', SET + T - 2, 'evening', 'night'],
] as const)
  test(`sky change ${label}`, async ({ page }, info) => {
    const P = info.project.name
    const msgs = collectConsole(page)
    const now = at(start)
    await open(page, now, data(now, { stage: 'adult', look: 'heart', mood: 'content', outfit: OUTFITS[0], backup: true }), true)
    await expect(page.locator('#scene')).toHaveAttribute('data-sky', from)
    await settle(page)
    await page.evaluate(() => {
      ;(window as unknown as { __cls: number }).__cls = 0
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) (window as unknown as { __cls: number }).__cls += (e as unknown as { value: number }).value
      }).observe({ type: 'layout-shift', buffered: false })
    })
    const rects = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('#home *')]
          .filter((e) => !e.closest('#scene') && !e.closest('svg') && (e as HTMLElement).offsetParent !== null)
          .map((e) => {
            const r = e.getBoundingClientRect()
            return `${e.tagName}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`
          }),
      )
    const before = await rects()
    await page.clock.runFor(3 * 60_000)
    await expect(page.locator('#scene')).toHaveAttribute('data-sky', to)
    const starTrack: string[] = []
    for (const ms of [150, 400, 800, 1200, 1700]) {
      await page.waitForTimeout(ms - (starTrack.length ? [150, 400, 800, 1200, 1700][starTrack.length - 1] : 0))
      starTrack.push(
        await page.evaluate(() => {
          const night = Number(getComputedStyle(document.querySelector('#scene .scene-sky.scene-for-night')!).opacity)
          const st = document.querySelector('#scene .scene-star')!
          const tw = st.querySelector('.scene-star-twinkle')!
          return `night=${night.toFixed(2)} star=${Number(getComputedStyle(st).opacity).toFixed(2)}*tw${Number(getComputedStyle(tw).opacity).toFixed(2)}`
        }),
      )
      if (starTrack.length === 2) await page.screenshot({ path: `${dir}/${PFX}-${page.viewportSize()!.width}-fade-early-${label}.png`, scale: 'css' })
    }
    console.log('STARS', P, label, JSON.stringify(starTrack))
    const mid = await page.evaluate(() => ({
      skies: [...document.querySelectorAll('#scene .scene-sky')].map((e) => `${e.className.split(' ').pop()}=${Number(getComputedStyle(e).opacity).toFixed(2)}`),
      stars: [...document.querySelectorAll('#scene .scene-star')].slice(0, 3).map((e) => Number(getComputedStyle(e).opacity).toFixed(2)),
      clouds: [...document.querySelectorAll('#scene .scene-cloud')].map((e) => Number(getComputedStyle(e).opacity).toFixed(2)),
      hill: getComputedStyle(document.querySelector('.scene-hill-near')!).fill,
    }))
    await page.screenshot({ path: `${dir}/${PFX}-${P}-fade-mid-${label}.png`, scale: 'css' })
    const midRects = await rects()
    await settle(page)
    const after = await rects()
    const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls)
    const moved = after.filter((x, i) => x !== before[i])
    const movedMid = midRects.filter((x, i) => x !== before[i])
    console.log('FADE', P, label, JSON.stringify({ mid, cls, moved, movedMid, n: before.length }))
    await page.screenshot({ path: `${dir}/${PFX}-${P}-fade-after-${label}.png`, scale: 'css' })
    expect(before.length).toBe(after.length)
    expect(moved).toEqual([])
    expect(movedMid).toEqual([])
    expect(cls).toBe(0)
    expect(msgs).toEqual([])
  })

// 4. Reduced motion: nothing runs on Home in any sky; frames identical; sky change under reduced motion.
test('reduced motion: Home stands still in every sky', async ({ page }, info) => {
  test.setTimeout(180_000)
  const P = info.project.name
  const msgs = collectConsole(page)
  await holdSpeech(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const out: string[] = []
  for (const sky of SKIES)
    for (const s of [{ stage: 'egg', look: 'neutral', mood: 'happy' }, { stage: 'juvenile', look: 'wisdom', mood: 'sleepy' }, { stage: 'elder', look: 'heart', mood: 'happy' }]) {
      const now = TIME[sky]
      await open(page, now, data(now, { ...s, outfit: s.stage === 'egg' ? undefined : OUTFITS[1] }))
      await page.waitForTimeout(600)
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === 'running')
          .map((a) => `${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty}@${((a.effect as KeyframeEffect).target as Element)?.className}`),
      )
      if (running.length) out.push(`${sky} ${s.stage}: running ${running.join(', ')}`)
      const a = await page.screenshot()
      await page.waitForTimeout(1500)
      const b = await page.screenshot()
      if (!a.equals(b)) out.push(`${sky} ${s.stage}: pixels changed over 1.5s`)
    }
  await page.screenshot({ path: `${dir}/${PFX}-${P}-reduced-night-elder.png`, scale: 'css' })
  // A sky change under reduced motion.
  await open(page, at(SET - T - 2), data(at(SET - T - 2), { stage: 'hatchling', look: 'neutral', mood: 'content', backup: true }), true)
  await page.clock.runFor(3 * 60_000)
  await expect(page.locator('#scene')).toHaveAttribute('data-sky', 'evening')
  const fade = await page.evaluate(() =>
    document
      .getAnimations()
      .filter((a) => a.playState === 'running')
      .map((a) => `${(a as CSSTransition).transitionProperty ?? (a as CSSAnimation).animationName}`),
  )
  console.log('REDUCED', P, JSON.stringify(out), 'on sky change running:', JSON.stringify(fade))
  expect(out).toEqual([])
  expect(msgs).toEqual([])
})

// 5. Tap targets, task buttons in the lower half, one-tap logging with feedback, persistence.
test('tap targets and one-tap logging', async ({ page }, info) => {
  const P = info.project.name
  const msgs = collectConsole(page)
  for (const sky of ['day', 'night'] as Sky[]) {
    const now = TIME[sky]
    await open(page, now, data(now, { stage: 'whelp', look: 'neutral', mood: 'content', outfit: OUTFITS[2] }))
    await expect(page.locator('#speech')).toHaveClass(/is-showing/)
    await settle(page)
    const vp = page.viewportSize()!
    const small = await page.evaluate(() =>
      [...document.querySelectorAll('#home button, #home a, #home [role=button], #home input, #home select, nav a, nav button, .tabbar a')]
        .filter((e) => (e as HTMLElement).offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
        .map((e) => {
          const r = e.getBoundingClientRect()
          // The real hit area: scan out from the centre until elementFromPoint stops landing on it.
          const cx = (r.left + r.right) / 2
          const cy = (r.top + r.bottom) / 2
          const on = (x: number, y: number) => {
            const h = document.elementFromPoint(x, y)
            return !!h && (h === e || e.contains(h))
          }
          let t = cy, b = cy, l = cx, rr = cx
          while (t > 0 && on(cx, t - 0.5)) t -= 0.5
          while (b < innerHeight && on(cx, b + 0.5)) b += 0.5
          while (l > 0 && on(l - 0.5, cy)) l -= 0.5
          while (rr < innerWidth && on(rr + 0.5, cy)) rr += 0.5
          return { what: `${e.tagName}.${e.className} "${(e.textContent ?? '').trim().slice(0, 24)}"`, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, hitW: rr - l, hitH: b - t }
        }),
    )
    console.log('TARGETS', P, sky, JSON.stringify(small))
    for (const s of small) expect.soft(Math.min(Math.max(s.w, s.hitW), Math.max(s.h, s.hitH)), s.what).toBeGreaterThanOrEqual(44)
    const tasks = await page.locator('#task-list button.task').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()))
    console.log('TASKS', P, sky, JSON.stringify(tasks.map((t) => [Math.round(t.top), Math.round(t.height)])), 'vp', vp.height)
    expect((tasks[0].top + tasks.at(-1).bottom) / 2).toBeGreaterThanOrEqual(vp.height / 2)
  }
  const xp0 = Number(await page.locator('#xp-total').textContent())
  const btn = page.locator('#task-list button.task:not([disabled])').first()
  await btn.tap()
  await page.waitForTimeout(250)
  await page.screenshot({ path: `${dir}/${PFX}-${P}-log-feedback.png`, scale: 'css' })
  await expect.poll(async () => Number(await page.locator('#xp-total').textContent())).toBeGreaterThan(xp0)
  const fb = await page.evaluate(() => ({
    react: document.querySelector('#dragon-art > .dragon-react')!.className,
    toast: [...document.querySelectorAll('.toast, .float, [class*=float], [class*=toast]')].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.className),
  }))
  console.log('LOGFB', P, JSON.stringify(fb))
  const xp1 = Number(await page.locator('#xp-total').textContent())
  await page.reload()
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
  expect(Number(await page.locator('#xp-total').textContent())).toBe(xp1)
  expect(msgs).toEqual([])
})

// 6. Offline: load, go offline, reload, log, reload; the scene still draws.
test('offline: log survives reload, scene draws', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const P = info.project.name
  const msgs = collectConsole(page)
  await page.clock.setFixedTime(TIME.evening)
  await page.goto('./')
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
  await expect(page.locator('#scene')).toHaveAttribute('data-sky', 'evening')
  const xp0 = Number(await page.locator('#xp-total').textContent())
  await page.locator('#task-list button.task:not([disabled])').first().tap()
  await expect.poll(async () => Number(await page.locator('#xp-total').textContent())).toBeGreaterThan(xp0)
  const xp1 = Number(await page.locator('#xp-total').textContent())
  await page.reload()
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
  expect(Number(await page.locator('#xp-total').textContent())).toBe(xp1)
  await settle(page)
  await page.screenshot({ path: `${dir}/${PFX}-${P}-offline-after-reload.png`, scale: 'css' })
  await context.setOffline(false)
  expect(msgs.filter((m) => !/ERR_INTERNET_DISCONNECTED/.test(m))).toEqual([])
})

// 7. Animation cost on Home with 4x CPU throttling, with and without the scene.
for (const sky of ['day', 'night'] as Sky[])
  for (const sceneOn of [true, false])
    test(`perf ${sky} scene ${sceneOn ? 'on' : 'off'}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'pixel10pro')
      test.setTimeout(120_000)
      const now = TIME[sky]
      await open(page, now, data(now, { stage: 'elder', look: 'heart', mood: 'happy', outfit: OUTFITS[0], backup: true }))
      if (!sceneOn) await page.addStyleTag({ content: '#scene, #scene-floor { display: none !important; }' })
      await settle(page)
      await page.waitForTimeout(1500)
      const cdp = await page.context().newCDPSession(page)
      await cdp.send('Performance.enable')
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
      const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' })
      const frames = await page.evaluate(
        () =>
          new Promise<number[]>((res) => {
            const ts: number[] = []
            const start = performance.now()
            const f = (t: number) => {
              ts.push(t)
              if (t - start < 5000) requestAnimationFrame(f)
              else res(ts.slice(1).map((x, i) => x - ts[i]))
            }
            requestAnimationFrame(f)
          }),
      )
      const done = new Promise<string>((res) => cdp.once('Tracing.tracingComplete', (e) => res(e.stream!)))
      await cdp.send('Tracing.end')
      const stream = await done
      let raw = ''
      for (;;) {
        const r = await cdp.send('IO.read', { handle: stream })
        raw += r.base64Encoded ? Buffer.from(r.data, 'base64').toString() : r.data
        if (r.eof) break
      }
      const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]))
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })
      const parsed = JSON.parse(raw)
      const events = (parsed.traceEvents ?? parsed) as { name: string; dur?: number; ph: string }[]
      const sum: Record<string, number> = {}
      for (const e of events)
        if (e.ph === 'X' && e.dur && ['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'RasterTask'].includes(e.name))
          sum[e.name] = Math.round(((sum[e.name] ?? 0) + e.dur / 1000) * 10) / 10
      const sorted = [...frames].sort((a, b) => a - b)
      const pct = (p: number) => Math.round(sorted[Math.floor(sorted.length * p)] * 10) / 10
      const res = {
        frames: frames.length,
        p50: pct(0.5),
        p95: pct(0.95),
        max: Math.round(sorted[sorted.length - 1] * 10) / 10,
        over25ms: frames.filter((f) => f > 25).length,
        taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
        styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
        layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
        traceMs: sum,
      }
      console.log('PERF', sky, sceneOn ? 'scene-on' : 'scene-off', JSON.stringify(res))
    })

// 8. Tapping the dragon fades the bubble before the tap bounce: plain welcome bubble and
// the tappable backup bubble; tapping the backup bubble itself still opens Settings.
for (const kind of ['welcome', 'backup'] as const)
  for (const stage of ['egg', 'hatchling', 'elder'])
    test(`tap dragon closes ${kind} bubble (${stage})`, async ({ page }, info) => {
      const P = info.project.name
      const msgs = collectConsole(page)
      await holdSpeech(page)
      const mood = kind === 'welcome' ? 'sleepy' : 'content'
      const now = TIME.day
      await open(page, now, data(now, { stage, look: 'heart', mood, backup: kind === 'welcome' }))
      await expect(page.locator('#speech')).toHaveClass(/is-showing/)
      if (kind === 'backup') await expect(page.locator('#speech')).toHaveClass(/is-tappable/)
      await settle(page)
      const art = (await page.locator('#dragon-art .dragon-svg').boundingBox())!
      const sp = (await page.locator('#speech').boundingBox())!
      // Tap low on the body, away from the bubble.
      let ty = art.y + art.height * 0.8
      if (ty > sp.y - 4 && ty < sp.y + sp.height + 4) ty = sp.y + sp.height + 10 < art.y + art.height ? sp.y + sp.height + 10 : sp.y - 10
      await page.touchscreen.tap(art.x + art.width / 2, ty)
      const track: { t: number; bubble: number; react: string; wrapTf: string; overHead: number }[] = []
      const t0 = Date.now()
      for (let i = 0; i < 12; i++) {
        track.push(
          await page.evaluate(() => {
            const b = document.querySelector('#speech')!
            const wrap = document.querySelector('#dragon-art > .dragon-react')!
            const br = b.getBoundingClientRect()
            const op = Number(getComputedStyle(b).opacity)
            let over = 0
            for (const e of wrap.querySelectorAll('.dragon-head *, .hd-eye')) {
              const r = e.getBoundingClientRect()
              const w = Math.min(r.right, br.right) - Math.max(r.left, br.left)
              const h = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top)
              if (w > 0 && h > 0 && op > 0.3) over += w * h
            }
            return { t: 0, bubble: Math.round(op * 100) / 100, react: wrap.className, wrapTf: getComputedStyle(wrap).transform, overHead: Math.round(over) }
          }),
        )
        track[track.length - 1].t = Date.now() - t0
        if (i === 2) await page.screenshot({ path: `${dir}/${PFX}-${P}-tapclose-${kind}-${stage}-mid.png`, clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 460 }, scale: 'css' })
        await page.waitForTimeout(50)
      }
      await settle(page)
      const after = await page.evaluate(() => ({
        cls: document.querySelector('#speech')!.className,
        opacity: getComputedStyle(document.querySelector('#speech')!).opacity,
        btnDisabled: (document.querySelector('#speech .speech-tap') as HTMLButtonElement | null)?.disabled ?? null,
        route: location.hash,
        homeVisible: (document.querySelector('#home') as HTMLElement).offsetParent !== null || !(document.querySelector('#home') as HTMLElement).hidden,
      }))
      console.log('TAPCLOSE', P, kind, stage, JSON.stringify({ track, after }))
      expect(track.some((x) => /react-tap/.test(x.react))).toBe(true)
      expect(after.cls).not.toMatch(/is-showing/)
      expect(Number(after.opacity)).toBe(0)
      expect(after.route).not.toMatch(/settings/)
      if (kind === 'backup') expect(after.btnDisabled).toBe(true)
      // A second tap on the dragon doesn't bring it back or navigate.
      await page.touchscreen.tap(art.x + art.width / 2, ty)
      await settle(page)
      await expect(page.locator('#speech')).not.toHaveClass(/is-showing/)
      expect(msgs).toEqual([])
    })

test('tapping the backup bubble itself still opens Settings', async ({ page }) => {
  const msgs = collectConsole(page)
  await holdSpeech(page)
  const now = TIME.day
  await open(page, now, data(now, { stage: 'hatchling', look: 'neutral', mood: 'content' }))
  await expect(page.locator('#speech')).toHaveClass(/is-tappable/)
  await settle(page)
  await page.locator('#speech .speech-tap').tap()
  await expect(page.locator('#settings-screen')).toBeVisible()
  expect(msgs).toEqual([])
})
