// Settings, export, import and the backup reminder, on the phone (from M6 slice 1).
// Screenshots (with SCREENSHOTS=1): tests/screenshots/m6s1-*
import { readFile } from 'node:fs/promises'
import { test, expect, settle, shot, type Page } from './fixtures'
import { TASKS } from '../../src/config/tasks'
import { BACKUP_REMINDER, IMPORT_REFUSED, SETTINGS, WELCOME_BACK } from '../../src/ui/copy'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
// Friday 9 October 2026, 10:00 BST.
const NOW = new Date('2026-10-09T10:00:00+01:00')
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const at = (key: string, hm: string) => new Date(`${key}T${hm}:00+01:00`).getTime()

/** A gym log at 19:00 on each given day. */
function logs(days: string[], prefix = 'e') {
  return days.map((d, i) => ({ id: `${prefix}${i}`, type: 'log', taskId: 'gym', timestamp: at(d, '19:00'), xpAwarded: XP('gym') }))
}
/** Logged yesterday and the day before: happy, nothing to welcome. */
const RECENT = ['2026-10-07', '2026-10-08']

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

/** Seeds the saved data (a string is stored as-is) once, then opens the app at `hash`. */
async function open(page: Page, data: object | string | null, hash = '') {
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
  await page.clock.install({ time: NOW })
  await page.goto(`./${hash}`)
  await expect(page.locator('#tabbar a').first()).toBeVisible()
}

const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1') ?? 'null'))
const speechShowing = (page: Page) => page.evaluate(() => document.querySelector('#speech')!.classList.contains('is-showing'))
/** The page's clock runs on from NOW, so a time read during a test is just after it. */
const soonAfterNow = (t: unknown) => typeof t === 'number' && t >= NOW.getTime() && t < NOW.getTime() + 60_000
const settingsTab = (page: Page) => page.locator('.tabbar a.tab[data-route="settings"]')

test('Settings tab: fifth tab, gear icon, route, layout and tap targets in light and dark', async ({ page }, info) => {
  const msgs = collectConsole(page)
  await open(page, { schemaVersion: 1, events: logs(RECENT), settings: { lastBackupAt: at('2026-10-05', '12:00') } })
  await expect(page.locator('.tabbar a.tab')).toHaveCount(5)
  await expect(settingsTab(page)).toHaveText('Settings')
  await expect(settingsTab(page).locator('svg.icon')).toHaveCount(1)
  // Backed up 4 days ago: no dot.
  await expect(settingsTab(page).locator('.tab-dot')).toBeHidden()

  await settingsTab(page).tap()
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(settingsTab(page)).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('#settings-screen')).toBeVisible()
  await expect(page.locator('#home')).toBeHidden()
  await expect(page.getByRole('heading', { name: SETTINGS.title })).toBeVisible()
  await expect(page.getByRole('heading', { name: SETTINGS.backupTitle })).toBeVisible()
  await expect(page.locator('.ss-last')).toHaveText('Last backup: 5 Oct')

  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await settle(page)
    await shot(page, `m6s1-settings-${info.project.name}-${scheme}`)
  }

  for (const sel of ['#ss-export', '#ss-import', ...[0, 1, 2, 3, 4].map((i) => `.tabbar a.tab >> nth=${i}`)]) {
    const b = (await page.locator(sel).boundingBox())!
    expect(b.height, sel).toBeGreaterThanOrEqual(44)
    expect(b.width, sel).toBeGreaterThanOrEqual(44)
  }
  const widths = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    vw: innerWidth,
    wide: [...document.querySelectorAll('#settings-screen *')].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length,
  }))
  expect(widths.doc).toBeLessThanOrEqual(widths.vw)
  expect(widths.wide).toBe(0)

  // Back returns to Home.
  await page.goBack()
  await expect(page.locator('#home')).toBeVisible()
  expect(msgs).toEqual([])
})

test('export downloads a dated backup with the save data and exportedAt, and records the backup', async ({ page }) => {
  const msgs = collectConsole(page)
  const events = logs(['2026-09-01', ...RECENT])
  await open(page, { schemaVersion: 1, events, settings: { dragonName: 'Ember' } }, '#/settings')
  await expect(page.locator('.ss-last')).toHaveText(SETTINGS.neverBackedUp)
  // Never backed up, first log over 14 days ago: the dot shows, with a label.
  await expect(settingsTab(page).locator('.tab-dot')).toBeVisible()
  await expect(settingsTab(page)).toHaveAccessibleName(`Settings, ${SETTINGS.tabDotLabel}`)

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#ss-export').tap()])
  expect(download.suggestedFilename()).toBe('drag-on-backup-2026-10-09.json')
  const file = JSON.parse(await readFile((await download.path())!, 'utf8'))
  expect(file.schemaVersion).toBe(1)
  expect(file.events).toEqual(events)
  expect(file.settings.dragonName).toBe('Ember')
  expect(soonAfterNow(file.exportedAt), `exportedAt ${file.exportedAt}`).toBe(true)

  await expect(page.locator('.ss-toast')).toHaveClass(/is-showing/)
  await expect(page.locator('.ss-toast .toast-text')).toHaveText(SETTINGS.exported)
  await expect(page.locator('.ss-last')).toHaveText('Last backup: today')
  await expect(settingsTab(page).locator('.tab-dot')).toBeHidden()
  await expect(settingsTab(page)).toHaveAccessibleName('Settings')
  expect((await stored(page)).settings.lastBackupAt).toBe(file.exportedAt)
  expect(msgs).toEqual([])
})

test('import: pick a file, see what is in it, confirm, and the data is replaced with a safety copy kept', async ({ page }, info) => {
  const msgs = collectConsole(page)
  const before = { schemaVersion: 1, events: logs(RECENT, 'old'), settings: { dragonName: 'Here' } }
  await open(page, before, '#/settings')
  const rawBefore = await page.evaluate(() => localStorage.getItem('drag-on:v1'))

  // 4 gym logs (one undone) = 120 XP: a Hatchling. Exported on 1 Oct.
  const fileEvents = [
    ...logs(['2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23'], 'f'),
    { id: 'u', type: 'undo', targetEventId: 'f3', timestamp: at('2026-09-23', '19:01') },
  ]
  const exportedAt = at('2026-10-01', '20:00')
  const backup = { schemaVersion: 1, events: fileEvents, settings: { dragonName: 'From file', lastBackupAt: 5 }, exportedAt }

  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#ss-import').tap()])
  await chooser.setFiles({ name: 'drag-on-backup-2026-10-01.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) })

  const sheet = page.locator('dialog.sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.locator('.sheet-fact').nth(0)).toHaveText(/Logs\s*3/)
  await expect(sheet.locator('.sheet-fact').nth(1)).toHaveText(/Stage\s*Hatchling/)
  await expect(sheet.locator('.sheet-fact').nth(2)).toHaveText(/Saved\s*1 Oct/)
  await expect(sheet).toContainText('replaces everything on this phone')
  await expect(page.locator('#sheet-cancel')).toBeFocused()
  for (const sel of ['#sheet-confirm', '#sheet-cancel']) {
    const b = (await page.locator(sel).boundingBox())!
    expect(b.height).toBeGreaterThanOrEqual(44)
    expect(b.x + b.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  }
  await settle(page)
  await shot(page, `m6s1-import-sheet-${info.project.name}`)

  await page.locator('#sheet-confirm').tap()
  await expect(sheet).toHaveCount(0)
  await expect(page.locator('.ss-toast .toast-text')).toHaveText(SETTINGS.imported)
  await expect(page.locator('.ss-last')).toHaveText('Last backup: 1 Oct')

  const now = await stored(page)
  expect(now.events).toEqual(fileEvents)
  expect(now.settings.dragonName).toBe('From file')
  expect(now.settings.lastBackupAt).toBe(exportedAt)
  const copies = await page.evaluate(() =>
    Object.keys(localStorage)
      .filter((k) => k.startsWith('drag-on:before-import-'))
      .map((k) => [k, localStorage.getItem(k)]),
  )
  expect(copies).toHaveLength(1)
  expect(soonAfterNow(Number(copies[0]![0]!.slice('drag-on:before-import-'.length)))).toBe(true)
  expect(copies[0]![1]).toBe(rawBefore)

  // Home shows the imported dragon.
  await page.locator('.tabbar a.tab[data-route="home"]').tap()
  await expect(page.locator('#dragon-name')).toHaveText('From file')
  await expect(page.locator('#xp-total')).toHaveText(String(3 * XP('gym')))
  await expect(page.locator('#stage-name')).toHaveText('Hatchling')
  expect(msgs).toEqual([])
})

test('import: cancelling changes nothing; junk, other JSON and newer backups are refused gently', async ({ page }) => {
  const msgs = collectConsole(page)
  await open(page, { schemaVersion: 1, events: logs(RECENT) }, '#/settings')
  const rawBefore = await page.evaluate(() => localStorage.getItem('drag-on:v1'))
  const pick = async (text: string) => {
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#ss-import').tap()])
    await chooser.setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(text) })
  }

  await pick(JSON.stringify({ schemaVersion: 1, events: logs(['2026-09-01']), exportedAt: NOW.getTime() }))
  await expect(page.locator('dialog.sheet')).toBeVisible()
  await page.locator('#sheet-cancel').tap()
  await expect(page.locator('dialog.sheet')).toHaveCount(0)
  await expect(page.locator('#ss-import')).toBeFocused()

  // Escape cancels too.
  await pick(JSON.stringify({ schemaVersion: 1, events: [] }))
  await expect(page.locator('dialog.sheet')).toBeVisible()
  await expect(page.locator('.sheet-fact').nth(2)).toHaveText(/Saved\s*Not recorded/)
  await page.keyboard.press('Escape')
  await expect(page.locator('dialog.sheet')).toHaveCount(0)

  await pick('this is not json')
  await expect(page.locator('.ss-status')).toHaveText(IMPORT_REFUSED.unreadable)
  await pick('{"hello":"world"}')
  await expect(page.locator('.ss-status')).toHaveText(IMPORT_REFUSED.notBackup)
  await pick(JSON.stringify({ schemaVersion: 2, events: [] }))
  await expect(page.locator('.ss-status')).toHaveText(IMPORT_REFUSED.newerVersion)
  await expect(page.locator('dialog.sheet')).toHaveCount(0)

  expect(await page.evaluate(() => localStorage.getItem('drag-on:v1'))).toBe(rawBefore)
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('drag-on:before-import-')))).toEqual([])
  expect(msgs).toEqual([])
})

test('read-only: import is off with a note, export sends the stored data untouched, and no reminder or dot', async ({ page }) => {
  const msgs = collectConsole(page)
  // First log a month ago and never backed up: due, but read-only can't record a backup.
  const raw = JSON.stringify({ schemaVersion: 2, events: logs(['2026-09-09', ...RECENT]), settings: {}, somethingNew: { kept: true } })
  await open(page, raw)
  await settle(page)
  expect(await speechShowing(page)).toBe(false)
  await expect(settingsTab(page).locator('.tab-dot')).toBeHidden()
  await settingsTab(page).tap()
  await expect(page.locator('#ss-import')).toBeDisabled()
  await expect(page.locator('#ss-import-paused')).toBeVisible()
  await expect(page.locator('#ss-import')).toHaveAccessibleDescription(SETTINGS.importPaused)

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#ss-export').tap()])
  expect(await readFile((await download.path())!, 'utf8')).toBe(raw)
  // Nothing written while read-only.
  expect(await page.evaluate(() => localStorage.getItem('drag-on:v1'))).toBe(raw)
  await expect(page.locator('.ss-last')).toHaveText(SETTINGS.neverBackedUp)
  await expect(settingsTab(page).locator('.tab-dot')).toBeHidden()
  // The read-only console note is expected here.
  expect(msgs.filter((m) => !m.includes('Not saving on this device'))).toEqual([])
})

test('backup reminder: once a day on Home, tap it to open Settings; welcome back comes first', async ({ page }, info) => {
  const msgs = collectConsole(page)
  // First log 30 days ago, never backed up, logged yesterday: due, nothing to welcome.
  await open(page, { schemaVersion: 1, events: logs(['2026-09-09', ...RECENT]) })
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  expect(BACKUP_REMINDER).toContain(await page.locator('#speech').textContent())
  // The line is a real button inside the live region, which keeps no role of its own.
  const tapLine = page.getByRole('button', { name: await page.locator('#speech').textContent() ?? '' })
  await expect(tapLine).toBeVisible()
  expect(await page.locator('#speech').getAttribute('role')).toBeNull()
  await expect(settingsTab(page).locator('.tab-dot')).toBeVisible()
  await settle(page)
  const bubble = (await page.locator('#speech').boundingBox())!
  const button = (await tapLine.boundingBox())!
  expect(button.height).toBeGreaterThanOrEqual(44)
  expect(button.width).toBeGreaterThanOrEqual(44)
  // The button fills the bubble.
  expect(Math.abs(button.height - bubble.height)).toBeLessThan(1)
  await shot(page, `m6s1-reminder-${info.project.name}`)

  await tapLine.tap()
  await expect(page).toHaveURL(/#\/settings$/)
  await expect(page.locator('#settings-screen')).toBeVisible()

  // Back on Home, and after a reload: not again today.
  await page.locator('.tabbar a.tab[data-route="home"]').tap()
  expect(await speechShowing(page)).toBe(false)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await settle(page)
  expect(await speechShowing(page)).toBe(false)
  // The dot stays until there's a backup.
  await expect(settingsTab(page).locator('.tab-dot')).toBeVisible()

  // Keyboard: Enter on the focused button opens Settings too.
  await page.clock.setFixedTime(new Date('2026-10-10T10:00:00+01:00'))
  await page.reload()
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  await page.locator('#speech .speech-tap').focus()
  await page.keyboard.press('Enter')
  await expect(page).toHaveURL(/#\/settings$/)
  await page.locator('.tabbar a.tab[data-route="home"]').tap()
  // A log today keeps the dragon content tomorrow, so nothing to welcome.
  await page.locator('#task-list button.task[data-task-id="walk"]').tap()

  // The day after, it's said again.
  await page.clock.setFixedTime(new Date('2026-10-11T10:00:00+01:00'))
  await page.reload()
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  expect(BACKUP_REMINDER).toContain(await page.locator('#speech').textContent())
  // It lasts about 8s, then the button can't be reached.
  await page.clock.runFor(7_000)
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  await page.clock.runFor(1_500)
  await expect(page.locator('#speech')).not.toHaveClass(/is-showing/)
  await expect(page.locator('#speech .speech-tap')).toBeDisabled()
  expect(msgs).toEqual([])
})


test('backup reminder: a welcome back takes the open, the reminder waits for the next one', async ({ page }) => {
  // First log long ago, last log 4 days ago: sleepy, and a backup is due.
  await open(page, { schemaVersion: 1, events: logs(['2026-09-01', '2026-10-05']) })
  await expect(page.locator('#mood-chip')).toHaveText('Sleepy')
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  expect(WELCOME_BACK.sleepy).toContain(await page.locator('#speech').textContent())
  await page.reload()
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  expect(BACKUP_REMINDER).toContain(await page.locator('#speech').textContent())
})

test('no reminder and no dot with no logs, or with a recent backup', async ({ page }) => {
  await open(page, null)
  await settle(page)
  expect(await speechShowing(page)).toBe(false)
  await expect(settingsTab(page).locator('.tab-dot')).toBeHidden()
  await page.evaluate(
    (d) => localStorage.setItem('drag-on:v1', d),
    JSON.stringify({ schemaVersion: 1, events: logs(['2026-09-01', ...RECENT]), settings: { lastBackupAt: at('2026-09-25', '12:00') } }),
  )
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await settle(page)
  expect(await speechShowing(page)).toBe(false)
  await expect(settingsTab(page).locator('.tab-dot')).toBeHidden()
})
