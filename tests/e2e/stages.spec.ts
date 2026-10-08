// Milestone 2, Slice 1: the grown stages, their reveals, and stage holding.
import { test, expect, settle, shot, SWEEPS_SIZES, type Page } from './fixtures'
import { STAGES } from '../../src/config/stages'
import { TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const TUE_1000 = new Date('2026-10-06T10:00:00+01:00')
const OLD = Date.parse('2026-10-01T12:00:00+01:00')
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const from = (id: string) => STAGES.find((s) => s.id === id)!.xpFrom
const GROWN = ['hatchling', 'whelp', 'juvenile', 'adult', 'elder'] as const

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function seed(page: Page, events: object[]) {
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: d }))
      sessionStorage.setItem('seeded', '1')
    }
  }, events)
}
const log = (xp: number, extra: object = {}, id = 'seed1') => ({ id, type: 'log', taskId: 'gym', timestamp: OLD, xpAwarded: xp, ...extra })
const xpTotal = async (page: Page) => Number(await page.locator('#xp-total').textContent())

/** Union of painted shapes in the dragon art, plus the boxes it must fit in. */
async function artFit(page: Page, root = '#dragon-art') {
  return page.evaluate((root) => {
    const shapes = [...document.querySelectorAll(`${root} svg.dragon-svg :is(path,ellipse,circle,rect,polygon,line,polyline)`)]
      .filter((e) => {
        const cs = getComputedStyle(e)
        return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0
      })
      .map((e) => e.getBoundingClientRect())
      .filter((r) => r.width > 0 || r.height > 0)
    const u = shapes.reduce(
      (a, r) => ({ l: Math.min(a.l, r.left), t: Math.min(a.t, r.top), r: Math.max(a.r, r.right), b: Math.max(a.b, r.bottom) }),
      { l: Infinity, t: Infinity, r: -Infinity, b: -Infinity },
    )
    const box = (s: string) => {
      const b = document.querySelector(s)?.getBoundingClientRect()
      return b ? { l: b.left, t: b.top, r: b.right, b: b.bottom } : null
    }
    return {
      art: { l: Math.round(u.l), t: Math.round(u.t), r: Math.round(u.r), b: Math.round(u.b), w: Math.round(u.r - u.l), h: Math.round(u.b - u.t) },
      area: box(root === '#dragon-art' ? '.dragon' : '.overlay-art'),
      header: box('.top'),
      label: box('.growth-row'),
      toast: document.querySelector('#toast.is-showing') ? box('#toast') : null,
      lastTask: box('#task-list li:last-child .task'),
      undo: box('#undo'),
      look: document.querySelector(`${root} .dragon-react`)?.getAttribute('data-look'),
    }
  }, root)
}

const SIZES = [
  [410, 914],
  [360, 800],
  [410, 800],
  [360, 680],
] as const
const SEED_AT: Record<(typeof GROWN)[number], number> = {
  hatchling: from('hatchling') + 30,
  whelp: from('whelp') + 100,
  juvenile: from('juvenile') + 200,
  adult: from('adult') + 300,
  elder: from('elder') + 500,
}

// 1. Home screen at each stage
for (const [w, h] of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`home stages ${w}x${h} ${scheme}`, SWEEPS_SIZES, async ({ page }, info) => {
      test.skip(info.project.name !== 'pixel10pro')
      const msgs = collectConsole(page)
      await page.setViewportSize({ width: w, height: h })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.clock.install({ time: TUE_1000 })
      const sizes: Record<string, number> = {}
      await page.goto('./')
      for (const stage of GROWN) {
        await page.evaluate(
          (xp) => localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: [{ id: 's', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-10-01T12:00:00+01:00'), xpAwarded: xp }] })),
          SEED_AT[stage],
        )
        await page.reload()
        await expect(page.locator('#stage-name')).toHaveText(STAGES.find((s) => s.id === stage)!.name)
        const f = await artFit(page)
        const sh = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])
        console.log(`${w}x${h} ${scheme} ${stage}`, JSON.stringify(f), 'label', await page.locator('#growth-label').textContent())
        // Seeded with gym logs, so from Juvenile on the dragon has the strength look.
        expect(f.look).toBe(['juvenile', 'adult', 'elder'].includes(stage) ? `${stage}-strength` : stage)
        expect(sh[0]).toBeLessThanOrEqual(w)
        expect(sh[1]).toBeLessThanOrEqual(h)
        // Not clipped: inside its area (1px slack for stroke rounding) and below the header
        expect(f.art.l).toBeGreaterThanOrEqual(-1)
        expect(f.art.r).toBeLessThanOrEqual(w + 1)
        expect(f.art.t).toBeGreaterThanOrEqual(f.header!.b - 1)
        expect(f.art.b).toBeLessThanOrEqual(f.label!.t + 1)
        expect(f.lastTask!.b).toBeLessThanOrEqual(h)
        expect(f.undo!.b).toBeLessThanOrEqual(h)
        sizes[stage] = f.art.w * f.art.h
        await shot(page, `m2-${w}x${h}-${scheme}-${stage}`)
      }
      console.log(`${w}x${h} painted area by stage`, JSON.stringify(sizes))
      expect(msgs, msgs.join('\n')).toEqual([])
    })
  }
}

// 2. Stage-up overlay for each transition
const TRANSITIONS = [
  ['hatchling', 'whelp'],
  ['whelp', 'juvenile'],
  ['juvenile', 'adult'],
  ['adult', 'elder'],
] as const

for (const [a, b] of TRANSITIONS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`stage-up ${a} -> ${b} ${scheme}`, async ({ page }, info) => {
      const msgs = collectConsole(page)
      await page.emulateMedia({ colorScheme: scheme })
      const below = from(b) - 10
      await seed(page, [log(below, { stageReached: a })])
      await page.addInitScript(() => {
        const w = window as any
        w.__overlays = 0
        new MutationObserver((ms) => {
          for (const m of ms) for (const n of m.addedNodes) if (n instanceof HTMLElement && n.classList.contains('overlay')) w.__overlays++
        }).observe(document, { childList: true, subtree: true })
      })
      await page.clock.setFixedTime(TUE_1000)
      await page.goto('./')
      await expect(page.locator('#stage-name')).toHaveText(STAGES.find((s) => s.id === a)!.name)
      await page.locator('button.task[data-task-id="gym"]').focus()
      await page.keyboard.press('Enter')
      const overlay = page.getByRole('dialog')
      await expect(overlay).toBeVisible()
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.at(-1))
      expect(saved.stageReached).toBe(b)
      await expect(page.locator('.overlay')).toHaveClass(/is-revealed/)
      await settle(page)
      const f = await artFit(page, '.overlay .overlay-layer.is-to')
      const m = await page.evaluate(() => {
        const msg = document.querySelector('.overlay-message')!
        const range = document.createRange()
        range.selectNodeContents(msg)
        const lines = new Map<number, number>()
        for (const r of range.getClientRects()) lines.set(Math.round(r.top), (lines.get(Math.round(r.top)) ?? 0) + r.width)
        const btn = document.querySelector('.overlay-button')!.getBoundingClientRect()
        const card = document.querySelector('.overlay-card')!.getBoundingClientRect()
        return {
          lines: [...lines.values()].map(Math.round),
          wrap: getComputedStyle(msg).textWrap,
          btn: { w: Math.round(btn.width), h: Math.round(btn.height), b: Math.round(btn.bottom) },
          card: { t: Math.round(card.top), b: Math.round(card.bottom) },
          inert: (document.getElementById('app') as any).inert,
          active: document.activeElement?.className,
          bg: getComputedStyle(document.querySelector('.overlay')!).backgroundColor,
        }
      })
      console.log(`${info.project.name} ${a}->${b} ${scheme}`, JSON.stringify({ art: f.art, overlayArt: f.area, ...m }))
      const vp = page.viewportSize()!
      expect(m.btn.w).toBeGreaterThanOrEqual(44)
      expect(m.btn.h).toBeGreaterThanOrEqual(44)
      expect(m.btn.b).toBeLessThanOrEqual(vp.height)
      expect(m.card.t).toBeGreaterThanOrEqual(0)
      expect(f.art.l).toBeGreaterThanOrEqual(-1)
      expect(f.art.r).toBeLessThanOrEqual(vp.width + 1)
      expect(f.art.t).toBeGreaterThanOrEqual(-1)
      expect(m.inert).toBe(true)
      if (m.lines.length > 1) {
        // balanced: no orphan line much shorter than the longest
        expect(Math.min(...m.lines) / Math.max(...m.lines)).toBeGreaterThan(0.45)
      }
      await shot(page, `m2-${info.project.name}-up-${b}-${scheme}`)

      // Tab can't reach the page behind
      for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Tab')
        expect(await page.evaluate(() => !!document.activeElement?.closest('#app'))).toBe(false)
      }
      // Close: light uses Escape, dark uses the backdrop; the button is covered below.
      if (scheme === 'light') await page.keyboard.press('Escape')
      else await page.locator('.overlay').click({ position: { x: 8, y: 8 } })
      await expect(page.locator('.overlay')).toHaveCount(0)
      const after = await page.evaluate(() => ({
        inert: (document.getElementById('app') as any).inert,
        tag: document.activeElement?.tagName,
      }))
      expect(after.inert).toBe(false)
      expect(after.tag).not.toBe('BODY')
      await expect(page.locator('#stage-name')).toHaveText(STAGES.find((s) => s.id === b)!.name)

      // Fires once: more logs and a reload don't repeat it
      await page.locator('button.task[data-task-id="walk"]').click()
      await page.reload()
      await page.locator('button.task[data-task-id="read"]').click()
      await settle(page)
      await expect(page.locator('.overlay')).toHaveCount(0)
      expect(await page.evaluate(() => (window as any).__overlays)).toBe(0) // counter resets on reload; none since
      expect(msgs, msgs.join('\n')).toEqual([])
    })
  }
}

test('stage-up button closes and undo back down shows nothing sad', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, [log(from('whelp') - 10, { stageReached: 'hatchling' })])
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  await page.locator('button.task[data-task-id="gym"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  // Guard: an instant tap is ignored
  await page.locator('.overlay').click({ position: { x: 8, y: 8 } })
  await page.waitForTimeout(50)
  await expect(page.locator('.overlay')).toHaveCount(1)
  await expect(page.locator('.overlay')).toHaveClass(/is-revealed/) // revealed after the close guard has passed
  await settle(page)
  await page.locator('.overlay-button').click()
  await expect(page.locator('.overlay')).toHaveCount(0)
  await expect(page.locator('#stage-name')).toHaveText('Whelp')
  await page.locator('#undo').click()
  // Undoing the mis-tap takes the stage back; no overlay, nothing sad
  console.log('after undo stage', await page.locator('#stage-name').textContent(), await page.locator('#growth-label').textContent())
  await settle(page)
  await expect(page.locator('.overlay')).toHaveCount(0)
  expect(msgs).toEqual([])
})

// 4. Held stage
test('held stage: stageReached whelp below its threshold shows Whelp, counting to grow', async ({ page }, info) => {
  const msgs = collectConsole(page)
  const total = 450
  await seed(page, [log(350, { stageReached: 'hatchling' }, 'a'), log(100, { stageReached: 'whelp' }, 'b')])
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  await expect(page.locator('#stage-name')).toHaveText('Whelp')
  expect(await xpTotal(page)).toBe(total)
  await expect(page.locator('#growth-label')).toHaveText(`${from('juvenile') - total} XP to grow`)
  const bar = await page.locator('#xp-bar').evaluate((e) => ({ now: e.getAttribute('aria-valuenow'), text: e.getAttribute('aria-valuetext'), fill: (e.firstElementChild as HTMLElement).style.width }))
  console.log('held bar', bar)
  expect(Number(bar.now)).toBe(0) // below the held stage's own threshold: progress shows from the start
  expect(await page.locator('#dragon-art .dragon-react').getAttribute('data-look')).toBe('whelp')
  await shot(page, `m2-${info.project.name}-held-whelp`)
  // A log here doesn't celebrate (already Whelp)
  await page.locator('button.task[data-task-id="gym"]').click()
  await settle(page)
  await expect(page.locator('.overlay')).toHaveCount(0)
  await expect(page.locator('#stage-name')).toHaveText('Whelp')
  expect(msgs).toEqual([])
})

// 5. Existing user data
test('existing hatchling data without stageReached loads and one log does not celebrate', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, [log(130)])
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  await expect(page.locator('#stage-name')).toHaveText('Hatchling')
  await expect(page.locator('#growth-label')).toHaveText(`${from('whelp') - 130} XP to grow`)
  await page.locator('button.task[data-task-id="walk"]').click()
  await expect(page.locator('#toast-text')).toHaveText(`+${XP('walk')} XP · Went for a walk`)
  await settle(page)
  await expect(page.locator('.overlay')).toHaveCount(0)
  const last = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.at(-1))
  console.log('new event on legacy data', last)
  expect(msgs).toEqual([])
})

// 6. Elder
test('elder: Fully grown, full bar, logging still gives feedback', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, [log(from('elder') + 500, { stageReached: 'elder' })])
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  await expect(page.locator('#stage-name')).toHaveText('Elder')
  await expect(page.locator('#growth-label')).toHaveText('Fully grown')
  await settle(page) // let the bar's width transition finish
  const bar = await page.locator('#xp-bar').evaluate((e) => ({ now: e.getAttribute('aria-valuenow'), fill: getComputedStyle(e.firstElementChild!).width, track: getComputedStyle(e).width }))
  console.log('elder bar', bar)
  expect(bar.now).toBe('100')
  expect(bar.fill).toBe(bar.track)
  await page.locator('button.task[data-task-id="gym"]').click()
  const fb = await page.evaluate(() => ({
    float: document.querySelector('.float-xp')?.textContent,
    wiggle: !!document.querySelector('#dragon-art .dragon-react.react-log'),
    toast: document.querySelector('#toast-text')?.textContent,
  }))
  expect(fb).toEqual({ float: `+${XP('gym')} XP`, wiggle: true, toast: `+${XP('gym')} XP · Gym / workout` })
  expect(await xpTotal(page)).toBe(from('elder') + 500 + XP('gym'))
  await expect(page.locator('#growth-label')).toHaveText('Fully grown')
  await settle(page)
  await expect(page.locator('.overlay')).toHaveCount(0)
  expect(msgs).toEqual([])
})

// 7. Reduced motion: reveals crossfade
for (const [a, b] of TRANSITIONS) {
  test(`reduced motion reveal ${a} -> ${b}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'pixel10pro')
    const msgs = collectConsole(page)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await seed(page, [log(from(b) - 10, { stageReached: a })])
    await page.addInitScript(() => {
      const w = window as any
      w.__cls = new Set()
      new MutationObserver(() => {
        const o = document.querySelector('.overlay')
        if (o) w.__cls.add(o.className)
      }).observe(document, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] })
    })
    await page.clock.setFixedTime(TUE_1000)
    await page.goto('./')
    await page.locator('button.task[data-task-id="gym"]').click()
    await expect(page.locator('.overlay')).toHaveClass(/is-calm/)
    const anims: string[] = []
    for (let t = 0; t < 6; t++) {
      anims.push(
        ...(await page.evaluate(() =>
          document
            .getAnimations()
            .map((x: any) => `${x.animationName ?? 'transition:' + x.transitionProperty}@${(x.effect?.target as Element)?.className?.toString?.() ?? ''}`),
        )),
      )
      await page.waitForTimeout(200)
    }
    const uniq = [...new Set(anims)]
    const classes = await page.evaluate(() => [...(window as any).__cls])
    console.log(`reduced ${a}->${b}`, JSON.stringify({ uniq, classes }))
    // Only opacity transitions or the overlay fade-in; no keyframe motion
    for (const x of uniq) expect(x, x).toMatch(/^(transition:opacity|overlay-in|float-xp-calm)@/)
    const final = await page.evaluate(() => ({
      to: getComputedStyle(document.querySelector('.overlay-layer.is-to')!).transform,
      sparks: [...document.querySelectorAll('.overlay-sparks, .overlay-glow')].map((s) => getComputedStyle(s).display),
    }))
    expect(final.to).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
    for (const s of final.sparks) expect(s).toBe('none')
    await page.locator('.overlay-button').click()
    await expect(page.locator('.overlay')).toHaveCount(0)
    expect(msgs).toEqual([])
  })
}

// Offline at a grown stage
test('offline at Adult: log, reload, still there', async ({ page, context }) => {
  const msgs = collectConsole(page)
  await seed(page, [log(from('adult') + 100, { stageReached: 'adult' })])
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 })
  await context.setOffline(true)
  await page.locator('button.task[data-task-id="read"]').click()
  await page.reload()
  await expect(page.locator('#stage-name')).toHaveText('Adult')
  expect(await xpTotal(page)).toBe(from('adult') + 100 + XP('read'))
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await expect(page.locator('#dragon-art svg')).toBeVisible()
  await context.setOffline(false)
  expect(msgs.filter((m) => !m.includes('ERR_INTERNET_DISCONNECTED'))).toEqual([])
})
