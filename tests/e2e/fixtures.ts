// Shared Playwright fixtures. Every log rolls for a variable reward with Math.random,
// so by default the page's Math.random is pinned to a roll that brings nothing: specs
// that check exact XP, floats and toasts stay deterministic. A spec that wants a
// reward adds its own init script, which runs after this one and wins.
// For the same reason the app makes no secret-wish seed (__dragOnNoWishSeed), so no
// wish is ever granted (src/main.ts then passes startApp a makeSeed that makes none);
// a spec that wants one saves a missionSeed in its settings. That flag goes on every
// browser context, including ones a spec makes itself with browser.newContext, so no
// spec can miss it. (It never needs overriding, so the undefined order of context and
// page init scripts doesn't matter; the Math.random pin stays on the page, where a
// spec's own pin is sure to run after it.)
// Likewise first-run setup is skipped (__dragOnSkipSetup), so a spec that starts with
// nothing saved lands on Home. tests/e2e/setup.spec.ts turns that off with
// `test.use({ skipSetup: false })`: a worker option, set in the same init script, so
// there's no order of scripts to race.
import { test as base, expect, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { MISSION } from '../../src/config/missions'
import { TASKS } from '../../src/config/tasks'
import { missionFor } from '../../src/game/mission'

export * from '@playwright/test'

const testFlags = (context: BrowserContext, skipSetup: boolean) =>
  context.addInitScript((skip) => {
    const w = window as { __dragOnNoWishSeed?: boolean; __dragOnSkipSetup?: boolean }
    w.__dragOnNoWishSeed = true
    w.__dragOnSkipSetup = skip
  }, skipSetup)

export const test = base.extend<{}, { skipSetup: boolean }>({
  skipSetup: [true, { scope: 'worker', option: true }],
  browser: [
    async ({ browser, skipSetup }, use) => {
      const newContext = browser.newContext.bind(browser)
      browser.newContext = async (options) => {
        const context = await newContext(options)
        await testFlags(context, skipSetup)
        return context
      }
      await use(browser)
    },
    { scope: 'worker' },
  ],
  context: async ({ context, skipSetup }, use) => {
    await testFlags(context, skipSetup)
    await use(context)
  },
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      Math.random = () => 0.9999
    })
    await use(page)
  },
})

/**
 * For tests that loop over viewport sizes themselves: they run once, in pixel10pro,
 * and narrow360 leaves them out (see grepInvert in playwright.config.ts).
 * Use as `test('name', SWEEPS_SIZES, async ...)` or on a `test.describe`.
 */
export const SWEEPS_SIZES = { tag: '@sweeps-sizes' }

/**
 * For tests that check geometry, fit, overlap, tap-target size or anything else that
 * depends on the width: they run in pixel10pro and again in narrow360 (see grep in
 * playwright.config.ts). Every other test runs once, in pixel10pro.
 * Use as `test('name', LAYOUT, async ...)` or on a `test.describe`.
 */
export const LAYOUT = { tag: '@layout' }

/**
 * Closes an overlay (the stage-up or a find card) with `close` (a tap or Escape), waiting
 * out its close guard: overlays ignore taps for CLOSE_GUARD_MS after opening (see
 * src/ui/overlay.ts), so this tries again until one lands (the overlay gets .is-closing),
 * then waits for it to go. No fixed wait.
 */
export async function closePastGuard(overlay: Locator, close: () => Promise<unknown>) {
  // It must be open first, or "gone" below would pass without closing anything.
  await expect(overlay).toBeVisible()
  // evaluateAll never waits, so an overlay removed mid-check (at once under reduced
  // motion) can't hang it; an empty list means it's already gone.
  const classes = () => overlay.evaluateAll((els) => els.map((e) => e.className))
  await expect(async () => {
    if ((await classes()).length) await close()
    expect((await classes()).every((c) => /\bis-closing\b/.test(c))).toBe(true)
  }).toPass({ intervals: [100], timeout: 5000 })
  await expect(overlay).toHaveCount(0)
}

/**
 * Seeds the saved data (an object, or a string stored as-is) before the app loads, once
 * per tab: a sessionStorage guard stops a reload from putting it back, so a test can
 * reload to see what the app saved. Call before `page.goto`.
 */
export async function seedStore(page: Page, data: object | string) {
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear()
      localStorage.setItem('drag-on:v1', d)
      sessionStorage.setItem('seeded', '1')
    }
  }, typeof data === 'string' ? data : JSON.stringify(data))
}

/**
 * A missionSeed whose secret wish on `day` (a dayKey) is `id`, with the default tasks
 * and nothing logged, found through the game's own pick. Save it in the seeded
 * settings to get that wish.
 */
export function seedForMission(day: string, id: string): string {
  for (let i = 0; i < 500; i++) {
    const seed = `e2e-${i}`
    if (missionFor(day, seed, TASKS, [], MISSION)?.id === id) return seed
  }
  throw new Error(`No seed in 500 gives the wish ${id} on ${day}`)
}

const SHOT_DIR = 'tests/screenshots'
const SHOTS = process.env.SCREENSHOTS === '1' || process.env.E2E_FULL === '1'

/**
 * The colour schemes to check for the i-th entry of a sweep (a size, a stage-up).
 * Light and dark lay out the same, so an ordinary run checks each entry in one scheme,
 * in the pattern light, dark, dark, light (repeating): in a list that alternates 410 and
 * 360 wide, both widths get both schemes. A screenshot run (SCREENSHOTS=1, or the full
 * run) does both for every entry, for the pictures. Use for geometry, never for colour
 * or contrast checks.
 */
export function schemesFor(i: number): readonly ('light' | 'dark')[] {
  if (SHOTS) return ['light', 'dark']
  return [i % 4 === 1 || i % 4 === 2 ? 'dark' : 'light']
}

/**
 * Saves a screenshot to tests/screenshots/<name>.png, but only when asked for
 * (SCREENSHOTS=1, or the full run with E2E_FULL=1), so ordinary runs skip the work.
 * - `of`: shoot just this element (a selector) rather than the page.
 * - `settled`: wait for animations to finish first (see `settle`).
 * - `delay`: wait this long first, for a deliberate mid-animation shot.
 * The waits only happen when a screenshot is taken.
 */
export async function shot(page: Page, name: string, opts: { of?: string; settled?: boolean; delay?: number } = {}) {
  if (!SHOTS) return
  if (opts.settled) await settle(page)
  if (opts.delay) await page.waitForTimeout(opts.delay)
  const path = `${SHOT_DIR}/${name}.png`
  if (opts.of) await page.locator(opts.of).screenshot({ path })
  else await page.screenshot({ path })
}

/**
 * Waits until every animation and transition that will end has ended, so geometry
 * and screenshots show the resting layout. Endless idle loops (breathing, wobble)
 * are ignored. Waits two frames first, so ones about to start are counted.
 * Needs time to keep flowing: fine with `page.clock.install` and `setFixedTime`, but it
 * will hang after `page.clock.pauseAt` (frames and animations stop until the clock is resumed).
 */
export async function settle(page: Page) {
  await page.evaluate(async () => {
    const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)))
    const finite = (a: Animation) => {
      const end = a.effect?.getComputedTiming().endTime
      return typeof end === 'number' && Number.isFinite(end)
    }
    // Counted in rounds rather than by the clock: tests often fake or freeze Date.
    let rounds = 0
    await frame()
    await frame()
    for (;;) {
      const busy = document.getAnimations().filter((a) => a.playState === 'running' && finite(a))
      if (!busy.length) return
      if (++rounds > 100) {
        const names = busy.map((a) => (a as CSSAnimation).animationName ?? (a as CSSTransition).transitionProperty)
        throw new Error(`Animations still running after ~10s: ${names.join(', ')}`)
      }
      await Promise.race([Promise.allSettled(busy.map((a) => a.finished)), new Promise((r) => setTimeout(r, 100))])
      await frame()
    }
  })
}
