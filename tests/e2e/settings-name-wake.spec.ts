// Settings: the dragon's name and the wake-up times, on the phone (from M6 slice 2).
// Screenshots (with SCREENSHOTS=1): tests/screenshots/m6s2-*
import { test, expect, settle, shot, type Page } from './fixtures'
import { DRAGON_NAME_MAX } from '../../src/config/settings'
import { DEFAULT_WAKE_TIME } from '../../src/config/time'
import { TASKS } from '../../src/config/tasks'
import { SETTINGS } from '../../src/ui/copy'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
// Friday 9 October 2026 (BST). Weekdays have a 06:30 target by default.
const FRI = (hm: string) => new Date(`2026-10-09T${hm}:00+01:00`)
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const at = (key: string, hm: string) => new Date(`${key}T${hm}:00+01:00`).getTime()

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
const wakeTask = (page: Page) => page.locator('#task-list button.task[data-task-id="wake"]')
const nameInput = (page: Page) => page.getByRole('textbox', { name: SETTINGS.nameLabel })
const wakeSwitch = (page: Page, day: string) => page.getByRole('switch', { name: `${day} wake-up` })
const wakeTime = (page: Page, day: string) => page.getByLabel(`${day} wake-up time`)

test('cards in order, tap targets, labels and no overflow, in light and dark', async ({ page }, info) => {
  const msgs = collectConsole(page)
  await open(page, FRI('10:00'), null, '#/settings')
  const titles = await page.locator('#settings-screen h2').allTextContents()
  expect(titles).toEqual([SETTINGS.nameTitle, SETTINGS.wakeTitle, SETTINGS.backupTitle])

  // Seven days, Monday first, weekdays on at 06:30 and the weekend off.
  await expect(page.locator('.ss-day')).toHaveCount(7)
  for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']) {
    await expect(wakeSwitch(page, day)).toHaveAttribute('aria-checked', 'true')
    await expect(wakeTime(page, day)).toHaveValue('06:30')
  }
  for (const day of ['Saturday', 'Sunday']) {
    await expect(wakeSwitch(page, day)).toHaveAttribute('aria-checked', 'false')
    await expect(wakeTime(page, day)).toBeHidden()
  }
  await expect(nameInput(page)).toHaveValue('')
  await expect(nameInput(page)).toHaveAttribute('placeholder', SETTINGS.namePlaceholder)

  for (const sel of ['#ss-name', '.ss-switch >> nth=0', '.ss-switch >> nth=6', '#ss-wake-mon']) {
    const b = (await page.locator(sel).boundingBox())!
    expect(b.height, sel).toBeGreaterThanOrEqual(44)
    expect(b.width, sel).toBeGreaterThanOrEqual(44)
  }
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await settle(page)
    const widths = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      vw: innerWidth,
      wide: [...document.querySelectorAll('#settings-screen *')]
        .filter((e) => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > innerWidth + 0.5)
        .map((e) => e.className),
    }))
    expect(widths.doc).toBeLessThanOrEqual(widths.vw)
    expect(widths.wide).toEqual([])
    await shot(page, `m6s2-settings-${info.project.name}-${scheme}`)
  }
  expect(msgs).toEqual([])
})

test('renaming shows on Home and the Dragon screen, trimmed; blank goes back to "your dragon"', async ({ page }) => {
  const msgs = collectConsole(page)
  await open(page, FRI('10:00'))
  await expect(page.locator('#dragon-name')).toHaveText('your dragon')
  await tab(page, 'settings').tap()

  await nameInput(page).fill('  Ember  ')
  await nameInput(page).press('Enter')
  await expect(nameInput(page)).toHaveValue('Ember')
  await expect(nameInput(page)).not.toBeFocused()
  await expect(page.locator('.ss-name .ss-saved')).toHaveText(SETTINGS.saved)
  expect((await stored(page)).settings.dragonName).toBe('Ember')

  await tab(page, 'home').tap()
  await expect(page.locator('#dragon-name')).toHaveText('Ember')
  await tab(page, 'dragon').tap()
  await expect(page.locator('#dragon-screen')).toContainText('Ember')

  // A longer name is cut to the cap on saving, and the field shows what was kept.
  await tab(page, 'settings').tap()
  await nameInput(page).fill('A'.repeat(DRAGON_NAME_MAX + 5))
  await nameInput(page).blur()
  await expect(nameInput(page)).toHaveValue('A'.repeat(DRAGON_NAME_MAX))
  expect((await stored(page)).settings.dragonName).toBe('A'.repeat(DRAGON_NAME_MAX))

  // Blank (just spaces) saves as no name.
  await nameInput(page).fill('   ')
  await nameInput(page).blur()
  await expect(nameInput(page)).toHaveValue('')
  expect((await stored(page)).settings.dragonName).toBeNull()
  await tab(page, 'home').tap()
  await expect(page.locator('#dragon-name')).toHaveText('your dragon')

  // A name still being typed is saved when the app is hidden or swiped away.
  await tab(page, 'settings').tap()
  await nameInput(page).fill('Swiped')
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
  expect((await stored(page)).settings.dragonName).toBe('Swiped')
  await nameInput(page).fill('Hidden')
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    delete (document as { visibilityState?: unknown }).visibilityState
  })
  expect((await stored(page)).settings.dragonName).toBe('Hidden')

  // And it lasts.
  await nameInput(page).fill('Pip')
  await nameInput(page).press('Enter')
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await expect(nameInput(page)).toHaveValue('Pip')
  await tab(page, 'home').tap()
  await expect(page.locator('#dragon-name')).toHaveText('Pip')
  expect(msgs).toEqual([])
})

test("turning off today's target hides Got up on time on Home; on again brings it back", async ({ page }) => {
  const msgs = collectConsole(page)
  await open(page, FRI('06:00'))
  await expect(wakeTask(page)).toBeVisible()
  await expect(wakeTask(page)).toContainText('by 06:45')

  await tab(page, 'settings').tap()
  // Try a different time first, so switching back on brings it back rather than the default.
  await wakeTime(page, 'Friday').fill('06:40')
  await expect(page.locator('.ss-wake .ss-saved')).toHaveText(SETTINGS.saved)
  await wakeSwitch(page, 'Friday').tap()
  await expect(wakeSwitch(page, 'Friday')).toHaveAttribute('aria-checked', 'false')
  await expect(wakeTime(page, 'Friday')).toBeHidden()
  await expect(page.locator('.ss-day[data-day="fri"] .ss-day-off')).toHaveText(SETTINGS.wakeOff)
  const saved = (await stored(page)).settings
  expect(saved.wakeSchedule.fri).toBeNull()
  // The edit starts today; earlier days keep the old schedule.
  expect(saved.wakeScheduleHistory).toEqual([
    { from: '1970-01-01', schedule: { mon: '06:30', tue: '06:30', wed: '06:30', thu: '06:30', fri: '06:30', sat: null, sun: null } },
    { from: '2026-10-09', schedule: { mon: '06:30', tue: '06:30', wed: '06:30', thu: '06:30', fri: null, sat: null, sun: null } },
  ])

  await tab(page, 'home').tap()
  await expect(wakeTask(page)).toHaveCount(0)

  // On again: the time used earlier this session comes back.
  await tab(page, 'settings').tap()
  await wakeSwitch(page, 'Friday').tap()
  await expect(wakeTime(page, 'Friday')).toHaveValue('06:40')
  // A day that was off gets the default.
  await wakeSwitch(page, 'Saturday').tap()
  await expect(wakeTime(page, 'Saturday')).toHaveValue(DEFAULT_WAKE_TIME)
  await tab(page, 'home').tap()
  await expect(wakeTask(page)).toBeVisible()
  await expect(wakeTask(page)).toContainText('by 06:55')
  // Several edits today still leave one entry for today.
  expect((await stored(page)).settings.wakeScheduleHistory).toHaveLength(2)
  expect(msgs).toEqual([])
})

test('a later target today takes effect at once, and a changed time lasts after a reload', async ({ page }) => {
  const msgs = collectConsole(page)
  // 06:50: the 06:30 window (to 06:45) has closed.
  await open(page, FRI('06:50'), { schemaVersion: 1, events: [], settings: {} })
  await expect(wakeTask(page)).toHaveCount(0)
  await tab(page, 'settings').tap()
  await wakeTime(page, 'Friday').fill('07:00')
  await tab(page, 'home').tap()
  await expect(wakeTask(page)).toBeEnabled()
  await expect(wakeTask(page)).toContainText('by 07:15')
  await wakeTask(page).tap()
  await expect(wakeTask(page)).toContainText('Done')
  expect((await stored(page)).events.map((e: { taskId: string }) => e.taskId)).toEqual(['wake'])

  // Another day's time, and a reload.
  await tab(page, 'settings').tap()
  await wakeTime(page, 'Monday').fill('07:15')
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await expect(wakeTime(page, 'Monday')).toHaveValue('07:15')
  await expect(wakeTime(page, 'Friday')).toHaveValue('07:00')
  expect((await stored(page)).settings.wakeSchedule.mon).toBe('07:15')
  expect(msgs).toEqual([])
})

test('the backup reminder opens Settings with the Backup card in view', async ({ page }) => {
  const msgs = collectConsole(page)
  // First log 30 days ago, never backed up, logged yesterday: due.
  const events = ['2026-09-09', '2026-10-07', '2026-10-08'].map((d, i) => ({
    id: `e${i}`, type: 'log', taskId: 'gym', timestamp: at(d, '19:00'), xpAwarded: XP('gym'),
  }))
  await open(page, FRI('10:00'), { schemaVersion: 1, events })
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  await page.locator('#speech .speech-tap').tap()
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.locator('#ss-export')).toBeInViewport({ ratio: 1 })
  await expect(page.locator('#ss-import')).toBeInViewport({ ratio: 1 })
  expect(msgs).toEqual([])
})

test("read-only: the name and wake-up times can't be changed, and say why", async ({ page }) => {
  const raw = JSON.stringify({ schemaVersion: 2, events: [], settings: { dragonName: 'Later' } })
  await open(page, FRI('10:00'), raw, '#/settings')
  await expect(nameInput(page)).toBeDisabled()
  await expect(nameInput(page)).toHaveValue('Later')
  await expect(wakeSwitch(page, 'Monday')).toBeDisabled()
  await expect(wakeTime(page, 'Monday')).toBeDisabled()
  await expect(page.locator('.ss-name .ss-note')).toHaveText(SETTINGS.editsPaused)
  await expect(page.locator('.ss-wake .ss-note')).toHaveText(SETTINGS.editsPaused)
})
