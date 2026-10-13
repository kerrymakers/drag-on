import { test, expect, schemesFor, settle, shot, SWEEPS_SIZES, type Page } from './fixtures'
test.use({ timezoneId: 'Europe/London' })

// Tuesday mid-morning: wake window closed, all other tasks open.
const TUE_1000 = new Date('2026-10-06T10:00:00+01:00')

/** Seeds saved data once per test, so reloads don't reseed. */
async function seedXp(page: Page, xp: number) {
  const data = {
    schemaVersion: 1,
    events: xp
      ? [{ id: 'seed1', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-10-01T12:00:00+01:00'), xpAwarded: xp }]
      : [],
  }
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('drag-on:v1', JSON.stringify(d))
      sessionStorage.setItem('seeded', '1')
    }
  }, data)
}

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const r = (s: string) => {
      const e = document.querySelector(s)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }
    }
    return {
      scrollH: document.documentElement.scrollHeight,
      scrollW: document.documentElement.scrollWidth,
      art: r('#dragon-art .dragon-svg'),
      eyes: r('#dragon-art .hatchling-eyes'),
      toast: document.querySelector('#toast.is-showing') ? r('#toast') : null,
      toastUndo: document.querySelector('#toast.is-showing') ? r('#toast-undo') : null,
      label: r('.growth-row'),
      firstTask: r('.task'),
      undo: r('#undo'),
      overlayArt: r('.overlay-art'),
      overlayMsg: r('.overlay-message'),
      overlayBtn: r('.overlay-button'),
    }
  })
}

const SIZES = [
  [410, 914],
  [360, 800],
  [410, 800],
  [360, 680],
] as const

for (const [i, [w, h]] of SIZES.entries()) {
  for (const scheme of schemesFor(i)) {
    test.describe(`viewport ${w}x${h} ${scheme}`, SWEEPS_SIZES, () => {
      test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel10pro'))
      test.use({ viewport: { width: w, height: h } })
      const tag = `s3-${w}x${h}-${scheme}`

      for (const [name, xp] of [['egg0', 0], ['egg60', 60], ['egg85', 85], ['hatchling', 130]] as const) {
        test(name, async ({ page }) => {
          const msgs = collectConsole(page)
          await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
          await seedXp(page, xp)
          await page.clock.install({ time: TUE_1000 })
          await page.goto('./')
          await expect(page.locator('.task').first()).toBeVisible()
          const g = await geometry(page)
          expect(g.scrollW).toBeLessThanOrEqual(w)
          expect(g.scrollH).toBeLessThanOrEqual(h)
          await shot(page, `${tag}-${name}`)
          expect(msgs).toEqual([])
        })
      }

      test('toast', async ({ page }) => {
        const msgs = collectConsole(page)
        await page.emulateMedia({ colorScheme: scheme })
        await seedXp(page, 130)
        await page.clock.setFixedTime(TUE_1000)
        await page.goto('./')
        await page.locator('button.task[data-task-id="avoided"]').click()
        await expect(page.locator('.float-xp')).toHaveCount(0) // float and wiggle done, toast still up
        await settle(page)
        await expect(page.locator('#toast')).toHaveClass(/is-showing/)
        const g = await geometry(page)
        // The toast must sit above the bar label and never over a task button.
        expect(g.toast!.bottom).toBeLessThanOrEqual(g.label!.top)
        expect(g.toast!.bottom).toBeLessThanOrEqual(g.firstTask!.top)
        expect(g.toast!.left).toBeGreaterThanOrEqual(0)
        expect(g.toast!.right).toBeLessThanOrEqual(w)
        expect(g.toastUndo!.w).toBeGreaterThanOrEqual(44)
        expect(g.toastUndo!.h).toBeGreaterThanOrEqual(44)
        await shot(page, `${tag}-toast`)
        expect(msgs).toEqual([])
      })

      test('hatch overlay final', async ({ page }) => {
        const msgs = collectConsole(page)
        await page.emulateMedia({ colorScheme: scheme })
        await seedXp(page, 85)
        await page.clock.setFixedTime(TUE_1000)
        await page.goto('./')
        await page.locator('button.task[data-task-id="gym"]').click()
        await expect(page.getByRole('dialog')).toBeVisible()
        await expect(page.locator('.overlay')).toHaveClass(/is-revealed/)
        await settle(page)
        const g = await geometry(page)
        expect(g.overlayBtn!.h).toBeGreaterThanOrEqual(44)
        expect(g.overlayBtn!.bottom).toBeLessThanOrEqual(h)
        expect(g.overlayArt!.top).toBeGreaterThanOrEqual(0)
        await shot(page, `${tag}-overlay`)
        expect(msgs).toEqual([])
      })
    })
  }
}

for (const [w, h] of [[410, 800], [360, 680]] as const) {
  test(`short viewport ${w}x${h}`, SWEEPS_SIZES, async ({ page }, info) => {
    test.skip(info.project.name !== 'pixel10pro')
    await page.setViewportSize({ width: w, height: h })
    await page.clock.install({ time: new Date('2026-10-06T06:00:00+01:00') })
    await page.goto('./')
    await page.locator('button.task[data-task-id="gym"]').click()
    const r = await page.evaluate(() => ({
      scrollH: document.documentElement.scrollHeight,
      undoBottom: document.querySelector('#undo')!.getBoundingClientRect().bottom,
    }))
    expect(r.scrollH).toBeLessThanOrEqual(h)
    expect(r.undoBottom).toBeLessThanOrEqual(h)
    await shot(page, `home-short-${w}x${h}`)
  })
}

test('notice at 360x680 leaves the dragon visible', SWEEPS_SIZES, async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  await page.setViewportSize({ width: 360, height: 680 })
  await page.addInitScript(() => {
    localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 2, events: [] }))
  })
  await page.clock.install({ time: TUE_1000 })
  await page.goto('./')
  await expect(page.locator('#notice')).toBeVisible()
  const g = await geometry(page)
  expect(g.scrollH).toBeLessThanOrEqual(680)
  await shot(page, `s3-360x680-notice`)
})
