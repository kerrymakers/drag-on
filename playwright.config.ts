import { readFileSync } from 'node:fs'
import { defineConfig } from '@playwright/test'

const UA =
  'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

// The e2e run builds into its own folder and serves it on its own port, and never
// reuses a running server. A preview of dist/ that's rebuilt mid-run (or left over
// from an older build) can otherwise serve index.html for sw.js and flake the
// console checks with "unsupported MIME type ('text/html')".
const PORT = 4174
const OUT_DIR = 'dist-e2e'

// The default run is the lasting feature checks in tests/e2e/. The phone tester's
// one-off round checks are scratch files in tests/phone/ (gitignored, never committed)
// and only run with E2E_FULL=1 (`npm run test:e2e:full`); with none there, it runs just tests/e2e/.
const FULL = process.env.E2E_FULL === '1'

// How long the whole local run (build included) should take: targetSeconds in
// tests/budget.json, measured on the Mac. The global timeout is twice that, rounded up
// to a whole minute, so a runaway suite fails in minutes instead of taking an hour.
// Raise targetSeconds there, on purpose, and this follows.
// Screenshot and full runs check every size sweep in both colour schemes (schemesFor in
// tests/e2e/fixtures.ts), about half as many tests again, so they get twice as long.
const { targetSeconds } = JSON.parse(readFileSync(new URL('./tests/budget.json', import.meta.url), 'utf8')) as { targetSeconds: number }
const BOTH_SCHEMES = FULL || process.env.SCREENSHOTS === '1'
const GLOBAL_TIMEOUT_MS = Math.ceil((2 * targetSeconds) / 60) * 60_000 * (BOTH_SCHEMES ? 2 : 1)

export default defineConfig({
  testDir: 'tests',
  testMatch: FULL ? ['e2e/**/*.spec.ts', 'phone/**/*.spec.ts'] : ['e2e/**/*.spec.ts'],
  // Each test gets its own browser context (and so its own storage) against one static
  // preview server, so tests don't share state and can run side by side. Two workers
  // everywhere (not one per core), so animation timing isn't starved of CPU and the Mac
  // stays usable for other work while tests run (the npm scripts also run them under nice).
  fullyParallel: true,
  workers: 2,
  // Locally only failures get printed; in CI, annotations on the PR.
  reporter: process.env.CI ? 'github' : 'dot',
  reportSlowTests: { max: 5, threshold: 10_000 },
  // About twice the measured run (see GLOBAL_TIMEOUT_MS), so a runaway suite fails instead of taking an hour.
  globalTimeout: GLOBAL_TIMEOUT_MS,
  use: {
    baseURL: `http://localhost:${PORT}/drag-on/`,
    browserName: 'chromium',
    userAgent: UA,
    isMobile: true,
    hasTouch: true,
  },
  projects: [
    { name: 'pixel10pro', use: { viewport: { width: 410, height: 914 }, deviceScaleFactor: 3.125 } },
    {
      name: 'narrow360',
      use: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 },
      // Only tests tagged @layout (LAYOUT in tests/e2e/fixtures.ts: geometry, fit, tap
      // targets) run again at 360px; logic and journeys run once, in pixel10pro. Tests
      // tagged @sweeps-sizes set their own sizes, so they never run here either.
      grep: /@layout/,
      grepInvert: /@sweeps-sizes/,
    },
  ],
  webServer: {
    command: `npm run build -- --outDir ${OUT_DIR} && npm run preview -- --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/drag-on/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
