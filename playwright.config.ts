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
// one-off round checks live in tests/phone/ and only run with E2E_FULL=1
// (`npm run test:e2e:full`).
const FULL = process.env.E2E_FULL === '1'

export default defineConfig({
  testDir: 'tests',
  testMatch: FULL ? ['e2e/**/*.spec.ts', 'phone/**/*.spec.ts'] : ['e2e/**/*.spec.ts'],
  // Each test gets its own browser context (and so its own storage) against one static
  // preview server, so tests don't share state and can run side by side. Four workers
  // rather than one per core, so animation timing isn't starved of CPU.
  fullyParallel: true,
  workers: process.env.CI ? 2 : 4,
  reporter: 'list',
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
      // Tests tagged @sweeps-sizes (see tests/e2e/fixtures.ts) set their own sizes, so
      // they run once, in pixel10pro, rather than again here.
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
