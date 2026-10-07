// M5 slice 1: streaks, the History screen and the Home streak chip, on the phone.
// Screenshots: tests/screenshots/m5s1-*
import { test, expect, type Page, type Browser, type TestInfo } from './fixtures'
import { TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
// Wednesday 7 October 2026, 10:00 BST. Nothing logged yet today.
const NOW = new Date('2026-10-07T10:00:00+01:00')
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp

/** Day keys from a to b inclusive ("2026-09-10"). */
function range(a: string, b: string): string[] {
  const out: string[] = []
  for (let d = new Date(`${a}T12:00:00Z`); d <= new Date(`${b}T12:00:00Z`); d = new Date(d.getTime() + 86_400_000))
    out.push(d.toISOString().slice(0, 10))
  return out
}
const at = (key: string, hm: string) => new Date(`${key}T${hm}:00+01:00`).getTime()
const weekday = (key: string) => new Date(`${key}T12:00:00Z`).getUTCDay()

/**
 * One log on 25 Aug (a short earlier run, then a gap), then every day from 10 Sep to
 * 6 Oct except 20 Sep (frozen: a freeze was earned at day 7). Weekday wake-ups at
 * 06:20, a treat on 5 Oct and an item find on 4 Oct. Current streak: 26.
 */
function seed(opts: { lastDay?: string; startDay?: string } = {}) {
  const events: object[] = []
  let n = 0
  const log = (taskId: string, ts: number, extra: object = {}) =>
    events.push({ id: `e${n++}`, type: 'log', taskId, timestamp: ts, xpAwarded: XP(taskId), ...extra })
  log('gym', at('2026-08-25', '18:00'))
  for (const d of range(opts.startDay ?? '2026-09-10', opts.lastDay ?? '2026-10-06')) {
    if (d === '2026-09-20') continue
    const wd = weekday(d)
    if (wd >= 1 && wd <= 5) log('wake', at(d, '06:20'))
    log(['gym', 'walk', 'read', 'selfcare'][n % 4]!, at(d, '19:00'), d === '2026-10-05' ? { reward: { kind: 'treat', bonusXp: 6 } } : {})
    if (d === '2026-10-04') log('avoided', at(d, '20:00'), { reward: { kind: 'item', itemId: 'bow' } })
  }
  return { schemaVersion: 1, events }
}

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function fresh(
  browser: Browser,
  info: TestInfo,
  opts: { scheme?: 'light' | 'dark'; reduced?: boolean; data?: object | null; url?: string; size?: [number, number] } = {},
) {
  const context = await browser.newContext({
    ...info.project.use,
    ...(opts.size ? { viewport: { width: opts.size[0], height: opts.size[1] } } : {}),
    colorScheme: opts.scheme ?? 'light',
    reducedMotion: opts.reduced ? 'reduce' : 'no-preference',
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  })
  const page = await context.newPage()
  const msgs = collectConsole(page)
  await page.addInitScript(() => (Math.random = () => 0.9999))
  const data = opts.data === undefined ? seed() : opts.data
  if (data) {
    await page.addInitScript((d) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.clear()
        localStorage.setItem('drag-on:v1', JSON.stringify(d))
        sessionStorage.setItem('seeded', '1')
      }
    }, data)
  }
  await page.clock.install({ time: NOW })
  await page.goto(new URL(opts.url ?? './', info.project.use.baseURL!).toString())
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  return { page, context, msgs }
}

const box = async (page: Page, sel: string) => {
  const b = await page.locator(sel).first().boundingBox()
  if (!b) throw new Error(`no box for ${sel}`)
  return b
}

async function overflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    const s = document.querySelector('.hs-scroll') as HTMLElement | null
    const wide = [...document.querySelectorAll('#history-screen *')]
      .map((e) => ({ e, r: e.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5))
      .map(({ e, r }) => `${e.className} ${Math.round(r.left)}-${Math.round(r.right)}`)
    return { docW: doc.scrollWidth, vw: innerWidth, scrollW: s?.scrollWidth, clientW: s?.clientWidth, wide: wide.slice(0, 5) }
  })
}

const tag = (info: TestInfo) => info.project.name

test('screens: Home chip and History, light and dark, plus layout and tap targets', async ({ browser }, info) => {
  test.setTimeout(120_000)
  for (const scheme of ['light', 'dark'] as const) {
    const { page, context, msgs } = await fresh(browser, info, { scheme })
    await expect(page.locator('#streak-chip')).toBeVisible()
    await expect(page.locator('#streak-chip')).toHaveText('26 days')
    await page.screenshot({ path: `${dir}/m5s1-home-${tag(info)}-${scheme}.png` })

    // Chip: visible box and effective tap area.
    const chip = await box(page, '#streak-chip')
    const hit = await page.evaluate(() => {
      const c = document.getElementById('streak-chip')!
      const r = c.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      // Walk out from the centre until elementFromPoint stops being the chip.
      const reach = (dx: number, dy: number) => {
        let k = 0
        while (k < 60) {
          const e = document.elementFromPoint(cx + dx * (k + 1), cy + dy * (k + 1))
          if (e !== c) break
          k++
        }
        return k
      }
      return { up: reach(0, -1), down: reach(0, 1), left: reach(-1, 0), right: reach(1, 0) }
    })
    const tapH = hit.up + hit.down + 1
    const tapW = hit.left + hit.right + 1
    console.log(`[${tag(info)} ${scheme}] chip visible ${Math.round(chip.width)}x${Math.round(chip.height)}, tap area ~${tapW}x${tapH}`, hit)
    expect(tapH, 'chip tap height').toBeGreaterThanOrEqual(44)
    expect(tapW, 'chip tap width').toBeGreaterThanOrEqual(44)

    // Task buttons ≥44.
    for (const b of await page.locator('#task-list button.task').all()) {
      const r = (await b.boundingBox())!
      expect(r.height).toBeGreaterThanOrEqual(44)
      expect(r.width).toBeGreaterThanOrEqual(44)
    }

    // History via the chip.
    await page.locator('#streak-chip').tap()
    await expect(page).toHaveURL(/#\/history$/)
    await expect(page.locator('#history-screen')).toBeVisible()
    await expect(page.locator('.hs-streak-number')).toHaveText('26')
    await expect(page.locator('.hs-month')).toHaveText('October 2026')
    await page.screenshot({ path: `${dir}/m5s1-history-${tag(info)}-${scheme}-top.png` })
    const ov = await overflow(page)
    console.log(`[${tag(info)} ${scheme}] overflow`, ov)
    expect(ov.docW).toBeLessThanOrEqual(ov.vw)
    expect(ov.scrollW!).toBeLessThanOrEqual(ov.clientW!)
    expect(ov.wide).toEqual([])

    // Calendar cells and month buttons.
    const cells = page.locator('button.hs-cell')
    const sizes = await cells.evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return [r.width, r.height] }))
    const minW = Math.min(...sizes.map((s) => s[0]!))
    const minH = Math.min(...sizes.map((s) => s[1]!))
    console.log(`[${tag(info)} ${scheme}] ${sizes.length} day cells, min ${minW.toFixed(1)}x${minH.toFixed(1)}`)
    expect(minW).toBeGreaterThanOrEqual(44)
    expect(minH).toBeGreaterThanOrEqual(44)
    for (const sel of ['.hs-month-btn >> nth=0', '.hs-month-btn >> nth=1']) {
      const b = await box(page, sel)
      expect(b.width).toBeGreaterThanOrEqual(44)
      expect(b.height).toBeGreaterThanOrEqual(44)
    }
    for (const t of await page.locator('.tabbar a.tab').all()) {
      const r = (await t.boundingBox())!
      expect(r.height).toBeGreaterThanOrEqual(44)
      expect(r.width).toBeGreaterThanOrEqual(44)
    }

    // Scroll to the calendar and the day card, screenshot.
    await page.locator('.hs-calendar').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${dir}/m5s1-history-${tag(info)}-${scheme}-calendar.png` })
    await page.locator('button.hs-cell[data-day="2026-10-05"]').tap()
    await page.locator('.hs-day').scrollIntoViewIfNeeded()
    await expect(page.locator('.hs-day-title')).not.toBeEmpty()
    await page.screenshot({ path: `${dir}/m5s1-history-${tag(info)}-${scheme}-day.png` })

    // September with the frozen day.
    await page.locator('.hs-month-btn').first().tap()
    await expect(page.locator('.hs-month')).toHaveText('September 2026')
    await page.locator('button.hs-cell[data-day="2026-09-20"]').tap()
    await expect(page.locator('.hs-day-empty')).toContainText('streak freeze')
    await page.locator('.hs-calendar').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${dir}/m5s1-history-${tag(info)}-${scheme}-september.png` })
    expect(await page.locator('button.hs-cell[data-day="2026-09-20"]').getAttribute('data-status')).toBe('frozen')

    expect(msgs, msgs.join('\n')).toEqual([])
    await context.close()
  }
})

test('chip never moves the task buttons or the XP bar', async ({ browser }, info) => {
  const pos = async (data: object | null) => {
    const { page, context } = await fresh(browser, info, { data })
    const r = {
      chip: await page.locator('#streak-chip').isVisible(),
      task: (await box(page, '#task-list button.task')).y,
      bar: (await box(page, '#xp-bar')).y,
      row: (await box(page, '.growth-row')).height,
      label: await page.locator('#growth-label').evaluate((e) => {
        const r = e.getBoundingClientRect()
        return { w: Math.round(r.width), clipped: e.scrollWidth > e.clientWidth, text: e.textContent }
      }),
    }
    await context.close()
    return r
  }
  const without = await pos(seed({ lastDay: '2026-10-05', startDay: '2026-10-05' })) // streak 0: last log 5 Oct, 6 Oct missed
  const withChip = await pos(seed())
  console.log(`[${tag(info)}] no chip`, without, 'chip', withChip)
  expect(without.chip).toBe(false)
  expect(withChip.chip).toBe(true)
  expect(withChip.task).toBeCloseTo(without.task, 0)
  expect(withChip.bar).toBeCloseTo(without.bar, 0)
  expect(withChip.label.clipped).toBe(false)
})

test('a long streak with a big XP label still fits at this width', async ({ browser }, info) => {
  // 150 days in a row, lots of XP.
  const { page, context, msgs } = await fresh(browser, info, { data: seed({ startDay: '2026-05-10' }) })
  await expect(page.locator('#streak-chip')).toBeVisible()
  const r = await page.evaluate(() => {
    const row = document.querySelector('.growth-row')!.getBoundingClientRect()
    const els = ['#growth-label', '#streak-chip', '.growth-total'].map((s) => {
      const e = document.querySelector(s) as HTMLElement
      const b = e.getBoundingClientRect()
      return { s, l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), clipped: e.scrollWidth > e.clientWidth + 1, text: e.textContent }
    })
    return { row: { l: row.left, r: row.right, h: row.height }, els }
  })
  console.log(`[${tag(info)}] long streak row`, JSON.stringify(r))
  await page.screenshot({ path: `${dir}/m5s1-home-${tag(info)}-long-streak.png` })
  for (const e of r.els) {
    expect(e.r).toBeLessThanOrEqual(Math.ceil(r.row.r))
    // The chip's ::before tap area makes scrollWidth > clientWidth; that isn't clipping.
    if (e.s !== '#streak-chip') expect(e.clipped, e.s).toBe(false)
  }
  // No overlap between label and chip.
  expect(r.els[0]!.r).toBeLessThanOrEqual(r.els[1]!.l)
  expect(msgs).toEqual([])
  await context.close()
})

test('logging is one tap, the chip and calendar update, and undo puts them back', async ({ browser }, info) => {
  const { page, context, msgs } = await fresh(browser, info)
  const chip = page.locator('#streak-chip')
  await expect(chip).toHaveText('26 days')
  const gym = page.locator('button.task[data-task-id="gym"]')
  await gym.tap()
  await expect(page.locator('#toast-text')).toContainText('Gym')
  await expect(chip).toHaveText('27 days')
  await page.screenshot({ path: `${dir}/m5s1-home-${tag(info)}-logged-toast.png` })
  await page.waitForTimeout(600) // let the toast finish rising

  // Does the chip's invisible tap area reach any part of the toast Undo or other controls?
  const steal = await page.evaluate(() => {
    const chip = document.getElementById('streak-chip')!
    const targets = ['#toast-undo', '#undo', '#task-list button.task', '#dragon-art', '#speech']
    const out: Record<string, number> = {}
    for (const s of targets) {
      for (const t of document.querySelectorAll(s)) {
        const r = t.getBoundingClientRect()
        if (r.width === 0) continue
        let stolen = 0
        for (let x = r.left + 1; x < r.right; x += 2)
          for (let y = r.top + 1; y < r.bottom; y += 2) if (chip.contains(document.elementFromPoint(x, y))) stolen++
        if (stolen) out[s] = (out[s] ?? 0) + stolen
      }
    }
    const u = document.getElementById('toast-undo')!.getBoundingClientRect()
    const c = chip.getBoundingClientRect()
    return { out, undo: { t: u.top, b: u.bottom, l: u.left, r: u.right }, chip: { t: c.top, b: c.bottom, l: c.left, r: c.right } }
  })
  console.log(`[${tag(info)}] chip hit-area overlap with controls`, JSON.stringify(steal))
  expect(steal.out).toEqual({})

  // Toast Undo tap at its edge nearest the chip still undoes.
  const u = await box(page, '#toast-undo')
  await page.touchscreen.tap(u.x + u.width / 2, u.y + u.height - 2)
  await expect(chip).toHaveText('26 days')
  await expect(page).not.toHaveURL(/history/)
  await expect(gym).toBeEnabled()

  // Log again, then check History.
  await gym.tap()
  await expect(chip).toHaveText('27 days')
  await page.locator('.tabbar a.tab[data-route="history"]').tap()
  await expect(page.locator('.hs-streak-number')).toHaveText('27')
  const today = page.locator('button.hs-cell[data-day="2026-10-07"]')
  await expect(today).toHaveAttribute('data-status', 'logged')
  await expect(page.locator('.hs-day-list')).toContainText('Gym')
  // Undo from Home with the Undo last log button (leaving Home dismissed the toast;
  // the toast's own Undo is covered by the Undo-corner test).
  await page.locator('.tabbar a.tab[data-route="home"]').tap()
  await page.locator('#undo').tap()
  await expect(chip).toHaveText('26 days')
  await page.locator('.tabbar a.tab[data-route="history"]').tap()
  await expect(page.locator('.hs-streak-number')).toHaveText('26')
  await expect(today).not.toHaveAttribute('data-status', 'logged')
  await expect(page.locator('.hs-day-empty')).toBeVisible()
  expect(msgs, msgs.join('\n')).toEqual([])
  await context.close()
})

test('day tap shows logs, focus and month bounds', async ({ browser }, info) => {
  const { page, context, msgs } = await fresh(browser, info, { url: './#/history' })
  await expect(page.locator('.hs-month')).toHaveText('October 2026')
  const prev = page.locator('.hs-month-btn').nth(0)
  const next = page.locator('.hs-month-btn').nth(1)
  await expect(next).toBeDisabled() // no future months
  // Future days are not buttons.
  expect(await page.locator('button.hs-cell[data-day="2026-10-08"]').count()).toBe(0)
  // Today selected by default.
  await expect(page.locator('button.hs-cell.is-selected')).toHaveAttribute('data-day', '2026-10-07')

  // Tap 5 Oct: treat shown.
  await page.locator('button.hs-cell[data-day="2026-10-05"]').tap()
  await expect(page.locator('.hs-day-list')).toContainText('treat')
  const focused1 = await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.day ?? document.activeElement?.className)
  expect(focused1).toBe('2026-10-05')
  // Tap 4 Oct: item find shown.
  await page.locator('button.hs-cell[data-day="2026-10-04"]').tap()
  await expect(page.locator('.hs-day-list')).toContainText('Found the')
  const detailText = await page.locator('.hs-day').innerText()
  const focused2 = await page.evaluate(() => (document.activeElement as HTMLElement)?.dataset.day ?? document.activeElement?.className)
  const titlePos = () =>
    page.locator('.hs-day-title').evaluate((e) => {
      const r = e.getBoundingClientRect()
      return { top: Math.round(r.top), bottom: Math.round(r.bottom), tabTop: Math.round(document.getElementById('tabbar')!.getBoundingClientRect().top) }
    })
  // The tapped day keeps focus, and its card is brought into view above the tab bar (it may scroll smoothly).
  expect(focused2).toBe('2026-10-04')
  await expect.poll(async () => { const p = await titlePos(); return p.top >= 0 && p.bottom <= p.tabTop }).toBe(true)
  console.log(`[${tag(info)}] focus after day taps`, focused1, focused2, 'detail', JSON.stringify(detailText), 'detail title pos', await titlePos())

  // Month nav focus.
  await prev.focus()
  await prev.press('Enter')
  await expect(page.locator('.hs-month')).toHaveText('September 2026')
  const f3 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  await page.locator('.hs-month-btn').nth(0).press('Enter')
  await expect(page.locator('.hs-month')).toHaveText('August 2026')
  await expect(prev).toBeDisabled() // nothing before the first log
  const f4 = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))
  console.log(`[${tag(info)}] focus after month changes`, f3, f4)
  expect(f3).toBe('Previous month')
  expect(f4).toBe('Next month')
  await expect(page.locator('button.hs-cell[data-day="2026-08-25"]')).toHaveAttribute('data-status', 'logged')
  // Days before the first log are faded and not tappable, like days to come.
  expect(await page.locator('button.hs-cell[data-day="2026-08-24"]').count()).toBe(0)
  await expect(page.locator('#history-screen .hs-cell.is-before')).toHaveCount(24)
  await page.locator('.hs-calendar').scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${dir}/m5s1-history-${tag(info)}-august-bound.png` })
  // Tapping prev while disabled does nothing.
  await prev.tap({ force: true })
  await expect(page.locator('.hs-month')).toHaveText('August 2026')

  // Leaving and coming back resets to this month.
  await page.locator('.tabbar a.tab[data-route="home"]').tap()
  await page.locator('.tabbar a.tab[data-route="history"]').tap()
  await expect(page.locator('.hs-month')).toHaveText('October 2026')
  expect(msgs, msgs.join('\n')).toEqual([])
  await context.close()
})

test('Android back from History returns Home (chip and tab)', async ({ browser }, info) => {
  const { page, context } = await fresh(browser, info)
  await page.locator('#streak-chip').tap()
  await expect(page).toHaveURL(/#\/history$/)
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  await expect(page.locator('#history-screen')).toBeHidden()
  // Chip → History → Dragon tab → back: Home.
  await page.locator('#streak-chip').tap()
  await page.locator('.tabbar a.tab[data-route="dragon"]').tap()
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  const len = await page.evaluate(() => history.length)
  console.log(`[${tag(info)}] history.length after round trips`, len)
  await context.close()
})

test('offline: log, reload, chip and calendar still show it', async ({ browser }, info) => {
  const { page, context, msgs } = await fresh(browser, info)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 })
  await context.setOffline(true)
  await page.locator('button.task[data-task-id="read"]').tap()
  await expect(page.locator('#streak-chip')).toHaveText('27 days')
  await page.reload()
  await expect(page.locator('button.task[data-task-id="read"]')).toBeDisabled()
  await expect(page.locator('#streak-chip')).toHaveText('27 days')
  await page.locator('#streak-chip').tap()
  await expect(page.locator('button.hs-cell[data-day="2026-10-07"]')).toHaveAttribute('data-status', 'logged')
  await expect(page.locator('.hs-day-list')).toContainText('Read')
  await page.screenshot({ path: `${dir}/m5s1-history-${tag(info)}-offline.png` })
  await page.goto(new URL('./#/history', info.project.use.baseURL!).toString())
  await expect(page.locator('.hs-streak-number')).toHaveText('27')
  await context.setOffline(false)
  const relevant = msgs.filter((m) => !m.includes('ERR_INTERNET_DISCONNECTED'))
  expect(relevant, relevant.join('\n')).toEqual([])
  await context.close()
})

test('reduced motion: no transitions or animations on chip and History', async ({ browser }, info) => {
  const { page, context, msgs } = await fresh(browser, info, { reduced: true, scheme: 'dark' })
  const chipT = await page.locator('#streak-chip').evaluate((e) => getComputedStyle(e).transition)
  await page.locator('#streak-chip').tap()
  await page.locator('button.hs-cell[data-day="2026-10-03"]').tap()
  await page.locator('.hs-month-btn').first().tap()
  const anims = await page.evaluate(() =>
    document.getAnimations().map((a) => `${(a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty} on ${((a.effect as KeyframeEffect).target as Element)?.className}`),
  )
  const hsTransitions = await page.evaluate(() =>
    [...document.querySelectorAll('#history-screen *')]
      .map((e) => [e.className, getComputedStyle(e).transitionDuration, getComputedStyle(e).animationName] as const)
      .filter(([, d, a]) => d.split(',').some((x) => parseFloat(x) > 0.01) || a !== 'none')
      .slice(0, 10),
  )
  console.log(`[${tag(info)}] reduced: chip transition`, chipT, 'anims', anims, 'history transitions', hsTransitions)
  await page.screenshot({ path: `${dir}/m5s1-history-${tag(info)}-reduced-dark.png` })
  expect(anims).toEqual([])
  expect(msgs).toEqual([])
  await context.close()
})

test('empty state: no logs ever, History and Home', async ({ browser }, info) => {
  const { page, context, msgs } = await fresh(browser, info, { data: null, url: './#/history' })
  await expect(page.locator('#history-screen')).toBeVisible()
  await expect(page.locator('.hs-month-btn').nth(0)).toBeDisabled()
  await expect(page.locator('.hs-month-btn').nth(1)).toBeDisabled()
  await page.screenshot({ path: `${dir}/m5s1-history-${tag(info)}-empty.png` })
  const text = await page.locator('.hs-summary').innerText()
  console.log(`[${tag(info)}] empty summary`, JSON.stringify(text))
  expect(msgs).toEqual([])
  await context.close()
})

test('tapping the bottom corner of the toast Undo undoes, and never opens History', async ({ browser }, info) => {
  const { page, context, msgs } = await fresh(browser, info)
  const gym = page.locator('button.task[data-task-id="gym"]')
  await gym.tap()
  await expect(page.locator('#streak-chip')).toHaveText('27 days')
  await page.waitForTimeout(800) // let the toast finish rising
  const u = await box(page, '#toast-undo')
  // Just outside the pill's rounded corner (where the chip's tap area used to reach):
  // whatever is there, it must not open History.
  await page.touchscreen.tap(u.x + u.width - 4, u.y + u.height - 2)
  await page.waitForTimeout(300)
  await expect(page).not.toHaveURL(/history/)
  await expect(page.locator('#home')).toBeVisible()
  // Inside the bottom-right of the visible pill (clear of its rounded edge): undoes.
  await page.touchscreen.tap(u.x + u.width - 14, u.y + u.height - 6)
  await expect(page.locator('#streak-chip')).toHaveText('26 days')
  await expect(gym).toBeEnabled()
  await expect(page).not.toHaveURL(/history/)
  await expect(page.locator('#home')).toBeVisible()
  expect(msgs, msgs.join('\n')).toEqual([])
  await context.close()
})

test('reduced motion: tapping a day brings its card into view without smooth scrolling', async ({ browser }, info) => {
  const { page, context } = await fresh(browser, info, { reduced: true, url: './#/history' })
  await page.locator('button.hs-cell[data-day="2026-10-04"]').tap()
  // No smooth scroll: it's already in place on the next frame.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(null))))
  const p = await page.locator('.hs-day-title').evaluate((e) => {
    const r = e.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, tabTop: document.getElementById('tabbar')!.getBoundingClientRect().top }
  })
  expect(p.top).toBeGreaterThanOrEqual(0)
  expect(p.bottom).toBeLessThanOrEqual(p.tabTop)
  await context.close()
})
