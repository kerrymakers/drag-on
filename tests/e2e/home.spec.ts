import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'
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
  await expect(page.locator('#xp-gain')).toHaveText(`+${XP('gym')} XP`)
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
  const cap = await page.locator('#dragon-caption').textContent()
  console.log('hatchling caption', cap)
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
  await expect(page.locator('#xp-gain')).toHaveText('Undone')
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
  const gainNormal = await page.locator('#xp-gain').evaluate((e) => getComputedStyle(e).animationName)
  console.log('normal', normal, gainNormal)
  expect(normal.egg).toBe('egg-wobble')
  expect(gainNormal).toBe('xp-gain')

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await task(page, 'read').click()
  const reduced = await page.evaluate(() => ({
    egg: getComputedStyle(document.querySelector('.egg')!).animationName,
    task: getComputedStyle(document.querySelector('.task')!).transitionProperty,
    taskDur: getComputedStyle(document.querySelector('.task')!).transitionDuration,
    gain: getComputedStyle(document.querySelector('#xp-gain')!).animationName,
    gainOpacity: getComputedStyle(document.querySelector('#xp-gain')!).opacity,
    gainText: document.querySelector('#xp-gain')!.textContent,
    running: document.getAnimations().length,
  }))
  console.log('reduced', reduced)
  expect(reduced.egg).toBe('none')
  expect(reduced.gain).toBe('none')
  expect(reduced.gainOpacity).toBe('1')
  expect(reduced.gainText).toBe(`+${XP('read')} XP`)
  // Feedback is cleared after its timeout
  await page.clock.runFor(2000)
  await expect(page.locator('#xp-gain')).toHaveText('')
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
  await page
    .waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 3000 })
    .catch(() => console.log('not controlled on first load'))
  await context.setOffline(true)
  await task(page, 'gym').click()
  await expect(page.locator('#xp-gain')).toHaveText(`+${XP('gym')} XP`)
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
