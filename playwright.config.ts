import { defineConfig } from '@playwright/test'

const UA =
  'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

// The e2e run builds into its own folder and serves it on its own port, and never
// reuses a running server. A preview of dist/ that's rebuilt mid-run (or left over
// from an older build) can otherwise serve index.html for sw.js and flake the
// console checks with "unsupported MIME type ('text/html')".
const PORT = 4174
const OUT_DIR = 'dist-e2e'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
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
    { name: 'narrow360', use: { viewport: { width: 360, height: 800 }, deviceScaleFactor: 3 } },
  ],
  webServer: {
    command: `npm run build -- --outDir ${OUT_DIR} && npm run preview -- --outDir ${OUT_DIR} --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/drag-on/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
