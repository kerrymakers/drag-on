// Milestone 3, Slice 2: the evolution look.
import { test, expect, type Page } from '@playwright/test'
import { LOOK_CHANGE_MARGIN } from '../../src/config/evolution'
import { STAGES } from '../../src/config/stages'
import { TASKS } from '../../src/config/tasks'
import { LOOK_NAMES } from '../../src/ui/copy'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const TUE_1000 = new Date('2026-10-06T10:00:00+01:00')
const OLD = Date.parse('2026-10-01T12:00:00+01:00')
const from = (id: string) => STAGES.find((s) => s.id === id)!.xpFrom
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const shotDir = 'tests/screenshots'

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

let n = 0
const log = (taskId: string, xp: number, extra: object = {}) => ({
  id: `seed${++n}`,
  type: 'log',
  taskId,
  timestamp: OLD + n * 60_000,
  xpAwarded: xp,
  ...extra,
})

const homeLook = (page: Page) => page.locator('#dragon-art .dragon-react').getAttribute('data-look')

/** Every look name, so we can check none leaks before it's reached. */
const ALL_NAMES = Object.values(LOOK_NAMES)

test('before Juvenile there is no look, and no look name anywhere', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, [log('gym', from('juvenile') - 100, { stageReached: 'whelp' })])
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./#/dragon')
  const screen = page.locator('#dragon-screen')
  await expect(screen.locator('.stage-name')).toHaveText('Whelp')
  await expect(screen.locator('.look-chip')).toBeHidden()
  expect(await screen.locator('.dragon-svg').getAttribute('data-evolution')).toBe('neutral')
  const html = await page.evaluate(() => document.body.innerHTML)
  for (const name of ALL_NAMES) expect(html).not.toContain(name)
  expect(msgs).toEqual([])
})

for (const motion of ['no-preference', 'reduce'] as const) {
  test(`reaching Juvenile reveals the look in the stage-up overlay (${motion})`, async ({ page }, info) => {
    const msgs = collectConsole(page)
    await page.emulateMedia({ reducedMotion: motion })
    // Strength leads; one more gym log reaches Juvenile.
    await seed(page, [
      log('read', 200),
      log('gym', from('juvenile') - 200 - 10, { stageReached: 'whelp' }),
    ])
    await page.clock.setFixedTime(TUE_1000)
    await page.goto('./')
    expect(await homeLook(page)).toBe('whelp')
    await page.locator('button.task[data-task-id="gym"]').click()

    const overlay = page.getByRole('dialog')
    await expect(overlay).toBeVisible()
    await expect(page.locator('.overlay')).toHaveClass(/is-revealed/, { timeout: 4000 })
    if (motion === 'reduce') await expect(page.locator('.overlay')).toHaveClass(/is-calm/)
    const to = page.locator('.overlay-layer.is-to .dragon-svg')
    expect(await to.getAttribute('data-stage')).toBe('juvenile')
    expect(await to.getAttribute('data-evolution')).toBe('strength')
    expect(await page.locator('.overlay-layer.is-from .dragon-svg').getAttribute('data-evolution')).toBe('neutral')
    await expect(page.locator('.overlay-sub')).toContainText(LOOK_NAMES.strength)
    await expect(page.locator('.overlay-sub')).toBeInViewport()
    const btn = await page.locator('.overlay-button').boundingBox()
    expect(btn!.height).toBeGreaterThanOrEqual(44)
    expect(btn!.y + btn!.height).toBeLessThanOrEqual(page.viewportSize()!.height)
    await page.screenshot({ path: `${shotDir}/m3s2-${info.project.name}-juvenile-reveal-${motion}.png` })

    await page.locator('.overlay-button').click()
    await expect(page.locator('.overlay')).toHaveCount(0)
    expect(await homeLook(page)).toBe('juvenile-strength')

    // The Dragon screen names the look near the stage.
    await page.getByRole('link', { name: 'Dragon' }).click()
    const chip = page.locator('#dragon-screen .look-chip')
    await expect(chip).toBeVisible()
    await expect(chip).toHaveText(`${LOOK_NAMES.strength} dragon`)
    expect(await chip.getAttribute('data-look')).toBe('strength')
    expect(await page.locator('#dragon-screen .dragon-svg').getAttribute('data-evolution')).toBe('strength')
    // Other look names stay a surprise.
    const html = await page.evaluate(() => document.body.innerHTML)
    for (const name of ALL_NAMES.filter((x) => x !== LOOK_NAMES.strength)) expect(html).not.toContain(name)
    await page.screenshot({ path: `${shotDir}/m3s2-${info.project.name}-dragon-screen-strength-${motion}.png` })
    expect(msgs).toEqual([])
  })
}

test('a first-time change of look gets a gentle celebration, and undo reverts it quietly', async ({ page }, info) => {
  const msgs = collectConsole(page)
  const strength = from('juvenile')
  // Wisdom is just inside the margin: one read log takes it more than the margin ahead.
  const wisdom = Math.floor(strength * (1 + LOOK_CHANGE_MARGIN)) - XP('read') + 5
  expect(wisdom).toBeLessThanOrEqual(strength * (1 + LOOK_CHANGE_MARGIN))
  expect(wisdom + XP('read')).toBeGreaterThan(strength * (1 + LOOK_CHANGE_MARGIN))
  expect(strength + wisdom + XP('read')).toBeLessThan(from('adult'))
  await seed(page, [log('gym', strength, { stageReached: 'juvenile' }), log('read', wisdom)])
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  expect(await homeLook(page)).toBe('juvenile-strength')

  await page.locator('button.task[data-task-id="read"]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('.overlay')).toHaveClass(/reveal-shimmer/)
  await expect(page.locator('.overlay')).toHaveClass(/is-revealed/, { timeout: 4000 })
  expect(await page.locator('.overlay-layer.is-from .dragon-svg').getAttribute('data-evolution')).toBe('strength')
  expect(await page.locator('.overlay-layer.is-to .dragon-svg').getAttribute('data-evolution')).toBe('wisdom')
  expect(await page.locator('.overlay-layer.is-to .dragon-svg').getAttribute('data-stage')).toBe('juvenile')
  await expect(page.locator('.overlay-message')).toContainText(LOOK_NAMES.wisdom)
  await expect(page.locator('.overlay-sub')).toHaveCount(0)
  await page.screenshot({ path: `${shotDir}/m3s2-${info.project.name}-look-change.png` })
  await page.locator('.overlay-button').click()
  await expect(page.locator('.overlay')).toHaveCount(0)
  expect(await homeLook(page)).toBe('juvenile-wisdom')
  await expect(page.locator('#stage-name')).toHaveText('Juvenile')

  // Undo goes back to the earlier look, with no celebration.
  await page.locator('#undo').click()
  await page.waitForTimeout(800)
  await expect(page.locator('.overlay')).toHaveCount(0)
  expect(await homeLook(page)).toBe('juvenile-strength')
  expect(msgs).toEqual([])
})

test('changing back to a look seen before happens quietly', async ({ page }) => {
  const msgs = collectConsole(page)
  const s1 = from('juvenile')
  const w = Math.ceil(s1 * (1 + LOOK_CHANGE_MARGIN)) + 50 // wisdom takes over: both looks seen
  const bar = w * (1 + LOOK_CHANGE_MARGIN)
  const s2 = Math.floor(bar) - s1 - XP('gym') + 5 // one gym log takes strength back over
  expect(s1 + s2).toBeLessThanOrEqual(bar)
  expect(s1 + s2 + XP('gym')).toBeGreaterThan(bar)
  expect(s1 + w + s2 + XP('gym')).toBeLessThan(from('adult'))
  await seed(page, [log('gym', s1, { stageReached: 'juvenile' }), log('read', w), log('walk', s2)])
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  expect(await homeLook(page)).toBe('juvenile-wisdom')

  await page.locator('button.task[data-task-id="gym"]').click()
  await expect.poll(() => homeLook(page)).toBe('juvenile-strength')
  await page.waitForTimeout(800)
  await expect(page.locator('.overlay')).toHaveCount(0)
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(page.locator('#dragon-screen .look-chip')).toHaveText(`${LOOK_NAMES.strength} dragon`)
  expect(msgs).toEqual([])
})

test('every look draws cleanly at every grown stage, mood and scheme', async ({ page }, info) => {
  test.skip(info.project.name !== 'narrow360') // the narrowest supported width
  const msgs = collectConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: TUE_1000 })
  await page.goto('./')
  const looks = { strength: 'gym', discipline: 'avoided', wisdom: 'read', heart: 'selfcare' } as const
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    for (const stage of ['juvenile', 'adult', 'elder']) {
      for (const [look, taskId] of Object.entries(looks)) {
        for (const [mood, daysAgo] of [['happy', 0], ['content', 1], ['sleepy', 3], ['grumpy', 5]] as const) {
          await page.evaluate(
            ({ xp, taskId, stage, ts }) =>
              localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: [{ id: 's', type: 'log', taskId, timestamp: ts, xpAwarded: xp, stageReached: stage }] })),
            { xp: from(stage) + 10, taskId, stage, ts: TUE_1000.getTime() - daysAgo * 86_400_000 },
          )
          await page.reload()
          const svg = page.locator('#dragon-art .dragon-svg')
          await expect(svg).toHaveAttribute('data-evolution', look)
          await expect(svg).toHaveAttribute('data-stage', stage)
          await expect(svg).toHaveAttribute('data-mood', mood)
          const fit = await page.evaluate(() => {
            const b = document.querySelector('#dragon-art .dragon-body')!.getBoundingClientRect()
            const area = document.querySelector('.dragon')!.getBoundingClientRect()
            return { l: b.left, r: b.right, t: b.top, b: b.bottom, aT: area.top, aB: area.bottom, w: document.documentElement.scrollWidth }
          })
          expect(fit.l, `${stage} ${look} ${mood}`).toBeGreaterThanOrEqual(-1)
          expect(fit.r, `${stage} ${look} ${mood}`).toBeLessThanOrEqual(361)
          expect(fit.w).toBeLessThanOrEqual(360)
          if (mood === 'sleepy' || (mood === 'happy' && stage !== 'adult')) {
            await page.locator('#dragon-art').screenshot({ path: `${shotDir}/m3s2-${scheme}-${stage}-${look}-${mood}.png` })
          }
        }
      }
    }
  }
  expect(msgs).toEqual([])
})

test('a lost popstate does not leave the tab bar ignoring taps', async ({ page }) => {
  const msgs = collectConsole(page)
  await page.clock.setFixedTime(TUE_1000)
  await page.goto('./')
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(page.locator('#dragon-screen')).toBeVisible()
  // Swallow the back() so its popstate never arrives.
  await page.evaluate(() => {
    const w = window as any
    w.__back = history.back.bind(history)
    history.back = () => {}
  })
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.locator('#dragon-screen')).toBeVisible()
  await page.evaluate(() => {
    history.back = (window as any).__back
  })
  await page.waitForTimeout(700) // past the guard's fallback
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.locator('#home')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  expect(msgs).toEqual([])
})
