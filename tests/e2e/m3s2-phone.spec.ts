// Phone-tester pass for Milestone 3, Slice 2 (evolution look) across the user's viewports.
import { test, expect, type Page } from '@playwright/test'
import { LOOK_CHANGE_MARGIN } from '../../src/config/evolution'
import { STAGES } from '../../src/config/stages'
import { TASKS } from '../../src/config/tasks'
import { LOOK_NAMES } from '../../src/ui/copy'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const TUE_1000 = new Date('2026-10-06T10:00:00+01:00')
const OLD = Date.parse('2026-10-01T12:00:00+01:00')
const from = (id: string) => STAGES.find((s) => s.id === id)!.xpFrom
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const dir = 'tests/screenshots/m3s2-phone'
const ALL_NAMES = Object.values(LOOK_NAMES)

const SIZES = [
  [410, 840],
  [410, 914],
  [360, 800],
  [410, 800],
  [360, 680],
] as const
const LOOKS = { strength: 'gym', discipline: 'avoided', wisdom: 'read', heart: 'selfcare' } as const
const MOODS = [['happy', 0], ['content', 1], ['sleepy', 3], ['grumpy', 5]] as const

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}
async function seed(page: Page, events: object[]) {
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: d }))
      sessionStorage.setItem('seeded', '1')
    }
  }, events)
}
let n = 0
const log = (taskId: string, xp: number, extra: object = {}) => ({
  id: `seed${++n}`, type: 'log', taskId, timestamp: OLD + n * 60_000, xpAwarded: xp, ...extra,
})

type Box = { l: number; t: number; r: number; b: number }
const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))

async function tapTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, a, [role=button], .task')]
      .filter((e) => {
        const r = e.getBoundingClientRect()
        const cs = getComputedStyle(e)
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]') && e.getAttribute('aria-hidden') !== 'true'
      })
      .map((e) => ({ id: e.id || e.className || e.textContent, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }))
      .filter((x) => x.w < 44 || x.h < 44),
  )
}

for (const [w, h] of SIZES) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 3.125 })
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel10pro'))

    for (const scheme of ['light', 'dark'] as const) {
      test(`1 pre-Juvenile shows no look (${scheme})`, async ({ page }) => {
        const msgs = collectConsole(page)
        await page.emulateMedia({ colorScheme: scheme })
        await seed(page, [log('gym', from('juvenile') - 100, { stageReached: 'whelp' })])
        await page.clock.setFixedTime(TUE_1000)
        await page.goto('./')
        for (const where of ['home', 'dragon']) {
          if (where === 'dragon') await page.getByRole('link', { name: 'Dragon' }).click()
          const html = await page.evaluate(() => document.body.innerHTML)
          for (const nm of ALL_NAMES) expect(html, nm).not.toContain(nm)
          expect(await page.locator('.look-part').count()).toBe(0)
          const evos = await page.locator('.dragon-svg').evaluateAll((els) => els.map((e) => e.getAttribute('data-evolution')))
          for (const e of evos) expect(e).toBe('neutral')
          expect(html).not.toMatch(/look-(strength|discipline|wisdom|heart)|data-look="(strength|discipline|wisdom|heart)"/)
          await page.screenshot({ path: `${dir}/${w}x${h}-${scheme}-pre-${where}.png` })
        }
        expect(await tapTargets(page)).toEqual([])
        expect(msgs).toEqual([])
      })

      test(`2 Juvenile reveal overlay fits (${scheme})`, async ({ page }) => {
        const msgs = collectConsole(page)
        await page.emulateMedia({ colorScheme: scheme })
        await seed(page, [log('selfcare', 200), log('selfcare', from('juvenile') - 200 - 10, { stageReached: 'whelp' })])
        await page.clock.setFixedTime(TUE_1000)
        await page.goto('./')
        await page.locator('button.task[data-task-id="selfcare"]').click()
        await expect(page.locator('.overlay')).toHaveClass(/is-revealed/, { timeout: 4000 })
        await page.waitForTimeout(600)
        const m = await page.evaluate(() => {
          const b = (s: string) => {
            const r = document.querySelector(s)!.getBoundingClientRect()
            return { l: r.left, t: r.top, r: r.right, b: r.bottom }
          }
          const sub = document.querySelector<HTMLElement>('.overlay-sub')!
          const card = document.querySelector<HTMLElement>('.overlay-card')!
          return {
            sub: b('.overlay-sub'), card: b('.overlay-card'), btn: b('.overlay-button'), msg: b('.overlay-message'), art: b('.overlay-art'),
            subOverflowX: sub.scrollWidth > sub.clientWidth + 1, subOverflowY: sub.scrollHeight > sub.clientHeight + 1,
            cardOverflow: card.scrollHeight > card.clientHeight + 1,
            docW: document.documentElement.scrollWidth, text: sub.textContent,
          }
        })
        const vw = w, vh = h
        expect(m.subOverflowX).toBe(false)
        expect(m.subOverflowY).toBe(false)
        expect(m.cardOverflow).toBe(false)
        for (const k of ['sub', 'card', 'btn', 'msg'] as const) {
          expect(m[k].l, k).toBeGreaterThanOrEqual(0); expect(m[k].r, k).toBeLessThanOrEqual(vw)
          expect(m[k].t, k).toBeGreaterThanOrEqual(0); expect(m[k].b, k).toBeLessThanOrEqual(vh)
        }
        expect(m.sub.l).toBeGreaterThanOrEqual(m.card.l); expect(m.sub.r).toBeLessThanOrEqual(m.card.r)
        expect(m.sub.b).toBeLessThanOrEqual(m.btn.t)
        expect(m.msg.b).toBeLessThanOrEqual(m.sub.t + 1)
        expect(m.btn.b - m.btn.t).toBeGreaterThanOrEqual(44)
        expect(m.docW).toBeLessThanOrEqual(vw)
        await page.screenshot({ path: `${dir}/${w}x${h}-${scheme}-reveal.png` })
        expect(msgs).toEqual([])
      })

      test(`3 every look, stage and mood (${scheme})`, async ({ page }) => {
        test.setTimeout(240_000)
        const msgs = collectConsole(page)
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.clock.install({ time: TUE_1000 })
        await page.goto('./')
        const problems: string[] = []
        for (const stage of ['juvenile', 'adult', 'elder']) {
          for (const [look, taskId] of Object.entries(LOOKS)) {
            for (const [mood, daysAgo] of MOODS) {
              const tag = `${stage} ${look} ${mood}`
              await page.evaluate(({ xp, taskId, stage, ts }) => {
                localStorage.removeItem('drag-on:ui')
                localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: [{ id: 's', type: 'log', taskId, timestamp: ts, xpAwarded: xp, stageReached: stage }] }))
              }, { xp: from(stage) + 10, taskId, stage, ts: TUE_1000.getTime() - daysAgo * 86_400_000 })
              await page.reload()
              const svg = page.locator('#dragon-art .dragon-svg')
              await expect(svg).toHaveAttribute('data-evolution', look)
              await expect(svg).toHaveAttribute('data-mood', mood)
              if (mood === 'sleepy' || mood === 'grumpy') { await expect(page.locator('#speech')).toHaveClass(/is-showing/); await page.waitForTimeout(450) }
              const f = await page.evaluate(() => {
                const bx = (r: DOMRect) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })
                const painted = [...document.querySelectorAll('#dragon-art svg.dragon-svg :is(path,ellipse,circle,rect,polygon,line,polyline)')]
                  .filter((e) => { const cs = getComputedStyle(e); return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0 })
                  .map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 || r.height > 0)
                const u = painted.reduce((a, r) => ({ l: Math.min(a.l, r.left), t: Math.min(a.t, r.top), r: Math.max(a.r, r.right), b: Math.max(a.b, r.bottom) }), { l: 1e9, t: 1e9, r: -1e9, b: -1e9 })
                const hb = document.querySelector('#dragon-art .dragon-head-box')?.getBoundingClientRect()
                const looks = [...document.querySelectorAll('#dragon-art .look-part :is(path,ellipse,circle,rect,polygon,line,polyline)')].map((e) => e.getBoundingClientRect()).filter((r) => hb && r.left < hb.right && r.right > hb.left && r.top < hb.bottom && r.bottom > hb.top).map(bx)
                const sp = document.querySelector('#speech.is-showing')
                const svgEl = document.querySelector('#dragon-art svg.dragon-svg')!
                return {
                  art: u, svg: bx(svgEl.getBoundingClientRect()), area: bx(document.querySelector('.dragon')!.getBoundingClientRect()),
                  header: bx(document.querySelector('.top')!.getBoundingClientRect()), growth: bx(document.querySelector('.growth-row')!.getBoundingClientRect()),
                  head: document.querySelector('#dragon-art .dragon-head-box') ? bx(document.querySelector('#dragon-art .dragon-head-box')!.getBoundingClientRect()) : null,
                  looks, speech: sp ? bx(sp.getBoundingClientRect()) : null, docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
                  lookCount: document.querySelectorAll('#dragon-art .look-part').length,
                }
              })
              if (f.lookCount === 0) problems.push(`${tag}: no look parts drawn`)
              if (f.art.l < 0 || f.art.r > w) problems.push(`${tag}: art off-screen horizontally`)
              if (f.art.t < f.header.b - 2) problems.push(`${tag}: art overlaps header by ${(f.header.b - f.art.t).toFixed(1)}px`)
              if (f.art.b > f.growth.t + 2) problems.push(`${tag}: art overlaps growth row by ${(f.art.b - f.growth.t).toFixed(1)}px`)
              if (f.docW > w) problems.push(`${tag}: horizontal scroll`)
              if (f.docH > h) problems.push(`${tag}: page scrolls vertically (${f.docH})`)
              if (f.speech) {
                const s = f.speech
                if (s.l < 0 || s.r > w || s.t < 0) problems.push(`${tag}: speech off-screen`)
                if (f.head && overlap(s, f.head) > 4) problems.push(`${tag}: speech overlaps head by ${overlap(s, f.head).toFixed(0)}px²`)
                const lp = f.looks.map((b) => overlap(s, b)).reduce((a, b) => Math.max(a, b), 0)
                if (lp > 4) problems.push(`${tag}: speech overlaps head accessory by ${lp.toFixed(0)}px²`)
                if (s.t < f.header.b - 2) problems.push(`${tag}: speech overlaps header`)
                if (s.b > f.growth.t) problems.push(`${tag}: speech overlaps the XP row by ${(s.b - f.growth.t).toFixed(1)}px`)
              }
              if (w === 410 && h === 840) {
                await page.locator('.dragon').screenshot({ path: `${dir}/${w}x${h}-${scheme}-${stage}-${look}-${mood}.png` })
              } else if (w === 360 && h === 680 && (mood === 'sleepy' || mood === 'grumpy')) {
                await page.screenshot({ path: `${dir}/${w}x${h}-${scheme}-${stage}-${look}-${mood}-full.png` })
              }
            }
          }
        }
        expect(problems).toEqual([])
        expect(msgs).toEqual([])
      })

      test(`3b welcome bubble clears the head and XP row before Juvenile (${scheme})`, async ({ page }) => {
        const msgs = collectConsole(page)
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.clock.install({ time: TUE_1000 })
        await page.goto('./')
        const problems: string[] = []
        for (const stage of ['hatchling', 'whelp']) {
          for (const [mood, daysAgo] of MOODS.filter(([m]) => m === 'sleepy' || m === 'grumpy')) {
            const tag = `${stage} ${mood}`
            await page.evaluate(({ xp, stage, ts }) => {
              localStorage.removeItem('drag-on:ui')
              localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: [{ id: 's', type: 'log', taskId: 'gym', timestamp: ts, xpAwarded: xp, stageReached: stage }] }))
            }, { xp: from(stage) + 10, stage, ts: TUE_1000.getTime() - daysAgo * 86_400_000 })
            await page.reload()
            await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-mood', mood)
            await expect(page.locator('#speech')).toHaveClass(/is-showing/)
            await page.waitForTimeout(450)
            const f = await page.evaluate(() => {
              const bx = (e: Element) => { const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
              return {
                head: bx(document.querySelector('#dragon-art .dragon-head-box')!),
                speech: bx(document.querySelector('#speech')!),
                header: bx(document.querySelector('.top')!),
                growth: bx(document.querySelector('.growth-row')!),
              }
            })
            const s = f.speech
            if (s.l < 0 || s.r > w || s.t < 0) problems.push(`${tag}: speech off-screen`)
            if (overlap(s, f.head) > 4) problems.push(`${tag}: speech overlaps head by ${overlap(s, f.head).toFixed(0)}px²`)
            if (s.t < f.header.b - 2) problems.push(`${tag}: speech overlaps header`)
            if (s.b > f.growth.t) problems.push(`${tag}: speech overlaps the XP row by ${(s.b - f.growth.t).toFixed(1)}px`)
            if (w === 410 && h === 840) await page.locator('.dragon').screenshot({ path: `${dir}/${w}x${h}-${scheme}-${stage}-${mood}.png` })
          }
        }
        expect(problems).toEqual([])
        expect(msgs).toEqual([])
      })

      test(`5 Dragon screen look chip (${scheme})`, async ({ page }) => {
        const msgs = collectConsole(page)
        await page.emulateMedia({ colorScheme: scheme })
        const problems: string[] = []
        await page.clock.install({ time: TUE_1000 })
        await page.goto('./#/dragon')
        for (const [look, taskId] of Object.entries(LOOKS)) {
          for (const [mood, daysAgo] of [['happy', 0], ['grumpy', 5]] as const) {
            await page.evaluate(({ xp, taskId, ts }) => {
              localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: [{ id: 's', type: 'log', taskId, timestamp: ts, xpAwarded: xp, stageReached: 'elder' }] }))
            }, { xp: 7010, taskId, ts: TUE_1000.getTime() - daysAgo * 86_400_000 })
            await page.reload()
            const chip = page.locator('#dragon-screen .look-chip')
            await expect(chip).toBeVisible()
            const c = await page.evaluate(() => {
              const bx = (s: string) => { const r = document.querySelector(s)!.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom } }
              const t = document.querySelector('#dragon-screen .look-chip-text')!
              const range = document.createRange(); range.selectNodeContents(t)
              const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
              return { chip: bx('#dragon-screen .look-chip'), stage: bx('#dragon-screen .stage-row'), mood: bx('#dragon-screen .mood-chip'), name: bx('#dragon-screen .dragon-name'), art: bx('#dragon-screen .ds-art'), lines, docW: document.documentElement.scrollWidth }
            })
            const tag = `${look} ${mood}`
            if (c.lines > 1) problems.push(`${tag}: chip text wraps to ${c.lines} lines`)
            if (c.chip.l < 0 || c.chip.r > w) problems.push(`${tag}: chip off-screen`)
            if (overlap(c.chip, c.stage) > 0 || overlap(c.chip, c.mood) > 0 || overlap(c.chip, c.name) > 0) problems.push(`${tag}: chip overlaps header items`)
            if (c.docW > w) problems.push(`${tag}: horizontal scroll`)
            await page.screenshot({ path: `${dir}/${w}x${h}-${scheme}-dragonscreen-${look}-${mood}.png` })
          }
        }
        expect(await tapTargets(page)).toEqual([])
        expect(problems).toEqual([])
        expect(msgs).toEqual([])
      })
    }

    test('4 look change: first time celebrates, back to seen and undo are quiet', async ({ page }) => {
      const msgs = collectConsole(page)
      const s1 = from('juvenile')
      const wis = Math.floor(s1 * (1 + LOOK_CHANGE_MARGIN)) - XP('read') + 5
      await seed(page, [log('gym', s1, { stageReached: 'juvenile' }), log('read', wis)])
      await page.clock.setFixedTime(TUE_1000)
      await page.goto('./')
      await page.locator('button.task[data-task-id="read"]').click()
      await expect(page.locator('.overlay')).toHaveClass(/is-revealed/, { timeout: 4000 })
      await page.waitForTimeout(500)
      const fit = await page.evaluate(() => {
        const c = document.querySelector<HTMLElement>('.overlay-card')!
        const r = c.getBoundingClientRect()
        return { over: c.scrollHeight > c.clientHeight + 1, b: r.bottom, t: r.top, btn: document.querySelector('.overlay-button')!.getBoundingClientRect().height }
      })
      expect(fit.over).toBe(false)
      expect(fit.t).toBeGreaterThanOrEqual(0)
      expect(fit.b).toBeLessThanOrEqual(h)
      expect(fit.btn).toBeGreaterThanOrEqual(44)
      await page.screenshot({ path: `${dir}/${w}x${h}-lookchange.png` })
      await page.locator('.overlay-button').click()
      await expect(page.locator('.overlay')).toHaveCount(0)
      // Undo: quiet.
      await page.locator('#undo').click()
      await page.waitForTimeout(800)
      await expect(page.locator('.overlay')).toHaveCount(0)
      expect(await page.locator('#dragon-art .dragon-react').getAttribute('data-look')).toBe('juvenile-strength')
      expect(msgs).toEqual([])
    })

    test('4b change back to a seen look is quiet', async ({ page }) => {
      const msgs = collectConsole(page)
      const s1 = from('juvenile')
      const wv = Math.ceil(s1 * (1 + LOOK_CHANGE_MARGIN)) + 50
      const s2 = Math.floor(wv * (1 + LOOK_CHANGE_MARGIN)) - s1 - XP('gym') + 5
      await seed(page, [log('gym', s1, { stageReached: 'juvenile' }), log('read', wv), log('walk', s2)])
      await page.clock.setFixedTime(TUE_1000)
      await page.goto('./')
      expect(await page.locator('#dragon-art .dragon-react').getAttribute('data-look')).toBe('juvenile-wisdom')
      await page.locator('button.task[data-task-id="gym"]').click()
      await expect(page.locator('#toast')).toHaveClass(/is-showing/)
      await expect.poll(() => page.locator('#dragon-art .dragon-react').getAttribute('data-look')).toBe('juvenile-strength')
      await page.waitForTimeout(1000)
      await expect(page.locator('.overlay')).toHaveCount(0)
      await page.locator('#undo').click()
      await page.waitForTimeout(1000)
      await expect(page.locator('.overlay')).toHaveCount(0)
      expect(await page.locator('#dragon-art .dragon-react').getAttribute('data-look')).toBe('juvenile-wisdom')
      expect(msgs).toEqual([])
    })

    test('6 reduced motion, offline logging, persistence, console', async ({ page, context }) => {
      const msgs = collectConsole(page)
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await seed(page, [log('gym', from('adult') + 100, { stageReached: 'adult' })])
      await page.clock.setFixedTime(TUE_1000)
      await page.goto('./')
      await page.evaluate(() => navigator.serviceWorker.ready)
      await page.reload()
      await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
      const anims = await page.evaluate(() => {
        const out: string[] = []
        for (const e of document.querySelectorAll('*')) {
          const cs = getComputedStyle(e)
          const durs = cs.animationDuration.split(',').map(parseFloat)
          if (cs.animationName !== 'none' && durs.some((d) => d > 0.01) && cs.animationIterationCount === 'infinite') out.push(`${e.getAttribute('class')}: ${cs.animationName}`)
        }
        return out
      })
      expect(anims, 'infinite animations under reduced motion').toEqual([])
      await context.setOffline(true)
      const before = Number(await page.locator('#xp-total').textContent())
      await page.locator('button.task[data-task-id="read"]').click()
      await expect(page.locator('#toast')).toHaveClass(/is-showing/)
      await expect.poll(async () => Number(await page.locator('#xp-total').textContent())).toBe(before + XP('read'))
      await page.reload()
      await expect(page.locator('#xp-total')).toHaveText(String(before + XP('read')))
      await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-evolution', 'strength')
      await context.setOffline(false)
      expect(msgs).toEqual([])
    })

    test('7 navigation: tab bar and back', async ({ page }) => {
      const msgs = collectConsole(page)
      await seed(page, [log('gym', from('juvenile') + 100, { stageReached: 'juvenile' })])
      await page.clock.setFixedTime(TUE_1000)
      await page.goto('./')
      await page.getByRole('link', { name: 'Dragon' }).click()
      await expect(page.locator('#dragon-screen')).toBeVisible()
      await expect(page.locator('#dragon-screen .look-chip')).toBeVisible()
      await page.goBack()
      await expect(page.locator('#home')).toBeVisible()
      await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
      await page.getByRole('link', { name: 'Dragon' }).click()
      await expect(page.locator('#dragon-screen')).toBeVisible()
      await page.getByRole('link', { name: 'Home' }).click()
      await expect(page.locator('#home')).toBeVisible()
      await page.getByRole('link', { name: 'Dragon' }).click()
      await page.getByRole('link', { name: 'Dragon' }).click()
      await expect(page.locator('#dragon-screen')).toBeVisible()
      await page.goBack()
      await expect(page.locator('#home')).toBeVisible()
      // Logging from home is still one tap after navigating.
      await page.locator('button.task[data-task-id="walk"]').click()
      await expect(page.locator('#toast')).toHaveClass(/is-showing/)
      expect(msgs).toEqual([])
    })

    test('8 only the task list scrolls; header and dragon stay put', async ({ page }) => {
      const msgs = collectConsole(page)
      await seed(page, [log('read', from('elder') + 100, { stageReached: 'elder' })])
      await page.clock.setFixedTime(TUE_1000)
      await page.goto('./')
      const before = await page.evaluate(() => ({
        top: document.querySelector('.top')!.getBoundingClientRect().top,
        art: document.querySelector('#dragon-art')!.getBoundingClientRect().top,
        docH: document.documentElement.scrollHeight,
        tasks: (() => { const t = document.querySelector<HTMLElement>('#tasks')!; return { sh: t.scrollHeight, ch: t.clientHeight, oy: getComputedStyle(t).overflowY } })(),
      }))
      expect(before.docH).toBeLessThanOrEqual(h)
      await page.mouse.wheel(0, 600)
      await page.locator('#tasks').evaluate((t) => t.scrollBy(0, 1000))
      await page.evaluate(() => window.scrollBy(0, 1000))
      await page.waitForTimeout(200)
      const after = await page.evaluate(() => ({
        winY: window.scrollY,
        top: document.querySelector('.top')!.getBoundingClientRect().top,
        art: document.querySelector('#dragon-art')!.getBoundingClientRect().top,
        last: document.querySelector('#task-list li:last-child .task')!.getBoundingClientRect().bottom,
        tabTop: document.querySelector('#tabbar')!.getBoundingClientRect().top,
      }))
      expect(after.winY).toBe(0)
      expect(after.top).toBe(before.top)
      expect(after.art).toBe(before.art)
      expect(after.last).toBeLessThanOrEqual(after.tabTop + 1)
      expect(await tapTargets(page)).toEqual([])
      await page.screenshot({ path: `${dir}/${w}x${h}-home-scrolled.png` })
      test.info().annotations.push({ type: 'tasks', description: JSON.stringify(before.tasks) })
      expect(msgs).toEqual([])
    })
  })
}
