// Phone-tester pass for Milestone 4 slice 2: Collection tab and the "found something"
// card. 410x914 (pixel10pro project) and 360x800 (narrow360 project), light/dark,
// reduced motion, offline, installed-PWA height, Android back, console.
import { test, expect, type Page } from '../e2e/fixtures'
import { ITEMS } from '../../src/config/items'
import { REWARDS } from '../../src/config/rewards'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const NOW = new Date('2026-10-13T10:00:00+01:00')
const RARE_ROLL = REWARDS.rareChance / 3

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

async function open(page: Page, roll: number | null, hash = '') {
  await page.addInitScript((r) => {
    if (r !== null) Math.random = () => r
  }, roll)
  await page.clock.setFixedTime(NOW)
  await page.goto('./' + hash)
  await expect(page.locator('#tabbar a').first()).toBeVisible()
}

function lum(rgb: string) {
  const [r, g, b] = rgb.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return +((l1! + 0.05) / (l2! + 0.05)).toFixed(2)
}

function foundEvents(n: number) {
  const t = Date.parse('2026-10-05T09:00:00+01:00')
  return ITEMS.slice(0, n).map((item, k) => ({
    id: `f${k}`,
    type: 'log',
    taskId: 'avoided',
    timestamp: t + (k % 8) * 86_400_000,
    xpAwarded: 15,
    reward: { kind: 'item', itemId: item.id },
  }))
}

async function measureCollection(page: Page) {
  return page.evaluate(() => {
    const cs = (e: Element) => getComputedStyle(e)
    const tiles = [...document.querySelectorAll('#collection-screen .item-tile')].map((e) => e.getBoundingClientRect())
    const top0 = tiles[0]!.top
    const body = cs(document.body).backgroundColor
    const count = document.querySelector('.cs-count')!
    const unk = document.querySelector('.item-tile.is-unknown .item-tile-art')
    const unkTile = document.querySelector('.item-tile.is-unknown')
    const date = document.querySelector('.item-tile.is-found .item-tile-date')
    const name = document.querySelector('.item-tile.is-found .item-tile-name')
    const foundTile = document.querySelector('.item-tile.is-found')
    const line = document.querySelector('.cs-line')!
    return {
      vw: innerWidth,
      docW: document.documentElement.scrollWidth,
      docH: document.documentElement.scrollHeight,
      vh: innerHeight,
      perRow: tiles.filter((r) => Math.abs(r.top - top0) < 1).length,
      minW: Math.min(...tiles.map((r) => r.width)),
      minH: Math.min(...tiles.map((r) => r.height)),
      left: Math.min(...tiles.map((r) => r.left)),
      right: Math.max(...tiles.map((r) => r.right)),
      tabbarTop: document.querySelector('.tabbar')!.getBoundingClientRect().top,
      body,
      count: [cs(count).color, cs(count).backgroundColor],
      line: [cs(line).color, body],
      unk: unk ? [cs(unk).color, cs(unk).backgroundColor] : null,
      unkBorder: unkTile ? [cs(unkTile).borderTopColor, body] : null,
      date: date && foundTile ? [cs(date).color, cs(foundTile).backgroundColor] : null,
      name: name && foundTile ? [cs(name).color, cs(foundTile).backgroundColor] : null,
      nameOverflow: [...document.querySelectorAll<HTMLElement>('.item-tile-name')].some((n) => n.scrollWidth > n.clientWidth + 1),
      scroller: (() => {
        const s = document.querySelector<HTMLElement>('.cs-scroll')!
        return { sh: s.scrollHeight, ch: s.clientHeight, sw: s.scrollWidth, cw: s.clientWidth }
      })(),
    }
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`tabs and Collection (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, null)
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${dir}/m4s2-phone-home-${scheme}-${p}.png` })

    // Tab bar: 5 tabs since M6 (Settings), sizes, spacing, centred.
    const tabs = await page.$$eval('#tabbar a', (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return { label: e.textContent?.trim(), x: Math.round(r.x), w: Math.round(r.width), h: Math.round(r.height), cx: Math.round(r.x + r.width / 2) }
      }),
    )
    const bar = await page.locator('#tabbar').boundingBox()
    console.log(p, scheme, 'tabs', JSON.stringify(tabs), 'bar', JSON.stringify(bar))
    expect(tabs).toHaveLength(5)
    for (const t of tabs) {
      expect(t.w).toBeGreaterThanOrEqual(44)
      expect(t.h).toBeGreaterThanOrEqual(44)
    }
    const labelOverflow = await page.$$eval('#tabbar a', (els) => els.some((e) => e.scrollWidth > e.clientWidth + 1))
    expect(labelOverflow).toBe(false)

    // Empty Collection.
    await page.getByRole('link', { name: 'Collection' }).click()
    await expect(page.locator('#collection-screen')).toBeVisible()
    await page.waitForTimeout(300)
    const empty = await measureCollection(page)
    console.log(p, scheme, 'empty', JSON.stringify(empty), {
      count: contrast(empty.count[0]!, empty.count[1]!),
      line: contrast(empty.line[0]!, empty.line[1]!),
      unk: empty.unk && contrast(empty.unk[0]!, empty.unk[1]!),
      unkBorder: empty.unkBorder && contrast(empty.unkBorder[0]!, empty.unkBorder[1]!),
    })
    expect(empty.perRow).toBe(3)
    expect(empty.docW).toBeLessThanOrEqual(empty.vw)
    expect(empty.scroller.sw).toBeLessThanOrEqual(empty.scroller.cw)
    expect(empty.minW).toBeGreaterThanOrEqual(44)
    expect(empty.minH).toBeGreaterThanOrEqual(44)
    expect(contrast(empty.count[0]!, empty.count[1]!)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(empty.unk![0]!, empty.unk![1]!)).toBeGreaterThanOrEqual(3)
    await page.screenshot({ path: `${dir}/m4s2-phone-collection-empty-${scheme}-${p}.png` })
    expect(msgs).toEqual([])
  })

  for (const n of [5, ITEMS.length]) {
    test(`Collection with ${n} found (${scheme})`, async ({ page }, info) => {
      const p = info.project.name
      const msgs = collectConsole(page)
      await page.emulateMedia({ colorScheme: scheme })
      await seed(page, foundEvents(n))
      await open(page, null, '#/collection')
      await expect(page.locator('.cs-count')).toHaveText(`${n} of ${ITEMS.length} found`)
      await page.waitForTimeout(300)
      const m = await measureCollection(page)
      console.log(p, scheme, n, JSON.stringify(m), {
        date: m.date && contrast(m.date[0]!, m.date[1]!),
        name: m.name && contrast(m.name[0]!, m.name[1]!),
        count: contrast(m.count[0]!, m.count[1]!),
      })
      expect(m.perRow).toBe(3)
      expect(m.docW).toBeLessThanOrEqual(m.vw)
      expect(m.scroller.sw).toBeLessThanOrEqual(m.scroller.cw)
      expect(m.nameOverflow).toBe(false)
      expect(contrast(m.date![0]!, m.date![1]!)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(m.name![0]!, m.name![1]!)).toBeGreaterThanOrEqual(4.5)
      await page.screenshot({ path: `${dir}/m4s2-phone-collection-${n}-${scheme}-${p}.png` })
      if (m.scroller.sh > m.scroller.ch) {
        await page.locator('.cs-scroll').evaluate((e) => (e.scrollTop = e.scrollHeight))
        await page.waitForTimeout(200)
        await page.screenshot({ path: `${dir}/m4s2-phone-collection-${n}-${scheme}-${p}-bottom.png` })
        // The last row clears the tab bar when scrolled to the end.
        const lastBottom = await page.$$eval('.item-tile', (els) => Math.max(...els.map((e) => e.getBoundingClientRect().bottom)))
        expect(lastBottom).toBeLessThanOrEqual(m.tabbarTop + 1)
      }
      expect(msgs).toEqual([])
    })
  }

  test(`find card: one tap, readable, guard, closes (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, RARE_ROLL)
    // One tap on a task.
    await page.locator('button.task[data-task-id="read"]').tap()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.length)
    expect(saved).toBe(1)
    const card = page.locator('.overlay.item-found')
    await expect(card).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${dir}/m4s2-phone-card-${scheme}-${p}.png` })
    const g = await page.evaluate(() => {
      const c = document.querySelector('.item-card')!.getBoundingClientRect()
      const b = document.querySelector('.item-found .overlay-button')!.getBoundingClientRect()
      const cs = (s: string) => getComputedStyle(document.querySelector(s)!)
      return {
        card: { x: c.x, y: c.y, r: c.right, b: c.bottom },
        btn: { w: b.width, h: b.height },
        vw: innerWidth,
        vh: innerHeight,
        heading: [cs('.item-found-heading').color, cs('.item-card').backgroundColor],
        name: [cs('.item-found-name').color, cs('.item-card').backgroundColor],
        line: [cs('.item-found-line').color, cs('.item-card').backgroundColor],
        saved: [cs('.item-found-saved').color, cs('.item-card').backgroundColor],
        btnC: [cs('.item-found .overlay-button').color, cs('.item-found .overlay-button').backgroundColor],
      }
    })
    const cons = {
      heading: contrast(g.heading[0]!, g.heading[1]!),
      name: contrast(g.name[0]!, g.name[1]!),
      line: contrast(g.line[0]!, g.line[1]!),
      saved: contrast(g.saved[0]!, g.saved[1]!),
      btn: contrast(g.btnC[0]!, g.btnC[1]!),
    }
    console.log(p, scheme, 'card', JSON.stringify(g), JSON.stringify(cons))
    expect(g.card.x).toBeGreaterThanOrEqual(0)
    expect(g.card.r).toBeLessThanOrEqual(g.vw)
    expect(g.card.y).toBeGreaterThanOrEqual(0)
    expect(g.card.b).toBeLessThanOrEqual(g.vh)
    expect(g.btn.w).toBeGreaterThanOrEqual(44)
    expect(g.btn.h).toBeGreaterThanOrEqual(44)
    for (const [k, v] of Object.entries(cons)) expect.soft(v, k).toBeGreaterThanOrEqual(4.5)
    // Tap anywhere (scrim corner) closes after the guard.
    await page.touchscreen.tap(20, 20)
    await expect(card).toHaveCount(0)
    await expect(page.locator('#toast')).toHaveClass(/is-showing/)
    await page.screenshot({ path: `${dir}/m4s2-phone-card-closed-${scheme}-${p}.png` })
    // Collection shows the find.
    await page.getByRole('link', { name: 'Collection' }).tap()
    await expect(page.locator('.cs-count')).toHaveText(`1 of ${ITEMS.length} found`)
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/m4s2-phone-collection-1-${scheme}-${p}.png` })
    expect(msgs).toEqual([])
  })

  test(`find chained after hatch (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await seed(page, [{ id: 'a', type: 'log', taskId: 'read', timestamp: Date.parse('2026-10-12T09:00:00+01:00'), xpAwarded: 90 }])
    await open(page, RARE_ROLL)
    await page.locator('button.task[data-task-id="gym"]').tap()
    const stage = page.locator('.overlay:not(.item-found)')
    await expect(stage).toBeVisible()
    await expect(page.locator('.overlay.item-found')).toHaveCount(0)
    await page.waitForTimeout(1300)
    await page.screenshot({ path: `${dir}/m4s2-phone-hatch-${scheme}-${p}.png` })
    await page.locator('.overlay:not(.item-found) .overlay-button').tap()
    const card = page.locator('.overlay.item-found')
    await expect(card).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${dir}/m4s2-phone-hatch-card-${scheme}-${p}.png` })
    await page.touchscreen.tap(20, 20)
    await expect(page.locator('.overlay')).toHaveCount(0)
    await expect(page.locator('#toast')).toHaveClass(/is-showing/)
    await page.screenshot({ path: `${dir}/m4s2-phone-hatch-after-${scheme}-${p}.png` })
    expect(msgs).toEqual([])
  })
}

test('reduced motion: card and tab switch', async ({ page }, info) => {
  const p = info.project.name
  const msgs = collectConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').tap()
  await expect(page.locator('.overlay.item-found')).toBeVisible()
  const anim = await page.evaluate(() =>
    document.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName ?? 'transition',
      dur: (a.effect?.getTiming().duration as number) ?? 0,
      target: ((a.effect as KeyframeEffect)?.target as Element | null)?.className?.toString().slice(0, 40),
    })),
  )
  console.log(p, 'rm animations', JSON.stringify(anim))
  const art = await page.evaluate(() => getComputedStyle(document.querySelector('.item-found-art')!).animationName)
  const cardA = await page.evaluate(() => getComputedStyle(document.querySelector('.item-card')!).animationName)
  expect(art).toBe('none')
  expect(cardA).not.toBe('item-card-in')
  await page.waitForTimeout(100)
  await page.screenshot({ path: `${dir}/m4s2-phone-card-rm-${p}.png` })
  await page.waitForTimeout(600)
  await page.touchscreen.tap(20, 20)
  await expect(page.locator('.overlay.item-found')).toHaveCount(0)
  expect(msgs).toEqual([])
})

test('Android back returns Home from Collection', async ({ page }) => {
  const msgs = collectConsole(page)
  await open(page, null)
  await page.getByRole('link', { name: 'Collection' }).tap()
  await expect(page).toHaveURL(/#\/collection$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/drag-on\/(#\/?)?$/)
  await expect(page.locator('#home')).toBeVisible()
  await expect(page.locator('#collection-screen')).toBeHidden()
  // Home -> Dragon -> Collection -> back = Home
  await page.getByRole('link', { name: 'Dragon' }).tap()
  await page.getByRole('link', { name: 'Collection' }).tap()
  await expect(page.locator('#collection-screen')).toBeVisible()
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  // Collection -> Dragon -> back = Home
  await page.getByRole('link', { name: 'Collection' }).tap()
  await page.getByRole('link', { name: 'Dragon' }).tap()
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  // Collection -> Home tab -> back leaves the app (no stray Collection entry)
  await page.getByRole('link', { name: 'Collection' }).tap()
  await page.getByRole('link', { name: 'Home' }).tap()
  await expect(page.locator('#home')).toBeVisible()
  const len = await page.evaluate(() => history.length)
  console.log('history length after round trip', len)
  // Deep link + back
  expect(msgs).toEqual([])
})

test('installed-PWA height 410x840: Home fits without scrolling', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  for (const scheme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width: 410, height: 840 })
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, null)
    await page.waitForTimeout(400)
    const r = await page.evaluate(() => {
      const s = document.scrollingElement!
      const list = document.getElementById('tasks')!
      return {
        sh: s.scrollHeight,
        ch: s.clientHeight,
        sw: s.scrollWidth,
        cw: s.clientWidth,
        listOver: list.scrollHeight - list.clientHeight,
        lastTaskBottom: Math.max(...[...document.querySelectorAll('button.task')].map((e) => e.getBoundingClientRect().bottom)),
        tabbarTop: document.querySelector('.tabbar')!.getBoundingClientRect().top,
        tasks: [...document.querySelectorAll('button.task')].map((e) => {
          const b = e.getBoundingClientRect()
          return [Math.round(b.width), Math.round(b.height)]
        }),
      }
    })
    console.log('840', scheme, JSON.stringify(r))
    expect(r.sh).toBe(r.ch)
    expect(r.sw).toBeLessThanOrEqual(r.cw)
    expect(r.listOver).toBeLessThanOrEqual(0)
    expect(r.lastTaskBottom).toBeLessThanOrEqual(r.tabbarTop)
    for (const [w, h] of r.tasks) {
      expect(w).toBeGreaterThanOrEqual(44)
      expect(h).toBeGreaterThanOrEqual(44)
    }
    await page.screenshot({ path: `${dir}/m4s2-phone-home-410x840-${scheme}.png` })
    await page.getByRole('link', { name: 'Collection' }).tap()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/m4s2-phone-collection-410x840-${scheme}.png` })
  }
})

test('offline: log with a find, reload offline, still there', async ({ page, context }, info) => {
  const p = info.project.name
  const msgs = collectConsole(page)
  await open(page, RARE_ROLL)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true)
  await context.setOffline(true)
  await page.locator('button.task[data-task-id="read"]').tap()
  await expect(page.locator('.overlay.item-found')).toBeVisible()
  await page.waitForTimeout(700)
  await page.touchscreen.tap(20, 20)
  await expect(page.locator('.overlay.item-found')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await expect(page.locator('#xp-total')).not.toHaveText('0')
  await page.getByRole('link', { name: 'Collection' }).tap()
  await expect(page.locator('.cs-count')).toHaveText(`1 of ${ITEMS.length} found`)
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${dir}/m4s2-phone-offline-collection-${p}.png` })
  // Deep reload straight into Collection offline.
  await page.reload()
  await expect(page.locator('#collection-screen')).toBeVisible()
  await expect(page.locator('.item-tile.is-found')).toHaveCount(1)
  await context.setOffline(false)
  console.log(p, 'offline console', JSON.stringify(msgs))
  expect(msgs.filter((m) => !/net::ERR_INTERNET_DISCONNECTED/.test(m))).toEqual([])
})
