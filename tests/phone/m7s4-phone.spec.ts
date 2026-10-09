// Phone-tester checks for M7 slice 4 (livelier dragon: idle motions, tap reaction, shading).
// Screenshots: tests/screenshots/m7s4-phone-*
import { test, expect, settle, type Page } from '../e2e/fixtures'
import * as fs from 'node:fs'
import { ITEMS } from '../../src/config/items'
import { STAGES } from '../../src/config/stages'
import { MOODS } from '../../src/config/mood'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = 'm7s4-phone'
const NOW = new Date('2026-10-13T10:00:00+01:00')
const DAY = 86_400_000
const OUTFITS = [
  { head: 'sunhat', neck: 'garland', held: 'teddy' },
  { head: 'crown', neck: 'scarf', held: 'balloon' },
  { head: 'partyhat', neck: 'bell', held: 'lantern' },
]
const LOOK_TASK = { neutral: 'gym', strength: 'gym', discipline: 'avoided', wisdom: 'read', heart: 'selfcare' } as const
const from = (s: string) => STAGES.find((x) => x.id === s)!.xpFrom
const MOOD_DAYS: Record<string, number> = {
  happy: 0,
  content: MOODS.find((m) => m.id === 'content')!.fromDays,
  sleepy: MOODS.find((m) => m.id === 'sleepy')!.fromDays,
  grumpy: MOODS.find((m) => m.id === 'grumpy')!.fromDays + 1,
}
const STAGE_LOOKS = [
  { stage: 'egg', look: 'neutral' },
  { stage: 'hatchling', look: 'neutral' },
  { stage: 'whelp', look: 'neutral' },
  ...['juvenile', 'adult', 'elder'].flatMap((stage) => ['strength', 'discipline', 'wisdom', 'heart'].map((look) => ({ stage, look }))),
]

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

function data({ stage, look, mood, outfit }: { stage: string; look: string; mood: string; outfit?: object }) {
  const last = NOW.getTime() - MOOD_DAYS[mood] * DAY - 60 * 60_000
  const events: object[] = []
  const xp = stage === 'egg' ? 20 : from(stage) + 10
  const taskId = LOOK_TASK[look as keyof typeof LOOK_TASK]
  events.push({ id: 'xp', type: 'log', taskId, timestamp: last - 60 * 60_000, xpAwarded: xp, ...(stage !== 'egg' ? { stageReached: stage } : {}) })
  ITEMS.forEach((it, k) =>
    events.push({ id: `f${k}`, type: 'log', taskId: 'avoided', timestamp: last - (ITEMS.length - k) * 1000, xpAwarded: 0, reward: { kind: 'item', itemId: it.id } }),
  )
  events.push({ id: 'last', type: 'log', taskId, timestamp: last, xpAwarded: 0 })
  return { schemaVersion: 1, events, settings: { lastBackupAt: NOW.getTime(), ...(outfit ? { wearing: outfit } : {}) } }
}

async function load(page: Page, d: object) {
  await page.evaluate((d) => {
    localStorage.clear()
    localStorage.setItem('drag-on:v1', JSON.stringify(d))
  }, d)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
}

type ProbeResult = {
  overflow: { clip: string; side: string; px: number; cls: string; sample: number }[]
  worst: { sample: number; mode: string; px: number }
  detach: { what: string; px: number; deg: number }[]
  speech: { hat: number; head: number; headMin: number } | null
  samples: number
}

/**
 * Pauses every animation inside the dragon, then steps through poses: `sync` samples
 * (one shared clock, for attachment) and `rand` samples (each animation group at its
 * own random phase, to find worst combined poses). Measures painted bounds (with
 * stroke) against every clipping ancestor and the viewport sides, attachment of
 * features vs the part they sit on, and speech bubble overlap with hat/head.
 * Leaves the dragon frozen at the worst pose found; call resume() after.
 */
async function probe(page: Page, root: string, opts: { react?: string; sync?: number; rand?: number } = {}): Promise<ProbeResult> {
  return page.evaluate(
    ({ root, react, nSync, nRand }) => {
      const wrap = document.querySelector<HTMLElement>(`${root} > .dragon-react`)!
      const svg = wrap.querySelector('svg')!
      if (react) {
        wrap.classList.remove('react-log', 'react-treat', 'react-hatch', 'react-tap', 'react-perk')
        void wrap.offsetWidth
        wrap.classList.add(`react-${react}`)
      }
      const anims = document.getAnimations().filter((a) => {
        const t = (a.effect as KeyframeEffect | null)?.target
        return t instanceof Element && wrap.contains(t)
      })
      anims.forEach((a) => a.pause())
      const timing = (a: Animation) => a.effect!.getComputedTiming()
      const finite = (a: Animation) => Number.isFinite(timing(a).endTime as number)
      const key = (a: Animation) => {
        const t = a.effect!.getTiming()
        return `${(a as CSSAnimation).animationName}|${t.duration}|${t.delay}`
      }
      // Clip rects: ancestors that clip, plus the viewport's left/right/top.
      const clips: { name: string; r: DOMRect }[] = []
      for (let e: Element | null = svg.parentElement; e && e !== document.documentElement; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push({ name: `${e.tagName.toLowerCase()}${e.id ? '#' + e.id : ''}.${[...e.classList].join('.')}`, r: e.getBoundingClientRect() })
      }
      clips.push({ name: 'viewport', r: new DOMRect(0, 0, innerWidth, 1e6) })
      // Painted shapes that are actually showing in this mood.
      const shown = (e: Element) => {
        for (let p: Element | null = e; p && p !== svg; p = p.parentElement) {
          const cs = getComputedStyle(p)
          if (cs.display === 'none' || cs.visibility === 'hidden') return false
          if (p.classList.contains('mood-part') && cs.opacity === '0') return false
        }
        return !e.classList.contains('dragon-head-box') && !e.closest('defs')
      }
      const shapes = [...svg.querySelectorAll('path,ellipse,circle,rect,polygon,polyline,line')].filter(shown).map((e) => {
        const cs = getComputedStyle(e)
        const sw = cs.stroke && cs.stroke !== 'none' ? parseFloat(cs.strokeWidth) || 0 : 0
        return { e: e as SVGGraphicsElement, sw, cls: `${e.tagName}.${e.getAttribute('class') ?? ''}${e.closest('[data-worn]') ? '@' + e.closest('[data-worn]')!.getAttribute('data-worn') : ''}` }
      })
      const box = (s: (typeof shapes)[number]) => {
        const r = s.e.getBoundingClientRect()
        const m = s.e.getScreenCTM()
        const pad = m ? (s.sw / 2) * Math.hypot(m.a, m.b) : 0
        return { l: r.left - pad, t: r.top - pad, r: r.right + pad, b: r.bottom + pad, w: r.width }
      }
      // Attachment pairs.
      const q = (sel: string) => [...svg.querySelectorAll<SVGGraphicsElement>(sel)].filter(shown)
      const headRef = svg.querySelector<SVGGraphicsElement>('.dragon-head > ellipse.hd-skin')
      const bodyRef = svg.querySelector<SVGGraphicsElement>('.dragon-body > ellipse.hd-skin')
      const pairs: { what: string; el: SVGGraphicsElement; ref: SVGGraphicsElement }[] = []
      if (headRef)
        for (const sel of ['.worn-head', '.look-glasses', '.lk-forehead', '.lk-nosehorn', '.lk-flower', '.mood-lid', '.mood-lid-fill', '.mood-happy', '.dragon-eyes'])
          for (const el of q(sel)) pairs.push({ what: `${sel}${sel === '.dragon-eyes' ? '(gaze moves by design)' : ''}`, el, ref: headRef })
      if (bodyRef) for (const sel of ['.worn-neck', '.worn-held', '.lk-plate', '.lk-sash-stripe', '.lk-badge']) for (const el of q(sel)) pairs.push({ what: sel, el, ref: bodyRef })
      for (const s of ['l', 'r']) {
        const wing = svg.querySelector<SVGGraphicsElement>(`.dg-wing.dg-${s} .hd-wing`)
        if (wing) for (const el of q(`.dg-wing.dg-${s} .lk-wingmark`)) pairs.push({ what: `wingmark-${s}`, el, ref: wing })
      }
      const rel = (p: (typeof pairs)[number]) => p.ref.getScreenCTM()!.inverse().multiply(p.el.getScreenCTM()!)
      const base = pairs.map(rel)
      const pxScale = headRef ? Math.hypot(headRef.getScreenCTM()!.a, headRef.getScreenCTM()!.b) : 1
      const detach = new Map<string, { px: number; deg: number }>()
      // Speech bubble.
      const bubble = document.querySelector('#speech.is-showing')
      const bubbleR = bubble && wrap.closest('#dragon-art') ? bubble.getBoundingClientRect() : null
      const union = (els: SVGGraphicsElement[]) => {
        const rs = els.map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0)
        if (!rs.length) return null
        return { l: Math.min(...rs.map((r) => r.left)), t: Math.min(...rs.map((r) => r.top)), r: Math.max(...rs.map((r) => r.right)), b: Math.max(...rs.map((r) => r.bottom)) }
      }
      const ov = (a: { l: number; t: number; r: number; b: number } | null, b: DOMRect | null) => {
        if (!a || !b) return 0
        const w = Math.min(a.r, b.right) - Math.max(a.l, b.left)
        const h = Math.min(a.b, b.bottom) - Math.max(a.t, b.top)
        return w > 0 && h > 0 ? Math.round(w * h) : 0
      }
      const hatShapes = q('.worn-head path, .worn-head ellipse, .worn-head circle, .worn-head rect, .worn-head polygon')
      const headShapes = [...q('.dragon-head path, .dragon-head ellipse, .dragon-head circle')]
      let speech: { hat: number; head: number; headMin: number } | null = bubbleR ? { hat: 0, head: 0, headMin: 1e9 } : null

      const overflow = new Map<string, { clip: string; side: string; px: number; cls: string; sample: number }>()
      let worst = { sample: -1, mode: 'sync', px: -1e9 }
      const plans: { mode: string; set: () => void }[] = []
      const groups = new Map<string, number>()
      for (let i = 0; i < nSync; i++) {
        const t = i * 250
        const f = nSync > 1 ? i / (nSync - 1) : 0
        plans.push({ mode: 'sync', set: () => anims.forEach((a) => (a.currentTime = finite(a) ? f * (timing(a).endTime as number) : t)) })
      }
      for (let i = 0; i < nRand; i++)
        plans.push({
          mode: 'rand',
          set: () => {
            groups.clear()
            anims.forEach((a) => {
              const k = key(a)
              if (!groups.has(k)) groups.set(k, Math.random())
              const g = groups.get(k)!
              const d = finite(a) ? (timing(a).endTime as number) : (a.effect!.getTiming().duration as number)
              a.currentTime = g * d
            })
          },
        })
      plans.forEach((p, i) => {
        p.set()
        let sampleWorst = -1e9
        for (const s of shapes) {
          const b = box(s)
          if (b.w === 0) continue
          for (const c of clips) {
            const sides = { left: c.r.left - b.l, right: b.r - c.r.right, top: c.r.top - b.t, bottom: c.name === 'viewport' ? -1e9 : b.b - c.r.bottom }
            for (const [side, px] of Object.entries(sides)) {
              sampleWorst = Math.max(sampleWorst, px)
              const k = `${c.name}|${side}`
              if (px > 0.5 && (!overflow.has(k) || overflow.get(k)!.px < px)) overflow.set(k, { clip: c.name, side, px: Math.round(px * 10) / 10, cls: s.cls, sample: i })
            }
          }
        }
        if (sampleWorst > worst.px) worst = { sample: i, mode: p.mode, px: Math.round(sampleWorst * 10) / 10 }
        if (p.mode === 'sync') {
          pairs.forEach((pr, j) => {
            const m = rel(pr)
            const b0 = base[j]
            const px = Math.hypot(m.e - b0.e, m.f - b0.f) * pxScale
            const deg = Math.abs((Math.atan2(m.b, m.a) - Math.atan2(b0.b, b0.a)) * (180 / Math.PI))
            const cur = detach.get(pr.what) ?? { px: 0, deg: 0 }
            detach.set(pr.what, { px: Math.max(cur.px, Math.round(px * 10) / 10), deg: Math.max(cur.deg, Math.round(deg * 10) / 10) })
          })
          if (speech && bubbleR) {
            speech.hat = Math.max(speech.hat, ov(union(hatShapes), bubbleR))
            const hv = ov(union(headShapes), bubbleR)
            speech.head = Math.max(speech.head, hv)
            speech.headMin = Math.min(speech.headMin, hv)
          }
        }
      })
      // Leave it in the worst pose found (re-running a rand plan would re-roll, so only sync is exact).
      plans[worst.mode === 'sync' ? worst.sample : 0].set()
      if (worst.mode === 'rand') {
        // Re-find a worst rand pose for the screenshot.
        let best = -1e9
        let state: number[] = []
        for (let i = 0; i < nRand; i++) {
          plans[nSync + i].set()
          let w = -1e9
          for (const s of shapes) {
            const b = box(s)
            if (b.w === 0) continue
            for (const c of clips) w = Math.max(w, c.r.left - b.l, b.r - c.r.right, c.r.top - b.t)
          }
          if (w > best) {
            best = w
            state = anims.map((a) => a.currentTime as number)
          }
        }
        anims.forEach((a, k) => (a.currentTime = state[k]))
      }
      return {
        overflow: [...overflow.values()],
        worst,
        detach: [...detach.entries()].map(([what, v]) => ({ what, ...v })),
        speech,
        samples: plans.length,
      }
    },
    { root, react: opts.react ?? null, nSync: opts.sync ?? 120, nRand: opts.rand ?? 150 },
  )
}

async function resume(page: Page, root: string) {
  await page.evaluate((root) => {
    const wrap = document.querySelector(`${root} > .dragon-react`)!
    wrap.classList.remove('react-log', 'react-treat', 'react-hatch', 'react-tap', 'react-perk')
    document.getAnimations().forEach((a) => {
      const t = (a.effect as KeyframeEffect | null)?.target
      if (t instanceof Element && wrap.contains(t)) a.play()
    })
  }, root)
}

async function shootAround(page: Page, root: string, file: string) {
  const b = (await page.locator(root).boundingBox())!
  const vp = page.viewportSize()!
  const x = Math.max(0, b.x - 16)
  const y = Math.max(0, b.y - 40)
  await page.screenshot({ path: file, clip: { x, y, width: Math.min(vp.width - x, b.width + 32), height: Math.min(vp.height - y, b.height + 56) } })
}

async function sheet(page: Page, name: string, list: { label: string; file: string }[], cols = 8) {
  const html = `<html><body style="margin:0;background:#888;font:11px sans-serif;display:grid;grid-template-columns:repeat(${cols},1fr);gap:2px">${list
    .map((s) => `<div><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><div style="background:#fff">${s.label}</div></div>`)
    .join('')}</body></html>`
  const p2 = await page.context().newPage()
  await p2.setViewportSize({ width: 1600, height: 900 })
  await p2.setContent(html)
  await p2.screenshot({ path: `${dir}/${PFX}-sheet-${name}.png`, fullPage: true })
  await p2.close()
}

const significant = (r: ProbeResult) => ({
  overflow: r.overflow.filter((o) => o.px > 1),
  detach: r.detach.filter((d) => !d.what.startsWith('.dragon-eyes') && (d.px > 0.5 || d.deg > 0.3)),
  eyes: r.detach.find((d) => d.what.startsWith('.dragon-eyes')),
  speech: r.speech,
  worst: r.worst,
})

// 1. Every stage/look x mood, on Home, Dragon screen and Collection preview, wearing an outfit.
for (const { stage, look } of STAGE_LOOKS)
  test(`motion matrix ${stage}/${look}`, async ({ page }, info) => {
    test.setTimeout(600_000)
    const P = info.project.name
    const msgs = collectConsole(page)
    await page.clock.setFixedTime(NOW)
    await page.goto('./')
    const problems: string[] = []
    const shots: Record<string, { label: string; file: string }[]> = { light: [], dark: [] }
    let o = 0
    for (const mood of ['happy', 'content', 'sleepy', 'grumpy']) {
      const outfit = stage === 'egg' ? undefined : OUTFITS[o++ % OUTFITS.length]
      await page.emulateMedia({ colorScheme: 'light' })
      await load(page, data({ stage, look, mood, outfit }))
      await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-stage', stage)
      if (stage !== 'egg') await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-evolution', look)
      await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-mood', mood)
      await settle(page)
      const tag = `${P} ${stage}/${look} ${mood}`
      const report = (where: string, r: ProbeResult) => {
        const s = significant(r)
        console.log('PROBE', where, tag, JSON.stringify(s))
        for (const ov of s.overflow) problems.push(`${where} ${tag}: clipped ${ov.px}px ${ov.side} by ${ov.clip} (${ov.cls})`)
        for (const d of s.detach) problems.push(`${where} ${tag}: ${d.what} drifts ${d.px}px / ${d.deg}deg`)
        if (s.speech && (s.speech.hat > 0 || s.speech.head > 0)) problems.push(`${where} ${tag}: speech bbox overlaps hat ${s.speech.hat}px2 head max ${s.speech.head} min ${s.speech.headMin}px2`)
      }
      // Home: idle, then each reaction on top.
      const home = await probe(page, '#dragon-art')
      report('home', home)
      for (const scheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme: scheme })
        const file = `${dir}/${PFX}-${P}-home-${scheme}-${stage}-${look}-${mood}.png`
        await shootAround(page, '#dragon-art', file)
        shots[scheme].push({ label: `${stage} ${look} ${mood}`, file })
      }
      await page.emulateMedia({ colorScheme: 'light' })
      await resume(page, '#dragon-art')
      for (const react of ['tap', 'log', 'treat', 'perk']) {
        const r = await probe(page, '#dragon-art', { react, sync: 30, rand: 60 })
        report(`home+${react}`, { ...r, detach: r.detach.filter(() => react === 'tap'), speech: null })
        await resume(page, '#dragon-art')
      }
      // Dragon screen.
      await page.getByRole('link', { name: 'Dragon' }).click()
      await expect(page.locator('#dragon-screen .ds-art .dragon-svg')).toBeVisible()
      await settle(page)
      const ds = await probe(page, '#dragon-screen .ds-art', { sync: 80, rand: 100 })
      report('dragon', ds)
      if (mood === 'content' || mood === 'sleepy')
        for (const scheme of ['light', 'dark'] as const) {
          await page.emulateMedia({ colorScheme: scheme })
          await page.screenshot({ path: `${dir}/${PFX}-${P}-dragon-${scheme}-${stage}-${look}-${mood}.png` })
        }
      await page.emulateMedia({ colorScheme: 'light' })
      await resume(page, '#dragon-screen .ds-art')
      const dtap = await probe(page, '#dragon-screen .ds-art', { react: 'tap', sync: 30, rand: 60 })
      report('dragon+tap', { ...dtap, speech: null })
      await resume(page, '#dragon-screen .ds-art')
      // Collection preview.
      if (stage !== 'egg') {
        await page.getByRole('link', { name: 'Collection' }).click()
        const cs = page.locator('#collection-screen .cs-art .dragon-svg')
        if (await cs.count()) {
          await settle(page)
          const c = await probe(page, '#collection-screen .cs-art', { sync: 80, rand: 100 })
          report('collection', c)
          await resume(page, '#collection-screen .cs-art')
          const ctap = await probe(page, '#collection-screen .cs-art', { react: 'tap', sync: 30, rand: 60 })
          report('collection+tap', { ...ctap, speech: null })
          if (mood === 'happy') await page.screenshot({ path: `${dir}/${PFX}-${P}-collection-tapworst-${stage}-${look}.png`, clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 220 } })
          if (mood === 'content') {
            await page.screenshot({ path: `${dir}/${PFX}-${P}-collection-light-${stage}-${look}.png` })
          }
          await resume(page, '#collection-screen .cs-art')
        }
      }
      await page.getByRole('link', { name: 'Home' }).click()
    }
    for (const scheme of ['light', 'dark'] as const) await sheet(page, `${P}-home-${scheme}-${stage}-${look}`, shots[scheme], 4)
    console.log('PROBLEMS', P, stage, look, JSON.stringify(problems, null, 1))
    expect.soft(problems).toEqual([])
    expect(msgs).toEqual([])
  })

// 2. Tap reaction: plays, resets, survives repeated taps (Home, Dragon screen, Collection).
test('tap reaction plays and resets, single and repeated', async ({ page }, info) => {
  const P = info.project.name
  const msgs = collectConsole(page)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await load(page, data({ stage: 'adult', look: 'heart', mood: 'content', outfit: OUTFITS[0] }))
  await settle(page)
  const out: string[] = []
  for (const [route, root] of [
    ['Home', '#dragon-art'],
    ['Dragon', '#dragon-screen .ds-art'],
    ['Collection', '#collection-screen .cs-art'],
  ] as const) {
    await page.getByRole('link', { name: route }).click()
    await expect(page.locator(`${root} .dragon-svg`)).toBeVisible()
    await settle(page)
    const wrap = page.locator(`${root} > .dragon-react`)
    const state = () =>
      wrap.evaluate((w) => ({
        cls: w.className,
        tf: getComputedStyle(w).transform,
        eyes: [...w.querySelectorAll('.dragon-eyes')].map((e) => getComputedStyle(e).transform).join(','),
        anims: w.getAnimations().map((a) => (a as CSSAnimation).animationName),
      }))
    // Single tap.
    const art = page.locator(root)
    const bb = (await art.boundingBox())!
    await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height * 0.6)
    const during = await state()
    await page.waitForTimeout(250)
    await page.screenshot({ path: `${dir}/${PFX}-${P}-tap-mid-${route}.png` })
    await page.waitForTimeout(700)
    const after = await state()
    // Rapid taps.
    for (let i = 0; i < 8; i++) {
      await page.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height * 0.6)
      await page.waitForTimeout(70 + (i % 3) * 60)
    }
    const midRapid = await state()
    await page.waitForTimeout(1000)
    const afterRapid = await state()
    const line = `${route}: during=${JSON.stringify(during)} after=${JSON.stringify(after)} midRapid=${JSON.stringify(midRapid)} afterRapid=${JSON.stringify(afterRapid)}`
    console.log('TAP', P, line)
    if (!/react-tap/.test(during.cls)) out.push(`${route}: react-tap not added on tap`)
    if (/react-/.test(after.cls) || after.tf !== 'none') out.push(`${route}: not reset after single tap (${after.cls} ${after.tf})`)
    if (/react-/.test(afterRapid.cls) || afterRapid.tf !== 'none') out.push(`${route}: not reset after rapid taps (${afterRapid.cls} ${afterRapid.tf})`)
    if (afterRapid.anims.some((n) => /react|squint|blush/.test(n))) out.push(`${route}: reaction anims still attached ${afterRapid.anims}`)
  }
  console.log('TAP PROBLEMS', P, JSON.stringify(out))
  expect(out).toEqual([])
  expect(msgs).toEqual([])
})

// 3. Logging: one tap on Home, log reaction plays and resets, XP goes up; persists.
for (const stage of ['egg', 'hatchling', 'elder'])
  test(`one-tap log with reaction (${stage})`, async ({ page }, info) => {
    const P = info.project.name
    const msgs = collectConsole(page)
    await page.clock.setFixedTime(NOW)
    await page.goto('./')
    await load(page, data({ stage, look: 'wisdom', mood: 'content', outfit: stage === 'egg' ? undefined : OUTFITS[1] }))
    await settle(page)
    const xp0 = Number(await page.locator('#xp-total').textContent())
    const wrap = page.locator('#dragon-art > .dragon-react')
    const btn = page.locator('#task-list button.task:not([disabled])').first()
    await btn.tap()
    const cls = await wrap.getAttribute('class')
    await page.waitForTimeout(200)
    await page.screenshot({ path: `${dir}/${PFX}-${P}-log-mid-${stage}.png` })
    await expect.poll(async () => Number(await page.locator('#xp-total').textContent())).toBeGreaterThan(xp0)
    await settle(page)
    const after = await wrap.getAttribute('class')
    const tf = await wrap.evaluate((w) => getComputedStyle(w).transform)
    console.log('LOG', P, stage, cls, '->', after, tf)
    expect(cls).toMatch(/react-(log|treat|perk)/)
    expect(after).not.toMatch(/react-/)
    await page.reload()
    await expect(page.locator('#tabbar a').first()).toBeVisible()
    expect(Number(await page.locator('#xp-total').textContent())).toBeGreaterThan(xp0)
    expect(msgs).toEqual([])
  })

// 4. Reduced motion: dragon still in every mood; tap does nothing visible; logging still works.
test('reduced motion leaves the dragon still', async ({ page }, info) => {
  const P = info.project.name
  const msgs = collectConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  const out: string[] = []
  for (const { stage, look } of [{ stage: 'egg', look: 'neutral' }, { stage: 'hatchling', look: 'neutral' }, { stage: 'elder', look: 'heart' }, { stage: 'juvenile', look: 'wisdom' }])
    for (const mood of ['happy', 'content', 'sleepy', 'grumpy']) {
      await load(page, data({ stage, look, mood, outfit: stage === 'egg' ? undefined : OUTFITS[0] }))
      await page.waitForTimeout(300)
      for (const root of ['#dragon-art']) {
        const r = await page.evaluate((root) => {
          const wrap = document.querySelector(`${root} > .dragon-react`)!
          const running = document
            .getAnimations()
            .filter((a) => {
              const t = (a.effect as KeyframeEffect | null)?.target
              return t instanceof Element && wrap.contains(t) && a.playState === 'running'
            })
            .map((a) => (a as CSSAnimation).animationName ?? 'transition')
          const moving = [...wrap.querySelectorAll('.dragon-idle,.dragon-tail,.dg-wing,.dg-ear,.dg-head-move,.dragon-gaze,.dragon-shadow,.egg-inner,.egg-shadow,.dragon-eyes')]
            .map((e) => getComputedStyle(e).transform)
            .filter((t) => t !== 'none')
          return { running, moving }
        }, root)
        if (r.running.length || r.moving.length) out.push(`${stage}/${look} ${mood}: running=${r.running} transforms=${r.moving}`)
      }
      // Tap: no reaction class.
      await page.locator('#dragon-art').tap()
      const cls = await page.locator('#dragon-art > .dragon-react').getAttribute('class')
      if (/react-/.test(cls ?? '')) out.push(`${stage} ${mood}: tap adds ${cls} under reduced motion`)
    }
  // Two frames 1s apart should be pixel-identical (ignoring the speech bubble).
  await load(page, data({ stage: 'adult', look: 'strength', mood: 'happy', outfit: OUTFITS[2] }))
  await page.waitForTimeout(500)
  const a = await page.locator('#dragon-art').screenshot()
  await page.waitForTimeout(1300)
  const b = await page.locator('#dragon-art').screenshot()
  if (!a.equals(b)) out.push('home dragon pixels changed over 1.3s under reduced motion')
  fs.writeFileSync(`${dir}/${PFX}-${P}-reduced-home.png`, b)
  console.log('REDUCED-PRE', P, JSON.stringify(out))
  const xp0 = Number(await page.locator('#xp-total').textContent())
  await page.locator('#task-list button.task:not([disabled])').first().tap()
  await expect.poll(async () => Number(await page.locator('#xp-total').textContent())).toBeGreaterThan(xp0)
  console.log('REDUCED', P, JSON.stringify(out))
  expect(out).toEqual([])
  expect(msgs).toEqual([])
})

// 5. Stage-up overlay (the other place the dragon is drawn): reveal plays, nothing clipped.
for (const scheme of ['light', 'dark'] as const)
  test(`stage-up overlay to juvenile (${scheme})`, async ({ page }, info) => {
    const P = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.clock.setFixedTime(NOW)
    await page.goto('./')
    await load(page, {
      schemaVersion: 1,
      events: [
        { id: 'a', type: 'log', taskId: 'read', timestamp: NOW.getTime() - 3 * DAY, xpAwarded: 200 },
        { id: 'b', type: 'log', taskId: 'gym', timestamp: NOW.getTime() - 2 * DAY, xpAwarded: from('juvenile') - 210, stageReached: 'whelp' },
      ],
      settings: { lastBackupAt: NOW.getTime() },
    })
    await page.locator('button.task[data-task-id="gym"]').tap()
    await expect(page.locator('.overlay')).toBeVisible()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${dir}/${PFX}-${P}-overlay-mid-${scheme}.png` })
    await expect(page.locator('.overlay')).toHaveClass(/is-revealed/, { timeout: 6000 })
    await settle(page)
    const r = await probe(page, '.overlay-layer.is-to', { sync: 80, rand: 100 })
    console.log('OVERLAY', P, scheme, JSON.stringify(significant(r)))
    await page.screenshot({ path: `${dir}/${PFX}-${P}-overlay-revealed-${scheme}.png` })
    await resume(page, '.overlay-layer.is-to')
    expect.soft(significant(r).overflow).toEqual([])
    expect(msgs).toEqual([])
  })

// 6. Offline log + reload.
test('offline: log survives reload', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const msgs = collectConsole(page)
  await page.goto('./')
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
  const xp0 = Number(await page.locator('#xp-total').textContent())
  await page.locator('#task-list button.task:not([disabled])').first().tap()
  await expect.poll(async () => Number(await page.locator('#xp-total').textContent())).toBeGreaterThan(xp0)
  const xp1 = Number(await page.locator('#xp-total').textContent())
  await page.reload()
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
  expect(Number(await page.locator('#xp-total').textContent())).toBe(xp1)
  await context.setOffline(false)
  expect(msgs.filter((m) => !/ERR_INTERNET_DISCONNECTED/.test(m))).toEqual([])
})

// 7. Animation cost on Home with 4x CPU throttling: frame intervals and main-thread work.
for (const scenario of [
  { name: 'elder-happy-outfit', stage: 'elder', look: 'heart', mood: 'happy', outfit: OUTFITS[0] },
  { name: 'hatchling-content', stage: 'hatchling', look: 'neutral', mood: 'content', outfit: undefined },
  { name: 'egg-content', stage: 'egg', look: 'neutral', mood: 'content', outfit: undefined },
])
  for (const motion of ['no-preference', 'reduce'] as const)
    test(`perf ${scenario.name} ${motion}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'pixel10pro')
      test.setTimeout(120_000)
      await page.emulateMedia({ reducedMotion: motion })
      await page.clock.setFixedTime(NOW)
      await page.goto('./')
      await load(page, data(scenario))
      await settle(page)
      await page.waitForTimeout(2500) // let the welcome bubble / perk finish
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
      const events = (JSON.parse(raw).traceEvents ?? JSON.parse(raw)) as { name: string; dur?: number; ph: string }[]
      const sum: Record<string, number> = {}
      for (const e of events)
        if (e.ph === 'X' && e.dur && ['UpdateLayoutTree', 'Layout', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'RasterTask', 'CompositeLayers', 'FunctionCall', 'AnimationFrameFiredCallback'].includes(e.name))
          sum[e.name] = Math.round(((sum[e.name] ?? 0) + e.dur / 1000) * 10) / 10
      const sorted = [...frames].sort((a, b) => a - b)
      const pct = (p: number) => Math.round(sorted[Math.floor(sorted.length * p)] * 10) / 10
      const res = {
        frames: frames.length,
        meanMs: Math.round((frames.reduce((a, b) => a + b, 0) / frames.length) * 10) / 10,
        p50: pct(0.5),
        p95: pct(0.95),
        max: Math.round(sorted[sorted.length - 1] * 10) / 10,
        over25ms: frames.filter((f) => f > 25).length,
        over50ms: frames.filter((f) => f > 50).length,
        taskMs: Math.round((m1.TaskDuration - m0.TaskDuration) * 1000),
        styleMs: Math.round((m1.RecalcStyleDuration - m0.RecalcStyleDuration) * 1000),
        layoutMs: Math.round((m1.LayoutDuration - m0.LayoutDuration) * 1000),
        traceMs: sum,
      }
      console.log('PERF', scenario.name, motion, JSON.stringify(res))
    })
