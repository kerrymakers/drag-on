// Phone-tester round 2 extras for M4 slice 2: wrapped log toasts for every task
// (normal and after a find), accent in light mode, reduced motion on the stage-up.
import { test, expect, type Page } from './fixtures'
import { REWARDS } from '../../src/config/rewards'
import { TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const NOW = new Date('2026-10-13T10:00:00+01:00')
const RARE_ROLL = REWARDS.rareChance / 3

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

async function open(page: Page, roll: number | null, hash = '') {
  await page.addInitScript((r) => {
    if (r !== null) Math.random = () => r
  }, roll)
  await page.clock.setFixedTime(NOW)
  await page.goto('./' + hash)
  await expect(page.locator('#tabbar a').first()).toBeVisible()
}

async function measureToast(page: Page) {
  return page.evaluate(() => {
    const r = (s: string) => {
      const e = document.querySelector(s)
      if (!e) return null
      const b = e.getBoundingClientRect()
      return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), w: Math.round(b.width), h: Math.round(b.height) }
    }
    const name = document.querySelector<HTMLElement>('.toast-name')
    const tasks = [...document.querySelectorAll('button.task')].map((e) => e.getBoundingClientRect().top)
    return {
      vw: innerWidth,
      toast: r('#toast'),
      undo: r('#toast-undo'),
      text: document.querySelector('#toast-text')?.textContent,
      wrapped: document.querySelector('#toast')!.classList.contains('is-wrapped'),
      nameTrunc: name ? name.scrollWidth > name.clientWidth + 1 : null,
      growthRow: r('.growth-row'),
      xpBar: r('#xp-bar'),
      firstTaskTop: Math.round(Math.min(...tasks)),
      speech: r('#speech'),
    }
  })
}

for (const scheme of ['light', 'dark'] as const) {
  test(`wrapped toasts for every task (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, null)
    for (const task of TASKS) {
      const btn = page.locator(`button.task[data-task-id="${task.id}"]`)
      if (!(await btn.isVisible())) continue
      await btn.scrollIntoViewIfNeeded()
      await btn.tap()
      // A stage-up may appear; close it.
      if (await page.locator('.overlay').count()) {
        await page.waitForTimeout(1500)
        await page.touchscreen.tap(20, 20)
        await expect(page.locator('.overlay')).toHaveCount(0)
      }
      await expect(page.locator('#toast')).toHaveClass(/is-showing/)
      await page.waitForTimeout(400)
      const m = await measureToast(page)
      console.log(p, scheme, task.id, JSON.stringify(m))
      expect.soft(m.nameTrunc, `${task.id} name truncated`).toBe(false)
      // A short name fits on one line at the Pixel's width, so it mustn't wrap.
      if (m.vw >= 410 && task.id === 'gym') expect.soft(m.wrapped, 'short toast wrapped').toBe(false)
      expect.soft(m.undo!.w).toBeGreaterThanOrEqual(44)
      expect.soft(m.undo!.h).toBeGreaterThanOrEqual(44)
      expect.soft(m.toast!.l).toBeGreaterThanOrEqual(0)
      expect.soft(m.toast!.r).toBeLessThanOrEqual(m.vw)
      expect.soft(m.toast!.b, 'toast over first task').toBeLessThanOrEqual(m.firstTaskTop)
      expect.soft(m.toast!.b, 'toast over xp bar').toBeLessThanOrEqual(m.xpBar!.t)
      await page.screenshot({ path: `${dir}/m4s2r2-phone-toast-${task.id}-${scheme}-${p}.png` })
      // Undo it so every task is tested from the same state.
      await page.locator('#toast-undo').tap()
      await page.waitForTimeout(250)
    }
    expect(msgs).toEqual([])
  })

  test(`find toast on longest task (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, RARE_ROLL)
    const btn = page.locator('button.task[data-task-id="avoided"]')
    await btn.scrollIntoViewIfNeeded()
    await btn.tap()
    await expect(page.locator('.overlay.item-found')).toBeVisible()
    await page.waitForTimeout(800)
    await page.touchscreen.tap(20, 20)
    await expect(page.locator('.overlay')).toHaveCount(0)
    await expect(page.locator('#toast')).toHaveClass(/is-showing/)
    await page.waitForTimeout(400)
    const m = await measureToast(page)
    console.log(p, scheme, 'find-avoided', JSON.stringify(m))
    expect.soft(m.nameTrunc).toBe(false)
    expect.soft(m.undo!.w).toBeGreaterThanOrEqual(44)
    expect.soft(m.undo!.h).toBeGreaterThanOrEqual(44)
    expect.soft(m.toast!.r).toBeLessThanOrEqual(m.vw)
    expect.soft(m.toast!.b).toBeLessThanOrEqual(m.firstTaskTop)
    expect.soft(m.toast!.b).toBeLessThanOrEqual(m.xpBar!.t)
    await page.screenshot({ path: `${dir}/m4s2r2-phone-findtoast-avoided-${scheme}-${p}.png` })
    expect(msgs).toEqual([])
  })

  test(`accent: Home tasks, Dragon screen, active tab (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await open(page, null)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/m4s2r2-phone-accent-home-${scheme}-${p}.png` })
    await page.getByRole('link', { name: 'Dragon' }).tap()
    await expect(page.locator('#dragon-screen')).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/m4s2r2-phone-accent-dragon-${scheme}-${p}.png` })
    const c = await page.evaluate(() => {
      const out: Record<string, string> = {}
      for (const s of ['.task-xp', '.tab.is-active', '.tab.is-active .tab-icon']) {
        const e = document.querySelector(s)
        if (e) out[s] = getComputedStyle(e).color
      }
      out.bg = getComputedStyle(document.body).backgroundColor
      out.tabbar = getComputedStyle(document.querySelector('.tabbar')!).backgroundColor
      return out
    })
    console.log(p, scheme, 'accent colours', JSON.stringify(c))
    expect(msgs).toEqual([])
  })
}

test('reduced motion: stage-up then card both calm', async ({ page }, info) => {
  const p = info.project.name
  const msgs = collectConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: d }))
      sessionStorage.setItem('seeded', '1')
    }
  }, [{ id: 'a', type: 'log', taskId: 'read', timestamp: Date.parse('2026-10-12T09:00:00+01:00'), xpAwarded: 90 }])
  await open(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="gym"]').tap()
  const stage = page.locator('.overlay:not(.item-found)')
  await expect(stage).toBeVisible()
  await expect(stage).toHaveClass(/is-calm/)
  const anims = await page.evaluate(() =>
    document.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName ?? 'transition',
      dur: a.effect?.getTiming().duration,
      iter: a.effect?.getTiming().iterations,
      target: ((a.effect as KeyframeEffect)?.target as Element | null)?.className?.toString().slice(0, 50),
    })),
  )
  console.log(p, 'rm stage-up animations', JSON.stringify(anims))
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${dir}/m4s2r2-phone-rm-hatch-${p}.png` })
  await page.locator('.overlay:not(.item-found) .overlay-button').tap()
  const card = page.locator('.overlay.item-found')
  await expect(card).toBeVisible()
  await expect(card).toHaveClass(/is-calm/)
  const anims2 = await page.evaluate(() =>
    document.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName ?? 'transition',
      dur: a.effect?.getTiming().duration,
      iter: a.effect?.getTiming().iterations,
      target: ((a.effect as KeyframeEffect)?.target as Element | null)?.className?.toString().slice(0, 50),
    })),
  )
  console.log(p, 'rm card animations', JSON.stringify(anims2))
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${dir}/m4s2r2-phone-rm-hatch-card-${p}.png` })
  await page.touchscreen.tap(20, 20)
  await expect(page.locator('.overlay')).toHaveCount(0)
  expect(msgs).toEqual([])
})
