// Clean single-tap shots (fresh page per tap) for float coverage, round 2.
import { test, expect } from './fixtures'
import { REWARDS } from '../../src/config/rewards'
test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const TREAT_ROLL = REWARDS.rareChance + REWARDS.treatChance / 2
for (const motion of ['no-preference', 'reduce'] as const)
  for (const scheme of ['light', 'dark'] as const)
    for (const id of ['gym', 'read', 'selfcare', 'avoided'])
      test(`clean ${id} ${scheme} ${motion}`, async ({ page }, info) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: motion })
        await page.addInitScript((r) => { Math.random = () => r }, TREAT_ROLL)
        await page.clock.setFixedTime(new Date('2026-10-13T10:00:00+01:00'))
        await page.goto('./')
        await expect(page.locator('button.task').first()).toBeVisible()
        await page.locator(`button.task[data-task-id="${id}"]`).click()
        const ms = motion === 'reduce' ? 450 : 350
        await page.evaluate((m) => document.querySelectorAll('.float-xp').forEach((f) => f.getAnimations().forEach((a) => { a.pause(); a.currentTime = m })), ms)
        const cover = await page.evaluate((tid) => {
          const out: string[] = []
          const labels = [...document.querySelectorAll('button.task *')].filter((e) => e.children.length === 0 && e.textContent!.trim())
          for (const f of document.querySelectorAll('.float-xp')) {
            const fr = f.getBoundingClientRect()
            for (const l of labels) {
              const r = l.getBoundingClientRect()
              // use text range for exact glyph box
              const rg = document.createRange(); rg.selectNodeContents(l)
              for (const lr of rg.getClientRects())
                if (fr.left < lr.right && fr.right > lr.left && fr.top < lr.bottom && fr.bottom > lr.top)
                  out.push(`${f.textContent} covers "${l.textContent!.trim()}" of ${(l.closest('button.task') as HTMLElement).dataset.taskId}${(l.closest('button.task') as HTMLElement).dataset.taskId === tid ? ' (TAPPED)' : ''} by ${Math.round(Math.min(fr.right, lr.right) - Math.max(fr.left, lr.left))}x${Math.round(Math.min(fr.bottom, lr.bottom) - Math.max(fr.top, lr.top))}`)
              void r
            }
          }
          return out
        }, id)
        console.log(info.project.name, id, scheme, motion, JSON.stringify(cover))
        await page.screenshot({ path: `tests/screenshots/m4s1-r2c-${id}-${scheme}-${motion === 'reduce' ? 'rm' : 'motion'}-${info.project.name}.png` })
      })
