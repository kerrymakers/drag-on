// Shared Playwright fixtures. Every log rolls for a variable reward with Math.random,
// so by default the page's Math.random is pinned to a roll that brings nothing: specs
// that check exact XP, floats and toasts stay deterministic. A spec that wants a
// reward adds its own init script, which runs after this one and wins.
import { test as base, type Page } from '@playwright/test'

export * from '@playwright/test'

export const test = base.extend({
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

const SHOT_DIR = 'tests/screenshots'
const SHOTS = process.env.SCREENSHOTS === '1' || process.env.E2E_FULL === '1'

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
