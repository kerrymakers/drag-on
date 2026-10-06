// Phone-tester round 2 for M4 slice 1: toast name truncation, float coverage per task,
// and the treat toast after the hatch overlay closes.
import { test, expect, type Page } from './fixtures'
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

async function open(page: Page) {
  await page.addInitScript((r) => { Math.random = () => r }, TREAT_ROLL)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
}

for (const motion of ['no-preference', 'reduce'] as const) {
  for (const scheme of ['light', 'dark'] as const) {
    const tag = `${scheme}-${motion === 'reduce' ? 'rm' : 'motion'}`
    test(`per-task toast fit and float coverage (${tag})`, async ({ page }, info) => {
      const p = info.project.name
      const msgs = collectConsole(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: motion })
      await open(page)
      for (const t of TASKS) {
        const b = page.locator(`button.task[data-task-id="${t.id}"]`)
        if ((await b.count()) === 0) continue
        await b.click()
        const samples: object[] = []
        for (const ms of motion === 'reduce' ? [450] : [60, 200, 450, 700]) {
          await page.evaluate((m) => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = m }), ms)
          const s = await page.evaluate((id) => {
            const btn = document.querySelector(`button.task[data-task-id="${id}"]`)!
            const parts = [...btn.querySelectorAll('*')].filter((e) => e.children.length === 0 && e.textContent!.trim())
            const lab = parts.map((e) => ({ t: e.textContent!.trim(), r: e.getBoundingClientRect() }))
            const out: string[] = []
            for (const f of document.querySelectorAll('.float-xp')) {
              const fr = f.getBoundingClientRect()
              const op = +getComputedStyle(f).opacity
              if (op < 0.15) continue
              for (const l of lab) {
                const r = l.r
                if (fr.left < r.right && fr.right > r.left && fr.top < r.bottom && fr.bottom > r.top)
                  out.push(`${f.textContent}(op ${op.toFixed(2)}) over own "${l.t}"`)
              }
              // what's under the float centre (other than floats)
              const els = document.elementsFromPoint(fr.left + fr.width / 2, fr.top + fr.height / 2)
              const under = els.find((e) => !e.classList.contains('float-xp') && e.closest('button.task, .xp-bar, #xp-total, .progress, header, .dragon, #dragon-art'))
              if (under) {
                const host = under.closest('button.task') as HTMLElement | null
                out.push(`${f.textContent}@${Math.round(fr.left)},${Math.round(fr.top)} over ${host ? 'task:' + host.dataset.taskId : under.className || under.tagName}`)
              }
            }
            return out
          }, t.id)
          samples.push({ ms, s })
          await page.evaluate(() => document.getAnimations().forEach((a) => a.play()))
        }
        await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 300 }))
        await page.screenshot({ path: `${shotDir}/m4s1-r2-${t.id}-${tag}-${p}.png` })
        const toast = await page.evaluate(() => {
          const lead = document.querySelector('#toast-text .toast-lead') as HTMLElement
          const name = document.querySelector('#toast-text .toast-name') as HTMLElement
          const tr = document.querySelector('.toast')!.getBoundingClientRect()
          const u = (document.querySelector('#toast-undo') as HTMLElement).getBoundingClientRect()
          return { text: document.querySelector('#toast-text')!.textContent, leadFits: lead.scrollWidth <= lead.clientWidth, nameTrunc: name.scrollWidth > name.clientWidth, toast: [tr.left, tr.right], undo: [u.width, u.height] }
        })
        console.log(p, tag, t.id, JSON.stringify(toast), JSON.stringify(samples))
        expect(toast.leadFits).toBe(true)
        expect(toast.undo[0]).toBeGreaterThanOrEqual(44)
        expect(toast.undo[1]).toBeGreaterThanOrEqual(44)
        await page.evaluate(() => document.getAnimations().forEach((a) => { if (a.effect?.getComputedTiming().endTime !== Infinity) a.finish(); else a.play() }))
        await page.locator('#toast-undo').click()
        await expect(page.locator('#xp-total')).toHaveText('0')
        await page.waitForTimeout(150)
      }
      expect(msgs).toEqual([])
    })
  }
}

for (const scheme of ['light', 'dark'] as const) {
  test(`treat + hatch: toast after overlay (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('seeded')) {
        const t = Date.parse('2026-10-12T09:00:00+01:00')
        localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: [{ id: 'a', type: 'log', taskId: 'read', timestamp: t, xpAwarded: 90 }] }))
        sessionStorage.setItem('seeded', '1')
      }
    })
    await open(page)
    await page.locator('button.task[data-task-id="read"]').click()
    await expect(page.locator('.overlay')).toBeVisible()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${shotDir}/m4s1-r2-hatch-overlay-${scheme}-${p}.png` })
    const btn = await page.locator('.overlay-button').boundingBox()
    console.log(p, scheme, 'overlay button', JSON.stringify(btn))
    await page.waitForTimeout(5000)
    await page.locator('.overlay-button').click()
    await expect(page.locator('.overlay')).toHaveCount(0)
    await expect(page.locator('#toast')).toHaveClass(/is-showing/)
    await expect(page.locator('#toast-text')).toHaveText(`Treat! +${XP('read') + BONUS('read')} XP · Read for 20 minutes`)
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${shotDir}/m4s1-r2-hatch-after-${scheme}-${p}.png` })
    const nameTrunc = await page.evaluate(() => { const n = document.querySelector('#toast-text .toast-name') as HTMLElement; return n.scrollWidth > n.clientWidth })
    console.log(p, scheme, 'after-overlay name truncated', nameTrunc)
    const u = (await page.locator('#toast-undo').boundingBox())!
    expect(u.width).toBeGreaterThanOrEqual(44)
    expect(u.height).toBeGreaterThanOrEqual(44)
    await page.locator('#toast-undo').click()
    await expect(page.locator('#xp-total')).toHaveText('90')
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${shotDir}/m4s1-r2-hatch-undone-${scheme}-${p}.png` })
    await page.reload()
    await expect(page.locator('#xp-total')).toHaveText('90')
    const events = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.map((e: any) => e.type))
    console.log(p, scheme, 'events after undo+reload', JSON.stringify(events))
    expect(msgs).toEqual([])
  })
}
