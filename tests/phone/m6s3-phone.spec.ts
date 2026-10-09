// Phone-tester round checks for M6 slice 3 (Settings: editing tasks).
// Screenshots: tests/screenshots/m6s3-phone-*
import { test, expect, settle, type Page, type Browser, type TestInfo } from '../e2e/fixtures'
import { MAX_ACTIVE_TASKS, NEW_TASK_ID_PREFIX, TASK_NAME_MAX, TASK_XP_MAX, TASK_XP_MIN, TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = 'm6s3-phone'
const FRI = (hm: string) => new Date(`2026-10-09T${hm}:00+01:00`)
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const NAME = (id: string) => TASKS.find((t) => t.id === id)!.name
const SIZES = [
  [410, 914],
  [360, 800],
] as const

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function freshPage(
  browser: Browser,
  info: TestInfo,
  o: { w: number; h: number; scheme?: 'light' | 'dark'; data?: object | null; hash?: string; motion?: 'reduce' | 'no-preference'; time?: Date },
) {
  const context = await browser.newContext({
    ...info.project.use,
    viewport: { width: o.w, height: o.h },
    deviceScaleFactor: 3.125,
    colorScheme: o.scheme ?? 'light',
    reducedMotion: o.motion ?? 'reduce',
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  })
  const page = await context.newPage()
  const msgs = collectConsole(page)
  await page.addInitScript(() => (Math.random = () => 0.9999))
  if (o.data) {
    await page.addInitScript((d) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.clear()
        localStorage.setItem('drag-on:v1', d)
        sessionStorage.setItem('seeded', '1')
      }
    }, JSON.stringify(o.data))
  }
  await page.clock.install({ time: o.time ?? FRI('10:00') })
  await page.goto(`./${o.hash ?? ''}`)
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  return { page, context, msgs }
}

const tab = (page: Page, route: string) => page.locator(`.tabbar a.tab[data-route="${route}"]`)
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1') ?? 'null'))
const row = (page: Page, id: string) => page.locator(`.ss-task-row[data-task-id="${id}"]`)
const sheet = (page: Page) => page.locator('dialog.task-sheet')
const homeTask = (page: Page, id: string) => page.locator(`#task-list button.task[data-task-id="${id}"]`)

/** `count` active tasks: the built-ins then long-named extras (one unbroken 40 chars), plus one archived. */
function listOf(count: number) {
  const n = count - TASKS.length
  const extra = Array.from({ length: Math.max(n, 0) }, (_, i) => ({
    id: `${NEW_TASK_ID_PREFIX}${i}`,
    name: i === 0 ? 'W'.repeat(TASK_NAME_MAX) : `${i} Wonderfully long task name, really long`.slice(0, TASK_NAME_MAX),
    stat: (['heart', 'wisdom', 'strength', 'discipline'] as const)[i % 4],
    // Once a day, so the edit sheet's stepper reaches the plain XP maximum.
    xp: 15,
    rules: { kind: 'oncePerDay' },
    archived: false,
  }))
  const archived = { id: `${NEW_TASK_ID_PREFIX}old`, name: 'Supercalifragilisticexpialidocious-ish!!', stat: 'heart', xp: 20, rules: { kind: 'maxPerDay', max: 1 }, archived: true }
  return [...TASKS, ...extra, archived]
}
const data = (count: number) => ({ schemaVersion: 1, events: [], settings: { tasks: listOf(count) } })

async function overflow(page: Page, scope: string) {
  return page.evaluate((sel) => {
    const out: string[] = []
    if (document.documentElement.scrollWidth > innerWidth) out.push(`doc scrollWidth ${document.documentElement.scrollWidth}`)
    for (const e of document.querySelectorAll<HTMLElement>(`${sel} *`)) {
      const r = e.getBoundingClientRect()
      if (r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5)) out.push(`${e.tagName}.${e.className} ${r.left}-${r.right}`)
      // Clipped text: content wider than its box with hidden overflow.
      const cs = getComputedStyle(e)
      if (e.tagName !== 'INPUT' && e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' && e.clientWidth > 0) out.push(`clipped ${e.tagName}.${e.className} ${e.scrollWidth}>${e.clientWidth}`)
    }
    return out
  }, scope)
}

async function small(page: Page, selector: string) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { sel, id: e.id || e.dataset.taskId || e.textContent?.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }
      })
      .filter((x) => x.w < 44 || x.h < 44)
  }, selector)
}

// ---------------------------------------------------------------------------
test('tasks card + sheets: layout, tap targets, both sizes, light+dark', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  test.setTimeout(180_000)
  const fails: string[] = []
  const report: Record<string, unknown> = {}
  for (const [w, h] of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      const tag = `${w}-${scheme}`
      const { page, context, msgs } = await freshPage(browser, info, { w, h, scheme, hash: '#/settings', data: data(MAX_ACTIVE_TASKS - 1) })
      await page.locator('.ss-tasks').scrollIntoViewIfNeeded()
      await page.locator('.ss-archived-summary').tap()
      await settle(page)
      await page.locator('.ss-tasks').screenshot({ path: `${dir}/${PFX}-card-${tag}.png` })
      fails.push(...(await overflow(page, '#settings-screen')).map((s) => `${tag} card: ${s}`))
      for (const sel of ['.ss-task-row', '#ss-add-task', '.ss-archived-summary', '.ss-small-button'])
        fails.push(...(await small(page, sel)).map((s) => `${tag} small: ${JSON.stringify(s)}`))
      // The unbroken name stays inside its row.
      const long = await row(page, `${NEW_TASK_ID_PREFIX}0`).evaluate((b) => {
        const n = b.querySelector('.ss-task-name')!.getBoundingClientRect()
        const r = b.getBoundingClientRect()
        return { nameRight: n.right, rowRight: r.right, rowH: r.height, nameH: n.height }
      })
      report[`${tag} longrow`] = long
      if (long.nameRight > long.rowRight) fails.push(`${tag} long name past row`)

      // Edit sheet on the long-named task.
      await row(page, `${NEW_TASK_ID_PREFIX}0`).tap()
      await expect(sheet(page)).toBeVisible()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-edit-long-${tag}.png` })
      fails.push(...(await overflow(page, 'dialog.task-sheet')).map((s) => `${tag} edit: ${s}`))
      for (const sel of ['#task-sheet-xp-less', '#task-sheet-xp-more', '.ts-segment', '#task-sheet-done', '#task-sheet-cancel', '#task-sheet-archive', '#task-sheet-name'])
        fails.push(...(await small(page, sel)).map((s) => `${tag} small: ${JSON.stringify(s)}`))
      const geo = await page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect()
        const d = document.querySelector('dialog.task-sheet') as HTMLElement
        return {
          sheetTop: Math.round(r('dialog.task-sheet').top),
          sheetScrolls: d.scrollHeight > d.clientHeight,
          doneTop: Math.round(r('#task-sheet-done').top),
          cancelBottom: Math.round(r('#task-sheet-cancel').bottom),
          archiveBottom: Math.round(r('#task-sheet-archive').bottom),
          active: document.activeElement?.id,
          vh: innerHeight,
        }
      })
      report[`${tag} edit`] = geo
      if (geo.active !== 'task-sheet-title') fails.push(`${tag} focus on open is ${geo.active}`)
      if (geo.doneTop < geo.vh / 2) fails.push(`${tag} Done in top half (${geo.doneTop})`)
      // Stepper to its limits.
      for (let i = 0; i < 20; i++) if (await page.locator('#task-sheet-xp-more').isEnabled()) await page.locator('#task-sheet-xp-more').tap()
      await expect(page.locator('#task-sheet-xp')).toHaveText(`${TASK_XP_MAX} XP`)
      await expect(page.locator('#task-sheet-xp-more')).toBeDisabled()
      for (let i = 0; i < 20; i++) if (await page.locator('#task-sheet-xp-less').isEnabled()) await page.locator('#task-sheet-xp-less').tap()
      await expect(page.locator('#task-sheet-xp')).toHaveText(`${TASK_XP_MIN} XP`)
      await expect(page.locator('#task-sheet-xp-less')).toBeDisabled()
      await expect(page.locator('#task-sheet-xp-more')).toBeEnabled()
      await page.screenshot({ path: `${dir}/${PFX}-edit-min-${tag}.png` })
      await page.locator('#task-sheet-cancel').tap()
      await expect(sheet(page)).toHaveCount(0)

      // Wake sheet.
      await row(page, 'wake').tap()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-edit-wake-${tag}.png` })
      await page.locator('#task-sheet-cancel').tap()

      // Add sheet (one under the cap, so there's room already).
      await page.locator('#ss-add-task').tap()
      await expect(sheet(page)).toBeVisible()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-add-${tag}.png` })
      await page.getByRole('radio', { name: 'Wisdom' }).tap()
      await page.screenshot({ path: `${dir}/${PFX}-add-picked-${tag}.png` })
      fails.push(...(await overflow(page, 'dialog.task-sheet')).map((s) => `${tag} add: ${s}`))
      for (const sel of ['.ts-stat', '#task-sheet-done', '#task-sheet-cancel'])
        fails.push(...(await small(page, sel)).map((s) => `${tag} small: ${JSON.stringify(s)}`))
      report[`${tag} add`] = await page.evaluate(() => {
        const d = document.querySelector('dialog.task-sheet') as HTMLElement
        return {
          sheetTop: Math.round(d.getBoundingClientRect().top),
          scrolls: d.scrollHeight > d.clientHeight,
          doneTop: Math.round(document.querySelector('#task-sheet-done')!.getBoundingClientRect().top),
          cancelBottom: Math.round(document.querySelector('#task-sheet-cancel')!.getBoundingClientRect().bottom),
        }
      })
      await page.locator('#task-sheet-cancel').tap()
      if (msgs.length) fails.push(`${tag} console: ${msgs.join(' | ')}`)
      await context.close()
    }
  }
  console.log('layout report', JSON.stringify(report, null, 1))
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test('keyboard: focus starts on heading; name field stays above a 45% keyboard', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const out: Record<string, unknown> = {}
  for (const [w, h] of SIZES) {
    for (const mode of ['edit', 'add'] as const) {
      const { page, context, msgs } = await freshPage(browser, info, { w, h, hash: '#/settings' })
      if (mode === 'edit') await row(page, 'gym').tap()
      else await page.locator('#ss-add-task').tap()
      await expect(sheet(page)).toBeVisible()
      await settle(page)
      expect(await page.evaluate(() => document.activeElement?.id)).toBe('task-sheet-title')
      await page.locator('#task-sheet-name').tap()
      await expect(page.locator('#task-sheet-name')).toBeFocused()
      const r = (await page.locator('#task-sheet-name').boundingBox())!
      const kbTop = h * 0.55
      out[`${w} ${mode} resizes-visual`] = { inputTop: Math.round(r.y), inputBottom: Math.round(r.y + r.height), kbTop }
      expect(r.y + r.height, `${w} ${mode}: input under keyboard`).toBeLessThanOrEqual(kbTop)

      // If the page were resized by the keyboard (resizes-content), the sheet would shrink:
      // emulate that and check the name and the sheet can still be reached.
      await page.setViewportSize({ width: w, height: Math.round(kbTop) })
      await page.waitForTimeout(100)
      await page.locator('#task-sheet-name').scrollIntoViewIfNeeded()
      const r2 = (await page.locator('#task-sheet-name').boundingBox())!
      const d = await page.evaluate(() => {
        const s = document.querySelector('dialog.task-sheet') as HTMLElement
        return { top: s.getBoundingClientRect().top, h: s.clientHeight, sh: s.scrollHeight }
      })
      out[`${w} ${mode} resizes-content`] = { inputTop: Math.round(r2.y), inputBottom: Math.round(r2.y + r2.height), vh: Math.round(kbTop), sheet: d }
      expect(r2.y).toBeGreaterThanOrEqual(0)
      expect(r2.y + r2.height).toBeLessThanOrEqual(kbTop)
      await page.screenshot({ path: `${dir}/${PFX}-keyboard-${mode}-${w}.png` })
      // Done reachable by scrolling the sheet.
      await page.locator('#task-sheet-done').scrollIntoViewIfNeeded()
      await expect(page.locator('#task-sheet-done')).toBeInViewport()
      // Enter closes the keyboard (blurs), does not submit.
      await page.locator('#task-sheet-name').focus()
      await page.keyboard.press('Enter')
      await expect(sheet(page)).toBeVisible()
      await expect(page.locator('#task-sheet-name')).not.toBeFocused()
      expect(msgs).toEqual([])
      await context.close()
    }
  }
  console.log('keyboard', JSON.stringify(out, null, 1))
})

// ---------------------------------------------------------------------------
test('cancel paths: Escape, backdrop, back; focus returns', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context, msgs } = await freshPage(browser, info, { w: 410, h: 914, hash: '#/settings' })
  const notes: string[] = []

  // Escape (also what Android's back gesture sends to a modal dialog via CloseWatcher).
  await row(page, 'gym').tap()
  await page.locator('#task-sheet-name').fill('Changed')
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await expect(row(page, 'gym')).toBeFocused()
  await expect(row(page, 'gym')).toContainText(NAME('gym'))

  // Backdrop tap, top of the screen.
  await row(page, 'walk').tap()
  await page.locator('#task-sheet-xp-more').tap()
  await page.touchscreen.tap(200, 40)
  await expect(sheet(page)).toHaveCount(0)
  await expect(row(page, 'walk')).toBeFocused()
  await expect(row(page, 'walk')).toContainText(`${XP('walk')} XP`)

  // A tap inside the sheet's padding does not close it.
  await row(page, 'read').tap()
  const box = (await sheet(page).boundingBox())!
  await page.touchscreen.tap(box.x + 40, box.y + 10)
  await expect(sheet(page)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(row(page, 'read')).toBeFocused()

  // Add sheet cancel: focus back to Add.
  await page.locator('#ss-add-task').tap()
  await page.keyboard.press('Escape')
  await expect(page.locator('#ss-add-task')).toBeFocused()

  // Escape while typing in the name field.
  await row(page, 'gym').tap()
  await page.locator('#task-sheet-name').tap()
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)

  // History back (if Chrome's back went to history instead of the dialog).
  await tab(page, 'home').tap()
  await tab(page, 'settings').tap()
  await row(page, 'gym').tap()
  await expect(sheet(page)).toBeVisible()
  const urlBefore = page.url()
  await page.goBack()
  await page.waitForTimeout(400)
  const after = { url: page.url(), sheets: await sheet(page).count(), open: await page.evaluate(() => !!document.querySelector('dialog[open]')) }
  notes.push(`goBack from ${urlBefore}: ${JSON.stringify(after)}`)
  await page.screenshot({ path: `${dir}/${PFX}-after-goback.png` })
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  await settle(page)
  notes.push(`active after Escape on Home: ${await page.evaluate(() => document.activeElement?.tagName + '#' + document.activeElement?.id)}`)
  await page.screenshot({ path: `${dir}/${PFX}-after-goback-closed.png` })
  console.log('cancel notes', notes.join('\n'))
  // Nothing was saved.
  expect((await stored(page))?.settings?.tasks).toBeUndefined()
  expect(msgs).toEqual([])
  await context.close()
})

// ---------------------------------------------------------------------------
for (const count of [MAX_ACTIVE_TASKS]) {
  test(`home with ${count} active tasks: scroll fade, big buttons, one-tap log`, async ({ browser }, info) => {
    test.skip(info.project.name !== 'pixel10pro')
    test.setTimeout(120_000)
    const out: Record<string, unknown> = {}
    for (const [w, h] of SIZES) {
      for (const scheme of ['light', 'dark'] as const) {
        const tag = `${count}-${w}-${scheme}`
        const { page, context, msgs } = await freshPage(browser, info, { w, h, scheme, data: data(count) })
        await settle(page)
        await page.screenshot({ path: `${dir}/${PFX}-home-${tag}.png` })
        const buttons = page.locator('#task-list button.task')
        expect(await buttons.count()).toBe(count - 1) // wake hidden mid-morning
        expect(await overflow(page, '#home')).toEqual([])
        expect(await small(page, '#task-list button.task')).toEqual([])
        const info2 = await page.evaluate(() => {
          const list = document.querySelector('#task-list') as HTMLElement
          let s: HTMLElement | null = list
          while (s && !(s.scrollHeight > s.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(s).overflowY))) s = s.parentElement
          const btns = [...list.querySelectorAll<HTMLElement>('button.task')].map((b) => Math.round(b.getBoundingClientRect().height))
          return {
            scroller: s ? `${s.tagName}#${s.id}.${s.className}` : null,
            fade: s?.dataset.fade ?? null,
            listTop: Math.round(list.getBoundingClientRect().top),
            heights: btns,
          }
        })
        out[tag] = info2
        // Long names wrap: the unbroken one keeps its XP visible inside.
        const long = homeTask(page, `${NEW_TASK_ID_PREFIX}0`)
        await long.scrollIntoViewIfNeeded()
        const lg = await long.evaluate((b) => {
          const r = b.getBoundingClientRect()
          const x = b.querySelector('.task-xp')?.getBoundingClientRect()
          const n = b.querySelector('.task-name')?.getBoundingClientRect()
          return { right: r.right, xpRight: x?.right, nameRight: n?.right, h: r.height }
        })
        out[`${tag} long`] = lg
        expect(lg.nameRight ?? 0).toBeLessThanOrEqual(lg.right)
        expect(lg.xpRight ?? 0).toBeLessThanOrEqual(lg.right)
        await settle(page)
        await page.screenshot({ path: `${dir}/${PFX}-home-long-${tag}.png` })
        const last = buttons.last()
        await last.scrollIntoViewIfNeeded()
        await settle(page)
        out[`${tag} fadeAtEnd`] = await page.evaluate(() => document.querySelector<HTMLElement>('#home .scroll-fade, .scroll-fade')?.dataset.fade ?? null)
        await page.screenshot({ path: `${dir}/${PFX}-home-end-${tag}.png` })
        // One tap logs, with feedback.
        await last.tap()
        await expect(page.locator('#toast')).toHaveClass(/is-showing/)
        await expect(page.locator('#xp-total')).toHaveText('15')
        expect(msgs).toEqual([])
        await context.close()
      }
    }
    console.log('home', JSON.stringify(out, null, 1))
  })
}

// ---------------------------------------------------------------------------
test('end to end in dark mode with motion: rename, XP, archive/unarchive, add+log, history', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context, msgs } = await freshPage(browser, info, { w: 410, h: 914, scheme: 'dark', motion: 'no-preference' })
  // A read log before archiving.
  await homeTask(page, 'read').tap()
  await expect(homeTask(page, 'read')).toContainText('Done')
  await tab(page, 'settings').tap()

  await row(page, 'gym').tap()
  await page.locator('#task-sheet-name').fill('Lift heavy things')
  await page.locator('#task-sheet-xp-more').tap()
  await page.locator('#task-sheet-done').tap()
  await expect(row(page, 'gym')).toContainText('Lift heavy things')
  await expect(row(page, 'gym')).toBeFocused()

  await row(page, 'read').tap()
  await page.locator('#task-sheet-archive').tap()
  await expect(page.locator('.ss-toast')).toBeVisible()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${dir}/${PFX}-archived-toast-dark.png` })

  await page.locator('#ss-add-task').tap()
  await page.locator('#task-sheet-name').fill('Stretch')
  await page.getByRole('radio', { name: 'Heart' }).tap()
  await page.locator('#task-sheet-done').tap()
  await expect(sheet(page)).toHaveCount(0)
  const added = (await stored(page)).settings.tasks.at(-1).id

  await tab(page, 'home').tap()
  await expect(homeTask(page, 'read')).toHaveCount(0)
  await expect(homeTask(page, 'gym')).toContainText('Lift heavy things')
  await homeTask(page, 'gym').tap()
  await expect(page.locator('.toast-name')).toHaveText('Lift heavy things')
  await expect(page.locator('#toast')).toContainText(`+${XP('gym') + 5} XP`)
  await page.waitForTimeout(200)
  await page.screenshot({ path: `${dir}/${PFX}-e2e-home-dark.png` })
  await homeTask(page, added).tap()
  await expect(homeTask(page, added)).toContainText('Done')

  await tab(page, 'history').tap()
  await expect(page.locator('.hs-day')).toContainText(NAME('read'))
  await expect(page.locator('.hs-week')).not.toContainText(NAME('read'))
  await expect(page.locator('.hs-week')).toContainText('Stretch')
  await settle(page)
  await page.screenshot({ path: `${dir}/${PFX}-e2e-history-dark.png`, fullPage: true })

  await tab(page, 'settings').tap()
  await page.locator('.ss-archived-summary').tap()
  await page.getByRole('button', { name: `Unarchive ${NAME('read')}` }).tap()
  await tab(page, 'home').tap()
  await expect(homeTask(page, 'read')).toContainText('Done')
  expect(msgs).toEqual([])
  await context.close()
})

// ---------------------------------------------------------------------------
test('reduced motion: sheet uses the calm fade, no bounces', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const res: Record<string, unknown> = {}
  for (const motion of ['reduce', 'no-preference'] as const) {
    const { page, context } = await freshPage(browser, info, { w: 410, h: 914, hash: '#/settings', motion })
    await row(page, 'gym').tap()
    res[motion] = await page.evaluate(() => {
      const s = document.querySelector('dialog.task-sheet')!
      const step = document.querySelector('#task-sheet-xp-more')!
      const r = document.querySelector('.ss-task-row')!
      return {
        sheetAnim: getComputedStyle(s).animationName,
        sheetDur: getComputedStyle(s).animationDuration,
        calm: s.classList.contains('is-calm'),
        stepTransition: getComputedStyle(step).transitionProperty + ' ' + getComputedStyle(step).transitionDuration,
        rowTransition: getComputedStyle(r).transitionProperty + ' ' + getComputedStyle(r).transitionDuration,
      }
    })
    await context.close()
  }
  console.log('motion', JSON.stringify(res, null, 1))
  expect((res.reduce as { sheetAnim: string }).sheetAnim).not.toBe('sheet-in')
})

// ---------------------------------------------------------------------------
test('offline: task edits save and survive a reload', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context, msgs } = await freshPage(browser, info, { w: 410, h: 914 })
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await tab(page, 'settings').tap()
  await row(page, 'walk').tap()
  await page.locator('#task-sheet-name').fill('Offline walk')
  await page.locator('#task-sheet-done').tap()
  await row(page, 'gym').tap()
  await page.locator('#task-sheet-archive').tap()
  await page.locator('#ss-add-task').tap()
  await page.locator('#task-sheet-name').fill('Offline new')
  await page.getByRole('radio', { name: 'Strength' }).tap()
  await page.locator('#task-sheet-done').tap()
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await tab(page, 'home').tap()
  await expect(homeTask(page, 'walk')).toContainText('Offline walk')
  await expect(homeTask(page, 'gym')).toHaveCount(0)
  await expect(page.locator('#task-list button.task', { hasText: 'Offline new' })).toHaveCount(1)
  await page.locator('#task-list button.task', { hasText: 'Offline new' }).tap()
  await expect(page.locator('#toast')).toHaveClass(/is-showing/)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  expect((await stored(page)).events.length).toBe(1)
  await page.screenshot({ path: `${dir}/${PFX}-offline-home.png` })
  await context.setOffline(false)
  expect(msgs.filter((m) => !/net::ERR_INTERNET_DISCONNECTED/.test(m))).toEqual([])
  await context.close()
})

test('at cap: add sheet cannot open; cap card light+dark at 360', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  for (const scheme of ['light', 'dark'] as const) {
    const { page, context, msgs } = await freshPage(browser, info, { w: 360, h: 800, scheme, hash: '#/settings', data: data(MAX_ACTIVE_TASKS) })
    await expect(page.locator('#ss-add-task')).toBeDisabled()
    await page.locator('#ss-add-task').scrollIntoViewIfNeeded()
    await page.locator('.ss-archived-summary').tap()
    await settle(page)
    await page.locator('.ss-tasks').screenshot({ path: `${dir}/${PFX}-cap-card-360-${scheme}.png` })
    expect(await overflow(page, '#settings-screen')).toEqual([])
    expect(msgs).toEqual([])
    await context.close()
  }
})
