// Milestone 4, Slice 1: treats. A treat roll adds a second float, a happy hop, a
// longer buzz and a toast that mentions it. A normal log feels exactly as before.
import { test, expect, shot, type Page } from './fixtures'
import { REWARDS } from '../../src/config/rewards'
import { TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const NOW = new Date('2026-10-13T10:00:00+01:00')
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const BONUS = (id: string) => Math.round(XP(id) * REWARDS.treatBonusShare)
// Just inside the treat band, so the test follows the config.
const TREAT_ROLL = REWARDS.rareChance + REWARDS.treatChance / 2

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function setUp(page: Page, roll: number | null) {
  await page.addInitScript((r) => {
    if (r !== null) Math.random = () => r
    ;(window as any).__buzz = []
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (p: number | number[]) => {
        ;(window as any).__buzz.push(p)
        return true
      },
    })
  }, roll)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
}

const feedback = (page: Page) =>
  page.evaluate(() => ({
    floats: [...document.querySelectorAll('.float-xp')].map((f) => ({ text: f.textContent, treat: f.classList.contains('float-treat') })),
    toast: document.querySelector('#toast-text')!.textContent,
    log: !!document.querySelector('#dragon-art .react-log'),
    treat: !!document.querySelector('#dragon-art .react-treat'),
    buzz: (window as any).__buzz,
    xp: Number(document.querySelector('#xp-total')!.textContent),
    saved: JSON.parse(localStorage.getItem('drag-on:v1')!).events.at(-1),
  }))

test('a treat: second float, happy hop, longer buzz, toast, and the bonus saved', async ({ page }) => {
  const msgs = collectConsole(page)
  await setUp(page, TREAT_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  const fb = await feedback(page)
  console.log('treat feedback', JSON.stringify(fb))
  expect(fb.floats).toEqual([
    { text: `+${XP('read')} XP`, treat: false },
    { text: `+${BONUS('read')} treat`, treat: true },
  ])
  expect(fb.toast).toBe(`Treat! +${XP('read') + BONUS('read')} XP · Read for 20 minutes`)
  expect(fb).toMatchObject({ log: false, treat: true, xp: XP('read') + BONUS('read') })
  expect(fb.buzz).toEqual([[30, 60, 45]])
  expect(fb.saved).toMatchObject({ taskId: 'read', xpAwarded: XP('read'), reward: { kind: 'treat', bonusXp: BONUS('read') } })

  // Only the task name may shorten, and "Read for 20 minutes" fits at the Pixel's 410px.
  const fit = await page.evaluate(() => {
    const lead = document.querySelector('#toast-text .toast-lead') as HTMLElement
    const name = document.querySelector('#toast-text .toast-name') as HTMLElement
    return { lead: lead.scrollWidth <= lead.clientWidth, name: name.scrollWidth <= name.clientWidth }
  })
  expect(fit.lead).toBe(true)
  if (page.viewportSize()!.width >= 410) expect(fit.name).toBe(true)

  // Mid-animation, for a look at the float pair on the phone.
  await shot(page, `m4s1-treat-${test.info().project.name}`, { delay: 350 })

  await page.locator('#toast-undo').click()
  await expect(page.locator('#xp-total')).toHaveText('0')
  expect(msgs).toEqual([])
})

test('a normal log is unchanged: one float, the usual wiggle, toast and buzz', async ({ page }) => {
  await setUp(page, null)
  await page.locator('button.task[data-task-id="gym"]').click()
  const fb = await feedback(page)
  expect(fb.floats).toEqual([{ text: `+${XP('gym')} XP`, treat: false }])
  expect(fb.toast).toBe(`+${XP('gym')} XP · Gym / workout`)
  expect(fb).toMatchObject({ log: true, treat: false, xp: XP('gym'), buzz: [30] })
  expect(fb.saved).not.toHaveProperty('reward')
})

test('a treat in dark mode', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await setUp(page, TREAT_ROLL)
  await page.locator('button.task[data-task-id="walk"]').click()
  const treat = page.locator('.float-treat')
  await expect(treat).toHaveText(`+${BONUS('walk')} treat`)
  const colours = await treat.evaluate((el) => {
    const s = getComputedStyle(el)
    return { color: s.color, bg: s.backgroundColor }
  })
  expect(colours).toEqual({ color: 'rgb(255, 194, 216)', bg: 'rgb(90, 47, 64)' })
  await shot(page, `m4s1-treat-dark-${test.info().project.name}`, { delay: 350 })
})

test('reduced motion: no hop, the floats and toast still say it', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setUp(page, TREAT_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  const fb = await feedback(page)
  expect(fb).toMatchObject({ log: false, treat: false })
  expect(fb.floats.map((f) => f.text)).toEqual([`+${XP('read')} XP`, `+${BONUS('read')} treat`])
  expect(fb.toast).toBe(`Treat! +${XP('read') + BONUS('read')} XP · Read for 20 minutes`)
})

test('reduced motion: the still floats sit above the tapped button, clear of its labels', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setUp(page, TREAT_ROLL)
  const button = page.locator('button.task[data-task-id="avoided"]')
  await button.click()
  await page.waitForTimeout(500) // both floats fully shown
  // The button's own count and XP ("1/2 ✓ Done" or "+15 XP"), after the re-render.
  const labels = (await button.locator('.task-meta').boundingBox())!
  const floats = await page.$$eval('.float-xp', (els) => els.map((e) => e.getBoundingClientRect().bottom))
  expect(floats).toHaveLength(2)
  for (const bottom of floats) expect(bottom).toBeLessThanOrEqual(labels.y)
})

test('a treat that also hatches the egg is acknowledged again when the overlay closes', async ({ page }) => {
  const msgs = collectConsole(page)
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      const t = Date.parse('2026-10-12T09:00:00+01:00')
      const events = [{ id: 'a', type: 'log', taskId: 'read', timestamp: t, xpAwarded: 90 }]
      localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events }))
      sessionStorage.setItem('seeded', '1')
    }
  })
  await setUp(page, TREAT_ROLL)
  await page.locator('button.task[data-task-id="gym"]').click()
  await expect(page.locator('.overlay')).toBeVisible()
  await expect(page.locator('#toast')).not.toHaveClass(/is-showing/, { timeout: 10_000 }) // the toast ran out behind the overlay
  await page.locator('.overlay-button').click()
  await expect(page.locator('.overlay')).toHaveCount(0)
  const toast = page.locator('#toast')
  await expect(toast).toHaveClass(/is-showing/)
  await expect(page.locator('#toast-text')).toHaveText(`Treat! +${XP('gym') + BONUS('gym')} XP · Gym / workout`)
  // Undo still takes the log (and its bonus) back.
  await page.locator('#toast-undo').click()
  await expect(page.locator('#xp-total')).toHaveText('90')
  expect(msgs).toEqual([])
})
