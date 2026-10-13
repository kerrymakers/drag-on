// The phone sweep: the phone tester's every-round check, run with `npm run phone:sweep`
// (one screen only: `npm run phone:sweep -- --grep dragon`). For each screen and the
// common overlays, at 410×914 and 360×800, light and dark, with reduced motion, it:
// - saves a DPR 1 screenshot to tests/screenshots/sweep/<size>-<scheme>-<screen>.png;
// - measures every visible button, link, [role=button] and input (under 44×44 is a problem,
//   after allowing for a hit area that reaches past the box, e.g. a ::before);
// - records console errors and warnings;
// - checks nothing runs off the side (no horizontal scroll, no element past the edges).
// Once per run: a one-tap log on Home shows feedback, and a log made offline survives a reload.
// Results go to tests/screenshots/sweep/summary.txt (written by sweep-global.ts); read that first.
// It only fails on real problems. Not part of test:e2e: playwright.config.ts picks up
// tests/tools/ only when SWEEP=1.
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test, expect, settle, SWEEPS_SIZES, type Page, type ConsoleMessage } from '../e2e/fixtures'
import { TASKS } from '../../src/config/tasks'
import { REWARDS } from '../../src/config/rewards'
import { RESULTS_DIR, SWEEP_DIR, type SweepResult } from './sweep-global'

test.describe.configure({ mode: 'parallel' })

// Wednesday 7 October 2026, 10:00 BST. Nothing logged yet today.
const NOW = new Date('2026-10-07T10:00:00+01:00')
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const RARE_ROLL = REWARDS.rareChance / 3
const SIZES = [
  { name: '410', viewport: { width: 410, height: 914 } },
  { name: '360', viewport: { width: 360, height: 800 } },
] as const
const SCHEMES = ['light', 'dark'] as const

// --- Seeded state --------------------------------------------------------------------

const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000).toISOString().slice(0, 10)
const at = (key: string, hm: string) => new Date(`${key}T${hm}:00+01:00`).getTime()

/**
 * Mid-game: a hatched dragon with four weeks of history (weekday wake-ups, one task an
 * evening, one missed day), a treat, two finds, both worn. The same shape as the seed in
 * tests/e2e/history.spec.ts (spec-local helpers can't be imported without their tests).
 */
function midGame() {
  const events: object[] = []
  const log = (taskId: string, ts: number, extra: object = {}) =>
    events.push({ id: `e${events.length}`, type: 'log', taskId, timestamp: ts, xpAwarded: XP(taskId), ...extra })
  for (let k = -27; k <= -1; k++) {
    const d = day(k)
    if (k === -17) continue
    const wd = new Date(`${d}T12:00:00Z`).getUTCDay()
    if (wd >= 1 && wd <= 5) log('wake', at(d, '06:20'))
    log(['gym', 'walk', 'read', 'selfcare'][(k + 40) % 4]!, at(d, '19:00'), k === -2 ? { reward: { kind: 'treat', bonusXp: 6 } } : {})
    if (k === -3) log('avoided', at(d, '20:00'), { reward: { kind: 'item', itemId: 'bow' } })
    if (k === -9) log('avoided', at(d, '20:00'), { reward: { kind: 'item', itemId: 'scarf' } })
  }
  return { schemaVersion: 1, events, settings: { wearing: { head: 'bow', neck: 'scarf', held: null } } }
}

/** Seeds saved data once per test (sessionStorage flag), so reloads don't reseed. As in the e2e specs. */
async function open(page: Page, hash = '#/', data: object | null = midGame()) {
  if (data)
    await page.addInitScript((d) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('drag-on:v1', JSON.stringify(d))
        sessionStorage.setItem('seeded', '1')
      }
    }, data)
  await page.clock.install({ time: NOW })
  await page.goto(`./${hash}`)
  await expect(page.locator('#tabbar a').first()).toBeVisible()
}

// --- Checks --------------------------------------------------------------------------

/** Tap targets under 44×44 (allowing for hit areas past the box) and things past the side edges. */
async function measure(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = []
    const vw = innerWidth
    const doc = document.scrollingElement!
    if (doc.scrollWidth > vw + 0.5) out.push(`horizontal scroll: page is ${doc.scrollWidth}px wide in a ${vw}px viewport`)
    // An open dialog or overlay is modal: only it can be tapped.
    const scope = document.querySelector('dialog[open], .overlay[role=dialog]') ?? document.body
    const shown = (e: Element) => e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && e.getBoundingClientRect().width > 0
    const label = (e: Element) => {
      const id = e.id ? `#${e.id}` : e.classList[0] ? `.${e.classList[0]}` : ''
      const text = (e.getAttribute('aria-label') ?? e.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 24)
      return `${e.tagName.toLowerCase()}${id}${text ? ` "${text}"` : ''}`
    }
    // Tap targets.
    for (const e of scope.querySelectorAll<HTMLElement>('button, a[href], [role=button], input, select, textarea')) {
      if (!shown(e) || e.closest('[inert]')) continue
      let r = e.getBoundingClientRect()
      // Visually hidden (sr-only) controls, like a file input opened by its own button, aren't tapped.
      if ((r.width >= 44 && r.height >= 44) || r.width <= 1 || r.height <= 1) continue
      e.scrollIntoView({ block: 'center', inline: 'center' })
      r = e.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      // Walk out from the centre until a tap there stops landing on the element.
      const reach = (dx: number, dy: number) => {
        let k = 0
        while (k < 40 && e.contains(document.elementFromPoint(cx + dx * (k + 1), cy + dy * (k + 1)))) k++
        return k
      }
      const centreHits = e.contains(document.elementFromPoint(cx, cy))
      const w = centreHits ? reach(-1, 0) + reach(1, 0) + 1 : r.width
      const h = centreHits ? reach(0, -1) + reach(0, 1) + 1 : r.height
      if (w < 44 || h < 44) out.push(`small tap target: ${label(e)} ${Math.round(w)}×${Math.round(h)}`)
    }
    // Past the side edges (cut off, or scrolled sideways). The app has no sideways
    // scrollers on purpose. Decorative (aria-hidden) scene and dragon art may run past.
    const wide = [...scope.querySelectorAll('*')].filter((e) => {
      if (!shown(e) || e.closest('[aria-hidden=true], svg')) return false
      const r = e.getBoundingClientRect()
      return r.right > vw + 0.5 || r.left < -0.5
    })
    // Report the outermost ones only.
    for (const e of wide.filter((e) => !wide.some((o) => o !== e && o.contains(e))).slice(0, 5)) {
      const r = e.getBoundingClientRect()
      out.push(`past the edge: ${label(e)} spans ${Math.round(r.left)} to ${Math.round(r.right)}`)
    }
    return out
  })
}

interface Check {
  page: Page
  problems: string[]
  notes: string[]
  shots: string[]
}

/** Runs a check, collecting console errors and warnings, and writes its result for the summary. */
async function sweep(page: Page, name: string, body: (c: Check) => Promise<void>, ignore: RegExp | null = null) {
  const c: Check = { page, problems: [], notes: [], shots: [] }
  const consoleMsg = (m: ConsoleMessage) => {
    if ((m.type() === 'error' || m.type() === 'warning') && !ignore?.test(m.text())) c.problems.push(`console ${m.type()}: ${m.text().slice(0, 160)}`)
  }
  page.on('console', consoleMsg)
  page.on('pageerror', (e) => c.problems.push(`page error: ${e.message.slice(0, 160)}`))
  try {
    await body(c)
  } catch (e) {
    c.problems.push(`check failed: ${String((e as Error).message).split('\n')[0]!.slice(0, 200)}`)
  }
  const result: SweepResult = { name, problems: c.problems, notes: c.notes, shots: c.shots }
  writeFileSync(join(RESULTS_DIR, `${name.replace(/[^\w-]+/g, '_')}.json`), JSON.stringify(result))
  expect(c.problems, c.problems.join('\n')).toEqual([])
}

/** Settles, screenshots (at DPR 1, set on the context) and measures. */
async function look(c: Check, file: string) {
  await settle(c.page)
  await c.page.screenshot({ path: join(SWEEP_DIR, `${file}.png`) })
  c.shots.push(`${file}.png`)
  c.problems.push(...(await measure(c.page)))
}

// --- Screens and overlays ------------------------------------------------------------

/** How to reach each one from a fresh page. */
const VIEWS: Record<string, (page: Page) => Promise<void>> = {
  home: (page) => open(page, '#/'),
  dragon: (page) => open(page, '#/dragon'),
  collection: (page) => open(page, '#/collection'),
  history: (page) => open(page, '#/history'),
  settings: (page) => open(page, '#/settings'),
  // The edit sheet for a task, from Settings.
  'task-sheet': async (page) => {
    await open(page, '#/settings')
    await page.locator('.ss-task-row').first().click()
    await expect(page.locator('dialog.task-sheet')).toBeVisible()
  },
  // The card for a rare find, after a one-tap log on Home.
  'item-found': async (page) => {
    await page.addInitScript((r) => (Math.random = () => r), RARE_ROLL)
    await open(page, '#/')
    await page.locator('#task-list button.task:enabled').first().click()
    await expect(page.locator('.overlay.item-found')).toBeVisible()
  },
}

test.describe('sweep', SWEEPS_SIZES, () => {
  for (const size of SIZES)
    for (const scheme of SCHEMES)
      test.describe(() => {
        test.use({ viewport: size.viewport, deviceScaleFactor: 1, colorScheme: scheme, reducedMotion: 'reduce', timezoneId: 'Europe/London', locale: 'en-GB' })
        for (const [view, reach] of Object.entries(VIEWS))
          test(`${view} ${size.name} ${scheme}`, async ({ page }) => {
            await sweep(page, `${size.name}-${scheme}-${view}`, async (c) => {
              await reach(page)
              await look(c, `${size.name}-${scheme}-${view}`)
            })
          })
      })

  test.describe(() => {
    test.use({ viewport: SIZES[0].viewport, deviceScaleFactor: 1, colorScheme: 'light', reducedMotion: 'reduce', timezoneId: 'Europe/London', locale: 'en-GB' })

    test('egg-home 410 light', async ({ page }) => {
      await sweep(page, '410-light-egg-home', async (c) => {
        await open(page, '#/', null)
        await look(c, '410-light-egg-home')
      })
    })

    test('home logging: one tap gives feedback', async ({ page }) => {
      await sweep(page, 'once-home-one-tap-log', async (c) => {
        await open(page, '#/')
        const xp = Number(await page.locator('#xp-total').textContent())
        const task = page.locator('#task-list button.task:enabled').first()
        const id = await task.getAttribute('data-task-id')
        await task.click()
        await expect(page.locator('#toast-text')).toContainText('XP')
        await expect(page.locator('#xp-total')).not.toHaveText(String(xp))
        c.notes.push(`logged ${id}: toast "${await page.locator('#toast-text').textContent()}"`)
        await look(c, 'once-410-light-home-after-log')
      })
    })

    test('home offline: a log made offline survives a reload', async ({ page, context }) => {
      await sweep(
        page,
        'once-home-offline-reload',
        async (c) => {
          await open(page, '#/')
          // Going offline before the service worker controls the page would test nothing.
          await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15_000 })
          await context.setOffline(true)
          const before = await page.locator('#xp-total').textContent()
          await page.locator('#task-list button.task:enabled').first().click()
          await expect(page.locator('#toast-text')).toContainText('XP')
          const after = await page.locator('#xp-total').textContent()
          expect(after).not.toBe(before)
          await page.reload()
          await expect(page.locator('#xp-total')).toHaveText(after!)
          c.notes.push(`XP ${before} -> ${after}, kept after an offline reload`)
          await context.setOffline(false)
        },
        /ERR_INTERNET_DISCONNECTED/,
      )
    })
  })
})
