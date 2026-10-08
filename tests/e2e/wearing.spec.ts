// Milestone 4, Slice 3: the dragon wears found items. One item per spot; tap a found
// tile in Collection to wear it, tap again to take it off; a new find goes on by
// itself only if its spot is free.
import { test, expect, settle, shot, SWEEPS_SIZES, type Page } from './fixtures'
import { ITEMS } from '../../src/config/items'
import { REWARDS } from '../../src/config/rewards'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const NOW = new Date('2026-10-13T10:00:00+01:00')
const DAY = 86_400_000
const RARE_ROLL = REWARDS.rareChance / 3
const CLOSE_GUARD_MS = 600

const item = (id: string) => ITEMS.find((i) => i.id === id)!
const BOW = item('bow') // head, first in pick order
const BEANIE = item('beanie') // head
const SCARF = item('scarf') // neck
const BOOK = item('book') // held
const lower = (name: string) => name.charAt(0).toLowerCase() + name.slice(1)

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

interface Seed {
  /** XP banked by an early log, to set the stage. */
  xp?: number
  /** Items already found, a day apart before NOW. */
  finds?: string[]
  wearing?: Record<string, string | null>
  /** When the last log was, in days before NOW (sets the mood). */
  lastLogDaysAgo?: number
}

/** Seeds saved data once per test, so reloads don't reseed. */
async function seed(page: Page, { xp = 0, finds = [], wearing, lastLogDaysAgo = 1 }: Seed) {
  const last = NOW.getTime() - lastLogDaysAgo * DAY
  const events: object[] = []
  if (xp) events.push({ id: 'xp', type: 'log', taskId: 'gym', timestamp: last - 30 * DAY, xpAwarded: xp })
  finds.forEach((id, k) =>
    events.push({ id: `f${k}`, type: 'log', taskId: 'avoided', timestamp: last - (finds.length - 1 - k) * 60_000, xpAwarded: 0, reward: { kind: 'item', itemId: id } }),
  )
  const data: Record<string, unknown> = { schemaVersion: 1, events }
  if (wearing) data.settings = { wearing }
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('drag-on:v1', JSON.stringify(d))
      sessionStorage.setItem('seeded', '1')
    }
  }, data)
}

async function open(page: Page, roll: number | null = null) {
  if (roll !== null) await page.addInitScript((r) => (Math.random = () => r), roll)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
}

const savedWearing = (page: Page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).settings?.wearing ?? null)
const homeWorn = (page: Page, id: string) => page.locator(`#dragon-art [data-worn="${id}"]`)
const tile = (page: Page, id: string) => page.locator(`#collection-screen button.item-tile[data-item="${id}"]`)
const csToast = (page: Page) => page.locator('#collection-screen .cs-toast')
const csToastText = (page: Page) => page.locator('#collection-screen .cs-toast .toast-text')
const card = (page: Page) => page.locator('.overlay.item-found')

async function closeCard(page: Page) {
  await page.waitForTimeout(CLOSE_GUARD_MS + 50) // past the card's close guard
  await card(page).click()
  await expect(card(page)).toHaveCount(0)
}

test('wear and take off from Collection, one item per spot', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, { xp: 700, finds: [BOW.id, BEANIE.id, SCARF.id, BOOK.id] })
  await open(page)
  await page.getByRole('link', { name: 'Collection' }).click()
  const screen = page.locator('#collection-screen')
  await expect(screen.locator('.cs-hint')).toHaveText('Tap a find to try it on.')

  // Found tiles are toggle buttons, big enough to tap; "?" tiles are not buttons.
  await expect(screen.locator('button.item-tile')).toHaveCount(4)
  await expect(screen.locator('.item-tile.is-unknown')).toHaveCount(ITEMS.length - 4)
  await expect(screen.locator('.item-tile.is-unknown button')).toHaveCount(0)
  for (const b of await screen.locator('button.item-tile').all()) {
    await expect(b).toHaveAttribute('aria-pressed', 'false')
    const box = (await b.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(44)
    expect(box.height).toBeGreaterThanOrEqual(44)
  }
  await expect(tile(page, BOW.id)).toHaveAccessibleName(`${BOW.name}, found yesterday`)

  // Wear the bow: pressed, badge, toast, the preview wears it, and it's saved.
  await tile(page, BOW.id).click()
  await expect(tile(page, BOW.id)).toHaveAttribute('aria-pressed', 'true')
  await expect(tile(page, BOW.id).locator('.item-tile-badge')).toBeVisible()
  await expect(csToast(page)).toHaveClass(/is-showing/)
  await expect(csToastText(page)).toHaveText(`Wearing the ${lower(BOW.name)}`)
  await expect(screen.locator(`.cs-art [data-worn="${BOW.id}"]`)).toHaveCount(1)
  expect(await savedWearing(page)).toEqual({ head: BOW.id, neck: null, held: null })
  // Focus stays on the tile that was tapped.
  expect(await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.item)).toBe(BOW.id)

  // Another head item swaps it out; other spots are left alone.
  await tile(page, SCARF.id).click()
  await tile(page, BEANIE.id).click()
  await expect(tile(page, BEANIE.id)).toHaveAttribute('aria-pressed', 'true')
  await expect(tile(page, BOW.id)).toHaveAttribute('aria-pressed', 'false')
  await expect(tile(page, SCARF.id)).toHaveAttribute('aria-pressed', 'true')
  await expect(screen.locator('.cs-art [data-worn]')).toHaveCount(2)
  expect(await savedWearing(page)).toEqual({ head: BEANIE.id, neck: SCARF.id, held: null })

  // Tap again to take it off.
  await tile(page, BEANIE.id).click()
  await expect(tile(page, BEANIE.id)).toHaveAttribute('aria-pressed', 'false')
  await expect(csToastText(page)).toHaveText('Taken off')
  await expect(screen.locator(`.cs-art [data-worn="${BEANIE.id}"]`)).toHaveCount(0)
  expect(await savedWearing(page)).toEqual({ head: null, neck: SCARF.id, held: null })

  // Wearing never touches the event log.
  const events = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.length)
  expect(events).toBe(5)
  expect(msgs).toEqual([])
})

test('the outfit shows on Home and the Dragon screen, and a reload keeps it', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, { xp: 700, finds: [BOW.id, SCARF.id, BOOK.id] })
  await open(page)
  await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(0)
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(page.locator('#dragon-screen .wear-empty')).toHaveText('Nothing yet')
  await expect(page.locator('#dragon-screen .wear-item')).toHaveCount(0)

  await page.getByRole('link', { name: 'Collection' }).click()
  for (const i of [BOW, SCARF, BOOK]) await tile(page, i.id).click()

  await page.getByRole('link', { name: 'Home' }).click()
  for (const i of [BOW, SCARF, BOOK]) await expect(homeWorn(page, i.id)).toHaveCount(1)

  await page.getByRole('link', { name: 'Dragon' }).click()
  const ds = page.locator('#dragon-screen')
  for (const i of [BOW, SCARF, BOOK]) await expect(ds.locator(`.ds-art [data-worn="${i.id}"]`)).toHaveCount(1)
  await expect(ds.locator('.wear-item .wear-name')).toHaveText([BOW.name, SCARF.name, BOOK.name])
  await expect(ds.locator('.wear-empty')).toBeHidden()

  await page.reload()
  for (const i of [BOW, SCARF, BOOK]) await expect(homeWorn(page, i.id)).toHaveCount(1)
  await page.getByRole('link', { name: 'Collection' }).click()
  for (const i of [BOW, SCARF, BOOK]) await expect(tile(page, i.id)).toHaveAttribute('aria-pressed', 'true')
  expect(msgs).toEqual([])
})

test('the same outfit re-renders without redrawing (idle animations keep going)', async ({ page }) => {
  await seed(page, { xp: 700, finds: [BOW.id], wearing: { head: BOW.id, neck: null, held: null } })
  await open(page)
  await expect(homeWorn(page, BOW.id)).toHaveCount(1)
  await page.evaluate(() => ((document.querySelector('#dragon-art .dragon-react') as any).__marker = 1))
  // Round the screens and a minute tick: Home renders again with the same outfit.
  await page.getByRole('link', { name: 'Collection' }).click()
  await page.getByRole('link', { name: 'Home' }).click()
  await page.clock.runFor(61_000)
  expect(await page.evaluate(() => (document.querySelector('#dragon-art .dragon-react') as any).__marker)).toBe(1)
  // A different outfit does redraw.
  await page.getByRole('link', { name: 'Collection' }).click()
  await tile(page, BOW.id).click()
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(homeWorn(page, BOW.id)).toHaveCount(0)
  expect(await page.evaluate(() => (document.querySelector('#dragon-art .dragon-react') as any).__marker)).toBeUndefined()
})

test('a find goes straight on when its spot is free, and undo takes it off', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, { xp: 700 })
  await open(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  // Logging is still one tap: the log is saved, then the card.
  await expect(card(page)).toBeVisible()
  await expect(card(page).locator('.item-found-name')).toHaveText(BOW.name)
  await expect(card(page).locator('.item-found-saved')).toHaveText('Added to your collection, and wearing it now')
  // Saved straight away, but the dragon behind the card doesn't wear it yet: the card is the reveal.
  expect(await savedWearing(page)).toEqual({ head: BOW.id, neck: null, held: null })
  await expect(homeWorn(page, BOW.id)).toHaveCount(0)
  // The card's lines wrap evenly rather than leaving a word on its own.
  expect(await card(page).locator('.item-found-saved').evaluate((e) => getComputedStyle(e).textWrap)).toContain('balance')
  await closeCard(page)
  await expect(homeWorn(page, BOW.id)).toHaveCount(1)

  // Undo the find: the bow comes off (it isn't found any more).
  await page.locator('#undo').click()
  await expect(page.locator('#toast-text')).toHaveText('Undone. That find is hiding again for now.')
  await expect(homeWorn(page, BOW.id)).toHaveCount(0)
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(page.locator('#dragon-screen .wear-empty')).toHaveText('Nothing yet')
  expect(msgs).toEqual([])
})

test('a find that also brings a stage-up stays hidden until its card closes', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, { xp: 590 }) // a read (25 XP) takes it to Whelp
  await open(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  const overlay = page.locator('.overlay:not(.item-found)')
  await expect(overlay).toBeVisible()
  // Neither the stage-up layers nor Home behind show the find yet.
  await expect(overlay.locator('[data-worn]')).toHaveCount(0)
  await expect(homeWorn(page, BOW.id)).toHaveCount(0)
  await expect(overlay).toHaveClass(/is-revealed/) // revealed after the close guard has passed
  await overlay.locator('.overlay-button').click()
  await expect(card(page)).toBeVisible()
  await expect(homeWorn(page, BOW.id)).toHaveCount(0)
  await closeCard(page)
  await expect(page.locator('.overlay')).toHaveCount(0)
  await expect(homeWorn(page, BOW.id)).toHaveCount(1)
  expect(msgs).toEqual([])
})

test('a find does not replace what is already worn in its spot', async ({ page }) => {
  await seed(page, { xp: 700, finds: [BEANIE.id], wearing: { head: BEANIE.id, neck: null, held: null } })
  await open(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  await expect(card(page).locator('.item-found-name')).toHaveText(BOW.name) // the first not found yet
  await expect(card(page).locator('.item-found-saved')).toHaveText('Added to your collection')
  await closeCard(page)
  await expect(homeWorn(page, BEANIE.id)).toHaveCount(1)
  await expect(homeWorn(page, BOW.id)).toHaveCount(0)
  expect(await savedWearing(page)).toEqual({ head: BEANIE.id, neck: null, held: null })
})

test('as an egg: choices are kept, and show once it hatches', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, { xp: 90, finds: [BOW.id] })
  await open(page)
  await page.getByRole('link', { name: 'Collection' }).click()
  const screen = page.locator('#collection-screen')
  await expect(screen.locator('.cs-hint')).toHaveText('Your dragon will wear these once it hatches.')
  await expect(screen.locator('.cs-art .egg')).toHaveCount(1)
  await tile(page, BOW.id).click()
  await expect(tile(page, BOW.id)).toHaveAttribute('aria-pressed', 'true')
  await expect(csToastText(page)).toHaveText(`Saving the ${lower(BOW.name)} for hatching day`)
  // The egg wears nothing.
  await expect(screen.locator('.cs-art [data-worn]')).toHaveCount(0)
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(page.locator('#dragon-screen .wear-item .wear-name')).toHaveText([BOW.name])
  await expect(page.locator('#dragon-screen .wear-egg')).toHaveText("I'll put these on once I hatch!")

  // Hatch: the new hatchling arrives wearing the bow.
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(0)
  await page.locator('button.task[data-task-id="gym"]').click()
  const overlay = page.locator('.overlay:not(.item-found)')
  await expect(overlay).toBeVisible()
  await expect(overlay.locator(`.is-to [data-worn="${BOW.id}"]`)).toHaveCount(1)
  await expect(overlay.locator('.is-from [data-worn]')).toHaveCount(0)
  await expect(overlay).toHaveClass(/is-revealed/) // revealed after the close guard has passed
  await overlay.locator('.overlay-button').click()
  await expect(homeWorn(page, BOW.id)).toHaveCount(1)
  expect(msgs).toEqual([])
})

test('a find made as an egg says it is kept for after hatching', async ({ page }) => {
  await open(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  await expect(card(page).locator('.item-found-saved')).toHaveText('Added to your collection, ready to wear after hatching')
  expect(await savedWearing(page)).toEqual({ head: BOW.id, neck: null, held: null })
})

test('old saves and malformed outfits load safely', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, { xp: 700, finds: [BOW.id, SCARF.id], wearing: { head: SCARF.id, neck: 42 as never, held: 'from-later' } })
  await open(page)
  await expect(page.locator('#dragon-art .dragon-svg')).toHaveCount(1)
  await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(0)
  await page.getByRole('link', { name: 'Collection' }).click()
  await expect(page.locator('#collection-screen button.item-tile[aria-pressed="true"]')).toHaveCount(0)
  expect(msgs).toEqual([])
})

// Layout: the outfit on every screen at 410 and 360, light and dark. Adult, so the
// hat is as high as it goes; sleepy, so the welcome bubble shows by the head.
for (const scheme of ['light', 'dark'] as const) {
  test(`layout with a full outfit (${scheme})`, async ({ page }) => {
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    const finds = ITEMS.slice(0, 9).map((i) => i.id)
    await seed(page, { xp: 4200, finds, wearing: { head: 'partyhat', neck: SCARF.id, held: 'balloon' }, lastLogDaysAgo: 3 })
    // partyhat and balloon aren't in the first nine: find them too.
    await page.addInitScript(() => {
      const d = JSON.parse(localStorage.getItem('drag-on:v1')!)
      if (!d.events.some((e: any) => e.id === 'pa')) {
        const t = d.events.at(-1).timestamp
        d.events.push({ id: 'pa', type: 'log', taskId: 'avoided', timestamp: t, xpAwarded: 0, reward: { kind: 'item', itemId: 'partyhat' } })
        d.events.push({ id: 'ba', type: 'log', taskId: 'avoided', timestamp: t, xpAwarded: 0, reward: { kind: 'item', itemId: 'balloon' } })
        localStorage.setItem('drag-on:v1', JSON.stringify(d))
      }
    })
    await open(page)
    const vp = page.viewportSize()!

    // Home: wearing all three, the welcome bubble clear of the hat, nothing scrolls.
    await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(3)
    await expect(page.locator('#speech')).toHaveClass(/is-showing/)
    await settle(page)
    const g = await page.evaluate(() => {
      const r = (e: Element) => e.getBoundingClientRect()
      const hat = r(document.querySelector('#dragon-art .worn-head')!)
      const speech = r(document.querySelector('#speech')!)
      return {
        overlap: !(speech.right <= hat.left || speech.left >= hat.right || speech.bottom <= hat.top || speech.top >= hat.bottom),
        docH: document.documentElement.scrollHeight,
        docW: document.documentElement.scrollWidth,
        hatTop: hat.top,
        artTop: r(document.querySelector('.dragon')!).top - 12,
      }
    })
    expect(g.overlap).toBe(false)
    expect(g.docH).toBeLessThanOrEqual(vp.height)
    expect(g.docW).toBeLessThanOrEqual(vp.width)
    await shot(page, `m4s3-home-${scheme}-${test.info().project.name}`)

    // Collection: the preview fits, three tiles across, nothing sideways.
    await page.getByRole('link', { name: 'Collection' }).click()
    const c = await page.evaluate(() => {
      const art = document.querySelector('#collection-screen .cs-art')!.getBoundingClientRect()
      const svg = document.querySelector('#collection-screen .cs-art .dragon-svg')!.getBoundingClientRect()
      const tiles = [...document.querySelectorAll('#collection-screen .item-tile')].map((e) => e.getBoundingClientRect())
      return {
        art: { left: art.left, right: art.right, h: art.height },
        svg: { left: svg.left, right: svg.right },
        perRow: tiles.filter((t) => Math.abs(t.top - tiles[0]!.top) < 1).length,
        minW: Math.min(...tiles.map((t) => t.width)),
        minH: Math.min(...tiles.map((t) => t.height)),
        docW: document.documentElement.scrollWidth,
      }
    })
    expect(c.art.left).toBeGreaterThanOrEqual(0)
    expect(c.svg.right).toBeLessThanOrEqual(vp.width)
    expect(c.art.h).toBeGreaterThan(80)
    expect(c.perRow).toBe(3)
    expect(c.minW).toBeGreaterThanOrEqual(44)
    expect(c.minH).toBeGreaterThanOrEqual(44)
    expect(c.docW).toBeLessThanOrEqual(vp.width)
    await expect(page.locator('#collection-screen [data-worn]')).toHaveCount(3)
    await settle(page)
    await shot(page, `m4s3-collection-${scheme}-${test.info().project.name}`)
    await tile(page, SCARF.id).click()
    await expect(csToast(page)).toHaveClass(/is-showing/)
    await settle(page)
    // The toast never catches a tap meant for a tile under it.
    expect(await csToast(page).evaluate((e) => getComputedStyle(e).pointerEvents)).toBe('none')
    const t = await csToast(page).boundingBox()
    const tab = await page.locator('.tabbar').boundingBox()
    expect(t!.x).toBeGreaterThanOrEqual(0)
    expect(t!.x + t!.width).toBeLessThanOrEqual(vp.width)
    expect(t!.y + t!.height).toBeLessThanOrEqual(tab!.y)
    await shot(page, `m4s3-collection-toast-${scheme}-${test.info().project.name}`)

    // Dragon screen.
    await page.getByRole('link', { name: 'Dragon' }).click()
    await expect(page.locator('#dragon-screen .wear-item')).toHaveCount(2)
    await page.locator('#dragon-screen .wear-list').scrollIntoViewIfNeeded()
    await shot(page, `m4s3-dragon-${scheme}-${test.info().project.name}`)
    expect(msgs).toEqual([])
  })
}

test('Home still fits without scrolling at 410x840 with a full outfit', SWEEPS_SIZES, async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  await page.setViewportSize({ width: 410, height: 840 })
  await seed(page, { xp: 9000, finds: [BEANIE.id, SCARF.id, BOOK.id], wearing: { head: BEANIE.id, neck: SCARF.id, held: BOOK.id } })
  await open(page)
  await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(3)
  const g = await page.evaluate(() => {
    const t = document.querySelector<HTMLElement>('#tasks')!
    const hat = document.querySelector('#dragon-art .worn-head')!.getBoundingClientRect()
    const header = document.querySelector('.top')!.getBoundingClientRect()
    return { docH: document.documentElement.scrollHeight, over: t.scrollHeight - t.clientHeight, hatTop: hat.top, headerBottom: header.bottom }
  })
  expect(g.docH).toBeLessThanOrEqual(840)
  expect(g.over).toBeLessThanOrEqual(0)
  expect(g.hatTop).toBeGreaterThanOrEqual(g.headerBottom)
})

test('curled up and sleepy carry the outfit, under reduced motion too', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seed(page, { xp: 1600, finds: [BEANIE.id, SCARF.id, BOOK.id], wearing: { head: BEANIE.id, neck: SCARF.id, held: BOOK.id }, lastLogDaysAgo: 6 })
  await open(page)
  await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-mood', 'grumpy')
  await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(3)
  // The hat rides inside the posture group, so it moves with the curl.
  expect(await page.locator('#dragon-art .dragon-pose .worn-head').count()).toBe(1)
  await settle(page)
  await shot(page, `m4s3-curled-${test.info().project.name}`)
})

// The welcome bubble keeps clear of the hat, and covers at most a sliver (<10%) of
// anything worn at the neck or held, on every stage that wears things.
for (const [w, h] of [[410, 914], [410, 840], [360, 800]] as const) {
  test(`the welcome bubble keeps clear of worn items at ${w}x${h}`, SWEEPS_SIZES, async ({ browser }, info) => {
    test.skip(info.project.name !== 'pixel10pro')
    test.setTimeout(90_000)
    const logs: string[][] = []
    for (const xp of [200, 700, 1600, 4200, 9000]) {
      for (const outfit of [
        { head: BEANIE.id, neck: SCARF.id, held: BOOK.id },
        { head: 'partyhat', neck: 'bell', held: 'balloon' },
      ]) {
        // A fresh context each time, so each case gets its own welcome.
        const context = await browser.newContext({ ...info.project.use, viewport: { width: w, height: h }, timezoneId: 'Europe/London', locale: 'en-GB', reducedMotion: 'reduce' })
        const ctx = await context.newPage()
        logs.push(collectConsole(ctx))
        await seed(ctx, { xp, finds: [outfit.head, outfit.neck, outfit.held], wearing: outfit, lastLogDaysAgo: 3 })
        await open(ctx)
        await expect(ctx.locator('#speech')).toHaveClass(/is-showing/)
        await settle(ctx)
        const g = await ctx.evaluate(() => {
          const r = (s: string) => document.querySelector(s)!.getBoundingClientRect()
          const bubble = r('#speech')
          const cover = (b: DOMRect) => {
            const x = Math.max(0, Math.min(bubble.right, b.right) - Math.max(bubble.left, b.left))
            const y = Math.max(0, Math.min(bubble.bottom, b.bottom) - Math.max(bubble.top, b.top))
            return (x * y) / (b.width * b.height)
          }
          return {
            neck: cover(r('#dragon-art .worn-neck')),
            held: cover(r('#dragon-art .worn-held')),
            hat: cover(r('#dragon-art .worn-head')),
            inView: bubble.left >= 0 && bubble.right <= innerWidth && bubble.top >= 0,
            docH: document.documentElement.scrollHeight,
          }
        })
        const name = `${w}x${h} xp ${xp} ${outfit.head}`
        expect(g.neck, name).toBeLessThan(0.1)
        expect(g.held, name).toBeLessThan(0.1)
        expect(g.hat, name).toBe(0)
        expect(g.inView, name).toBe(true)
        expect(g.docH, name).toBeLessThanOrEqual(h)
        if (xp === 1600 && outfit.head === BEANIE.id) await shot(ctx, `m4s3-bubble-${w}x${h}`)
        await context.close()
      }
    }
    expect(logs.flat()).toEqual([])
  })
}
