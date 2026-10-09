// Milestone 7, slice 4: the livelier dragon. Its idle life and tap reaction never push
// any of it out of view: the Collection preview is the tightest spot (a small drawing
// at the top of a scroll area), so the tallest stages are checked there through the
// whole tap reaction, at the top of a happy hop.
import { test, expect, type Page } from './fixtures'
import { STAGES } from '../../src/config/stages'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const NOW = new Date('2026-10-13T10:00:00+01:00')
const from = (s: string) => STAGES.find((x) => x.id === s)!.xpFrom

async function openCollection(page: Page, stage: string) {
  // A log an hour ago: happy, so the idle hops are at their biggest. Wearing a crown
  // and the warm-hearted look (a flower by the horn) for the tallest outline.
  const at = NOW.getTime() - 60 * 60_000
  const data = {
    schemaVersion: 1,
    events: [
      { id: 'xp', type: 'log', taskId: 'selfcare', timestamp: at - 60_000, xpAwarded: from(stage) + 10, stageReached: stage },
      { id: 'f', type: 'log', taskId: 'avoided', timestamp: at, xpAwarded: 0, reward: { kind: 'item', itemId: 'crown' } },
    ],
    settings: { lastBackupAt: NOW.getTime(), wearing: { head: 'crown' } },
  }
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('drag-on:v1', JSON.stringify(d))
      sessionStorage.setItem('seeded', '1')
    }
  }, data)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await page.getByRole('link', { name: 'Collection' }).click()
  await expect(page.locator('#collection-screen .cs-art .dragon-svg')).toHaveAttribute('data-stage', stage)
  await expect(page.locator('#collection-screen .cs-art .dragon-svg')).toHaveAttribute('data-mood', 'happy')
}

for (const stage of ['adult', 'elder']) {
  test(`the ${stage} stays inside the Collection preview's scroll area through a tap, mid-hop`, async ({ page }) => {
    await openCollection(page, stage)
    await page.locator('#collection-screen .cs-art').click()
    await expect(page.locator('#collection-screen .cs-art .dragon-react')).toHaveClass(/react-tap/)
    const worst = await page.evaluate(() => {
      const root = document.querySelector('#collection-screen .cs-art')!
      const anims = document.getAnimations() as CSSAnimation[]
      for (const a of anims) a.pause()
      const set = (name: string, t: number) => anims.filter((a) => a.animationName === name).forEach((a) => (a.currentTime = t))
      // The peak of the end-of-cycle hop (idle-hop: 11s, -2s delay, peak at 89%) and of the rock's bob.
      set('idle-hop', 9790 - 2000)
      set('idle-rock', 0.25 * 3700 - 1700 + 3700)
      // Everything that clips the preview: scrolling ancestors, and the screen.
      const clips: DOMRect[] = [new DOMRect(0, 0, innerWidth, innerHeight)]
      for (let e = root.parentElement; e; e = e.parentElement) {
        const cs = getComputedStyle(e)
        if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(e.getBoundingClientRect())
      }
      let out = { over: -Infinity, at: 0 }
      for (let t = 0; t <= 560; t += 10) {
        set('react-tap', t)
        const shapes = [...root.querySelectorAll('svg.dragon-svg :is(path,ellipse,circle,rect,polygon)')].filter((e) => {
          const cs = getComputedStyle(e)
          return cs.display !== 'none' && Number(cs.opacity) > 0 && !e.matches('.dragon-head-box') && !e.closest('.mood-part:not(.mood-happy)')
        })
        for (const s of shapes) {
          const r = s.getBoundingClientRect()
          if (!r.width && !r.height) continue
          for (const c of clips) {
            const over = Math.max(c.top - r.top, r.left < c.left ? c.left - r.left : 0, r.right > c.right ? r.right - c.right : 0)
            if (over > out.over) out = { over, at: t }
          }
        }
      }
      return out
    })
    expect(worst.over, `clipped by ${worst.over.toFixed(1)}px at ${worst.at}ms into the tap`).toBeLessThanOrEqual(0)
  })
}
