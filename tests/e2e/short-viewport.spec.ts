import { test, expect } from '@playwright/test'
test.use({ timezoneId: 'Europe/London' })
for (const [w, h] of [[410, 800], [360, 680]] as const) {
  test(`short viewport ${w}x${h}`, async ({ page }, info) => {
    test.skip(info.project.name !== 'pixel10pro')
    await page.setViewportSize({ width: w, height: h })
    await page.clock.install({ time: new Date('2026-10-06T06:00:00+01:00') })
    await page.goto('./')
    await page.locator('button.task[data-task-id="gym"]').click()
    const r = await page.evaluate(() => ({
      scrollH: document.documentElement.scrollHeight,
      undoBottom: document.querySelector('#undo')!.getBoundingClientRect().bottom,
      eggH: document.querySelector('.egg')!.getBoundingClientRect().height,
      firstTaskTop: document.querySelector('.task')!.getBoundingClientRect().top,
    }))
    console.log(w, h, JSON.stringify(r))
    await page.screenshot({ path: `tests/screenshots/home-short-${w}x${h}.png` })
  })
}
