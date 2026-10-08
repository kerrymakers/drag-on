// Milestone 3, Slice 1: fixed layout, tab bar, Dragon screen, Heart task.
import { test, expect, settle, shot, SWEEPS_SIZES, type Page } from './fixtures'
import { STAGES } from '../../src/config/stages'
import { TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const TUE_0600 = new Date('2026-10-06T06:00:00+01:00')
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp

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

const box = (page: Page, sel: string) =>
  page.locator(sel).first().evaluate((e) => {
    const b = e.getBoundingClientRect()
    return { t: b.top, b: b.bottom, w: b.width, h: b.height }
  })

for (const [w, h] of [[410, 840], [410, 914], [360, 800]] as const) {
  test(`home fits without scrolling at ${w}x${h} on a weekday at 06:00`, SWEEPS_SIZES, async ({ page }, info) => {
    test.skip(info.project.name !== 'pixel10pro')
    const msgs = collectConsole(page)
    await page.setViewportSize({ width: w, height: h })
    await page.clock.install({ time: TUE_0600 })
    await page.goto('./')
    await page.locator('button.task[data-task-id="gym"]').click() // show Undo
    await expect(page.locator('button.task')).toHaveCount(TASKS.length)
    const g = await page.evaluate(() => {
      const t = document.querySelector<HTMLElement>('#tasks')!
      return {
        docH: document.documentElement.scrollHeight,
        listOverflow: t.scrollHeight - t.clientHeight,
        fade: t.dataset.fade ?? '',
        undoBottom: document.querySelector('#undo')!.getBoundingClientRect().bottom,
        tabTop: document.querySelector('.tabbar')!.getBoundingClientRect().top,
      }
    })
    expect(g.docH).toBeLessThanOrEqual(h)
    expect(g.listOverflow).toBeLessThanOrEqual(0)
    expect(g.fade).toBe('')
    expect(g.undoBottom).toBeLessThanOrEqual(g.tabTop + 0.5)
    expect(msgs).toEqual([])
  })
}

test('on a short screen only the task list scrolls, with a fade, and the header stays put', SWEEPS_SIZES, async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  await page.setViewportSize({ width: 360, height: 640 })
  await page.clock.install({ time: TUE_0600 })
  await page.goto('./')
  const headerBefore = await box(page, '.top')
  await expect(page.locator('#tasks')).toHaveAttribute('data-fade', 'bottom')
  await page.locator('#tasks').evaluate((e) => e.scrollTo(0, 9999))
  await expect(page.locator('#tasks')).toHaveAttribute('data-fade', 'top')
  await page.mouse.wheel(0, 500)
  expect(await page.evaluate(() => [window.scrollY, document.documentElement.scrollHeight])).toEqual([0, 640])
  expect(await box(page, '.top')).toEqual(headerBefore)
  await expect(page.locator('#mood-chip')).toBeInViewport()
  await expect(page.locator('#undo')).toBeInViewport()
})

test('tab bar: big targets, aria-current, hash routes and the back button', async ({ page }) => {
  const msgs = collectConsole(page)
  await page.clock.install({ time: TUE_0600 })
  await page.goto('./')
  const tabs = page.locator('.tabbar a.tab')
  await expect(tabs).toHaveCount(4)
  for (const i of [0, 1, 2, 3]) {
    const b = await box(page, `.tabbar a.tab >> nth=${i}`)
    expect(b.h).toBeGreaterThanOrEqual(48)
    expect(b.w).toBeGreaterThanOrEqual(48)
  }
  const home = page.getByRole('link', { name: 'Home' })
  const dragon = page.getByRole('link', { name: 'Dragon' })
  await expect(home).toHaveAttribute('aria-current', 'page')
  await expect(dragon).not.toHaveAttribute('aria-current', /.*/)

  await dragon.click()
  await expect(page).toHaveURL(/#\/dragon$/)
  await expect(dragon).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('#home')).toBeHidden()
  await expect(page.locator('#dragon-screen')).toBeVisible()

  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  await expect(home).toHaveAttribute('aria-current', 'page')

  // Home tab from Dragon goes back, so history doesn't pile up.
  await dragon.click()
  await home.click()
  await expect(page.locator('#home')).toBeVisible()
  await page.goForward()
  await expect(page.locator('#dragon-screen')).toBeVisible()

  // Logging is still one tap on Home.
  await page.goBack()
  await page.locator('button.task[data-task-id="selfcare"]').click()
  await expect(page.locator('#xp-total')).toHaveText(String(XP('selfcare')))
  expect(msgs).toEqual([])
})

test('Dragon screen: stats, history with dates, and locked stages that give nothing away', async ({ page }) => {
  const msgs = collectConsole(page)
  const hatch = STAGES.find((s) => s.id === 'hatchling')!
  await seed(page, [
    { id: 'a', type: 'log', taskId: 'read', timestamp: Date.parse('2026-09-20T12:00:00+01:00'), xpAwarded: 40 },
    { id: 'b', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-09-22T12:00:00+01:00'), xpAwarded: hatch.xpFrom, stageReached: 'hatchling' },
  ])
  await page.clock.install({ time: TUE_0600 })
  await page.goto('./#/dragon')
  const screen = page.locator('#dragon-screen')
  await expect(screen).toBeVisible()
  await expect(screen.locator('.stage-name')).toHaveText('Hatchling')
  await expect(screen.locator('.stat[data-stat="strength"] .stat-value')).toHaveText(String(hatch.xpFrom))
  await expect(screen.locator('.stat[data-stat="wisdom"] .stat-value')).toHaveText('40')
  await expect(screen.locator('.stat[data-stat="heart"] .stat-value')).toHaveText('0')
  await expect(screen.locator('.history-item.is-reached')).toHaveText([/Egg\s*20 Sep/, /Hatchling\s*22 Sep/])
  await expect(screen.locator('.history-item.is-locked')).toHaveCount(STAGES.length - 2)

  // Nothing about unreached stages anywhere on the screen, visible or not.
  const html = await screen.evaluate((e) => e.innerHTML)
  for (const s of STAGES.slice(2)) {
    expect(html).not.toContain(s.name)
    expect(html).not.toContain(s.id)
  }

  // Logging the Heart task on Home shows up on the Dragon screen.
  await page.getByRole('link', { name: 'Home' }).click()
  await page.locator('button.task[data-task-id="selfcare"]').click()
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(screen.locator('.stat[data-stat="heart"] .stat-value')).toHaveText(String(XP('selfcare')))
  expect(msgs).toEqual([])
})

test('a welcome-back seen on Home is not replayed by switching tabs', async ({ page }) => {
  await seed(page, [
    { id: 'a', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-10-01T12:00:00+01:00'), xpAwarded: 40 },
  ])
  await page.clock.install({ time: new Date('2026-10-06T10:00:00+01:00') })
  await page.goto('./')
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(page.locator('#speech')).not.toHaveClass(/is-showing/)
  await page.getByRole('link', { name: 'Home' }).click()
  await settle(page)
  await expect(page.locator('#speech')).not.toHaveClass(/is-showing/)
})

// ---------------------------------------------------------------------------
// Phone tester, M3 Slice 1: every viewport (incl. the installed-PWA 410x840),
// light and dark, stages, welcome, toast across tabs, reduced motion, offline.
// ---------------------------------------------------------------------------
const VIEWPORTS = [
  [410, 840],
  [410, 914],
  [360, 800],
  [410, 800],
  [360, 680],
] as const
const ROUND = (r: DOMRect) => ({ l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) })

async function pageScroll(page: Page) {
  return page.evaluate(() => {
    const s = document.scrollingElement!
    return { sh: s.scrollHeight, ch: s.clientHeight, sw: s.scrollWidth, cw: s.clientWidth, y: window.scrollY }
  })
}

async function smallTargets(page: Page, root: string) {
  return page.$$eval(`${root} :is(button, a, [role=button], input)`, (els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { id: (e as HTMLElement).dataset.taskId ?? (e as HTMLElement).dataset.route ?? e.id ?? e.className, w: r.width, h: r.height }
      }),
  )
}

for (const [w, h] of VIEWPORTS) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`pt home ${w}x${h} ${scheme}: page never scrolls, list scrolls under a fixed header`, SWEEPS_SIZES, async ({ page }, info) => {
      test.skip(info.project.name !== 'pixel10pro')
      const msgs = collectConsole(page)
      await page.setViewportSize({ width: w, height: h })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.clock.install({ time: TUE_0600 })
      await page.goto('./')
      await page.locator('button.task[data-task-id="gym"]').click()
      await expect(page.locator('#undo')).toBeVisible()
      await expect(page.locator('button.task')).toHaveCount(TASKS.length)
      await expect(page.locator('button.task[data-task-id="wake"]')).toContainText('by 06:45')
      await settle(page) // the log's feedback has finished (the toast is still up, so its Undo is measured too)

      const ps = await pageScroll(page)
      const list = await page.locator('#tasks').evaluate((e) => ({ over: e.scrollHeight - e.clientHeight, fade: e.dataset.fade ?? '' }))
      const t = await smallTargets(page, '#app')
      console.log(`pt ${w}x${h} ${scheme}`, JSON.stringify({ ps, list, small: t.filter((x) => x.w < 44 || x.h < 44) }))
      expect(ps.sh, 'page scrollHeight').toBe(ps.ch)
      expect(ps.sw).toBeLessThanOrEqual(ps.cw)
      for (const x of t) {
        expect(x.w, `${x.id} w`).toBeGreaterThanOrEqual(44)
        expect(x.h, `${x.id} h`).toBeGreaterThanOrEqual(44)
      }
      if (w === 410 && h >= 840) {
        expect(list.over, 'list overflow at 410x840+').toBeLessThanOrEqual(0)
        expect(list.fade).toBe('')
      }
      for (const sel of ['.top', '#mood-chip', '#dragon-art', '.tabbar']) await expect(page.locator(sel).first()).toBeInViewport()
      await shot(page, `m3-home-${w}x${h}-${scheme}`)

      if (list.over > 0) {
        expect(list.fade).toBe('bottom')
        const fixed = () =>
          page.evaluate(() => ['.top', '#mood-chip', '#dragon-art', '.growth-row', '.tabbar'].map((s) => document.querySelector(s)!.getBoundingClientRect().top))
        const before = await fixed()
        // A real finger swipe on the list, then on the header.
        const tb = (await page.locator('#tasks').boundingBox())!
        const cx = tb.x + tb.width / 2
        const client = await page.context().newCDPSession(page)
        const swipe = async (y0: number, y1: number) => {
          await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: y0 }] })
          for (let i = 1; i <= 8; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: y0 + ((y1 - y0) * i) / 8 }] })
          await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
        }
        await swipe(tb.y + tb.height - 10, tb.y + 10)
        await page.waitForTimeout(600) // a fling has no event to wait on: let it coast to a stop
        const st = await page.locator('#tasks').evaluate((e) => ({ top: e.scrollTop, max: e.scrollHeight - e.clientHeight, fade: e.dataset.fade }))
        console.log(`pt ${w}x${h} after swipe`, JSON.stringify(st))
        expect(st.top).toBeGreaterThan(0)
        if (st.top < st.max - 1) {
          expect(st.fade).toBe('both')
          await shot(page, `m3-home-${w}x${h}-${scheme}-midscroll`)
        }
        await page.locator('#tasks').evaluate((e) => e.scrollTo(0, e.scrollHeight))
        await expect(page.locator('#tasks')).toHaveAttribute('data-fade', 'top')
        const hb = (await page.locator('.top').boundingBox())!
        await swipe(hb.y + hb.height / 2, hb.y - 200 > 0 ? hb.y - 200 : 1)
        await page.mouse.wheel(0, 400)
        await page.waitForTimeout(300) // give a wrongly scrolling page time to move
        expect(await fixed()).toEqual(before)
        expect((await pageScroll(page)).y).toBe(0)
        await shot(page, `m3-home-${w}x${h}-${scheme}-scrolled`)
      }
      expect(msgs, msgs.join('\n')).toEqual([])
    })
  }
}

// Each log after the first lands 25 XP past the next stage's threshold (read from config).
const stageFrom = (id: string) => STAGES.find((s) => s.id === id)!.xpFrom
const ADULT_SEED = [
  { id: 'e1', type: 'log', taskId: 'read', timestamp: Date.parse('2025-12-20T12:00:00Z'), xpAwarded: 25 },
  { id: 'e2', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-09-05T12:00:00+01:00'), xpAwarded: stageFrom('hatchling') },
  { id: 'e3', type: 'log', taskId: 'walk', timestamp: Date.parse('2026-09-15T12:00:00+01:00'), xpAwarded: stageFrom('whelp') - stageFrom('hatchling') },
  { id: 'e4', type: 'log', taskId: 'selfcare', timestamp: Date.parse('2026-09-25T12:00:00+01:00'), xpAwarded: stageFrom('juvenile') - stageFrom('whelp') },
  { id: 'e5', type: 'log', taskId: 'wake', timestamp: Date.parse('2026-10-05T12:00:00+01:00'), xpAwarded: stageFrom('adult') - stageFrom('juvenile') },
]
const STAGE_SEEDS: Record<string, { events: object[]; reached: number }> = {
  egg: { events: [], reached: 1 },
  hatchling: {
    events: [
      { id: 'h1', type: 'log', taskId: 'read', timestamp: Date.parse('2026-09-20T12:00:00+01:00'), xpAwarded: 40 },
      { id: 'h2', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-10-06T05:00:00+01:00'), xpAwarded: 80 },
    ],
    reached: 2,
  },
  adult: { events: ADULT_SEED, reached: 5 },
}

async function barCheck(page: Page) {
  return page.$$eval('#dragon-screen .stat', (rows) => {
    const vals = rows.map((r) => Number(r.querySelector('.stat-value')!.textContent))
    const top = Math.max(...vals)
    return rows.map((r, i) => {
      const track = r.querySelector('.stat-bar')!.getBoundingClientRect().width
      const fill = r.querySelector('.stat-fill')!.getBoundingClientRect().width
      return { stat: (r as HTMLElement).dataset.stat, v: vals[i], frac: track ? fill / track : 0, expected: top > 0 && vals[i]! > 0 ? Math.max(0.05, vals[i]! / top) : 0 }
    })
  })
}

async function leakCheck(page: Page, reachedCount: number) {
  const hidden = STAGES.slice(reachedCount)
  return page.evaluate((stages) => {
    const screen = document.querySelector('#dragon-screen')!
    const attrs = [...screen.querySelectorAll('*'), screen].flatMap((e) => [...e.attributes].map((a) => `${a.name}=${a.value}`)).join(' ')
    const screenText = (screen.textContent ?? '') + ' ' + attrs + ' ' + screen.innerHTML
    const whole = document.documentElement.outerHTML
    const hits = (s: string) => stages.filter((st) => new RegExp(`\\b(${st.id}|${st.name})\\b`, 'i').test(s)).map((st) => st.id)
    return { screen: hits(screenText), page: hits(whole) }
  }, hidden.map((s) => ({ id: s.id, name: s.name })))
}

for (const [w, h] of [[410, 840], [360, 680], [410, 914]] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    for (const stage of ['egg', 'hatchling', 'adult'] as const) {
      test(`pt dragon screen ${stage} ${w}x${h} ${scheme}`, SWEEPS_SIZES, async ({ page }, info) => {
        test.skip(info.project.name !== 'pixel10pro')
        const msgs = collectConsole(page)
        const seedData = STAGE_SEEDS[stage]!
        await seed(page, seedData.events)
        await page.setViewportSize({ width: w, height: h })
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.clock.install({ time: TUE_0600 })
        await page.goto('./#/dragon')
        const screen = page.locator('#dragon-screen')
        await expect(screen).toBeVisible()
        await expect(screen.locator('.stage-name')).toHaveText(STAGES.find((s) => s.id === stage)!.name)
        await expect(screen.locator('.history-item.is-reached')).toHaveCount(seedData.reached)
        await expect(screen.locator('.history-item.is-locked')).toHaveCount(STAGES.length - seedData.reached)
        for (const li of await screen.locator('.history-item.is-locked').all()) {
          await expect(li).toHaveText('???')
          await expect(li.locator('svg')).toHaveCount(1)
        }
        const leaks = await leakCheck(page, seedData.reached)
        const bars = await barCheck(page)
        const hist = await screen.locator('.history-item.is-reached').allInnerTexts()
        const ps = await pageScroll(page)
        const t = await smallTargets(page, '#app')
        const ds = await page.locator('#dragon-screen .ds-scroll').evaluate((e) => ({ over: e.scrollHeight - e.clientHeight, fade: e.dataset.fade ?? '' }))
        console.log(`pt ds ${stage} ${w}x${h} ${scheme}`, JSON.stringify({ leaks, bars, hist, ps, ds, line: await screen.locator('.ds-line').textContent() }))
        expect(leaks.screen, 'unreached stage names in Dragon screen DOM').toEqual([])
        for (const b of bars) expect(Math.abs(b.frac - b.expected), `${b.stat} bar`).toBeLessThan(0.02)
        expect(ps.sh).toBe(ps.ch)
        for (const x of t) {
          expect(x.w, `${x.id} w`).toBeGreaterThanOrEqual(44)
          expect(x.h, `${x.id} h`).toBeGreaterThanOrEqual(44)
        }
        await shot(page, `m3-dragon-${stage}-${w}x${h}-${scheme}`)
        if (ds.over > 0) {
          await page.locator('#dragon-screen .ds-scroll').evaluate((e) => e.scrollTo(0, e.scrollHeight))
          await shot(page, `m3-dragon-${stage}-${w}x${h}-${scheme}-bottom`)
        }
        if (stage === 'egg') {
          // Heart from a selfcare log: the only stat, so its bar is full.
          await page.getByRole('link', { name: 'Home' }).click()
          await page.locator('button.task[data-task-id="selfcare"]').click()
          await page.getByRole('link', { name: 'Dragon' }).click()
          await expect(screen.locator('.stat[data-stat="heart"] .stat-value')).toHaveText(String(XP('selfcare')))
          const b2 = await barCheck(page)
          console.log('pt egg after selfcare', JSON.stringify(b2), await screen.locator('.history-item.is-reached').allInnerTexts())
          expect(b2.find((b) => b.stat === 'heart')!.frac).toBeGreaterThan(0.98)
          await shot(page, `m3-dragon-egg-selfcare-${w}x${h}-${scheme}`)
        }
        expect(msgs, msgs.join('\n')).toEqual([])
      })
    }
  }
}

test('pt welcome: opened straight on #/dragon after a 3-day gap, bubble waits for Home and shows once', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, [{ id: 'a', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-10-03T09:00:00+01:00'), xpAwarded: 40 }])
  await page.clock.install({ time: new Date('2026-10-06T10:00:00+01:00') })
  await page.goto('./#/dragon')
  await expect(page.locator('#dragon-screen')).toBeVisible()
  await settle(page)
  expect(await page.locator('#speech').evaluate((e) => e.classList.contains('is-showing'))).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('drag-on:ui'))).toBeNull()
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  console.log('pt welcome text', await page.locator('#speech').textContent(), 'chip', await page.locator('#mood-chip').textContent())
  await shot(page, `m3-welcome-home-${test.info().project.name}`)
  await page.getByRole('link', { name: 'Dragon' }).click()
  await page.getByRole('link', { name: 'Home' }).click()
  await settle(page)
  await expect(page.locator('#speech')).not.toHaveClass(/is-showing/)
  await page.reload()
  await expect(page.locator('#home')).toBeVisible()
  await settle(page)
  await expect(page.locator('#speech')).not.toHaveClass(/is-showing/)
  expect(msgs).toEqual([])
})

for (const variant of ['quick', 'slow'] as const) {
  test(`pt toast across a tab switch (${variant})`, async ({ page }) => {
    const msgs = collectConsole(page)
    await page.clock.install({ time: TUE_0600 })
    await page.goto('./')
    await page.locator('button.task[data-task-id="read"]').click()
    await expect(page.locator('#toast')).toHaveClass(/is-showing/)
    await page.getByRole('link', { name: 'Dragon' }).click()
    const onDragon = await page.evaluate(() => {
      const t = document.querySelector('#toast')!
      const r = t.getBoundingClientRect()
      return { showing: t.classList.contains('is-showing'), visible: r.width > 0 && (t as HTMLElement).offsetParent !== null }
    })
    await shot(page, `m3-toast-on-dragon-${variant}-${test.info().project.name}`)
    if (variant === 'slow') await page.clock.runFor(6000) // past the toast's 5s
    await page.getByRole('link', { name: 'Home' }).click()
    const back = await page.evaluate(() => ({
      showing: document.querySelector('#toast')!.classList.contains('is-showing'),
      undoDisabled: (document.querySelector('#toast-undo') as HTMLButtonElement).disabled,
    }))
    console.log(`pt toast ${variant}`, JSON.stringify({ onDragon, back }))
    await shot(page, `m3-toast-back-${variant}-${test.info().project.name}`)
    if (back.showing && !back.undoDisabled) {
      await page.locator('#toast-undo').click()
      await expect(page.locator('#xp-total')).toHaveText('0')
      await expect(page.locator('button.task[data-task-id="read"]')).toBeEnabled()
    } else {
      await expect(page.locator('#toast')).not.toHaveClass(/is-showing/)
      await expect(page.locator('#xp-total')).toHaveText(String(XP('read')))
    }
    expect(msgs, msgs.join('\n')).toEqual([])
  })
}

test('pt reduced motion: stat bars and tab icons do not transition', async ({ page }) => {
  for (const rm of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion: rm })
    await page.clock.install({ time: TUE_0600 }).catch(() => {})
    await page.goto('./#/dragon')
    const s = await page.evaluate(() => {
      const cs = (sel: string) => {
        const c = getComputedStyle(document.querySelector(sel)!)
        return `${c.transitionProperty} ${c.transitionDuration}`
      }
      return { fill: cs('.stat-fill'), tabIcon: cs('.tab-icon'), screen: cs('#dragon-screen'), home: cs('#home') }
    })
    await page.getByRole('link', { name: 'Home' }).click()
    const anims = await page.evaluate(() => document.getAnimations().map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty))
    console.log('pt motion', rm, JSON.stringify(s), 'animations on tab switch', JSON.stringify(anims))
    if (rm === 'reduce') {
      expect(s.fill).toMatch(/0s$/)
      expect(s.tabIcon).toMatch(/0s$/)
      expect(anims).toEqual([])
    }
  }
})

test('pt offline: log on Home, see it on Dragon, reload offline straight into #/dragon', async ({ page, context }) => {
  const msgs = collectConsole(page)
  await page.clock.install({ time: TUE_0600 })
  await page.goto('./')
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 })
  await context.setOffline(true)
  await page.locator('button.task[data-task-id="selfcare"]').click()
  await expect(page.locator('#xp-total')).toHaveText(String(XP('selfcare')))
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(page.locator('.stat[data-stat="heart"] .stat-value')).toHaveText(String(XP('selfcare')))
  await page.reload()
  await expect(page.locator('#dragon-screen')).toBeVisible()
  await expect(page.locator('.stat[data-stat="heart"] .stat-value')).toHaveText(String(XP('selfcare')))
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.locator('button.task[data-task-id="selfcare"]')).toBeDisabled()
  await shot(page, `m3-offline-home-${test.info().project.name}`)
  await context.setOffline(false)
  const relevant = msgs.filter((m) => !m.includes('ERR_INTERNET_DISCONNECTED'))
  expect(relevant, relevant.join('\n')).toEqual([])
})
