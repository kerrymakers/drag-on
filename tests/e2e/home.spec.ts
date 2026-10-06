import { test, expect, type ConsoleMessage, type Page } from './fixtures'
import { STAGES } from '../../src/config/stages'
import { TASKS } from '../../src/config/tasks'

const shotDir = 'tests/screenshots'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })

// October 2026 is BST (+01:00) until the 25th.
const TUE_0600 = new Date('2026-10-06T06:00:00+01:00')
const SAT_1000 = new Date('2026-10-10T10:00:00+01:00')
const at = (iso: string) => new Date(iso)

// Balancing numbers come from config, so these tests survive a rebalance.
const XP = (id: string) => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(`No task ${id}`)
  return t.xp
}
const avoidedRules = TASKS.find((t) => t.id === 'avoided')!.rules
const AVOIDED_MAX = avoidedRules.kind === 'maxPerDay' ? avoidedRules.max : NaN
const HATCH_AT = STAGES.find((s) => s.id === 'hatchling')!.xpFrom
const stageNameFor = (total: number) => (total >= HATCH_AT ? 'Hatchling' : 'Egg')

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function open(page: Page, time: Date) {
  await page.clock.install({ time })
  await page.goto('./')
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
}

const task = (page: Page, id: string) => page.locator(`button.task[data-task-id="${id}"]`)
const xp = async (page: Page) => Number(await page.locator('#xp-total').textContent())

async function rerender(page: Page) {
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
}

async function checkLayout(page: Page) {
  const vp = page.viewportSize()!
  const sw = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(sw).toBeLessThanOrEqual(vp.width)
  const sh = await page.evaluate(() => document.documentElement.scrollHeight)
  const targets = await page.$$eval('button:not([hidden]), a, [role=button], input', (els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null)
      .map((e) => {
        const r = e.getBoundingClientRect()
        return {
          id: (e as HTMLElement).dataset.taskId ?? e.id,
          cls: e.className,
          x: r.x,
          y: r.y,
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          bottom: Math.round(r.bottom),
        }
      }),
  )
  console.log(`vp ${vp.width}x${vp.height} scrollH ${sh} targets`, JSON.stringify(targets))
  for (const t of targets) {
    expect(t.w, `${t.id} width`).toBeGreaterThanOrEqual(44)
    expect(t.h, `${t.id} height`).toBeGreaterThanOrEqual(44)
    if (t.cls.includes('task')) expect(t.h, `${t.id} task height`).toBeGreaterThanOrEqual(56)
    expect(t.x).toBeGreaterThanOrEqual(0)
    expect(t.x + t.w).toBeLessThanOrEqual(vp.width + 0.5)
    expect(t.bottom, `${t.id} on screen`).toBeLessThanOrEqual(vp.height)
  }
  // Task buttons in the lower half
  const firstTask = targets.find((t) => t.cls.includes('task'))
  if (firstTask) console.log('first task top y', firstTask.y, 'half', vp.height / 2)
  return targets
}

for (const scheme of ['light', 'dark'] as const) {
  test(`screens ${scheme}`, async ({ page }, info) => {
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    const p = info.project.name

    await open(page, TUE_0600)
    await expect(task(page, 'wake')).toBeVisible()
    await expect(task(page, 'wake')).toContainText('by 06:45')
    await checkLayout(page)
    await page.screenshot({ path: `${shotDir}/home-${p}-weekday0600-${scheme}.png` })

    // After a couple of logs: done states, counter, undo, feedback
    await task(page, 'gym').click()
    await task(page, 'avoided').click()
    await expect(page.locator('#undo')).toBeVisible()
    await checkLayout(page)
    await page.screenshot({ path: `${shotDir}/home-${p}-weekday-logged-${scheme}.png` })

    const colours = await page.evaluate(() => {
      const g = (s: string) => getComputedStyle(document.querySelector(s)!)
      return {
        bg: g('body').backgroundColor,
        task: g('button.task:not(.is-done)').backgroundColor,
        taskText: g('button.task:not(.is-done)').color,
        done: g('button.task.is-done').backgroundColor,
        doneText: g('button.task.is-done').color,
        tick: g('.task-tick').color,
        xp: g('.task-xp').color,
        hint: g('.task-hint')?.color,
        undo: g('#undo').color,
        name: g('#dragon-name').color,
      }
    })
    console.log('colours', scheme, JSON.stringify(colours))

    await page.clock.setSystemTime(SAT_1000)
    await page.reload()
    await expect(task(page, 'gym')).toBeVisible()
    await expect(task(page, 'wake')).toHaveCount(0)
    await checkLayout(page)
    await page.screenshot({ path: `${shotDir}/home-${p}-saturday-${scheme}.png` })

    expect(msgs, msgs.join('\n')).toEqual([])
  })
}

test('one tap logs, feedback, done states, avoided up to its limit', async ({ page }, info) => {
  const msgs = collectConsole(page)
  await open(page, TUE_0600)
  expect(await xp(page)).toBe(0)
  await expect(page.locator('#undo')).toBeHidden()

  await task(page, 'gym').click()
  expect(await xp(page)).toBe(XP('gym'))
  await expect(page.locator('#toast-text')).toHaveText(`+${XP('gym')} XP · Gym / workout`)
  await expect(task(page, 'gym')).toBeDisabled()
  await expect(task(page, 'gym')).toContainText('Done')
  await page.screenshot({ path: `${shotDir}/home-${info.project.name}-feedback.png` })

  // tapping a done task does nothing
  await task(page, 'gym').click({ force: true })
  expect(await xp(page)).toBe(XP('gym'))

  for (const id of ['walk', 'read']) {
    await task(page, id).click()
    await expect(task(page, id)).toBeDisabled()
  }
  const base = XP('gym') + XP('walk') + XP('read')
  expect(await xp(page)).toBe(base)

  for (let i = 1; i <= AVOIDED_MAX; i++) {
    await expect(task(page, 'avoided')).toBeEnabled()
    await task(page, 'avoided').click()
    expect(await xp(page)).toBe(base + XP('avoided') * i)
    if (i < AVOIDED_MAX) await expect(task(page, 'avoided')).toContainText(`${i}/${AVOIDED_MAX}`)
  }
  const total = base + XP('avoided') * AVOIDED_MAX
  await expect(task(page, 'avoided')).toBeDisabled()
  await expect(task(page, 'avoided')).toContainText(`${AVOIDED_MAX}/${AVOIDED_MAX}`)
  await expect(task(page, 'avoided')).toContainText('Done')
  expect(await xp(page)).toBe(total)
  await expect(page.locator('#stage-name')).toHaveText(stageNameFor(total))
  await page.screenshot({ path: `${shotDir}/home-${info.project.name}-alldone.png` })

  // Persistence
  await page.reload()
  expect(await xp(page)).toBe(total)
  await expect(task(page, 'gym')).toBeDisabled()
  await expect(task(page, 'avoided')).toContainText(`${AVOIDED_MAX}/${AVOIDED_MAX}`)
  expect(msgs, msgs.join('\n')).toEqual([])
})

test('reaching the Hatchling threshold shows Hatchling', async ({ page }, info) => {
  await open(page, TUE_0600)
  let total = 0
  for (const id of ['wake', 'gym', 'walk', 'read']) {
    await task(page, id).click()
    total += XP(id)
    expect(await xp(page)).toBe(total)
    await expect(page.locator('#stage-name')).toHaveText(stageNameFor(total))
  }
  // A full weekday morning of once-a-day tasks should hatch the egg.
  expect(total).toBeGreaterThanOrEqual(HATCH_AT)
  await expect(page.locator('#stage-name')).toHaveText('Hatchling')
  // The hatching moment: the log is already saved underneath it.
  const overlay = page.getByRole('dialog')
  await expect(overlay).toBeVisible()
  await expect(overlay).toContainText("Hello! I'm so happy to meet you.")
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.length)
  expect(saved).toBe(4)
  await page.clock.runFor(1500)
  await page.screenshot({ path: `${shotDir}/home-${info.project.name}-hatch-overlay.png` })
  await overlay.getByRole('button', { name: 'Hi there!' }).click()
  await expect(overlay).toHaveCount(0)
  await page.screenshot({ path: `${shotDir}/home-${info.project.name}-hatchling.png` })
  // Undo is for mis-taps, so it may take the stage back.
  await page.locator('#undo').click()
  const afterUndo = total - XP('read')
  expect(await xp(page)).toBe(afterUndo)
  await expect(page.locator('#stage-name')).toHaveText(stageNameFor(afterUndo))
})

test('wake window', async ({ page }) => {
  await open(page, at('2026-10-06T06:45:00+01:00'))
  await expect(task(page, 'wake')).toBeEnabled()
  await page.clock.setSystemTime(at('2026-10-06T06:45:59+01:00'))
  await rerender(page)
  await expect(task(page, 'wake')).toBeEnabled()
  await page.clock.setSystemTime(at('2026-10-06T06:46:00+01:00'))
  await rerender(page)
  await expect(task(page, 'wake')).toHaveCount(0)
  // Tapping a stale button right at the cutoff without re-render: rules reject it
  await page.clock.setSystemTime(at('2026-10-07T06:45:30+01:00'))
  await page.reload()
  await expect(task(page, 'wake')).toBeEnabled()
  await page.clock.setSystemTime(at('2026-10-07T06:46:10+01:00'))
  await task(page, 'wake').click()
  console.log('stale tap after cutoff xp:', await xp(page), 'wake count', await task(page, 'wake').count())
  expect(await xp(page)).toBe(0)
})

test('wake logged at 06:40 stays visible as done', async ({ page }) => {
  await open(page, at('2026-10-06T06:40:00+01:00'))
  await task(page, 'wake').click()
  expect(await xp(page)).toBe(XP('wake'))
  await expect(task(page, 'wake')).toBeDisabled()
  await page.clock.setSystemTime(at('2026-10-06T09:00:00+01:00'))
  await page.reload()
  await expect(task(page, 'wake')).toBeVisible()
  await expect(task(page, 'wake')).toBeDisabled()
  await expect(task(page, 'wake')).toContainText('Done')
  await expect(task(page, 'wake')).not.toContainText('by 06:45')
})

test('undo reverts and expires at 04:00', async ({ page }) => {
  await open(page, at('2026-10-06T20:00:00+01:00'))
  await task(page, 'gym').click()
  await task(page, 'walk').click()
  expect(await xp(page)).toBe(XP('gym') + XP('walk'))
  await expect(page.locator('#undo')).toBeVisible()
  await page.locator('#undo').click()
  expect(await xp(page)).toBe(XP('gym'))
  await expect(page.locator('#toast-text')).toHaveText('Undone')
  await expect(task(page, 'walk')).toBeEnabled()
  await expect(task(page, 'gym')).toBeDisabled()
  await page.locator('#undo').click()
  expect(await xp(page)).toBe(0)
  await expect(page.locator('#undo')).toBeHidden()
  // log again, then pass 04:00
  await task(page, 'gym').click()
  await page.clock.setSystemTime(at('2026-10-07T03:59:00+01:00'))
  await rerender(page)
  await expect(page.locator('#undo')).toBeVisible()
  await page.clock.setSystemTime(at('2026-10-07T04:00:00+01:00'))
  await rerender(page)
  await expect(page.locator('#undo')).toBeHidden()
  expect(await xp(page)).toBe(XP('gym'))
  await page.reload()
  await expect(page.locator('#undo')).toBeHidden()
})

test('day rollover: 03:30 log counts for previous day', async ({ page }, info) => {
  // Mon evening first, nothing logged; then 03:30 Tue = still Monday
  await open(page, at('2026-10-06T03:30:00+01:00'))
  // Monday's game day: wake window passed long ago, so hidden
  await expect(task(page, 'wake')).toHaveCount(0)
  await task(page, 'gym').click()
  await expect(task(page, 'gym')).toBeDisabled()
  const ts = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events[0].timestamp)
  console.log('logged at', new Date(ts).toISOString())
  await page.clock.setSystemTime(at('2026-10-06T04:00:30+01:00'))
  await rerender(page)
  await expect(task(page, 'gym')).toBeEnabled()
  await expect(task(page, 'wake')).toBeEnabled()
  await expect(page.locator('#undo')).toBeHidden()
  await page.screenshot({ path: `${shotDir}/home-${info.project.name}-after-rollover.png` })
  // Without visibilitychange: does the screen update on its own if left open?
  await page.clock.setSystemTime(at('2026-10-06T03:50:00+01:00'))
  await page.reload()
  await expect(task(page, 'gym')).toBeDisabled()
  await page.clock.runFor(15 * 60 * 1000)
  const stillDisabled = await task(page, 'gym').isDisabled()
  console.log('left open across 04:00 with no visibilitychange; gym still disabled:', stillDisabled)
  await task(page, 'gym').click({ force: true })
  console.log('tap on stale disabled button xp:', await xp(page))
})

test('reduced motion tones animations down', async ({ page }) => {
  await open(page, TUE_0600)
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const normal = await page.evaluate(() => ({
    egg: getComputedStyle(document.querySelector('.egg')!).animationName,
    task: getComputedStyle(document.querySelector('.task')!).transitionDuration,
  }))
  await task(page, 'walk').click()
  const gainNormal = await page.locator('.float-xp').evaluate((e) => getComputedStyle(e).animationName)
  console.log('normal', normal, gainNormal)
  expect(normal.egg).toBe('egg-wobble')
  expect(gainNormal).toBe('float-xp')
  await page.clock.runFor(1000) // let the float finish

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await task(page, 'read').click()
  const reduced = await page.evaluate(() => ({
    egg: getComputedStyle(document.querySelector('.egg')!).animationName,
    task: getComputedStyle(document.querySelector('.task')!).transitionProperty,
    taskDur: getComputedStyle(document.querySelector('.task')!).transitionDuration,
    float: getComputedStyle(document.querySelector('.float-xp')!).animationName,
    toastText: document.querySelector('#toast-text')!.textContent,
    running: document.getAnimations().length,
  }))
  console.log('reduced', reduced)
  expect(reduced.egg).toBe('none')
  expect(reduced.float).toBe('float-xp-calm') // a fade in place, no movement
  expect(reduced.toastText).toBe(`+${XP('read')} XP · Read for 20 minutes`)
  await expect(page.locator('#toast')).toBeVisible()
  // The toast goes after about 5 seconds
  await page.clock.runFor(5500)
  await expect(page.locator('#toast')).toBeHidden()
})

test('manifest is served and valid; icons load', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  expect(href).toBeTruthy()
  const murl = new URL(href!, page.url()).toString()
  const res = await request.get(murl)
  expect(res.ok()).toBeTruthy()
  const m = await res.json()
  expect(m.name).toBe('Drag-on')
  expect(m.display).toBe('standalone')
  expect(new URL(m.start_url, murl).pathname).toBe('/drag-on/')
  expect(new URL(m.scope, murl).pathname).toBe('/drag-on/')
  expect(m.icons.some((i: any) => i.sizes === '192x192')).toBeTruthy()
  expect(m.icons.some((i: any) => i.sizes === '512x512')).toBeTruthy()
  for (const icon of m.icons) {
    const r = await request.get(new URL(icon.src, murl).toString())
    expect(r.ok()).toBeTruthy()
    expect(r.headers()['content-type']).toContain('image/png')
  }
  const links = await page.$$eval('link[rel~=icon], link[rel=apple-touch-icon]', (ls) =>
    ls.map((l) => (l as HTMLLinkElement).href),
  )
  for (const l of links) {
    const r = await request.get(l)
    expect(r.ok(), `${l} -> ${r.status()}`).toBeTruthy()
  }
})

test('offline: load, go offline, log, reload, log persists', async ({ page, context }, info) => {
  const msgs = collectConsole(page)
  await open(page, TUE_0600)
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
  expect(new URL(scope).pathname).toBe('/drag-on/')
  // Going offline before the service worker controls the page would test nothing.
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 })
  await context.setOffline(true)
  await task(page, 'gym').click()
  await expect(page.locator('#toast-text')).toHaveText(`+${XP('gym')} XP · Gym / workout`)
  expect(await xp(page)).toBe(XP('gym'))
  await page.reload()
  await expect(task(page, 'gym')).toBeDisabled()
  expect(await xp(page)).toBe(XP('gym'))
  const radius = await page.locator('.task').first().evaluate((e) => getComputedStyle(e).borderRadius)
  expect(radius).toBe('20px')
  await task(page, 'walk').click()
  await page.reload()
  expect(await xp(page)).toBe(XP('gym') + XP('walk'))
  await page.screenshot({ path: `${shotDir}/home-${info.project.name}-offline.png` })
  await page.goto('./some/deep/link')
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
  await context.setOffline(false)
  const relevant = msgs.filter((m) => !m.includes('ERR_INTERNET_DISCONNECTED'))
  console.log('offline console', msgs)
  expect(relevant, relevant.join('\n')).toEqual([])
})

// ---------------------------------------------------------------------------
// Milestone 1, Slice 3: the MVP feel
// ---------------------------------------------------------------------------

const TUE_1000 = at('2026-10-06T10:00:00+01:00')

/** Seeds saved data once per test (sessionStorage flag), so reloads don't reseed. */
async function seed(page: Page, data: unknown) {
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('drag-on:v1', typeof d === 'string' ? d : JSON.stringify(d))
      sessionStorage.setItem('seeded', '1')
    }
  }, data as any)
}
const seedXp = (page: Page, xp: number) =>
  seed(page, {
    schemaVersion: 1,
    events: [{ id: 'seed1', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-10-01T12:00:00+01:00'), xpAwarded: xp }],
  })
const savedEvents = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1') ?? '{"events":[]}').events.length as number)

async function size(page: Page, sel: string) {
  const b = await page.locator(sel).first().boundingBox()
  return { w: Math.round(b!.width * 10) / 10, h: Math.round(b!.height * 10) / 10 }
}

/** Records vibrate calls and the saved event count at the moment an overlay is added. */
async function instrument(page: Page) {
  await page.addInitScript(() => {
    const w = window as any
    w.__vibes = []
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (p: unknown) => (w.__vibes.push(p), true) })
    w.__overlaySeen = []
    new MutationObserver((muts) => {
      for (const m of muts)
        for (const n of m.addedNodes)
          if (n instanceof HTMLElement && n.classList.contains('overlay')) {
            const raw = localStorage.getItem('drag-on:v1')
            w.__overlaySeen.push({ t: performance.now(), saved: raw ? JSON.parse(raw).events.length : 0 })
          }
    }).observe(document, { childList: true, subtree: true })
  })
}

test('s3: one tap gives instant feedback; toast Undo reverts; tapping the dragon logs nothing', async ({ page }) => {
  const msgs = collectConsole(page)
  await instrument(page)
  await seedXp(page, 20)
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  const fillBefore = await page.locator('#xp-fill').evaluate((e) => getComputedStyle(e).width)

  await task(page, 'gym').click()
  const now = await page.evaluate(() => ({
    float: document.querySelector('.float-xp')?.textContent,
    squish: !!document.querySelector('button.task.is-logged[data-task-id="gym"]'),
    wiggle: !!document.querySelector('#dragon-art .dragon-react.react-log'),
    toast: document.querySelector('#toast')!.classList.contains('is-showing'),
    toastText: document.querySelector('#toast-text')!.textContent,
    vibes: (window as any).__vibes,
    fillTransition: getComputedStyle(document.querySelector('#xp-fill')!).transitionDuration,
    label: document.querySelector('#growth-label')!.textContent,
    persistentUndo: !document.querySelector('#undo')!.classList.contains('is-idle'),
  }))
  console.log('feedback straight after one tap', JSON.stringify(now))
  expect(now.float).toBe(`+${XP('gym')} XP`)
  expect(now.squish && now.wiggle && now.toast && now.persistentUndo).toBe(true)
  expect(now.toastText).toBe(`+${XP('gym')} XP · Gym / workout`)
  expect(now.vibes).toEqual([30])
  expect(now.fillTransition).toBe('0.48s')
  expect(now.label).toBe(`${HATCH_AT - 20 - XP('gym')} XP to hatch`)
  await page.waitForTimeout(600)
  const fillAfter = await page.locator('#xp-fill').evaluate((e) => getComputedStyle(e).width)
  expect(fillAfter).not.toBe(fillBefore)
  expect(await savedEvents(page)).toBe(2)

  // Tap targets on the toast
  const tu = await size(page, '#toast-undo')
  console.log('toast undo', tu)
  expect(tu.w).toBeGreaterThanOrEqual(44)
  expect(tu.h).toBeGreaterThanOrEqual(44)

  // Toast Undo reverts the XP
  await page.locator('#toast-undo').click()
  expect(await xp(page)).toBe(20)
  await expect(task(page, 'gym')).toBeEnabled()
  await expect(page.locator('#toast-text')).toHaveText('Undone')
  expect(await savedEvents(page)).toBe(3) // log + undo, append-only

  // Tapping the dragon bounces it but never logs
  await page.locator('#dragon-art').click()
  const tap = await page.evaluate(() => !!document.querySelector('#dragon-art .dragon-react.react-tap'))
  expect(tap).toBe(true)
  for (let i = 0; i < 4; i++) await page.locator('#dragon-art').click()
  expect(await xp(page)).toBe(20)
  expect(await savedEvents(page)).toBe(3)
  const art = await size(page, '#dragon-art')
  console.log('dragon tap area', art)
  expect(msgs, msgs.join('\n')).toEqual([])
})

test('s3: toast lasts about 5s', async ({ page }) => {
  await page.clock.install({ time: TUE_1000 })
  await page.goto('./')
  await task(page, 'walk').click()
  await page.clock.runFor(4800)
  await expect(page.locator('#toast')).toHaveClass(/is-showing/)
  await page.clock.runFor(400)
  await expect(page.locator('#toast')).not.toHaveClass(/is-showing/)
})

test('s3: hatch overlay: saved first, 600ms guard, button/Escape/backdrop close, undo and re-cross', async ({ page }) => {
  const msgs = collectConsole(page)
  await instrument(page)
  await seedXp(page, 85)
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  const overlay = page.locator('.overlay')

  // 1) Saved before the overlay appears; early tap ignored; button closes
  await task(page, 'gym').click()
  await expect(overlay).toBeVisible()
  const seen = await page.evaluate(() => (window as any).__overlaySeen)
  console.log('overlay seen with saved events', seen)
  expect(seen[0].saved).toBe(2)
  const tEarly = await page.evaluate(() => performance.now())
  await overlay.click({ position: { x: 20, y: 20 } })
  await page.keyboard.press('Escape')
  const tAfterEarly = await page.evaluate(() => performance.now())
  console.log('early tap+Escape at ms after open:', Math.round(tEarly - seen[0].t), '-', Math.round(tAfterEarly - seen[0].t))
  await page.waitForTimeout(50)
  await expect(overlay).toHaveCount(1)
  await expect(overlay).not.toHaveClass(/is-closing/)
  await page.waitForTimeout(1500)
  const btn = await size(page, '.overlay-button')
  const scrim = await overlay.evaluate((e) => ({ bg: getComputedStyle(e).backgroundColor, op: getComputedStyle(e).opacity }))
  const focused = await page.evaluate(() => document.activeElement?.className)
  console.log('overlay button', btn, 'scrim', scrim, 'focused', focused)
  expect(btn.w).toBeGreaterThanOrEqual(44)
  expect(btn.h).toBeGreaterThanOrEqual(44)
  await page.getByRole('button', { name: 'Hi there!' }).click()
  await expect(overlay).toHaveCount(0)
  await expect(page.locator('#stage-name')).toHaveText('Hatchling')

  // 2) Undo back to Egg: no overlay, nothing sad
  await page.locator('#undo').click()
  await expect(page.locator('#stage-name')).toHaveText('Egg')
  await expect(page.locator('#growth-label')).toHaveText('15 XP to hatch')
  await page.waitForTimeout(800)
  await expect(overlay).toHaveCount(0)
  const look = await page.locator('#dragon-art .dragon-react').getAttribute('data-look')
  const bodyText = (await page.locator('body').innerText()).toLowerCase()
  console.log('after undo look', look, 'toast', await page.locator('#toast-text').textContent())
  expect(look).toBe('egg-2')
  for (const sad of ['sad', 'sorry', 'lost', 'oh no', 'missed']) expect(bodyText).not.toContain(sad)

  // 3) Re-cross: overlay again; Escape closes
  await task(page, 'gym').click()
  await expect(overlay).toBeVisible()
  await page.waitForTimeout(700)
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)

  // 4) Again via backdrop tap
  await page.locator('#undo').click()
  await expect(page.locator('#stage-name')).toHaveText('Egg')
  await task(page, 'gym').click()
  await expect(overlay).toBeVisible()
  await page.waitForTimeout(700)
  await overlay.click({ position: { x: 10, y: 10 } })
  await expect(overlay).toHaveCount(0)
  expect(await xp(page)).toBe(85 + XP('gym'))
  await page.reload()
  await expect(overlay).toHaveCount(0) // no replay on reload
  expect(await xp(page)).toBe(85 + XP('gym'))
  expect(msgs, msgs.join('\n')).toEqual([])
})

test('s3: left open across 06:46 and 04:00 with no visibilitychange', async ({ page }) => {
  const msgs = collectConsole(page)
  // Off the minute so the 60s tick can't be what refreshes at the boundary.
  await page.clock.install({ time: at('2026-10-06T06:45:20+01:00') })
  await page.goto('./')
  await expect(task(page, 'wake')).toBeEnabled()
  await page.clock.runFor(39_000) // 06:45:59
  await expect(task(page, 'wake')).toBeVisible()
  await page.clock.runFor(1_600) // 06:46:00.6
  await expect(task(page, 'wake')).toHaveCount(0)

  await page.clock.install({ time: at('2026-10-07T03:59:20+01:00') }) // still Tuesday's game day
  await page.reload()
  await task(page, 'gym').click()
  await task(page, 'avoided').click()
  await task(page, 'avoided').click()
  await expect(task(page, 'gym')).toBeDisabled()
  await expect(task(page, 'avoided')).toBeDisabled()
  await expect(page.locator('#undo')).not.toHaveClass(/is-idle/)
  await page.clock.runFor(39_000) // 03:59:59
  await expect(task(page, 'gym')).toBeDisabled()
  await page.clock.runFor(1_600) // 04:00:00.6
  await expect(task(page, 'gym')).toBeEnabled()
  await expect(task(page, 'avoided')).toBeEnabled()
  await expect(task(page, 'avoided')).not.toContainText('/2')
  await expect(page.locator('#undo')).toHaveClass(/is-idle/)
  await expect(task(page, 'wake')).toBeEnabled() // Wednesday has a 06:30 target
  const before = await xp(page)
  await task(page, 'gym').click()
  expect(await xp(page)).toBe(before + XP('gym'))
  expect(msgs, msgs.join('\n')).toEqual([])
})

test('s3: newer-version data shows a calm notice and is never written', async ({ page }, info) => {
  const msgs = collectConsole(page)
  const raw = JSON.stringify({
    schemaVersion: 2,
    events: [{ id: 'n1', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-10-01T12:00:00+01:00'), xpAwarded: 40 }],
    futureField: { x: 1 },
  })
  await seed(page, raw)
  await page.clock.install({ time: TUE_1000 })
  await page.goto('./')
  await expect(page.locator('#notice')).toBeVisible()
  const text = await page.locator('#notice-text').textContent()
  console.log('notice:', text)
  expect(await xp(page)).toBe(40)
  const close = await size(page, '#notice-close')
  console.log('notice close', close)
  expect(close.w).toBeGreaterThanOrEqual(44)
  expect(close.h).toBeGreaterThanOrEqual(44)
  await checkLayout(page)
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.screenshot({ path: `${shotDir}/s3-${info.project.name}-notice-newer-${scheme}.png` })
  }
  await task(page, 'gym').click()
  await task(page, 'walk').click()
  expect(await xp(page)).toBe(40 + XP('gym') + XP('walk'))
  await page.locator('#undo').click()
  const after = await page.evaluate(() => ({
    raw: localStorage.getItem('drag-on:v1'),
    keys: Object.keys(localStorage),
  }))
  expect(after.raw).toBe(raw)
  expect(after.keys).toEqual(['drag-on:v1'])
  await page.locator('#notice-close').click()
  await expect(page.locator('#notice')).toBeHidden()
  console.log('newer-version console', msgs)
})

test('s3: a failed save shows a gentle notice and keeps the tap', async ({ page }, info) => {
  const msgs = collectConsole(page)
  await page.addInitScript(() => {
    const orig = Storage.prototype.setItem
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === 'drag-on:v1') throw new DOMException('Quota exceeded', 'QuotaExceededError')
      return orig.call(this, k, v)
    }
  })
  await page.clock.install({ time: TUE_1000 })
  await page.goto('./')
  await expect(page.locator('#notice')).toBeHidden()
  await task(page, 'gym').click()
  await expect(page.locator('#notice')).toBeVisible()
  console.log('save-failed notice:', await page.locator('#notice-text').textContent())
  expect(await xp(page)).toBe(XP('gym'))
  await expect(page.locator('#toast-text')).toHaveText(`+${XP('gym')} XP · Gym / workout`)
  await page.waitForTimeout(500) // real time: let the CSS squish settle before measuring
  await checkLayout(page)
  await page.screenshot({ path: `${shotDir}/s3-${info.project.name}-notice-savefail-light.png` })
  await page.locator('#notice-close').click()
  await task(page, 'walk').click()
  await expect(page.locator('#notice')).toBeHidden() // stays dismissed this session
  console.log('save-failed console', msgs)
})

test('s3: reduced motion: no wobble/bounce/float/squish, bar jumps, overlay crossfades', async ({ page }) => {
  const msgs = collectConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seedXp(page, 85)
  await page.addInitScript(() => {
    const w = window as any
    w.__overlayClasses = []
    new MutationObserver(() => {
      const o = document.querySelector('.overlay')
      if (o) w.__overlayClasses.push(o.className)
    }).observe(document, { attributes: true, childList: true, subtree: true, attributeFilter: ['class'] })
  })
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  const idle = await page.evaluate(() => ({
    egg: getComputedStyle(document.querySelector('.egg')!).animationName,
    fill: getComputedStyle(document.querySelector('#xp-fill')!).transitionDuration,
  }))
  expect(idle).toEqual({ egg: 'none', fill: '0s' })

  await task(page, 'walk').click() // 85 + 15 = 100: hatches
  const r = await page.evaluate(() => {
    const cs = (s: string) => (document.querySelector(s) ? getComputedStyle(document.querySelector(s)!) : null)
    return {
      squish: cs('button.task.is-logged')?.animationName,
      wiggle: cs('#dragon-art .dragon-react')?.animationName,
      float: cs('.float-xp')?.animationName,
      toastTransform: cs('#toast')?.transform,
      fillWidth: cs('#xp-fill')?.width,
      overlayCalm: document.querySelector('.overlay')?.classList.contains('is-calm'),
      fromAnim: cs('.overlay-layer.is-from .dragon-react')?.animationName,
    }
  })
  console.log('reduced after log', r)
  expect(r.squish).toBe('none')
  expect(r.wiggle).toBe('none')
  expect(r.float).toBe('float-xp-calm')
  expect(r.toastTransform).toMatch(/matrix\(1, 0, 0, 1, -?[\d.]+, 0\)/)
  expect(r.overlayCalm).toBe(true)
  expect(r.fromAnim).toBe('none')
  await page.waitForTimeout(1500)
  const after = await page.evaluate(() => {
    const cs = (s: string) => getComputedStyle(document.querySelector(s)!)
    return {
      classes: [...new Set((window as any).__overlayClasses)],
      toLayer: { t: cs('.overlay-layer.is-to').transform, tr: cs('.overlay-layer.is-to').transitionProperty },
      msg: cs('.overlay-message').transform,
      btn: cs('.overlay-button').transform,
      body: cs('.overlay .hatchling-body').animationName,
      eyes: cs('.overlay .hatchling-eyes').animationName,
      running: document.getAnimations().map((a) => (a as any).animationName ?? (a as any).transitionProperty),
    }
  })
  console.log('reduced overlay', JSON.stringify(after))
  expect(after.classes.some((c: string) => c.includes('is-popping'))).toBe(false)
  expect(after.toLayer.t).toBe('none')
  expect(after.toLayer.tr).toBe('opacity')
  expect(after.msg).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
  expect(after.btn).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\))$/)
  expect(after.body).toBe('none')
  await page.getByRole('button', { name: 'Hi there!' }).click()
  await expect(page.locator('.overlay')).toHaveCount(0)
  // Hatchling at home is still too
  const home = await page.evaluate(() => getComputedStyle(document.querySelector('#dragon-art .hatchling-body')!).animationName)
  expect(home).toBe('none')
  await page.locator('#dragon-art').click()
  const tapAnim = await page.evaluate(() => getComputedStyle(document.querySelector('#dragon-art .dragon-react')!).animationName)
  expect(tapAnim).toBe('none')
  expect(msgs, msgs.join('\n')).toEqual([])
})

test('s3: offline log persists and the service worker controls the page', async ({ page, context }) => {
  const msgs = collectConsole(page)
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 }).catch(() => {})
  const firstControlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
  await context.setOffline(true)
  await task(page, 'read').click()
  await page.reload()
  const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)
  console.log('controlled on first load', firstControlled, 'after offline reload', controlled)
  expect(controlled).toBe(true)
  await expect(task(page, 'read')).toBeDisabled()
  expect(await xp(page)).toBe(XP('read'))
  // Art and styles came from the cache
  await expect(page.locator('#dragon-art svg')).toBeVisible()
  await context.setOffline(false)
  const relevant = msgs.filter((m) => !m.includes('ERR_INTERNET_DISCONNECTED'))
  expect(relevant, relevant.join('\n')).toEqual([])
})

test('s3: overlay keeps keyboard focus inside and returns it sensibly on close', async ({ page }) => {
  const msgs = collectConsole(page)
  await seedXp(page, 85)
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  await task(page, 'gym').focus()
  await page.keyboard.press('Enter')
  const overlay = page.locator('.overlay')
  await expect(overlay).toBeVisible()
  await page.waitForTimeout(1200)
  const appInert = await page.evaluate(() => (document.getElementById('app') as any).inert)
  expect(appInert).toBe(true)
  const seen: string[] = []
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab')
    seen.push(await page.evaluate(() => {
      const a = document.activeElement as HTMLElement | null
      const behind = !!a?.closest('#app')
      return `${a?.tagName}.${a?.className}${behind ? ' (BEHIND)' : ''}`
    }))
  }
  console.log('focus while overlay open', seen)
  for (const s of seen) expect(s).not.toContain('BEHIND')
  await page.keyboard.press('Escape')
  await expect(overlay).toHaveCount(0)
  await page.waitForTimeout(300)
  const after = await page.evaluate(() => ({
    inert: (document.getElementById('app') as any).inert,
    active: `${document.activeElement?.tagName}#${document.activeElement?.id}.${document.activeElement?.className} ${(document.activeElement as HTMLElement)?.dataset?.taskId ?? ''}`,
  }))
  console.log('after close', after)
  expect(after.inert).toBe(false)
  expect(after.active).not.toMatch(/^BODY/)
  expect(msgs, msgs.join('\n')).toEqual([])
})
