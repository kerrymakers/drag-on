// Phone-tester pass for Milestone 4 slice 1 (treats): floats, toast, reaction,
// undo, offline, tap targets and layout, light/dark, reduced motion on/off.
import { test, expect, type Page } from '../e2e/fixtures'
import { REWARDS } from '../../src/config/rewards'
import { TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const shotDir = 'tests/screenshots'
const NOW = new Date('2026-10-13T10:00:00+01:00')
const TREAT_ROLL = REWARDS.rareChance + REWARDS.treatChance / 2
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const BONUS = (id: string) => Math.round(XP(id) * REWARDS.treatBonusShare)

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function open(page: Page, roll: number | null) {
  await page.addInitScript((r) => {
    if (r !== null) Math.random = () => r
  }, roll)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
}

/** Freeze every running animation/transition at time t (ms) so screenshots are deterministic. */
async function freezeAt(page: Page, t: number) {
  await page.evaluate((ms) => {
    for (const a of document.getAnimations()) {
      a.pause()
      a.currentTime = ms
    }
  }, t)
}

const rect = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const e = document.querySelector(s)
    if (!e) return null
    const r = e.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height, r: r.right, b: r.bottom }
  }, sel)

function lum(rgb: string) {
  const [r, g, b] = rgb.match(/\d+/g)!.slice(0, 3).map(Number).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const contrast = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

for (const scheme of ['light', 'dark'] as const) {
  for (const motion of ['no-preference', 'reduce'] as const) {
    const tag = `${scheme}-${motion === 'reduce' ? 'rm' : 'motion'}`

    test(`treat vs normal feedback (${tag})`, async ({ page }, info) => {
      const p = info.project.name
      const msgs = collectConsole(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: motion })
      await open(page, TREAT_ROLL)

      const before = await page.$$eval('button.task', (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect()
          return { id: (e as HTMLElement).dataset.taskId, x: r.x, y: r.y, w: r.width, h: r.height }
        }),
      )

      await page.locator('button.task[data-task-id="avoided"]').click()
      const reactNow = await page.evaluate(() => {
        const w = document.querySelector('#dragon-art .dragon-react')!
        return { cls: w.className, anims: w.getAnimations().map((a) => (a as CSSAnimation).animationName) }
      })
      console.log(p, tag, 'reaction at tap', JSON.stringify(reactNow))
      if (motion === 'reduce') {
        expect(reactNow.anims).toEqual([])
        expect(reactNow.cls).not.toContain('react-treat')
      } else {
        expect(reactNow.cls).toContain('react-treat')
      }

      // Frames of the floats: early, mid, late.
      for (const t of [120, 450, 900]) {
        await freezeAt(page, t)
        const fl = await page.$$eval('.float-xp', (els) =>
          els.map((e) => {
            const r = e.getBoundingClientRect()
            const s = getComputedStyle(e)
            return { text: e.textContent, x: r.x, y: r.y, r: r.right, b: r.bottom, op: s.opacity, color: s.color, bg: s.backgroundColor }
          }),
        )
        console.log(p, tag, `floats @${t}`, JSON.stringify(fl))
        for (const f of fl) {
          expect(f.x).toBeGreaterThanOrEqual(0)
          expect(f.r).toBeLessThanOrEqual(page.viewportSize()!.width)
        }
        await page.screenshot({ path: `${shotDir}/m4s1-pt-treat-${tag}-${t}ms-${p}.png` })
        await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
      }

      // Treat pill contrast.
      const treat = await page.locator('.float-treat').evaluate((e) => {
        const s = getComputedStyle(e)
        return { color: s.color, bg: s.backgroundColor }
      }).catch(() => null)
      if (treat) {
        const c = contrast(treat.color, treat.bg)
        console.log(p, tag, 'treat pill contrast', c.toFixed(2), JSON.stringify(treat))
        expect(c).toBeGreaterThanOrEqual(4.5)
      }

      // Toast with the longest name.
      const toast = await page.evaluate(() => {
        const t = document.querySelector('#toast-text') as HTMLElement
        const root = t.closest('.toast') as HTMLElement
        const r = root.getBoundingClientRect()
        return { text: t.textContent, sw: t.scrollWidth, cw: t.clientWidth, x: r.x, r: r.right, w: r.width }
      })
      console.log(p, tag, 'toast', JSON.stringify(toast))
      expect(toast.x).toBeGreaterThanOrEqual(0)
      expect(toast.r).toBeLessThanOrEqual(page.viewportSize()!.width)

      // Reaction clears; floats gone; layout unchanged.
      await page.waitForTimeout(1500)
      const after = await page.evaluate(() => ({
        cls: document.querySelector('#dragon-art .dragon-react')!.className,
        floats: document.querySelectorAll('.float-xp').length,
      }))
      console.log(p, tag, 'after 1.5s', JSON.stringify(after))
      expect(after.cls).not.toContain('react-treat')
      expect(after.floats).toBe(0)
      const afterRects = await page.$$eval('button.task', (els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect()
          return { id: (e as HTMLElement).dataset.taskId, x: r.x, y: r.y, w: r.width, h: r.height }
        }),
      )
      expect(afterRects).toEqual(before)
      await page.screenshot({ path: `${shotDir}/m4s1-pt-treat-${tag}-settled-${p}.png` })

      // Tap targets.
      const small = await page.$$eval('button:not([hidden]), a, [role=button]', (els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
          .map((e) => {
            const r = e.getBoundingClientRect()
            return { id: (e as HTMLElement).dataset.taskId ?? e.id ?? e.className, w: r.width, h: r.height }
          })
          .filter((r) => r.w < 44 || r.h < 44),
      )
      console.log(p, tag, 'small targets', JSON.stringify(small))
      expect(small).toEqual([])
      const sw = await page.evaluate(() => document.documentElement.scrollWidth)
      expect(sw).toBeLessThanOrEqual(page.viewportSize()!.width)

      // Normal log for comparison (no treat): switch roll and log gym.
      await page.evaluate(() => (Math.random = () => 0.9999))
      await page.locator('button.task[data-task-id="gym"]').click()
      await freezeAt(page, 160)
      const normal = await page.evaluate(() => ({
        floats: [...document.querySelectorAll('.float-xp')].map((f) => f.className + ':' + f.textContent),
        toast: document.querySelector('#toast-text')!.textContent,
        cls: document.querySelector('#dragon-art .dragon-react')!.className,
      }))
      console.log(p, tag, 'normal', JSON.stringify(normal))
      expect(normal.floats).toEqual([`float-xp:+${XP('gym')} XP`])
      await page.screenshot({ path: `${shotDir}/m4s1-pt-normal-${tag}-${p}.png` })
      expect(msgs).toEqual([])
    })
  }
}

test('toast copy for every task with a treat', async ({ page }, info) => {
  await open(page, TREAT_ROLL)
  const out: object[] = []
  for (const t of TASKS) {
    const b = page.locator(`button.task[data-task-id="${t.id}"]:not(:disabled)`)
    if ((await b.count()) === 0) continue
    const ov = page.locator('.overlay-button')
    if (await ov.isVisible()) await ov.click()
    await page.waitForTimeout(300)
    await b.click()
    await page.waitForTimeout(400)
    const m = await page.evaluate(() => {
      const e = document.querySelector('#toast-text') as HTMLElement
      const r = e.closest('.toast')!.getBoundingClientRect()
      return { text: e.textContent, truncated: e.scrollWidth > e.clientWidth, sw: e.scrollWidth, cw: e.clientWidth, toastW: r.width }
    })
    out.push({ id: t.id, ...m })
    await page.screenshot({ path: `${shotDir}/m4s1-pt-toast-${t.id}-${info.project.name}.png` })
    await page.reload()
    await expect(page.locator('#task-list button.task').first()).toBeVisible()
  }
  console.log(info.project.name, 'toasts', JSON.stringify(out, null, 1))
})

test('undo after a treat removes base and bonus, also from stats, and survives reload', async ({ page }, info) => {
  const msgs = collectConsole(page)
  await open(page, TREAT_ROLL)
  await page.locator('button.task[data-task-id="read"]').click()
  await expect(page.locator('#xp-total')).toHaveText(String(XP('read') + BONUS('read')))
  await page.reload()
  await expect(page.locator('#xp-total')).toHaveText(String(XP('read') + BONUS('read')))
  // Undo via the persistent undo control (toast gone after reload).
  const undo = page.locator('.undo:not(.is-idle), #toast-undo:visible').first()
  console.log(info.project.name, 'undo controls', await page.locator('.undo, #toast-undo').evaluateAll((els) => els.map((e) => e.outerHTML.slice(0, 120))))
  await undo.click()
  await expect(page.locator('#xp-total')).toHaveText('0')
  await page.goto('./#/dragon')
  await page.waitForTimeout(300)
  const stats = await page.evaluate(() => document.querySelector('main, body')!.textContent!.replace(/\s+/g, ' ').slice(0, 600))
  console.log(info.project.name, 'dragon screen after undo', stats)
  await page.reload()
  await page.goto('./')
  await expect(page.locator('#xp-total')).toHaveText('0')
  expect(msgs).toEqual([])
})

test('offline treat log persists across offline reload', async ({ page, context }, info) => {
  const msgs = collectConsole(page)
  await open(page, TREAT_ROLL)
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 })
  await context.setOffline(true)
  await page.locator('button.task[data-task-id="walk"]').click()
  await expect(page.locator('.float-treat')).toHaveText(`+${BONUS('walk')} treat`)
  await expect(page.locator('#toast-text')).toContainText('Treat!')
  await page.reload()
  await expect(page.locator('#xp-total')).toHaveText(String(XP('walk') + BONUS('walk')))
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.at(-1))
  expect(saved.reward).toEqual({ kind: 'treat', bonusXp: BONUS('walk') })
  await page.screenshot({ path: `${shotDir}/m4s1-pt-offline-${info.project.name}.png` })
  await context.setOffline(false)
  console.log(info.project.name, 'offline console', JSON.stringify(msgs))
})

test('treat that also hatches the egg', async ({ page }, info) => {
  // 80 XP of logs already, then a treat on gym (40 + 20) crosses 100.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(
        'drag-on:v1',
        JSON.stringify({ schemaVersion: 1, events: [{ id: 'a', type: 'log', taskId: 'read', timestamp: Date.parse('2026-10-12T09:00:00+01:00'), xpAwarded: 25 }, { id: 'b', type: 'log', taskId: 'selfcare', timestamp: Date.parse('2026-10-11T09:00:00+01:00'), xpAwarded: 25 }, { id: 'c', type: 'log', taskId: 'avoided', timestamp: Date.parse('2026-10-10T09:00:00+01:00'), xpAwarded: 15 }] }),
      )
      sessionStorage.setItem('seeded', '1')
    }
  })
  const msgs = collectConsole(page)
  await open(page, TREAT_ROLL)
  await page.locator('button.task[data-task-id="walk"]').click() // 65 + 15 + 8 = 88, no hatch
  await page.waitForTimeout(1500)
  await page.locator('button.task[data-task-id="gym"]').click() // +40 +20 → 148
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shotDir}/m4s1-pt-treat-hatch-${info.project.name}.png` })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${shotDir}/m4s1-pt-treat-hatch-later-${info.project.name}.png` })
  expect(msgs).toEqual([])
})
