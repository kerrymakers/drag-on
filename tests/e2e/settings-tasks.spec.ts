// Settings: editing tasks, on the phone (from M6 slice 3).
// Screenshots (with SCREENSHOTS=1): tests/screenshots/m6s3-*
import { test, expect, settle, shot, type Page } from './fixtures'
import {
  MAX_ACTIVE_TASKS,
  NEW_TASK_ID_PREFIX,
  NEW_TASK_XP,
  TASK_DAILY_XP_MAX,
  TASK_LIMITS,
  TASK_NAME_MAX,
  TASK_XP_MAX,
  TASK_XP_STEP,
  TASKS,
} from '../../src/config/tasks'
import { maxXpFor } from '../../src/game/tasks'
import { SETTINGS, TASKS_COPY, dailyXpHint } from '../../src/ui/copy'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
// Friday 9 October 2026 (BST), mid-morning: the wake-up window has closed.
const FRI = (hm: string) => new Date(`2026-10-09T${hm}:00+01:00`)
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const NAME = (id: string) => TASKS.find((t) => t.id === id)!.name

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

/** Seeds the saved data once (a string as-is), then opens the app at `hash` at `time`. */
async function open(page: Page, time: Date, data: object | string | null = null, hash = '') {
  if (data !== null) {
    await page.addInitScript((d) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.clear()
        localStorage.setItem('drag-on:v1', d)
        sessionStorage.setItem('seeded', '1')
      }
    }, typeof data === 'string' ? data : JSON.stringify(data))
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time })
  await page.goto(`./${hash}`)
  await expect(page.locator('#tabbar a').first()).toBeVisible()
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1') ?? 'null'))
const tab = (page: Page, route: string) => page.locator(`.tabbar a.tab[data-route="${route}"]`)
const homeTask = (page: Page, id: string) => page.locator(`#task-list button.task[data-task-id="${id}"]`)
const row = (page: Page, id: string) => page.locator(`.ss-task-row[data-task-id="${id}"]`)
const sheet = (page: Page) => page.locator('dialog.task-sheet')
const sheetName = (page: Page) => sheet(page).getByRole('textbox', { name: TASKS_COPY.nameLabel })
const done = (page: Page) => page.locator('#task-sheet-done')

async function noOverflow(page: Page, scope: string) {
  const r = await page.evaluate((sel) => ({
    doc: document.documentElement.scrollWidth,
    vw: innerWidth,
    wide: [...document.querySelectorAll(`${sel} *`)]
      .filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > innerWidth + 0.5)
      .map((e) => e.className),
  }), scope)
  expect(r.doc).toBeLessThanOrEqual(r.vw)
  expect(r.wide).toEqual([])
}

async function bigEnough(page: Page, selectors: string[]) {
  for (const sel of selectors) {
    const b = (await page.locator(sel).first().boundingBox())!
    expect(b.height, sel).toBeGreaterThanOrEqual(44)
    expect(b.width, sel).toBeGreaterThanOrEqual(44)
  }
}

test('the Tasks card sits after Name, with a row per task, and its sheets fit, in light and dark', async ({ page }, info) => {
  const msgs = collectConsole(page)
  await open(page, FRI('10:00'), null, '#/settings')
  const titles = await page.locator('#settings-screen h2').allTextContents()
  expect(titles).toEqual([SETTINGS.nameTitle, TASKS_COPY.title, SETTINGS.wakeTitle, SETTINGS.backupTitle])
  await expect(page.locator('.ss-task-row')).toHaveCount(TASKS.length)
  await expect(row(page, 'gym')).toContainText(NAME('gym'))
  await expect(row(page, 'gym')).toContainText('Strength')
  await expect(row(page, 'gym')).toContainText(`${XP('gym')} XP`)
  // No archived tasks yet, so no Archived section.
  await expect(page.locator('.ss-archived')).toBeHidden()
  await bigEnough(page, ['.ss-task-row', '#ss-add-task'])

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.locator('.ss-tasks').scrollIntoViewIfNeeded()
    await settle(page)
    await noOverflow(page, '#settings-screen')
    await shot(page, `m6s3-tasks-card-${info.project.name}-${scheme}`)

    // The edit sheet: name, stat line, stepper, times a day, the next-log line, archive.
    await row(page, 'avoided').tap()
    await expect(sheet(page)).toBeVisible()
    await expect(sheetName(page)).toHaveValue(NAME('avoided'))
    await expect(sheetName(page)).not.toBeFocused()
    await expect(sheet(page)).toContainText('Counts towards Discipline')
    await expect(sheet(page)).toContainText(TASKS_COPY.nextLog)
    await expect(sheet(page).getByRole('radio', { name: 'Twice a day' })).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('#task-sheet-archive')).toBeVisible()
    await expect(sheet(page)).toContainText(TASKS_COPY.archiveNote)
    await bigEnough(page, ['#task-sheet-xp-less', '#task-sheet-xp-more', '.ts-segment', '#task-sheet-done', '#task-sheet-cancel', '#task-sheet-archive', '#task-sheet-name'])
    await settle(page)
    await noOverflow(page, 'dialog.task-sheet')
    await shot(page, `m6s3-edit-sheet-${info.project.name}-${scheme}`)
    await page.locator('#task-sheet-cancel').tap()
    await expect(sheet(page)).toHaveCount(0)

    // The add sheet: a stat picker, no archive.
    await page.locator('#ss-add-task').tap()
    await expect(sheet(page)).toBeVisible()
    await expect(sheet(page).getByRole('radio')).toHaveCount(4 + 3)
    await expect(sheet(page)).toContainText(TASKS_COPY.statFixed)
    await expect(page.locator('#task-sheet-archive')).toHaveCount(0)
    await expect(page.locator('#task-sheet-xp')).toHaveText(`${NEW_TASK_XP} XP`)
    await expect(sheet(page).getByRole('radio', { name: 'Once a day' })).toHaveAttribute('aria-checked', 'true')
    await bigEnough(page, ['.ts-stat'])
    await settle(page)
    await noOverflow(page, 'dialog.task-sheet')
    await shot(page, `m6s3-add-sheet-${info.project.name}-${scheme}`)
    await page.locator('#task-sheet-cancel').tap()
  }
  // Nothing was saved by just looking.
  expect((await stored(page))?.settings?.tasks).toBeUndefined()
  expect(msgs).toEqual([])
})

test('the wake-up task has no times-a-day choice and keeps its rules', async ({ page }) => {
  await open(page, FRI('06:00'), null, '#/settings')
  await row(page, 'wake').tap()
  await expect(sheet(page).getByRole('radiogroup')).toHaveCount(0)
  await page.locator('#task-sheet-xp-more').tap()
  await done(page).tap()
  const wake = (await stored(page)).settings.tasks.find((t: { id: string }) => t.id === 'wake')
  expect(wake).toMatchObject({ xp: XP('wake') + TASK_XP_STEP, rules: { kind: 'wakeUp' }, stat: 'discipline' })
  await tab(page, 'home').tap()
  await expect(homeTask(page, 'wake')).toContainText(`+${XP('wake') + TASK_XP_STEP} XP`)
})

test('rename a task and change its XP: Home shows it, the next log uses it, the past keeps its XP', async ({ page }) => {
  const msgs = collectConsole(page)
  await open(page, FRI('10:00'))
  // A walk before the edit.
  await homeTask(page, 'walk').tap()
  await expect(homeTask(page, 'walk')).toContainText('Done')
  await expect(page.locator('#xp-total')).toHaveText(String(XP('walk')))

  await tab(page, 'settings').tap()
  await row(page, 'gym').tap()
  await sheetName(page).fill('  Lifting  ')
  await page.locator('#task-sheet-xp-more').tap()
  await page.locator('#task-sheet-xp-more').tap()
  await expect(page.locator('#task-sheet-xp')).toHaveText(`${XP('gym') + 2 * TASK_XP_STEP} XP`)
  await done(page).tap()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.locator('.ss-tasks .ss-saved')).toHaveText(SETTINGS.saved)
  await expect(row(page, 'gym')).toContainText('Lifting')
  // Focus goes back to the row that was edited.
  await expect(row(page, 'gym')).toBeFocused()

  // The walk's XP down to the minimum step, and Cancel throws a change away.
  await row(page, 'walk').tap()
  await page.locator('#task-sheet-xp-less').tap()
  await page.locator('#task-sheet-cancel').tap()
  await expect(row(page, 'walk')).toContainText(`${XP('walk')} XP`)

  await tab(page, 'home').tap()
  await expect(homeTask(page, 'gym')).toContainText('Lifting')
  const newXp = XP('gym') + 2 * TASK_XP_STEP
  await expect(homeTask(page, 'gym')).toContainText(`+${newXp} XP`)
  await homeTask(page, 'gym').tap()
  await expect(page.locator('.toast-name')).toHaveText('Lifting')
  await expect(page.locator('#xp-total')).toHaveText(String(XP('walk') + newXp))
  const data = await stored(page)
  expect(data.events.map((e: { taskId: string; xpAwarded: number }) => [e.taskId, e.xpAwarded])).toEqual([
    ['walk', XP('walk')],
    ['gym', newXp],
  ])
  // The first edit stores the whole list; the stat never changes.
  expect(data.settings.tasks.map((t: { id: string }) => t.id)).toEqual(TASKS.map((t) => t.id))
  expect(data.settings.tasks.find((t: { id: string }) => t.id === 'gym')).toMatchObject({ name: 'Lifting', stat: 'strength' })

  // It all lasts.
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await expect(homeTask(page, 'gym')).toContainText('Lifting')
  await expect(page.locator('#xp-total')).toHaveText(String(XP('walk') + newXp))
  await tab(page, 'history').tap()
  await expect(page.locator('.hs-day')).toContainText('Lifting')
  expect(msgs).toEqual([])
})

test('a blank name turns Done off, and Done changes nothing when nothing changed', async ({ page }) => {
  await open(page, FRI('10:00'), null, '#/settings')
  await row(page, 'read').tap()
  await sheetName(page).fill('   ')
  await expect(done(page)).toBeDisabled()
  await sheetName(page).fill('Read a chapter')
  await expect(done(page)).toBeEnabled()
  await sheetName(page).fill(NAME('read'))
  await done(page).tap()
  await expect(sheet(page)).toHaveCount(0)
  expect((await stored(page))?.settings?.tasks).toBeUndefined()
  // A long name is kept to the limit as it's typed.
  await row(page, 'read').tap()
  await sheetName(page).fill('x'.repeat(TASK_NAME_MAX + 10))
  await expect(sheetName(page)).toHaveValue('x'.repeat(TASK_NAME_MAX))
  // The backdrop cancels.
  await page.mouse.click(10, 10)
  await expect(sheet(page)).toHaveCount(0)
  await expect(row(page, 'read')).toContainText(NAME('read'))
})

test('archive a task: gone from Home and the weekly counts, history kept; unarchive brings it back', async ({ page }) => {
  const msgs = collectConsole(page)
  await open(page, FRI('10:00'))
  await homeTask(page, 'read').tap()
  await expect(homeTask(page, 'read')).toContainText('Done')

  await tab(page, 'settings').tap()
  await row(page, 'read').tap()
  await page.locator('#task-sheet-archive').tap()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.locator('.ss-toast')).toContainText(`${NAME('read')} is archived`)
  await expect(row(page, 'read')).toHaveCount(0)
  await expect(page.locator('.ss-archived-summary')).toHaveText(TASKS_COPY.archivedTitle(1))
  // Folded away until opened.
  const unarchive = page.getByRole('button', { name: `Unarchive ${NAME('read')}` })
  await expect(unarchive).toBeHidden()

  await tab(page, 'home').tap()
  await expect(homeTask(page, 'read')).toHaveCount(0)
  await expect(page.locator('#xp-total')).toHaveText(String(XP('read')))
  await tab(page, 'history').tap()
  await expect(page.locator('.hs-week')).not.toContainText(NAME('read'))
  // Today's log still shows in the day view.
  await expect(page.locator('.hs-day')).toContainText(NAME('read'))
  await tab(page, 'dragon').tap()
  await expect(page.locator('.stat[data-stat="wisdom"] .stat-value')).toHaveText(String(XP('read')))

  // A reload keeps it archived.
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await tab(page, 'settings').tap()
  await page.locator('.ss-archived-summary').tap()
  await bigEnough(page, ['.ss-archived-summary', '.ss-small-button'])
  await unarchive.tap()
  await expect(page.locator('.ss-toast')).toContainText(`${NAME('read')} is back on Home`)
  await expect(page.locator('.ss-archived')).toBeHidden()
  await expect(row(page, 'read')).toBeVisible()
  await tab(page, 'home').tap()
  // Back with its history: already done today.
  await expect(homeTask(page, 'read')).toContainText('Done')
  await tab(page, 'history').tap()
  await expect(page.locator('.hs-week')).toContainText(NAME('read'))
  expect(msgs).toEqual([])
})

test("archiving the wake-up task puts its streak away in History until it's back", async ({ page }) => {
  await open(page, FRI('06:10'))
  await homeTask(page, 'wake').tap()
  await tab(page, 'history').tap()
  await expect(page.locator('.hs-wake')).toBeVisible()
  await tab(page, 'settings').tap()
  await row(page, 'wake').tap()
  await page.locator('#task-sheet-archive').tap()
  await tab(page, 'history').tap()
  await expect(page.locator('.hs-wake')).toBeHidden()
  await tab(page, 'settings').tap()
  await page.locator('.ss-archived-summary').tap()
  await page.getByRole('button', { name: `Unarchive ${NAME('wake')}` }).tap()
  await tab(page, 'history').tap()
  await expect(page.locator('.hs-wake')).toBeVisible()
  await expect(page.locator('.hs-wake')).toContainText('1 day')
})

test('add a task, log it in one tap, and it lasts', async ({ page }) => {
  const msgs = collectConsole(page)
  await open(page, FRI('10:00'), null, '#/settings')
  await page.locator('#ss-add-task').tap()
  await expect(done(page)).toBeDisabled()
  await sheetName(page).fill('Call Mum')
  // Still off until a stat is chosen.
  await expect(done(page)).toBeDisabled()
  await sheet(page).getByRole('radio', { name: 'Heart' }).tap()
  await expect(sheet(page).getByRole('radio', { name: 'Heart' })).toHaveAttribute('aria-checked', 'true')
  await sheet(page).getByRole('radio', { name: 'Twice a day' }).tap()
  await page.locator('#task-sheet-xp-more').tap()
  await done(page).tap()
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.locator('.ss-toast')).toContainText('Call Mum is on Home now')

  const task = (await stored(page)).settings.tasks.at(-1)
  expect(task).toMatchObject({
    name: 'Call Mum',
    stat: 'heart',
    xp: NEW_TASK_XP + TASK_XP_STEP,
    rules: { kind: 'maxPerDay', max: 2 },
    archived: false,
  })
  expect(task.id.startsWith(NEW_TASK_ID_PREFIX)).toBe(true)
  await expect(row(page, task.id)).toContainText('Heart')

  await tab(page, 'home').tap()
  const button = homeTask(page, task.id)
  await expect(button).toContainText('Call Mum')
  await button.tap()
  await expect(button).toContainText('1/2')
  await expect(page.locator('#xp-total')).toHaveText(String(NEW_TASK_XP + TASK_XP_STEP))
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await expect(homeTask(page, task.id)).toContainText('1/2')
  await tab(page, 'dragon').tap()
  await expect(page.locator('.stat[data-stat="heart"] .stat-value')).toHaveText(String(NEW_TASK_XP + TASK_XP_STEP))
  await tab(page, 'history').tap()
  await expect(page.locator('.hs-week')).toContainText('Call Mum')
  expect(msgs).toEqual([])
})

/** A full list: the built-in tasks plus long-named ones, up to the cap. */
function fullList() {
  const extra = Array.from({ length: MAX_ACTIVE_TASKS - TASKS.length }, (_, i) => ({
    id: `${NEW_TASK_ID_PREFIX}${i}`,
    name: `${i} ${'Wonderfully long task name, really long'}`.slice(0, TASK_NAME_MAX),
    stat: 'heart',
    xp: 15,
    rules: { kind: 'maxPerDay', max: 3 },
    archived: false,
  }))
  const unbroken = { ...extra[0]!, name: 'W'.repeat(TASK_NAME_MAX) }
  return [...TASKS, unbroken, ...extra.slice(1), { ...extra[0]!, id: `${NEW_TASK_ID_PREFIX}old`, archived: true }]
}

test('at the cap, Add and Unarchive are off with a gentle note', async ({ page }) => {
  await open(page, FRI('10:00'), { schemaVersion: 1, events: [], settings: { tasks: fullList() } }, '#/settings')
  await expect(page.locator('.ss-task-row')).toHaveCount(MAX_ACTIVE_TASKS)
  await expect(page.locator('#ss-add-task')).toBeDisabled()
  await expect(page.locator('#ss-tasks-full')).toHaveText(TASKS_COPY.full(MAX_ACTIVE_TASKS))
  await page.locator('.ss-archived-summary').tap()
  await expect(page.locator('.ss-small-button')).toBeDisabled()
  // Archiving one makes room.
  await row(page, 'walk').tap()
  await page.locator('#task-sheet-archive').tap()
  await expect(page.locator('#ss-add-task')).toBeEnabled()
  await expect(page.locator('#ss-tasks-full')).toBeHidden()
  await expect(page.locator('.ss-small-button').first()).toBeEnabled()
})

// Runs in both projects: pixel10pro (410 wide) and narrow360.
test('Home copes with a full list of long names, and logging stays one tap', async ({ page }, info) => {
  const msgs = collectConsole(page)
  await open(page, FRI('10:00'), { schemaVersion: 1, events: [], settings: { tasks: fullList() } })
  const width = page.viewportSize()!.width
  // Wake-up is hidden mid-morning; every other active task shows.
  await expect(page.locator('#task-list button.task')).toHaveCount(MAX_ACTIVE_TASKS - 1)
  await noOverflow(page, '#home')
  for (const b of await page.locator('#task-list button.task').all()) {
    const box = (await b.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    expect(box.x + box.width).toBeLessThanOrEqual(width)
  }
  // The unbroken 40-character name wraps inside its button, and the XP still shows.
  const long = homeTask(page, `${NEW_TASK_ID_PREFIX}0`)
  await long.scrollIntoViewIfNeeded()
  await expect(long.locator('.task-xp')).toBeInViewport({ ratio: 1 })
  await shot(page, `m6s3-home-full-${info.project.name}`, { settled: true })
  const last = homeTask(page, `${NEW_TASK_ID_PREFIX}${MAX_ACTIVE_TASKS - TASKS.length - 1}`)
  await last.scrollIntoViewIfNeeded()
  await expect(last).toBeInViewport({ ratio: 1 })
  await shot(page, `m6s3-home-full-end-${info.project.name}`, { settled: true })
  await last.tap()
  await expect(last).toContainText('1/3')
  await expect(page.locator('#xp-total')).toHaveText('15')
  expect(msgs).toEqual([])
})

test("read-only: tasks can't be changed, and the card says why", async ({ page }) => {
  const raw = JSON.stringify({ schemaVersion: 2, events: [], settings: { tasks: fullList().map((t) => ({ ...t, archived: t.id === 'gym' })) } })
  await open(page, FRI('10:00'), raw, '#/settings')
  await expect(page.locator('.ss-task-row').first()).toBeDisabled()
  await expect(page.locator('#ss-add-task')).toBeDisabled()
  await expect(page.locator('.ss-tasks .ss-note').last()).toHaveText(SETTINGS.editsPaused)
  await page.locator('.ss-archived-summary').tap()
  await expect(page.locator('.ss-small-button').first()).toBeDisabled()
  await page.locator('.ss-task-row').first().tap({ force: true })
  await expect(sheet(page)).toHaveCount(0)
})

test('a text selection dragged onto the backdrop keeps the sheet; a real backdrop tap cancels', async ({ page }) => {
  await open(page, FRI('10:00'), null, '#/settings')
  await row(page, 'read').tap()
  await sheetName(page).fill('Read a chapter')
  const box = (await sheetName(page).boundingBox())!
  await page.mouse.move(box.x + box.width - 10, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(10, 10, { steps: 4 })
  await page.mouse.up()
  await expect(sheet(page)).toBeVisible()
  await expect(sheetName(page)).toHaveValue('Read a chapter')
  await page.mouse.click(10, 10)
  await expect(sheet(page)).toHaveCount(0)
  await expect(row(page, 'read')).toContainText(NAME('read'))
})

test('arrow keys move through the stat and times-a-day choices, with one Tab stop each', async ({ page }, info) => {
  await open(page, FRI('10:00'), null, '#/settings')
  await page.locator('#ss-add-task').tap()
  const stats = sheet(page).locator('.ts-stat')
  const times = sheet(page).locator('.ts-segment')
  // Nothing chosen yet: the first stat is the Tab stop.
  expect(await stats.evaluateAll((bs) => bs.map((b) => (b as HTMLElement).tabIndex))).toEqual([0, -1, -1, -1])
  expect(await times.evaluateAll((bs) => bs.map((b) => (b as HTMLElement).tabIndex))).toEqual([0, -1, -1])
  await stats.first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(sheet(page).getByRole('radio', { name: 'Discipline' })).toBeFocused()
  await expect(sheet(page).getByRole('radio', { name: 'Discipline' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft') // wraps to the last
  await expect(sheet(page).getByRole('radio', { name: 'Heart' })).toBeFocused()
  await expect(sheet(page).getByRole('radio', { name: 'Heart' })).toHaveAttribute('aria-checked', 'true')
  expect(await stats.evaluateAll((bs) => bs.map((b) => (b as HTMLElement).tabIndex))).toEqual([-1, -1, -1, 0])
  await settle(page)
  await shot(page, `m6s3r2-stat-chosen-${info.project.name}`, { of: '.ts-stats' })
  // Chosen icon keeps a visible circle on its tinted card.
  const [card, circle] = await sheet(page).getByRole('radio', { name: 'Heart' }).evaluate((b) => [
    getComputedStyle(b).backgroundColor,
    getComputedStyle(b.querySelector('.ts-stat-icon')!).backgroundColor,
  ])
  expect(circle).not.toBe(card)

  await times.first().focus()
  await page.keyboard.press('ArrowDown')
  await expect(sheet(page).getByRole('radio', { name: 'Twice a day' })).toBeFocused()
  await expect(sheet(page).getByRole('radio', { name: 'Twice a day' })).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('End')
  await expect(sheet(page).getByRole('radio', { name: '3 times a day' })).toHaveAttribute('aria-checked', 'true')
})

test('leaving Settings closes an open sheet without saving, and focus lands on the new tab', async ({ page }) => {
  await open(page, FRI('10:00'), null, '#/settings')
  await row(page, 'gym').tap()
  await sheetName(page).fill('Lifting')
  await page.evaluate(() => {
    location.hash = '#/history'
  })
  await expect(page).toHaveURL(/#\/history$/)
  await expect(sheet(page)).toHaveCount(0)
  await expect(tab(page, 'history')).toBeFocused()
  expect((await stored(page))?.settings?.tasks).toBeUndefined()
  // The back button, too.
  await tab(page, 'home').tap()
  await tab(page, 'settings').tap()
  await row(page, 'gym').tap()
  await expect(sheet(page)).toBeVisible()
  await page.evaluate(() => history.back())
  await expect(sheet(page)).toHaveCount(0)
  await expect(page.locator('#settings-screen')).toBeHidden()
  await expect(tab(page, 'home')).toBeFocused()
})

test("if saving stops while a sheet is open, Done keeps the sheet and says why", async ({ page }) => {
  await open(page, FRI('10:00'), null, '#/settings')
  await row(page, 'gym').tap()
  await sheetName(page).fill('Lifting')
  // Another tab (a newer version) saves: this one goes read-only.
  await page.evaluate(() => {
    localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 2, events: [], settings: {} }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'drag-on:v1' }))
  })
  await done(page).tap()
  await expect(sheet(page)).toBeVisible()
  await expect(sheetName(page)).toHaveValue('Lifting')
  await expect(page.locator('#task-sheet-problem')).toHaveText(SETTINGS.editsPaused)
  await expect(done(page)).toBeDisabled()
  await expect(page.locator('#task-sheet-archive')).toBeDisabled()
  await expect(page.locator('#task-sheet-cancel')).toBeFocused()
  await page.locator('#task-sheet-cancel').tap()
  await expect(sheet(page)).toHaveCount(0)
  // Focus never lands on nothing: the row is off now, so it goes to the card's title.
  await expect(page.locator('#ss-tasks-title')).toBeFocused()
})

test('more times a day brings the XP down to fit, with a warm hint, and + stops there', async ({ page }) => {
  await open(page, FRI('10:00'), null, '#/settings')
  await row(page, 'walk').tap()
  for (let i = 0; i < 20 && (await page.locator('#task-sheet-xp-more').isEnabled()); i++) await page.locator('#task-sheet-xp-more').tap()
  await expect(page.locator('#task-sheet-xp')).toHaveText(`${TASK_XP_MAX} XP`)
  await expect(page.locator('#task-sheet-xp-hint')).toBeHidden()
  await sheet(page).getByRole('radio', { name: '3 times a day' }).tap()
  await expect(page.locator('#task-sheet-xp')).toHaveText(`${maxXpFor(3, TASK_LIMITS)} XP`)
  await expect(page.locator('#task-sheet-xp-hint')).toHaveText(dailyXpHint(maxXpFor(3, TASK_LIMITS), 3))
  await expect(page.locator('#task-sheet-xp-more')).toBeDisabled()
  await sheet(page).getByRole('radio', { name: 'Twice a day' }).tap()
  // Fewer times a day never raises the XP by itself, but + works again.
  await expect(page.locator('#task-sheet-xp')).toHaveText(`${maxXpFor(3, TASK_LIMITS)} XP`)
  await expect(page.locator('#task-sheet-xp-hint')).toBeHidden()
  await page.locator('#task-sheet-xp-more').tap()
  await page.locator('#task-sheet-xp-more').tap()
  await expect(page.locator('#task-sheet-xp')).toHaveText(`${maxXpFor(2, TASK_LIMITS)} XP`)
  await expect(page.locator('#task-sheet-xp-hint')).toHaveText(dailyXpHint(maxXpFor(2, TASK_LIMITS), 2))
  await done(page).tap()
  const walk = (await stored(page)).settings.tasks.find((t: { id: string }) => t.id === 'walk')
  expect(walk).toMatchObject({ xp: maxXpFor(2, TASK_LIMITS), rules: { kind: 'maxPerDay', max: 2 } })
  expect(walk.xp * 2).toBeLessThanOrEqual(TASK_DAILY_XP_MAX)
})
