// Milestone 4, Slice 2: rare items and the Collection screen. Math.random is pinned to
// a roll in the rare band, so every log finds the first item not found yet.
import { test, expect, closePastGuard, settle, shot, LAYOUT, type Page } from './fixtures'
import { ITEMS } from '../../src/config/items'
import { NATURE } from '../../src/config/nature'
import { REWARDS } from '../../src/config/rewards'
import { TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const NOW = new Date('2026-10-13T10:00:00+01:00')
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
// Inside the rare band, and as `pick` it chooses the first item left.
const RARE_ROLL = REWARDS.rareChance / 3
const FIRST = ITEMS[0]!
const SECOND = ITEMS[1]!
// The pinned roll also picks the first find in season (October) for a walk.
const OCTOBER_FIRST = NATURE.find((f) => f.months.includes(10))!

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function seed(page: Page, events: object[]) {
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: d }))
      sessionStorage.setItem('seeded', '1')
    }
  }, events)
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

const card = (page: Page) => page.locator('.overlay.item-found')
const saved = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.at(-1))

const closeCard = (page: Page) => closePastGuard(card(page), () => card(page).click())
const natureCard = (page: Page) => page.locator('.overlay.nature-found')
const closeNature = (page: Page) => closePastGuard(natureCard(page), () => natureCard(page).click())

test('a rare roll finds an item: card, toast, Collection, and undo takes it back', async ({ page }) => {
  const msgs = collectConsole(page)
  await setUp(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()

  // Saved first, worth no extra XP.
  expect(await saved(page)).toMatchObject({ taskId: 'read', xpAwarded: XP('read'), reward: { kind: 'item', itemId: FIRST.id } })
  await expect(page.locator('#xp-total')).toHaveText(String(XP('read')))
  expect(await page.evaluate(() => (window as any).__buzz)).toEqual([[25, 50, 25, 50, 60]])

  // The card: heading, drawing, name, a line, and it takes focus.
  await expect(card(page)).toBeVisible()
  await expect(card(page)).toHaveAttribute('role', 'dialog')
  await expect(card(page).locator('.item-found-name')).toHaveText(FIRST.name)
  await expect(card(page).locator(`.item-found-art svg[data-item="${FIRST.id}"]`)).toHaveCount(1)
  await expect(card(page).locator('.item-found-heading')).toHaveText('Found something!')
  await expect(card(page).locator('.overlay-button')).toBeVisible()
  expect(await page.evaluate(() => document.activeElement?.classList.contains('item-found'))).toBe(true)
  expect(await page.evaluate(() => document.getElementById('app')!.inert)).toBe(true)
  await shot(page, `m4s2-card-${test.info().project.name}`, { settled: true })

  // Close: tap anywhere. Focus returns to a task, and the toast comes back with Undo.
  await closeCard(page)
  expect(await page.evaluate(() => document.getElementById('app')!.inert)).toBe(false)
  expect(await page.evaluate(() => document.activeElement?.matches('button.task'))).toBe(true)
  await expect(page.locator('#toast')).toHaveClass(/is-showing/)
  await expect(page.locator('#toast-text')).toHaveText(`+${XP('read')} XP · Read for 20 minutes`) // the card already said "Found something!"
  await expect(page.locator('#toast-undo')).toBeVisible()

  // Collection: one find with its name and date, the rest a plain "?".
  await page.getByRole('link', { name: 'Collection' }).click()
  await expect(page).toHaveURL(/#\/collection$/)
  const screen = page.locator('#collection-screen')
  await expect(screen).toBeVisible()
  await expect(screen.locator('.cs-count')).toHaveText(`1 of ${ITEMS.length} found`)
  const found = screen.locator('.item-tile.is-found')
  await expect(found).toHaveCount(1)
  await expect(found.locator('.item-tile-name')).toHaveText(FIRST.name)
  await expect(found.locator('.item-tile-date')).toHaveText('Today')
  await expect(found.locator(`svg[data-item="${FIRST.id}"]`)).toHaveCount(1)
  await expect(screen.locator('.item-tile.is-unknown')).toHaveCount(ITEMS.length - 1)
  // Nothing about an unfound item reaches the page.
  const text = (await screen.textContent()) ?? ''
  const html = await screen.innerHTML()
  for (const other of ITEMS.slice(1)) {
    expect(text, other.id).not.toContain(other.name)
    expect(html, other.id).not.toContain(`data-item="${other.id}"`)
  }

  // Back Home: Undo takes the find away, gently.
  await page.getByRole('link', { name: 'Home' }).click()
  await page.locator('#undo').click()
  await expect(page.locator('#toast-text')).toHaveText('Undone. That find is hiding again for now.')
  await expect(page.locator('#xp-total')).toHaveText('0')
  await page.getByRole('link', { name: 'Collection' }).click()
  await expect(screen.locator('.cs-count')).toHaveText(`0 of ${ITEMS.length} found`)
  await expect(screen.locator('.item-tile.is-found')).toHaveCount(0)
  await expect(screen.locator('.item-tile.is-unknown')).toHaveCount(ITEMS.length)
  expect(msgs).toEqual([])
})

test('a quick double-tap on the task does not dismiss the card unseen', async ({ page }) => {
  await setUp(page, RARE_ROLL)
  const button = page.locator('button.task[data-task-id="avoided"]')
  await button.click()
  await expect(card(page)).toBeVisible()
  // The second tap lands on the card within the guard: a close would start in the tap's own handler.
  await card(page).click()
  await expect(card(page)).not.toHaveClass(/is-closing/)
  await expect(card(page)).toBeVisible()
  await closeCard(page)
  // Only one log was made.
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.length)
  expect(events).toBe(1)
})

test('the next find is a different item; a walk also spots something new: its card, the Nature tile, and Undo takes both back', async ({ page }) => {
  await setUp(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="gym"]').click()
  await closeCard(page)
  await page.locator('button.task[data-task-id="walk"]').click()
  expect(await saved(page)).toMatchObject({ taskId: 'walk', xpAwarded: XP('walk'), nature: { id: OCTOBER_FIRST.id } })
  await expect(card(page).locator('.item-found-name')).toHaveText(SECOND.name)
  await closeCard(page)
  // The nature card follows the item card: name, picture and what to look for.
  await expect(natureCard(page)).toBeVisible()
  await expect(natureCard(page).locator('.item-found-name')).toHaveText(OCTOBER_FIRST.name)
  await expect(natureCard(page).locator('.nature-look-for')).toHaveText(OCTOBER_FIRST.lookFor)
  await expect(natureCard(page).locator(`svg[data-nature="${OCTOBER_FIRST.id}"]`)).toHaveCount(1)
  await shot(page, `m10s1-nature-card-${test.info().project.name}`, { settled: true })
  await closeNature(page)
  await expect(page.locator('#toast-text')).toHaveText(`+${XP('walk')} XP · Went for a walk`)

  // Collection's Nature section: one found tile, the rest a plain "?". Tapping it reopens its card.
  await page.getByRole('link', { name: 'Collection' }).click()
  const nature = page.locator('#collection-screen .cs-nature')
  await expect(nature.locator('.cs-nature-count')).toHaveText(`1 of ${NATURE.length} found`)
  await expect(nature.locator('.nature-tile.is-unknown')).toHaveCount(NATURE.length - 1)
  await nature.locator('.nature-tile.is-found').click()
  await expect(natureCard(page).locator('.item-found-name')).toHaveText(OCTOBER_FIRST.name)
  await closeNature(page)
  expect(await page.evaluate(() => document.activeElement?.matches('.nature-tile'))).toBe(true)

  await page.getByRole('link', { name: 'Home' }).click()
  await page.locator('#undo').click()
  await expect(page.locator('#toast-text')).toHaveText('Undone. Those finds are hiding again for now.')
  await page.getByRole('link', { name: 'Collection' }).click()
  await expect(page.locator('.cs-count')).toHaveText(`1 of ${ITEMS.length} found`)
  await expect(page.locator('.item-tile.is-found .item-tile-name')).toHaveText(FIRST.name)
  await expect(nature.locator('.cs-nature-count')).toHaveText(`0 of ${NATURE.length} found`)
  await expect(nature.locator('.nature-tile.is-found')).toHaveCount(0)
})

test('a find that also hatches the egg: stage-up first, then the card, then the toast', async ({ page }) => {
  const msgs = collectConsole(page)
  const t = Date.parse('2026-10-12T09:00:00+01:00')
  await seed(page, [{ id: 'a', type: 'log', taskId: 'read', timestamp: t, xpAwarded: 90 }])
  await setUp(page, RARE_ROLL, { install: true })
  await page.locator('button.task[data-task-id="gym"]').click()
  await expect(page.locator('.overlay:not(.item-found)')).toBeVisible()
  await expect(card(page)).toHaveCount(0)
  await expect(page.locator('.overlay:not(.item-found)')).toHaveClass(/is-revealed/) // revealed after the close guard has passed
  await page.locator('.overlay:not(.item-found) .overlay-button').click()
  await expect(card(page)).toBeVisible()
  await expect(card(page).locator('.item-found-name')).toHaveText(FIRST.name)
  // The same tap (or a quick second one) doesn't close the card.
  await card(page).click()
  await expect(card(page)).toBeVisible()
  await page.clock.runFor(6000) // past the toast's 5s
  await expect(page.locator('#toast')).not.toHaveClass(/is-showing/) // the toast ran out behind the card
  await closeCard(page)
  await expect(page.locator('.overlay')).toHaveCount(0)
  await expect(page.locator('#toast')).toHaveClass(/is-showing/)
  await expect(page.locator('#toast-text')).toHaveText(`+${XP('gym')} XP · Gym / workout`)
  await page.locator('#toast-undo').click()
  await expect(page.locator('#xp-total')).toHaveText('90')
  expect(msgs).toEqual([])
})

test('Collection with nothing found: friendly empty state and "?" tiles', async ({ page }) => {
  const msgs = collectConsole(page)
  await setUp(page, null)
  await page.getByRole('link', { name: 'Collection' }).click()
  const screen = page.locator('#collection-screen')
  await expect(screen.locator('#cs-title')).toHaveText('Collection')
  await expect(screen.locator('.cs-count')).toHaveText(`0 of ${ITEMS.length} found`)
  await expect(screen.locator('.cs-line')).toHaveText('Nothing yet, your dragon is keeping an eye out.')
  await expect(screen.locator('.item-tile.is-unknown')).toHaveCount(ITEMS.length)
  await expect(screen.locator('.item-tile.is-unknown .item-tile-art').first()).toHaveText('?')
  expect(msgs).toEqual([])
})

for (const scheme of ['light', 'dark'] as const) {
  test(`Collection with every item and nature find (${scheme}): own drawings, 3 columns, big tiles, names fit, no sideways scroll`, LAYOUT, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme })
    const t = Date.parse('2026-10-05T09:00:00+01:00')
    const events = ITEMS.map((item, k) => ({
      id: `a${k}`,
      type: 'log',
      taskId: 'avoided',
      timestamp: t + k * 3_600_000,
      xpAwarded: 15,
      reward: { kind: 'item', itemId: item.id },
    }))
    // Every nature find too, one walk a day (the longest names must fit as well).
    const walks = NATURE.map((f, k) => ({ id: `n${k}`, type: 'log', taskId: 'walk', timestamp: t - (k + 1) * 86_400_000, xpAwarded: 15, nature: { id: f.id } }))
    await seed(page, [...walks, ...events])
    await setUp(page, null)
    await page.getByRole('link', { name: 'Collection' }).click()
    const screen = page.locator('#collection-screen')
    await expect(screen.locator('.cs-count')).toHaveText(`${ITEMS.length} of ${ITEMS.length} found`)
    await expect(screen.locator('.cs-nature-count')).toHaveText(`${NATURE.length} of ${NATURE.length} found`)
    await expect(screen.locator('.nature-tile.is-found')).toHaveCount(NATURE.length)
    await expect(screen.locator('.cs-line')).toHaveText('Every one found! Your dragon is delighted.')
    await expect(screen.locator('.item-tile.is-unknown')).toHaveCount(0)
    await expect(screen.locator('.item-tile.is-found')).toHaveCount(ITEMS.length)
    await expect(screen.locator('.item-tile.is-found .item-tile-date').first()).toHaveText('5 Oct')
    for (const item of ITEMS) await expect(screen.locator(`.item-tile.is-found svg[data-item="${item.id}"]`), item.id).toHaveCount(1)
    const g = await page.evaluate(() => {
      const tiles = [...document.querySelectorAll('#collection-screen .item-tile, #collection-screen .nature-tile')].map((e) => e.getBoundingClientRect())
      const firstRowTop = tiles[0]!.top
      const natureTop = document.querySelector('#collection-screen .nature-tile')!.getBoundingClientRect().top
      return {
        docW: document.documentElement.scrollWidth,
        vw: window.innerWidth,
        perRow: tiles.filter((r) => Math.abs(r.top - firstRowTop) < 1).length,
        naturePerRow: tiles.filter((r) => Math.abs(r.top - natureTop) < 1).length,
        minW: Math.min(...tiles.map((r) => r.width)),
        minH: Math.min(...tiles.map((r) => r.height)),
        right: Math.max(...tiles.map((r) => r.right)),
        nameOverflow: [...document.querySelectorAll<HTMLElement>('.item-tile-name')].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => n.textContent),
      }
    })
    expect(g.perRow).toBe(3)
    expect(g.naturePerRow).toBe(3)
    expect(g.minW).toBeGreaterThanOrEqual(44)
    expect(g.minH).toBeGreaterThanOrEqual(44)
    expect(g.right).toBeLessThanOrEqual(g.vw)
    expect(g.docW).toBeLessThanOrEqual(g.vw)
    expect(g.nameOverflow).toEqual([])
    await shot(page, `m7s3-collection-all-${scheme}-${test.info().project.name}`, { settled: true })
    await screen.locator('.cs-nature').scrollIntoViewIfNeeded()
    await shot(page, `m10s1-collection-nature-${scheme}-${test.info().project.name}`, { settled: true })
  })
}

// Unknown ids and malformed rewards are ignored (unit-tested in collection-screen.test.ts
// and rewards.test.ts); this checks the screen copes with them in saved data.
test('Collection ignores an unknown item id and a malformed reward', async ({ page }) => {
  const msgs = collectConsole(page)
  const t = Date.parse('2026-10-05T09:00:00+01:00')
  const events = ITEMS.slice(0, 5).map((item, k) => ({
    id: `f${k}`,
    type: 'log',
    taskId: 'avoided',
    timestamp: t + k * 86_400_000,
    xpAwarded: 15,
    reward: { kind: 'item', itemId: item.id },
  }))
  events.push({ id: 'x1', type: 'log', taskId: 'avoided', timestamp: t, xpAwarded: 15, reward: { kind: 'item', itemId: 'from-later' } })
  events.push({ id: 'x2', type: 'log', taskId: 'avoided', timestamp: t, xpAwarded: 15, reward: { kind: 'item' } as never })
  await seed(page, events)
  await setUp(page, null)
  await page.getByRole('link', { name: 'Collection' }).click()
  const screen = page.locator('#collection-screen')
  await expect(screen.locator('.cs-count')).toHaveText(`5 of ${ITEMS.length} found`)
  await expect(screen.locator('.item-tile.is-found')).toHaveCount(5)
  await expect(screen.locator('.item-tile.is-unknown')).toHaveCount(ITEMS.length - 5)
  await shot(page, `m4s2-collection-${test.info().project.name}`)
  expect(msgs).toEqual([])
})

test('reduced motion: the card appears without bouncing, and still closes the same way', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await setUp(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  await expect(card(page)).toBeVisible()
  const anim = await page.evaluate(() => ({
    art: getComputedStyle(document.querySelector('.item-found-art')!).animationName,
    card: getComputedStyle(document.querySelector('.item-card')!).animationName,
  }))
  expect(anim.art).toBe('none')
  expect(anim.card).not.toBe('item-card-in')
  await expect(card(page).locator('.overlay-button')).toBeVisible()
  await closeCard(page)
})

test('the card fits inside the screen (dark mode)', LAYOUT, async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await setUp(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  await expect(card(page)).toBeVisible()
  await settle(page) // the card has finished arriving
  const box = (await card(page).locator('.item-card').boundingBox())!
  const vp = page.viewportSize()!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
  await shot(page, `m4s2-card-dark-${test.info().project.name}`)
})

test('the find toast keeps the whole task name, wrapping it rather than cutting it off', LAYOUT, async ({ page }) => {
  await setUp(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="avoided"]').click()
  await closeCard(page)
  await expect(page.locator('#toast-text')).toHaveText(`+${XP('avoided')} XP · Something I've been avoiding`)
  await settle(page)
  const g = await page.evaluate(() => {
    const toast = document.querySelector<HTMLElement>('#toast')!
    const lead = document.querySelector<HTMLElement>('#toast-text .toast-lead')!
    const name = document.querySelector<HTMLElement>('#toast-text .toast-name')!
    const sep = document.querySelector<HTMLElement>('#toast-text .toast-sep')!
    const t = toast.getBoundingClientRect()
    const u = document.querySelector('#toast-undo')!.getBoundingClientRect()
    return {
      wrapped: toast.classList.contains('is-wrapped'),
      nameOnLine2: name.offsetTop > lead.offsetTop,
      nameCut: name.scrollWidth > name.clientWidth + 1,
      leadCut: lead.scrollWidth > lead.clientWidth + 1,
      sepVisible: getComputedStyle(sep).visibility === 'visible',
      toast: { top: t.top, bottom: t.bottom, left: t.left, right: t.right },
      undo: { w: u.width, h: u.height },
      barTop: document.querySelector('.xp-bar')!.getBoundingClientRect().top,
      firstTaskTop: document.querySelector('button.task')!.getBoundingClientRect().top,
      vw: innerWidth,
    }
  })
  expect(g.nameCut).toBe(false)
  expect(g.leadCut).toBe(false)
  expect(g.wrapped).toBe(g.nameOnLine2)
  // The dot between lead and name only shows when they share a line.
  expect(g.sepVisible).toBe(!g.wrapped)
  expect(g.undo.w).toBeGreaterThanOrEqual(44)
  expect(g.undo.h).toBeGreaterThanOrEqual(44)
  // It grows upward: never over the XP bar or the task buttons, and inside the screen.
  expect(g.toast.bottom).toBeLessThanOrEqual(g.barTop)
  expect(g.toast.bottom).toBeLessThan(g.firstTaskTop)
  expect(g.toast.top).toBeGreaterThanOrEqual(0)
  expect(g.toast.left).toBeGreaterThanOrEqual(0)
  expect(g.toast.right).toBeLessThanOrEqual(g.vw)
  if (g.vw <= 360) expect(g.wrapped).toBe(true)
  await shot(page, `m4s2-toast-wrap-${test.info().project.name}`)
})

test('bad-luck protection: after enough logs with no item, the next log finds one', async ({ page }) => {
  const t = Date.parse('2026-09-01T12:00:00+01:00')
  const day = 86_400_000
  const events = Array.from({ length: REWARDS.itemPityLogs }, (_, k) => ({
    id: `p${k}`,
    type: 'log',
    taskId: 'avoided',
    timestamp: t + k * day,
    xpAwarded: 15,
  }))
  await seed(page, events)
  await setUp(page, null) // a roll that brings nothing
  await page.locator('button.task[data-task-id="read"]').click()
  expect(await saved(page)).toMatchObject({ taskId: 'read', reward: { kind: 'item', itemId: ITEMS.at(-1)!.id } })
  await expect(card(page)).toBeVisible()
  await closeCard(page)
  // The next log is back to the usual odds.
  await page.locator('button.task[data-task-id="gym"]').click()
  expect(await saved(page)).not.toHaveProperty('reward')
  await expect(card(page)).toHaveCount(0)
})
