// Phone-tester round checks for M7 slice 1 (the "How hard is this for you?" picker).
// Screenshots: tests/screenshots/m7s1-phone-*
import { test, expect, settle, type Page, type Browser, type TestInfo } from '../e2e/fixtures'
import { EFFORT_LEVELS, NEW_TASK_ID_PREFIX, TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = 'm7s1-phone'
const FRI = (hm: string) => new Date(`2026-10-09T${hm}:00+01:00`)
const LEVEL = (id: string) => EFFORT_LEVELS.find((l) => l.id === id)!
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
const effort = (page: Page, id: string) => sheet(page).locator(`.ts-effort[data-effort="${id}"]`)
const times = (page: Page, n: number) => sheet(page).locator(`.ts-segment[data-times="${n}"]`)
const homeTask = (page: Page, id: string) => page.locator(`#task-list button.task[data-task-id="${id}"]`)

/** An M6-era save: every task stored without an effort level, plus custom ones. */
const LEGACY = [
  ...TASKS.map(({ effort: _e, ...t }) => (t.id === 'read' || t.id === 'selfcare' ? { ...t, archived: true } : t)),
  { id: `${NEW_TASK_ID_PREFIX}piano`, name: 'Practise piano', stat: 'wisdom', xp: 50, rules: { kind: 'oncePerDay' }, archived: false },
  { id: `${NEW_TASK_ID_PREFIX}water`, name: 'Drink water', stat: 'heart', xp: 15, rules: { kind: 'maxPerDay', max: 3 }, archived: false },
  { id: `${NEW_TASK_ID_PREFIX}stretch`, name: 'Stretch', stat: 'strength', xp: 25, rules: { kind: 'maxPerDay', max: 2 }, archived: false },
]
const legacyData = { schemaVersion: 1, events: [], settings: { tasks: LEGACY } }

async function overflow(page: Page, scope: string) {
  return page.evaluate((sel) => {
    const out: string[] = []
    if (document.documentElement.scrollWidth > innerWidth) out.push(`doc scrollWidth ${document.documentElement.scrollWidth}`)
    for (const e of document.querySelectorAll<HTMLElement>(`${sel} *`)) {
      const r = e.getBoundingClientRect()
      if (r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5)) out.push(`${e.tagName}.${e.className} ${r.left}-${r.right}`)
      const cs = getComputedStyle(e)
      if (e.tagName !== 'INPUT' && e.scrollWidth > e.clientWidth + 1 && cs.overflowX !== 'visible' && e.clientWidth > 0)
        out.push(`clipped ${e.tagName}.${e.className} ${e.scrollWidth}>${e.clientWidth}`)
    }
    return out
  }, scope)
}

async function sizes(page: Page, selector: string) {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((e) => e.getClientRects().length)
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { sel, id: e.id || e.dataset.effort || e.dataset.times || e.dataset.taskId || e.textContent?.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }
      })
  }, selector)
}

const SHEET_TARGETS = ['.ts-effort', '.ts-segment', '.ts-stat', '#task-sheet-done', '#task-sheet-cancel', '#task-sheet-archive', '#task-sheet-name']

// ---------------------------------------------------------------------------
test('sheets: layout, tap targets, both sizes, light+dark', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  test.setTimeout(240_000)
  const fails: string[] = []
  const report: Record<string, unknown> = {}
  for (const [w, h] of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      const tag = `${w}-${scheme}`
      const { page, context, msgs } = await freshPage(browser, info, { w, h, scheme, hash: '#/settings', data: legacyData })
      await page.locator('.ss-tasks').scrollIntoViewIfNeeded()
      await settle(page)
      await page.locator('.ss-tasks').screenshot({ path: `${dir}/${PFX}-card-legacy-${tag}.png` })
      fails.push(...(await overflow(page, '#settings-screen')).map((s) => `${tag} card: ${s}`))
      const rowSizes = await sizes(page, '.ss-task-row, #ss-add-task')
      fails.push(...rowSizes.filter((s) => s.w < 44 || s.h < 44).map((s) => `${tag} small ${JSON.stringify(s)}`))

      // Wake-up task (no level): "Currently 30 XP", no times a day.
      await row(page, 'wake').tap()
      await expect(sheet(page)).toBeVisible()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-wake-legacy-${tag}.png` })
      await expect(page.locator('#task-sheet-effort-hint')).toHaveText('Currently 30 XP. Pick a level to change it.')
      await expect(page.locator('#task-sheet-effort-hint')).toBeVisible()
      fails.push(...(await overflow(page, 'dialog.task-sheet')).map((s) => `${tag} wake: ${s}`))
      await page.locator('#task-sheet-cancel').tap()

      // Legacy custom 25 XP twice a day: legacy times hint.
      await row(page, `${NEW_TASK_ID_PREFIX}stretch`).tap()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-legacy-stretch-${tag}.png` })
      report[`${tag} stretch hint`] = await page.locator('#task-sheet-times-hint').textContent()
      await page.locator('#task-sheet-cancel').tap()

      // A levelled task: pick Really hard -> times hint, disabled 2/3.
      await row(page, `${NEW_TASK_ID_PREFIX}water`).tap()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-legacy-water-${tag}.png` })
      await effort(page, 'hard').tap()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-water-hard-${tag}.png` })
      fails.push(...(await overflow(page, 'dialog.task-sheet')).map((s) => `${tag} edit: ${s}`))
      const sheetSizes = await sizes(page, SHEET_TARGETS.join(','))
      report[`${tag} edit sizes`] = sheetSizes
      fails.push(...sheetSizes.filter((s) => s.w < 44 || s.h < 44).map((s) => `${tag} small ${JSON.stringify(s)}`))
      const geo = await page.evaluate(() => {
        const r = (s: string) => document.querySelector(s)!.getBoundingClientRect()
        const d = document.querySelector('dialog.task-sheet') as HTMLElement
        const eff = [...document.querySelectorAll('.ts-effort')].map((e) => {
          const b = e.getBoundingClientRect()
          return { top: Math.round(b.top), h: Math.round(b.height), l: Math.round(b.left), r: Math.round(b.right) }
        })
        return {
          sheetTop: Math.round(r('dialog.task-sheet').top),
          scrolls: d.scrollHeight > d.clientHeight,
          effortTop: Math.round(r('.ts-efforts').top),
          doneTop: Math.round(r('#task-sheet-done').top),
          doneBottom: Math.round(r('#task-sheet-done').bottom),
          eff,
          vh: innerHeight,
        }
      })
      report[`${tag} edit geo`] = geo
      if (new Set(geo.eff.map((e) => e.top)).size !== 1) fails.push(`${tag} effort choices not on one row`)
      if (new Set(geo.eff.map((e) => e.h)).size !== 1) fails.push(`${tag} effort choices differ in height`)
      if (geo.doneBottom > geo.vh) fails.push(`${tag} Done below the fold (${geo.doneBottom}>${geo.vh})`)
      await page.locator('#task-sheet-cancel').tap()

      // Add sheet.
      await page.locator('#ss-add-task').tap()
      await expect(sheet(page)).toBeVisible()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-add-${tag}.png` })
      await sheet(page).getByRole('radio', { name: 'Wisdom' }).tap()
      await effort(page, 'effort').tap()
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-add-effort-${tag}.png` })
      fails.push(...(await overflow(page, 'dialog.task-sheet')).map((s) => `${tag} add: ${s}`))
      const addSizes = await sizes(page, SHEET_TARGETS.join(','))
      fails.push(...addSizes.filter((s) => s.w < 44 || s.h < 44).map((s) => `${tag} small ${JSON.stringify(s)}`))
      report[`${tag} add`] = await page.evaluate(() => {
        const d = document.querySelector('dialog.task-sheet') as HTMLElement
        return {
          sheetTop: Math.round(d.getBoundingClientRect().top),
          scrolls: d.scrollHeight > d.clientHeight,
          doneTop: Math.round(document.querySelector('#task-sheet-done')!.getBoundingClientRect().top),
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

test('radiogroup semantics and keyboard', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context, msgs } = await freshPage(browser, info, { w: 410, h: 914, hash: '#/settings' })
  await row(page, 'walk').tap()
  const group = sheet(page).getByRole('radiogroup', { name: 'How hard is this for you?' })
  await expect(group).toBeVisible()
  const radios = group.getByRole('radio')
  await expect(radios).toHaveCount(3)
  for (const l of EFFORT_LEVELS) await expect(group.getByRole('radio', { name: `${l.label}, ${l.xp} XP` })).toBeVisible()
  await expect(effort(page, 'nudge')).toHaveAttribute('aria-checked', 'true')
  // Roving tabindex: only the checked one is tabbable.
  const tabIdx = () => sheet(page).locator('.ts-effort').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).tabIndex))
  expect(await tabIdx()).toEqual([0, -1, -1])
  // Tab order: name -> effort group (once) -> times group.
  await page.locator('#task-sheet-name').focus()
  await page.keyboard.press('Tab')
  await expect(effort(page, 'nudge')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(times(page, 1)).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(effort(page, 'nudge')).toBeFocused()
  // Arrows move and choose; wrap; Home/End.
  await page.keyboard.press('ArrowRight')
  await expect(effort(page, 'effort')).toBeFocused()
  await expect(effort(page, 'effort')).toHaveAttribute('aria-checked', 'true')
  expect(await tabIdx()).toEqual([-1, 0, -1])
  await page.keyboard.press('ArrowRight')
  await expect(effort(page, 'hard')).toHaveAttribute('aria-checked', 'true')
  await expect(times(page, 2)).toBeDisabled()
  await page.keyboard.press('ArrowRight')
  await expect(effort(page, 'nudge')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowLeft')
  await expect(effort(page, 'hard')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(effort(page, 'nudge')).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('End')
  await expect(effort(page, 'hard')).toHaveAttribute('aria-checked', 'true')
  // Hint is linked to the times group and live.
  const tg = sheet(page).getByRole('radiogroup', { name: 'Times a day' })
  await expect(tg).toHaveAttribute('aria-describedby', 'task-sheet-times-hint')
  await expect(page.locator('#task-sheet-times-hint')).toHaveAttribute('aria-live', 'polite')
  await expect(page.locator('#task-sheet-times-hint')).toHaveText('Really hard: once a day.')
  // Space/Enter on a focused radio chooses it.
  await page.keyboard.press('ArrowLeft')
  await expect(effort(page, 'effort')).toHaveAttribute('aria-checked', 'true')
  await effort(page, 'nudge').focus()
  await page.keyboard.press('Space')
  await expect(effort(page, 'nudge')).toHaveAttribute('aria-checked', 'true')
  const snap = await sheet(page).ariaSnapshot()
  console.log('aria snapshot\n' + snap)
  await page.keyboard.press('Escape')
  await expect(sheet(page)).toHaveCount(0)
  expect(msgs).toEqual([])
  await context.close()
})

test('legacy tasks: XP kept until a level is picked; wake shows Currently 30 XP; Home logs right XP', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context, msgs } = await freshPage(browser, info, { w: 410, h: 914, hash: '#/settings', data: legacyData })
  // Rows show XP for legacy tasks matching no level; an exact match shows as that level (M7s1 review round 1).
  await expect(row(page, 'wake').locator('.ss-task-xp')).toHaveText('30 XP')
  await expect(row(page, 'gym').locator('.ss-task-xp')).toHaveText('Really hard')
  await expect(row(page, `${NEW_TASK_ID_PREFIX}piano`).locator('.ss-task-xp')).toHaveText('50 XP')
  // Wake sheet.
  await row(page, 'wake').tap()
  await expect(page.locator('#task-sheet-effort-hint')).toHaveText('Currently 30 XP. Pick a level to change it.')
  for (const l of EFFORT_LEVELS) await expect(effort(page, l.id)).toHaveAttribute('aria-checked', 'false')
  await expect(sheet(page).getByRole('radiogroup', { name: 'Times a day' })).toHaveCount(0)
  // The first effort radio is tabbable when none is checked.
  expect(await sheet(page).locator('.ts-effort').evaluateAll((bs) => bs.map((b) => (b as HTMLElement).tabIndex))).toEqual([0, -1, -1])
  await page.locator('#task-sheet-cancel').tap()
  // Legacy 50 XP once a day: can't go to 2 before picking a level.
  await row(page, `${NEW_TASK_ID_PREFIX}piano`).tap()
  await expect(times(page, 2)).toBeDisabled()
  await expect(page.locator('#task-sheet-times-hint')).toHaveText("At 50 XP it's once a day.")
  await effort(page, 'nudge').tap()
  await expect(times(page, 3)).toBeEnabled()
  await expect(page.locator('#task-sheet-effort-hint')).toBeHidden()
  await page.locator('#task-sheet-cancel').tap()
  // Untouched legacy on Home logs its stored XP in one tap.
  await tab(page, 'home').tap()
  await expect(homeTask(page, 'gym')).toContainText('+40 XP')
  await expect(homeTask(page, `${NEW_TASK_ID_PREFIX}piano`)).toContainText('+50 XP')
  await homeTask(page, `${NEW_TASK_ID_PREFIX}piano`).tap()
  await expect(page.locator('#toast-text')).toHaveText('+50 XP · Practise piano')
  await expect(page.locator('#xp-total')).toHaveText('50')
  const ev = (await stored(page)).events
  expect(ev.at(-1)).toMatchObject({ taskId: `${NEW_TASK_ID_PREFIX}piano`, xpAwarded: 50 })
  await page.screenshot({ path: `${dir}/${PFX}-home-legacy.png` })
  expect(msgs).toEqual([])
  await context.close()
})

test('add a task, change level lowers times a day, offline logging gives the right XP and lasts', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context, msgs } = await freshPage(browser, info, { w: 410, h: 914 })
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()

  // Add: nudge, 3 times a day.
  await tab(page, 'settings').tap()
  await page.locator('#ss-add-task').tap()
  await page.locator('#task-sheet-name').fill('Tidy desk')
  await sheet(page).getByRole('radio', { name: 'Discipline' }).tap()
  await expect(effort(page, 'nudge')).toHaveAttribute('aria-checked', 'true')
  await times(page, 3).tap()
  await page.locator('#task-sheet-done').tap()
  await expect(sheet(page)).toHaveCount(0)
  const added = (await stored(page)).settings.tasks.at(-1)
  expect(added).toMatchObject({ name: 'Tidy desk', effort: 'nudge', xp: 15, rules: { kind: 'maxPerDay', max: 3 } })
  await expect(row(page, added.id).locator('.ss-task-xp')).toHaveText('A little nudge')

  // Edit: Takes effort -> times lowered to 2.
  await row(page, added.id).tap()
  await expect(times(page, 3)).toHaveAttribute('aria-checked', 'true')
  await effort(page, 'effort').tap()
  await expect(times(page, 2)).toHaveAttribute('aria-checked', 'true')
  await expect(times(page, 3)).toBeDisabled()
  await expect(page.locator('#task-sheet-times-hint')).toHaveText('Takes effort: up to twice a day.')
  await page.screenshot({ path: `${dir}/${PFX}-lowered.png` })
  await page.locator('#task-sheet-done').tap()
  const edited = (await stored(page)).settings.tasks.find((t: { id: string }) => t.id === added.id)
  expect(edited).toMatchObject({ effort: 'effort', xp: 25, rules: { kind: 'maxPerDay', max: 2 } })

  // Home: one tap logs +25.
  await tab(page, 'home').tap()
  const b = homeTask(page, added.id)
  await expect(b).toContainText('+25 XP')
  const before = (await stored(page)).events.length
  await b.tap()
  await expect(page.locator('#toast-text')).toHaveText('+25 XP · Tidy desk')
  await expect(b).toContainText('1/2')
  await expect(page.locator('#xp-total')).toHaveText('25')
  expect((await stored(page)).events.length).toBe(before + 1)
  await page.screenshot({ path: `${dir}/${PFX}-offline-logged.png` })
  await b.tap()
  await expect(b).toContainText('2/2')
  await expect(page.locator('#xp-total')).toHaveText('50')

  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await expect(page.locator('#xp-total')).toHaveText('50')
  await expect(homeTask(page, added.id)).toContainText('2/2')
  const evs = (await stored(page)).events.filter((e: { taskId?: string }) => e.taskId === added.id)
  expect(evs.map((e: { xpAwarded: number }) => e.xpAwarded)).toEqual([25, 25])
  // Edit later to hard: past logs keep 25.
  await tab(page, 'settings').tap()
  await row(page, added.id).tap()
  await effort(page, 'hard').tap()
  await expect(times(page, 1)).toHaveAttribute('aria-checked', 'true')
  await page.locator('#task-sheet-done').tap()
  await tab(page, 'home').tap()
  await expect(page.locator('#xp-total')).toHaveText('50')
  await context.setOffline(false)
  expect(msgs.filter((m) => !/net::ERR_INTERNET_DISCONNECTED/.test(m))).toEqual([])
  await context.close()
})

test('reduced motion: effort choices have no transition or press scale', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  for (const motion of ['reduce', 'no-preference'] as const) {
    const { page, context } = await freshPage(browser, info, { w: 410, h: 914, hash: '#/settings', motion })
    await row(page, 'walk').tap()
    const s = await effort(page, 'effort').evaluate((b) => {
      const cs = getComputedStyle(b)
      return { transition: cs.transitionDuration, sheetAnim: getComputedStyle(document.querySelector('dialog.task-sheet')!).animationDuration }
    })
    console.log(motion, JSON.stringify(s))
    if (motion === 'reduce') expect(s.transition.split(',').every((d) => d.trim() === '0s')).toBe(true)
    await context.close()
  }
})
