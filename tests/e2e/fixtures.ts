// Shared Playwright fixtures. Every log rolls for a variable reward with Math.random,
// so by default the page's Math.random is pinned to a roll that brings nothing: specs
// that check exact XP, floats and toasts stay deterministic. A spec that wants a
// reward adds its own init script, which runs after this one and wins.
import { test as base } from '@playwright/test'

export * from '@playwright/test'

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      Math.random = () => 0.9999
    })
    await use(page)
  },
})
