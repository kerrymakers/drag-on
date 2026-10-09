// Phone-tester checks for M7 slice 3 (six new rare items). Screenshots: tests/screenshots/m7s3-phone-*
import { test, expect, type Page } from '../e2e/fixtures'
import * as fs from 'node:fs'
import { ITEMS } from '../../src/config/items'
import { REWARDS } from '../../src/config/rewards'
import { STAGES } from '../../src/config/stages'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = 'm7s3-phone'
const NOW = new Date('2026-10-13T10:00:00+01:00')
const DAY = 86_400_000
const RARE_ROLL = REWARDS.rareChance / 3
const NEW = ITEMS.slice(-6).map((i) => i.id)
const OLD = ITEMS.slice(0, -6).map((i) => i.id)
const OUTFITS = [
  { head: 'sunhat', neck: 'garland', held: 'teddy' },
  { head: 'beret', neck: 'moon', held: 'cookie' },
]
const LOOK_TASK = { neutral: 'gym', strength: 'gym', discipline: 'avoided', wisdom: 'read', heart: 'selfcare' } as const
const from = (s: string) => STAGES.find((x) => x.id === s)!.xpFrom
const STAGE_LOOKS = [
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

function data({ xp, taskId = 'gym', stage, finds = [] as string[], wearing, daysAgo = 1 }: { xp: number; taskId?: string; stage?: string; finds?: string[]; wearing?: object; daysAgo?: number }) {
  const last = NOW.getTime() - daysAgo * DAY
  const events: object[] = []
  if (xp) events.push({ id: 'xp', type: 'log', taskId, timestamp: last - 60 * 60_000, xpAwarded: xp, ...(stage ? { stageReached: stage } : {}) })
  finds.forEach((id, k) =>
    events.push({ id: `f${k}`, type: 'log', taskId: 'avoided', timestamp: last - (finds.length - k) * 60_000, xpAwarded: 0, reward: { kind: 'item', itemId: id } }),
  )
  const d: Record<string, unknown> = { schemaVersion: 1, events }
  if (wearing) d.settings = { wearing }
  return d
}

async function load(page: Page, d: object) {
  await page.evaluate((d) => {
    localStorage.clear()
    localStorage.setItem('drag-on:v1', JSON.stringify(d))
  }, d)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
}

/** Worn item geometry vs svg, clipping ancestors and viewport, plus drawn size in CSS px. */
async function worn(page: Page, root: string) {
  return page.evaluate((root) => {
    const R = (e: Element) => {
      const b = e.getBoundingClientRect()
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }
    }
    const svg = document.querySelector(`${root} .dragon-svg`)!
    const sv = R(svg)
    const clips: ReturnType<typeof R>[] = []
    for (let e: Element | null = svg.parentElement; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(R(e))
    }
    return [...document.querySelectorAll(`${root} [data-worn]`)].map((e) => {
      const r = R(e)
      const out: string[] = []
      if (r.w < 1 || r.h < 1) out.push('zero-size')
      if (r.l < sv.l - 1 || r.r > sv.r + 1 || r.t < sv.t - 1 || r.b > sv.b + 1) out.push('outside-svg')
      if (r.l < 0 || r.r > innerWidth || r.t < 0) out.push('off-viewport')
      for (const c of clips) if (r.l < c.l - 1 || r.r > c.r + 1 || r.t < c.t - 1 || r.b > c.b + 1) out.push('clipped-by-ancestor')
      return { id: (e as HTMLElement).dataset.worn!, w: Math.round(r.w), h: Math.round(r.h), problems: out }
    })
  }, root)
}

async function sheet(page: Page, name: string, list: { label: string; file: string }[], cols = 6) {
  const html = `<html><body style="margin:0;background:#888;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},1fr);gap:2px">${list
    .map((s) => `<div><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><div style="background:#fff">${s.label}</div></div>`)
    .join('')}</body></html>`
  const p2 = await page.context().newPage()
  await p2.setViewportSize({ width: 1500, height: 900 })
  await p2.setContent(html)
  await p2.screenshot({ path: `${dir}/${PFX}-sheet-${name}.png`, fullPage: true })
  await p2.close()
}

// 1. Each new item worn on every stage/look, light and dark, at both sizes.
test('art matrix: new items on every stage and look', async ({ page }, info) => {
  test.setTimeout(600_000)
  const P = info.project.name
  const msgs = collectConsole(page)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  const problems: string[] = []
  const sizes: Record<string, Record<string, string>> = {}
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    const shots: { label: string; file: string }[] = []
    for (const { stage, look } of STAGE_LOOKS)
      for (let o = 0; o < OUTFITS.length; o++) {
        await load(page, data({ xp: from(stage) + 10, taskId: LOOK_TASK[look as keyof typeof LOOK_TASK], stage, finds: ITEMS.map((i) => i.id), wearing: OUTFITS[o] }))
        const svg = page.locator('#dragon-art .dragon-svg')
        await expect(svg).toHaveAttribute('data-stage', stage)
        await expect(svg).toHaveAttribute('data-evolution', look)
        await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(3)
        await page.waitForTimeout(400)
        for (const w of await worn(page, '#dragon-art')) {
          if (w.problems.length) problems.push(`${P} ${scheme} ${stage}/${look} ${w.id}: ${w.problems.join(',')}`)
          ;(sizes[w.id] ??= {})[stage] = `${w.w}x${w.h}`
        }
        const file = `${dir}/${PFX}-${P}-art-${scheme}-${stage}-${look}-o${o}.png`
        await page.locator('#dragon-art').screenshot({ path: file })
        shots.push({ label: `${stage} ${look} o${o}`, file })
      }
    await sheet(page, `${P}-art-${scheme}`, shots)
  }
  console.log('SIZES', P, JSON.stringify(sizes))
  console.log('PROBLEMS', P, JSON.stringify(problems, null, 1))
  expect.soft(problems).toEqual([])
  expect(msgs).toEqual([])
})

// 1b. Dragon screen and Collection preview with a new outfit (hatchling + elder).
for (const scheme of ['light', 'dark'] as const)
  test(`other screens wearing new items (${scheme})`, async ({ page }, info) => {
    const P = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.clock.setFixedTime(NOW)
    await page.goto('./')
    const problems: string[] = []
    for (const [stage, o] of [['hatchling', 0], ['elder', 1]] as const) {
      await load(page, data({ xp: from(stage) + 10, taskId: 'read', stage, finds: ITEMS.map((i) => i.id), wearing: OUTFITS[o] }))
      await page.getByRole('link', { name: 'Dragon' }).click()
      await expect(page.locator('#dragon-screen .ds-art [data-worn]')).toHaveCount(3)
      await page.waitForTimeout(400)
      for (const w of await worn(page, '#dragon-screen .ds-art')) if (w.problems.length) problems.push(`dragon ${stage} ${w.id}: ${w.problems}`)
      await page.screenshot({ path: `${dir}/${PFX}-${P}-dragon-${scheme}-${stage}.png` })
      await page.getByRole('link', { name: 'Collection' }).click()
      await expect(page.locator('#collection-screen .cs-art [data-worn]')).toHaveCount(3)
      await page.waitForTimeout(400)
      for (const w of await worn(page, '#collection-screen .cs-art')) if (w.problems.length) problems.push(`collection ${stage} ${w.id}: ${w.problems}`)
      await page.screenshot({ path: `${dir}/${PFX}-${P}-cs-preview-${scheme}-${stage}.png` })
      await page.getByRole('link', { name: 'Home' }).click()
    }
    expect.soft(problems).toEqual([])
    expect(msgs).toEqual([])
  })

// 2. Collection: all found, only the new six unknown, only the new six found.
for (const scheme of ['light', 'dark'] as const)
  test(`collection states (${scheme})`, async ({ page }, info) => {
    const P = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.clock.setFixedTime(NOW)
    await page.goto('./')
    const cases = { all: ITEMS.map((i) => i.id), oldonly: OLD, newonly: NEW, mixed: [...OLD.slice(0, 9), ...NEW.slice(0, 3)] }
    const report: Record<string, unknown> = {}
    for (const [name, finds] of Object.entries(cases)) {
      await load(page, data({ xp: from('adult') + 10, taskId: 'read', stage: 'adult', finds }))
      await page.getByRole('link', { name: 'Collection' }).click()
      const screen = page.locator('#collection-screen')
      await expect(screen.locator('.cs-count')).toHaveText(`${finds.length} of ${ITEMS.length} found`)
      await expect(screen.locator('.item-tile.is-found')).toHaveCount(finds.length)
      await expect(screen.locator('.item-tile.is-unknown')).toHaveCount(ITEMS.length - finds.length)
      const g = await page.evaluate(() => {
        const tiles = [...document.querySelectorAll<HTMLElement>('#collection-screen .item-tile')]
        return {
          docW: document.documentElement.scrollWidth,
          vw: innerWidth,
          small: tiles.map((t) => t.getBoundingClientRect()).filter((b) => b.width < 44 || b.height < 44).length,
          minTile: Math.round(Math.min(...tiles.map((t) => Math.min(t.getBoundingClientRect().width, t.getBoundingClientRect().height)))),
          overflowNames: [...document.querySelectorAll<HTMLElement>('.item-tile-name')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
          unknownText: [...document.querySelectorAll<HTMLElement>('#collection-screen .item-tile.is-unknown')].map((t) => t.textContent?.trim() + '|' + (t.getAttribute('aria-label') ?? '')).filter((s, i, a) => a.indexOf(s) === i),
          leaks: [...document.querySelectorAll<HTMLElement>('#collection-screen .item-tile.is-unknown [data-item], #collection-screen .item-tile.is-unknown svg:not(.item-unknown)')].length,
        }
      })
      report[name] = g
      expect.soft(g.docW, name).toBeLessThanOrEqual(g.vw)
      expect.soft(g.small, name).toBe(0)
      expect.soft(g.overflowNames, name).toEqual([])
      expect.soft(g.leaks, name).toBe(0)
      await page.screenshot({ path: `${dir}/${PFX}-${P}-collection-${scheme}-${name}.png`, fullPage: true })
      // Scroll to the grid's end too (fullPage may not capture inner scrollers).
      await screen.locator('.item-tile').last().scrollIntoViewIfNeeded()
      await page.waitForTimeout(250)
      await page.screenshot({ path: `${dir}/${PFX}-${P}-collection-${scheme}-${name}-end.png` })
      await page.getByRole('link', { name: 'Home' }).click()
    }
    console.log('COLLECTION', P, scheme, JSON.stringify(report))
    expect(msgs).toEqual([])
  })

// 3. The item-found card for each new item (hatchling, so it goes straight on), both schemes.
for (const scheme of ['light', 'dark'] as const)
  for (const motion of ['no-preference', 'reduce'] as const)
    test(`find card for each new item (${scheme}, ${motion})`, async ({ page }, info) => {
      test.setTimeout(180_000)
      const P = info.project.name
      const msgs = collectConsole(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: motion })
      await page.addInitScript((r) => (Math.random = () => r), RARE_ROLL)
      await page.clock.setFixedTime(NOW)
      await page.goto('./')
      for (const id of NEW) {
        // Everything else found, wearing nothing, so this one is next and goes on.
        await load(page, data({ xp: from('whelp') + 10, taskId: 'read', stage: 'whelp', finds: ITEMS.map((i) => i.id).filter((x) => x !== id) }))
        const t0 = Date.now()
        await page.locator('button.task[data-task-id="read"]').click()
        const card = page.locator('.overlay.item-found')
        await expect(card).toBeVisible()
        await expect(card).toHaveAttribute('data-item', id)
        await expect(card.locator(`.item-found-art svg[data-item="${id}"]`)).toHaveCount(1)
        await expect(card.locator('.item-found-name')).toHaveText(ITEMS.find((i) => i.id === id)!.name)
        await expect(card).toHaveClass(/is-revealed/)
        await page.waitForTimeout(motion === 'reduce' ? 100 : 700)
        const g = await card.evaluate((c) => {
          const art = c.querySelector('.item-found-art svg')!.getBoundingClientRect()
          const cardR = c.querySelector('.item-card')!.getBoundingClientRect()
          const btn = c.querySelector('.overlay-button')!.getBoundingClientRect()
          return {
            art: [Math.round(art.width), Math.round(art.height)],
            inCard: art.left >= cardR.left && art.right <= cardR.right && art.top >= cardR.top,
            cardInView: cardR.left >= 0 && cardR.right <= innerWidth && cardR.top >= 0 && cardR.bottom <= innerHeight,
            btn: [Math.round(btn.width), Math.round(btn.height)],
            anims: document.getAnimations().filter((a) => a.playState === 'running').map((a) => (a as CSSAnimation).animationName ?? 'transition'),
          }
        })
        console.log('CARD', P, scheme, motion, id, JSON.stringify(g), 'ms', Date.now() - t0)
        expect.soft(g.inCard, id).toBe(true)
        expect.soft(g.cardInView, id).toBe(true)
        expect.soft(g.btn[1], id).toBeGreaterThanOrEqual(44)
        if (motion === 'no-preference') await page.screenshot({ path: `${dir}/${PFX}-${P}-card-${scheme}-${id}.png` })
        await page.waitForTimeout(650)
        await card.click()
        await expect(card).toHaveCount(0)
        // It's on the dragon now, and the log survives a reload.
        await expect(page.locator(`#dragon-art [data-worn="${id}"]`)).toHaveCount(1)
        await page.reload()
        await expect(page.locator(`#dragon-art [data-worn="${id}"]`)).toHaveCount(1)
        const last = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.at(-1))
        expect(last.reward).toEqual({ kind: 'item', itemId: id })
      }
      expect(msgs).toEqual([])
    })

// 4. Offline: find a new item offline, reload, still there.
test('offline find of a new item survives reload', async ({ page, context }, info) => {
  const msgs = collectConsole(page)
  await page.addInitScript((r) => (Math.random = () => r), RARE_ROLL)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await load(page, data({ xp: from('hatchling') + 10, finds: OLD }))
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await context.setOffline(true)
  await page.locator('button.task[data-task-id="read"]').click()
  await expect(page.locator('.overlay.item-found')).toHaveAttribute('data-item', 'sunhat')
  await page.reload()
  await expect(page.locator('#dragon-art [data-worn="sunhat"]')).toHaveCount(1)
  await page.getByRole('link', { name: 'Collection' }).click()
  await expect(page.locator('#collection-screen .item-tile.is-found')).toHaveCount(OLD.length + 1)
  await context.setOffline(false)
  expect(msgs.filter((m) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m))).toEqual([])
})
