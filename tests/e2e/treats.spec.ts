// Milestone 4, Slice 1: treats. A treat roll adds a second float, a happy hop, a
// longer buzz and a toast that mentions it. A normal log feels exactly as before.
// Milestone 8, slice 3: granting the dragon's secret wish feels like a treat too, and
// the dragon hints at it on opening, with a sparkle by it that tells the wish.
import { test, expect, shot, LAYOUT, type Page } from './fixtures'
import { MISSION } from '../../src/config/missions'
import { REWARDS } from '../../src/config/rewards'
import { TASKS } from '../../src/config/tasks'
import { dayKey } from '../../src/game/day'
import { missionFor } from '../../src/game/mission'
import { wishCopy, wishHintLine } from '../../src/ui/copy'

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

async function setUp(page: Page, roll: number | null, opts: { install?: boolean } = {}) {
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
  // install: timers are faked too, so a test can run the clock past the toast.
  if (opts.install) await page.clock.install({ time: NOW })
  else await page.clock.setFixedTime(NOW)
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

test('the secret wish: hinted on opening, told by the bubble and the sparkle (clear of the goal chip, toast and tasks), and granted with its float, hop, burst, line and bonus; the sparkle hides until undo reopens it', LAYOUT, async ({ page }) => {
  const msgs = collectConsole(page)
  // A seed whose wish today is something for Wisdom, found through the game's own pick.
  const tasks = TASKS
  const day = dayKey(NOW.getTime())
  const seed = Array.from({ length: 200 }, (_, i) => `e2e-${i}`).find((s) => missionFor(day, s, tasks, [], MISSION)?.id === 'stat:wisdom')!
  await page.addInitScript((missionSeed) => {
    if (!sessionStorage.getItem('seeded')) {
      const settings = { missionSeed, goal: { taskId: 'gym', daysPerWeek: 3 } }
      localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: [], settings }))
      sessionStorage.setItem('seeded', '1')
    }
  }, seed)
  await setUp(page, null)
  const bonus = MISSION.bonusXp
  const wish = wishCopy('stat:wisdom')!.wish
  const sparkle = page.locator('#wish-sparkle')
  // Opening: the hint, and tapping it tells the wish. The sparkle tells it too.
  await expect(page.locator('#speech')).toHaveText(wishHintLine(day))
  await page.locator('#speech .speech-tap').click()
  await expect(page.locator('#speech')).toHaveText(wish)
  await expect(sparkle).toBeVisible()
  await expect(sparkle).toHaveAccessibleName('Secret wish')
  // Not the wish: a normal log. The sparkle stays, clear of the goal chip, the toast and the tasks.
  await page.locator('button.task[data-task-id="gym"]').click()
  expect((await feedback(page)).saved).not.toHaveProperty('mission')
  await sparkle.click()
  await expect(page.locator('#speech')).toHaveText(wish)
  const boxes = await page.evaluate(() => {
    const box = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().toJSON() as DOMRect
    return { sparkle: box('#wish-sparkle'), dragon: box('.dragon'), chip: box('#goal-chip'), toast: box('#toast'), task: box('#task-list .task'), speech: box('#speech') }
  })
  const apart = (a: DOMRect, b: DOMRect) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top
  expect(boxes.sparkle.width).toBeGreaterThanOrEqual(44)
  expect(boxes.sparkle.height).toBeGreaterThanOrEqual(44)
  expect(boxes.sparkle.top).toBeGreaterThanOrEqual(boxes.dragon.top)
  expect(boxes.sparkle.right).toBeLessThanOrEqual(boxes.dragon.right)
  for (const other of [boxes.chip, boxes.toast, boxes.task, boxes.speech]) expect(apart(boxes.sparkle, other)).toBe(true)
  await shot(page, `m8s3b-wish-sparkle-${test.info().project.name}`)
  await page.locator('button.task[data-task-id="read"]').click()
  const fb = await feedback(page)
  expect(fb.floats.slice(-2)).toEqual([
    { text: `+${XP('read')} XP`, treat: false },
    { text: `+${bonus} wish`, treat: true },
  ])
  expect(fb.toast).toBe(`Secret wish! +${XP('read') + bonus} XP · Read for 20 minutes`)
  expect(fb).toMatchObject({ treat: true, xp: XP('gym') + XP('read') + bonus })
  expect(fb.saved).toMatchObject({ taskId: 'read', xpAwarded: XP('read'), mission: { id: 'stat:wisdom', bonusXp: bonus } })
  await expect(page.locator('#speech')).toHaveText(/^You granted my secret wish/)
  await expect(page.locator('#dragon-art .wish-burst .wish-spark')).toHaveCount(8)
  await shot(page, `m8s3-wish-${test.info().project.name}`, { delay: 350 })
  await expect(sparkle).toBeHidden()

  // Undo takes the bonus back and reopens the wish: logging it again grants it again.
  await page.locator('#toast-undo').click()
  await expect(page.locator('#xp-total')).toHaveText(String(XP('gym')))
  await expect(sparkle).toBeVisible()
  await page.locator('button.task[data-task-id="read"]').click()
  await expect(page.locator('#toast-text')).toHaveText(`Secret wish! +${XP('read') + bonus} XP · Read for 20 minutes`)
  await expect(page.locator('#xp-total')).toHaveText(String(XP('gym') + XP('read') + bonus))
  await expect(sparkle).toBeHidden()
  expect(msgs).toEqual([])
})

test('reduced motion and dark mode: no hop, the floats and toast still say it, the treat pill keeps its colours, and the still floats sit above the tapped button, clear of its labels', LAYOUT, async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' })
  await setUp(page, TREAT_ROLL)
  const button = page.locator('button.task[data-task-id="avoided"]')
  await button.click()
  const fb = await feedback(page)
  expect(fb).toMatchObject({ log: false, treat: false })
  expect(fb.floats.map((f) => f.text)).toEqual([`+${XP('avoided')} XP`, `+${BONUS('avoided')} treat`])
  expect(fb.toast).toBe(`Treat! +${XP('avoided') + BONUS('avoided')} XP · Something I've been avoiding`)
  // Still floats fade in place, so where they sit doesn't change while they show.
  // The button's own count and XP ("1/2 ✓ Done" or "+15 XP"), after the re-render.
  const labels = (await button.locator('.task-meta').boundingBox())!
  const floats = await page.$$eval('.float-xp', (els) => els.map((e) => e.getBoundingClientRect().bottom))
  expect(floats).toHaveLength(2)
  for (const bottom of floats) expect(bottom).toBeLessThanOrEqual(labels.y)
  const colours = await page.locator('.float-treat').evaluate((el) => {
    const s = getComputedStyle(el)
    return { color: s.color, bg: s.backgroundColor }
  })
  expect(colours).toEqual({ color: 'rgb(255, 194, 216)', bg: 'rgb(90, 47, 64)' })
  await shot(page, `m4s1-treat-dark-${test.info().project.name}`)
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
  await setUp(page, TREAT_ROLL, { install: true })
  await page.locator('button.task[data-task-id="gym"]').click()
  await expect(page.locator('.overlay')).toBeVisible()
  await page.clock.runFor(6000) // past the toast's 5s
  await expect(page.locator('#toast')).not.toHaveClass(/is-showing/) // the toast ran out behind the overlay
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
