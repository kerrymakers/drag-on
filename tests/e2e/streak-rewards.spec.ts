// Streak milestone finds, the freeze-earned toast note, the "kept our streak cosy"
// line and History's "Next surprise" line, on the phone (from M5 slice 2).
// Screenshots (with SCREENSHOTS=1): tests/screenshots/m5s2-*
import { test, expect, settle, shot, type Page, type Browser, type TestInfo } from './fixtures'
import { TASKS } from '../../src/config/tasks'
import { FREEZE_EARNED, FREEZE_USED, WELCOME_BACK } from '../../src/ui/copy'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
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

/** One gym log at 19:00 on each day from a to b, and a wake-up on the last one. */
function seed(a: string, b: string) {
  const events = range(a, b).map((d, i) => ({ id: `e${i}`, type: 'log', taskId: 'gym', timestamp: at(d, '19:00'), xpAwarded: XP('gym') }))
  events.push({ id: 'wake', type: 'log', taskId: 'wake', timestamp: at(b, '06:20'), xpAwarded: XP('wake') })
  // Backed up this morning, so the backup reminder stays out of these speech-bubble checks.
  return { schemaVersion: 1, events, settings: { lastBackupAt: NOW.getTime() } }
}

async function fresh(browser: Browser, info: TestInfo, data: object, opts: { scheme?: 'light' | 'dark' } = {}) {
  const context = await browser.newContext({
    ...info.project.use,
    colorScheme: opts.scheme ?? 'light',
    reducedMotion: 'reduce',
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  })
  const page = await context.newPage()
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  // No luck on any roll: only a milestone or bad-luck protection can bring an item.
  await page.addInitScript(() => (Math.random = () => 0.9999))
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear()
      localStorage.setItem('drag-on:v1', JSON.stringify(d))
      sessionStorage.setItem('seeded', '1')
    }
  }, data)
  await page.clock.install({ time: NOW })
  await page.goto(new URL('./', info.project.use.baseURL!).toString())
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  return { page, context, msgs }
}

const card = (page: Page) => page.locator('.overlay.item-found')
/** The card ignores taps for a moment after opening (see CLOSE_GUARD_MS in overlay.ts). */
async function closeCard(page: Page) {
  await page.waitForTimeout(650)
  await card(page).locator('.overlay-button').click()
  await expect(card(page)).toHaveCount(0)
}
const task = (page: Page, id: string) => page.locator(`button.task[data-task-id="${id}"]`)
const speechShowing = (page: Page) => page.evaluate(() => document.querySelector('#speech')!.classList.contains('is-showing'))
const tag = (info: TestInfo) => info.project.name

/** The toast sits inside the viewport, its note on a line of its own under the XP. */
/** How many lines of text the toast has (lead/name rows plus the note). */
async function toastLines(page: Page) {
  return page.evaluate(() => {
    const tops = new Set([...document.querySelectorAll('#toast-text > span')].map((e) => Math.round((e as HTMLElement).offsetTop)))
    return tops.size
  })
}

async function toastFits(page: Page) {
  return page.evaluate(() => {
    const t = document.getElementById('toast')!.getBoundingClientRect()
    const lead = document.querySelector('.toast-lead')!.getBoundingClientRect()
    const note = document.querySelector('.toast-note')?.getBoundingClientRect()
    return { inside: t.left >= 0 && t.right <= innerWidth, noteBelow: note ? note.top >= lead.bottom - 1 : null }
  })
}

test('the 7th day in a row brings a milestone find, a freeze note, and comes back after undo', async ({ browser }, info) => {
  const { page, context, msgs } = await fresh(browser, info, seed('2026-10-01', '2026-10-06'))
  await expect(page.locator('#streak-chip')).toHaveText('6 days')

  await task(page, 'read').click() // one tap
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toHaveAttribute('data-milestone', '7')
  await expect(card(page).locator('.item-found-heading')).toHaveText('7 days together!')
  await expect(card(page).locator('.item-found-line')).toHaveText('I found you something to celebrate.')
  await expect(card(page).locator('.item-found-name')).not.toBeEmpty()
  await shot(page, `m5s2-milestone-${tag(info)}-card`, { settled: true })
  await closeCard(page)

  // The toast comes back after the card, with the freeze note (7 days earns one).
  await expect(page.locator('#toast')).toHaveClass(/is-showing/)
  // The card already celebrated the find, so the toast is just the log and the note: two lines at most.
  await expect(page.locator('#toast-text')).not.toContainText('Found something!')
  await expect(page.locator('.toast-lead')).toHaveText(`+${XP('read')} XP · `)
  await expect(page.locator('.toast-name')).toHaveText(TASKS.find((t) => t.id === 'read')!.name)
  await expect(page.locator('#toast-undo')).toBeVisible()
  await expect(page.locator('.toast-note')).toHaveText(` ${FREEZE_EARNED}`)
  await settle(page)
  expect(await toastFits(page)).toEqual({ inside: true, noteBelow: true })
  expect(await toastLines(page)).toBeLessThanOrEqual(2)
  await shot(page, `m5s2-milestone-${tag(info)}-toast`)
  await expect(page.locator('#streak-chip')).toHaveText('7 days')

  // Undo it from the toast: the find goes back. Relogging earns the milestone again.
  await page.locator('#toast-undo').click()
  await expect(page.locator('#streak-chip')).toHaveText('6 days')
  await task(page, 'read').click()
  await expect(card(page)).toHaveAttribute('data-milestone', '7')
  await closeCard(page)

  // A second log the same day is just a log.
  await task(page, 'walk').click()
  await expect(page.locator('#toast-text')).toContainText(`+${XP('walk')} XP`)
  await expect(page.locator('.toast-note')).toHaveCount(0)
  await expect(card(page)).toHaveCount(0)

  // History: the next surprise is at 30 days, and wake-up has no weekly line.
  await page.locator('#tabbar a[href="#/history"]').click()
  await expect(page.locator('.hs-next')).toHaveText('Next surprise at 30 days')
  await expect(page.locator('.hs-week')).not.toContainText(TASKS.find((t) => t.id === 'wake')!.name)
  await expect(page.locator('.hs-week')).toContainText(TASKS.find((t) => t.id === 'gym')!.name)
  await expect(page.locator('.hs-wake')).toBeVisible()
  await shot(page, `m5s2-history-${tag(info)}-next`)
  expect(msgs).toEqual([])
  await context.close()
})

test('a freeze earned without a milestone gets the toast note; an ordinary log does not', async ({ browser }, info) => {
  // 13 days in a row: the 14th earns a second freeze, and 14 isn't a milestone.
  const { page, context } = await fresh(browser, info, seed('2026-09-24', '2026-10-06'))
  await task(page, 'gym').click()
  await expect(page.locator('#toast-text')).toContainText(`+${XP('gym')} XP`)
  await expect(page.locator('.toast-note')).toHaveText(` ${FREEZE_EARNED}`)
  await expect(card(page)).toHaveCount(0)
  await settle(page)
  expect(await toastFits(page)).toEqual({ inside: true, noteBelow: true })
  await shot(page, `m5s2-freeze-${tag(info)}-toast`)
  await task(page, 'read').click()
  await expect(page.locator('#toast-text')).toContainText(`+${XP('read')} XP`)
  await expect(page.locator('.toast-note')).toHaveCount(0)
  await context.close()
})

test('the dragon says a freeze kept the streak cosy, once', async ({ browser }, info) => {
  // 7 days to 5 Oct earn a freeze; 6 Oct was quiet and used it.
  const { page, context, msgs } = await fresh(browser, info, seed('2026-09-29', '2026-10-05'))
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  expect(FREEZE_USED).toContain(await page.locator('#speech').textContent())
  await expect(page.locator('#streak-chip')).toHaveText('7 days')
  await shot(page, `m5s2-cosy-${tag(info)}`)

  // Back from another tab, and after a reload: never again for that day.
  await page.locator('#tabbar a[href="#/history"]').click()
  await expect(page.locator('.hs-cell[data-day="2026-10-06"]')).toHaveAttribute('data-status', 'frozen')
  await page.locator('#tabbar a[href="#/"]').click()
  expect(await speechShowing(page)).toBe(false)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await settle(page)
  expect(await speechShowing(page)).toBe(false)
  expect(msgs).toEqual([])
  await context.close()
})

test('the cosy line comes before a welcome back, and the welcome is not said after it', async ({ browser }, info) => {
  // 14 days to 4 Oct (two freezes); 5 and 6 Oct were quiet. Three days since the last log: sleepy.
  const { page, context } = await fresh(browser, info, seed('2026-09-21', '2026-10-04'))
  await expect(page.locator('#mood-chip')).toHaveText('Sleepy')
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  expect(FREEZE_USED).toContain(await page.locator('#speech').textContent())
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await settle(page)
  expect(await speechShowing(page)).toBe(false)
  await context.close()
})

test('no cosy line once the streak has ended anyway; the welcome back plays as before', async ({ browser }, info) => {
  // 7 days to 4 Oct: 5 Oct was frozen, 6 Oct ended the run.
  const { page, context } = await fresh(browser, info, seed('2026-09-28', '2026-10-04'))
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  const said = await page.locator('#speech').textContent()
  expect(FREEZE_USED).not.toContain(said)
  expect(WELCOME_BACK.sleepy).toContain(said)
  await expect(page.locator('#streak-chip')).toBeHidden()
  await context.close()
})

test('History says the next surprise is at 60 days after 30', async ({ browser }, info) => {
  const { page, context } = await fresh(browser, info, seed('2026-08-25', '2026-10-06')) // 43 days
  await page.locator('#tabbar a[href="#/history"]').click()
  await expect(page.locator('.hs-next')).toHaveText('Next surprise at 60 days')
  await context.close()
})

test('History has no "Next surprise" after the last milestone', async ({ browser }, info) => {
  const { page, context } = await fresh(browser, info, seed('2026-06-25', '2026-10-06')) // 104 days
  await page.locator('#tabbar a[href="#/history"]').click()
  await expect(page.locator('.hs-streak-label')).toBeVisible()
  await expect(page.locator('.hs-next')).toBeHidden()
  await context.close()
})
