import { defineConfig } from '@playwright/test'

const UA =
  'Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173/drag-on/',
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
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/drag-on/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
