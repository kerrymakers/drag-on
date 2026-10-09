// Phone-tester round checks for M6 slice 1 (Settings, backup export/import, reminder).
// Screenshots: tests/screenshots/m6s1-phone-*
import { readFile } from 'node:fs/promises'
import { test, expect, settle, type Page, type Browser, type TestInfo } from '../e2e/fixtures'
import { TASKS } from '../../src/config/tasks'
import { BACKUP_REMINDER } from '../../src/ui/copy'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = 'm6s1-phone'
const NOW = new Date('2026-10-09T10:00:00+01:00')
const DAY = 86_400_000
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const SIZES = [
  [410, 914],
  [360, 800],
] as const

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

/** First log 30 days ago, never backed up, last log yesterday with `xp` (reaching `stage`). */
function dueData(xp = XP('gym'), stage?: string, settings: object = {}) {
  return {
    schemaVersion: 1,
    events: [
      { id: 'old', type: 'log', taskId: 'gym', timestamp: NOW.getTime() - 30 * DAY, xpAwarded: XP('gym') },
      { id: 'y', type: 'log', taskId: 'gym', timestamp: NOW.getTime() - DAY, xpAwarded: xp, ...(stage ? { stageReached: stage } : {}) },
    ],
    settings,
  }
}

async function freshPage(
  browser: Browser,
  info: TestInfo,
  w: number,
  h: number,
  scheme: 'light' | 'dark',
  d: object | null,
  hash = '',
  motion: 'reduce' | 'no-preference' = 'reduce',
) {
  const context = await browser.newContext({
    ...info.project.use,
    viewport: { width: w, height: h },
    deviceScaleFactor: 3.125,
    colorScheme: scheme,
    reducedMotion: motion,
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  })
  const page = await context.newPage()
  const msgs = collectConsole(page)
  await page.addInitScript(() => (Math.random = () => 0.9999))
  if (d) {
    await page.addInitScript((d) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.clear()
        localStorage.setItem('drag-on:v1', d)
        sessionStorage.setItem('seeded', '1')
      }
    }, JSON.stringify(d))
  }
  await page.clock.install({ time: NOW })
  await page.goto(`./${hash}`)
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  return { page, context, msgs }
}

// ---------------------------------------------------------------------------
test('tab bar: five tabs fit, labels whole, 44px+, no overlap, dot placement (both sizes, light+dark)', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const fails: string[] = []
  for (const [w, h] of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      const { page, context, msgs } = await freshPage(browser, info, w, h, scheme, dueData())
      await expect(page.locator('.tab-dot').last()).toBeVisible()
      await settle(page)
      const g = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll<HTMLElement>('.tabbar a.tab')]
        const r = tabs.map((t) => t.getBoundingClientRect())
        const labels = [...document.querySelectorAll<HTMLElement>('.tabbar .tab-label')]
        const lr = labels.map((l) => l.getBoundingClientRect())
        const dot = document.querySelector('.tab[data-route="settings"] .tab-dot')!.getBoundingClientRect()
        const icon = document.querySelector('.tab[data-route="settings"] svg')!.getBoundingClientRect()
        const bar = document.querySelector('.tabbar')!.getBoundingClientRect()
        return {
          tabs: r.map((x) => ({ l: Math.round(x.left), w: Math.round(x.width), h: Math.round(x.height) })),
          labelsClipped: labels.map((l, i) => l.scrollWidth > l.clientWidth + 0.5 || lr[i]!.right > r[i]!.right + 0.5 || lr[i]!.left < r[i]!.left - 0.5),
          labelLines: labels.map((l) => Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight || '16'))),
          labelGap: lr.slice(1).map((x, i) => Math.round(x.left - lr[i]!.right)),
          overlap: r.slice(1).some((x, i) => x.left < r[i]!.right - 0.5),
          barRight: bar.right,
          vw: innerWidth,
          docW: document.documentElement.scrollWidth,
          dot: { l: dot.left, r: dot.right, t: dot.top, b: dot.bottom },
          dotOverIconPct: (() => {
            const ix = Math.max(0, Math.min(dot.right, icon.right) - Math.max(dot.left, icon.left))
            const iy = Math.max(0, Math.min(dot.bottom, icon.bottom) - Math.max(dot.top, icon.top))
            return Math.round(((ix * iy) / (dot.width * dot.height)) * 100)
          })(),
          dotInTab: dot.left >= r[4]!.left && dot.right <= r[4]!.right && dot.top >= r[4]!.top,
        }
      })
      const tag = `${w}x${h} ${scheme}`
      console.log(tag, JSON.stringify(g))
      g.tabs.forEach((t, i) => {
        if (t.w < 44 || t.h < 44) fails.push(`${tag} tab ${i} ${t.w}x${t.h}`)
      })
      if (g.labelsClipped.some(Boolean)) fails.push(`${tag} label clipped ${g.labelsClipped}`)
      if (g.labelGap.some((x) => x < 2)) fails.push(`${tag} labels close ${g.labelGap}`)
      if (g.overlap) fails.push(`${tag} tabs overlap`)
      if (g.docW > g.vw) fails.push(`${tag} horizontal scroll`)
      if (!g.dotInTab) fails.push(`${tag} dot outside tab`)
      await page.screenshot({ path: `${dir}/${PFX}-tabbar-${w}-${scheme}.png`, clip: { x: 0, y: h - 90, width: w, height: 90 } })
      await page.screenshot({ path: `${dir}/${PFX}-home-due-${w}-${scheme}.png` })
      if (msgs.length) fails.push(`${tag} console ${msgs.join(' | ')}`)
      await context.close()
    }
  }
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test('settings screen: light/dark at both sizes, contrast-ish, fits, normal motion vs reduced', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const fails: string[] = []
  for (const [w, h] of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      const { page, context, msgs } = await freshPage(browser, info, w, h, scheme, dueData(), '#/settings')
      await expect(page.locator('#settings-screen')).toBeVisible()
      // Since M6 slice 2 the Name and Wake-up cards come first, so bring Backup into view.
      await page.locator('.ss-scroll').evaluate((s) => {
        const card = s.querySelector('.ss-backup')!
        s.scrollTo({ top: s.scrollTop + card.getBoundingClientRect().top - s.getBoundingClientRect().top - 12, behavior: 'instant' })
      })
      await settle(page)
      const g = await page.evaluate(() => {
        const q = (s: string) => document.querySelector<HTMLElement>(s)!
        const tab = document.querySelector('.tabbar')!.getBoundingClientRect()
        const rect = (s: string) => {
          const r = q(s).getBoundingClientRect()
          return { t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
        }
        const lum = (c: string) => {
          const m = c.match(/[\d.]+/g)!.map(Number)
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          return 0.2126 * f(m[0]!) + 0.7152 * f(m[1]!) + 0.0722 * f(m[2]!)
        }
        const bgOf = (e: Element | null): string => {
          while (e) {
            const b = getComputedStyle(e).backgroundColor
            if (b && !b.includes('rgba(0, 0, 0, 0)') && b !== 'transparent') return b
            e = e.parentElement
          }
          return 'rgb(255,255,255)'
        }
        const contrast = (s: string) => {
          const e = q(s)
          const a = lum(getComputedStyle(e).color)
          const b = lum(bgOf(e))
          return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10
        }
        return {
          export: rect('#ss-export'),
          import: rect('#ss-import'),
          card: rect('.ss-backup'),
          tabTop: Math.round(tab.top),
          docW: document.documentElement.scrollWidth,
          vw: innerWidth,
          contrast: {
            title: contrast('.ss-title'),
            text: contrast('.ss-text'),
            last: contrast('.ss-last'),
            export: contrast('#ss-export'),
            import: contrast('#ss-import'),
          },
        }
      })
      const tag = `${w}x${h} ${scheme}`
      console.log(tag, JSON.stringify(g))
      for (const k of ['export', 'import'] as const) if (g[k].h < 44 || g[k].w < 44) fails.push(`${tag} ${k} ${g[k].w}x${g[k].h}`)
      if (g.card.b > g.tabTop) fails.push(`${tag} card runs under tab bar (${g.card.b} > ${g.tabTop})`)
      if (g.docW > g.vw) fails.push(`${tag} horizontal scroll`)
      for (const [k, v] of Object.entries(g.contrast)) if (v < 4.5) fails.push(`${tag} contrast ${k} ${v}`)
      await page.screenshot({ path: `${dir}/${PFX}-settings-${w}-${scheme}.png` })

      // Export toast, and the refused-import status, in this scheme.
      if (w === 410) {
        const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#ss-export').tap()])
        await dl.path()
        await expect(page.locator('.ss-toast')).toHaveClass(/is-showing/)
        await settle(page)
        const t = await page.evaluate(() => {
          const t = document.querySelector('.ss-toast')!.getBoundingClientRect()
          const i = document.querySelector('#ss-import')!.getBoundingClientRect()
          const bar = document.querySelector('.tabbar')!.getBoundingClientRect()
          return { toastTop: t.top, toastBottom: t.bottom, importBottom: i.bottom, barTop: bar.top }
        })
        console.log(tag, 'toast', JSON.stringify(t))
        if (t.toastBottom > t.barTop + 0.5) fails.push(`${tag} toast over tab bar`)
        await page.screenshot({ path: `${dir}/${PFX}-settings-exported-${scheme}.png` })
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#ss-import').tap()])
        await chooser.setFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('nope') })
        await expect(page.locator('.ss-status')).toBeVisible()
        await settle(page)
        await page.screenshot({ path: `${dir}/${PFX}-settings-refused-${scheme}.png` })
      }
      if (msgs.length) fails.push(`${tag} console ${msgs.join(' | ')}`)
      await context.close()
    }
  }
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test('reduced motion: sheet and buttons calm; without it the sheet rises', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const file = { schemaVersion: 1, events: dueData().events, exportedAt: NOW.getTime() - 3 * DAY }
  const out: Record<string, unknown> = {}
  for (const motion of ['reduce', 'no-preference'] as const) {
    const { page, context, msgs } = await freshPage(browser, info, 410, 914, 'light', dueData(), '#/settings', motion)
    const btn = await page.evaluate(() => getComputedStyle(document.querySelector('#ss-export')!).transitionDuration)
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#ss-import').tap()])
    await chooser.setFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
    await expect(page.locator('dialog.sheet')).toBeVisible()
    const anims = await page.evaluate(() =>
      document.getAnimations().map((a) => {
        const t = a.effect!.getComputedTiming()
        return { name: (a as CSSAnimation).animationName, dur: t.duration, iter: t.iterations }
      }),
    )
    const sheetAnim = await page.evaluate(() => getComputedStyle(document.querySelector('dialog.sheet')!).animationName)
    out[motion] = { btn, sheetAnim, anims: anims.filter((a) => a.iter !== Infinity) }
    expect(msgs).toEqual([])
    await context.close()
  }
  console.log('motion', JSON.stringify(out))
  expect((out['reduce'] as { sheetAnim: string }).sheetAnim).toBe('overlay-in')
  expect((out['reduce'] as { btn: string }).btn).toBe('0s')
  expect((out['no-preference'] as { sheetAnim: string }).sheetAnim).toBe('sheet-in')
})

// ---------------------------------------------------------------------------
test('import sheet: layout at both sizes light/dark, focus inside, backdrop tap and Escape cancel', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const fails: string[] = []
  // Includes one broken event so the "dropped" note shows too (longest sheet).
  const file = {
    schemaVersion: 1,
    events: [...dueData(700, 'whelp').events, { id: 'bad', type: 'log' }],
    settings: { dragonName: 'Ember' },
    exportedAt: NOW.getTime() - 3 * DAY,
  }
  for (const [w, h] of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      const { page, context, msgs } = await freshPage(browser, info, w, h, scheme, dueData(), '#/settings')
      const rawBefore = await page.evaluate(() => localStorage.getItem('drag-on:v1'))
      const pick = async () => {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#ss-import').tap()])
        await chooser.setFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
        await expect(page.locator('dialog.sheet')).toBeVisible()
        await settle(page)
      }
      await pick()
      const tag = `${w}x${h} ${scheme}`
      const g = await page.evaluate(() => {
        const s = document.querySelector('dialog.sheet')!.getBoundingClientRect()
        const r = (q: string) => {
          const x = document.querySelector(q)!.getBoundingClientRect()
          return { l: Math.round(x.left), r: Math.round(x.right), t: Math.round(x.top), b: Math.round(x.bottom), w: Math.round(x.width), h: Math.round(x.height) }
        }
        return {
          sheet: { t: Math.round(s.top), b: Math.round(s.bottom), w: Math.round(s.width) },
          confirm: r('#sheet-confirm'),
          cancel: r('#sheet-cancel'),
          vh: innerHeight,
          vw: innerWidth,
          active: document.activeElement?.id,
          texts: [...document.querySelectorAll('dialog.sheet .sheet-text, dialog.sheet .sheet-title, dialog.sheet .sheet-fact')].map((e) => e.textContent),
          overflowing: [...document.querySelectorAll('dialog.sheet *')].filter((e) => {
            const x = e.getBoundingClientRect()
            return x.right > innerWidth + 0.5 || x.left < -0.5
          }).length,
        }
      })
      console.log(tag, JSON.stringify(g))
      if (g.active !== 'sheet-cancel') fails.push(`${tag} focus on ${g.active}`)
      for (const k of ['confirm', 'cancel'] as const) if (g[k].h < 44 || g[k].w < 44) fails.push(`${tag} ${k} ${g[k].w}x${g[k].h}`)
      if (g.sheet.b < g.vh - 1 || g.sheet.b > g.vh + 1) fails.push(`${tag} sheet not at bottom (${g.sheet.b} vs ${g.vh})`)
      if (g.sheet.t < 0) fails.push(`${tag} sheet off top`)
      if (g.overflowing) fails.push(`${tag} ${g.overflowing} elements overflow`)
      if (g.confirm.t < g.vh / 2) fails.push(`${tag} confirm above thumb zone`)
      await page.screenshot({ path: `${dir}/${PFX}-sheet-${w}-${scheme}.png` })

      // Focus stays in the sheet: Tab a few times.
      const seen: string[] = []
      for (let i = 0; i < 4; i++) {
        await page.keyboard.press('Tab')
        seen.push(await page.evaluate(() => (document.activeElement?.closest('dialog') ? 'in' : `out:${document.activeElement?.tagName}#${document.activeElement?.id}`)))
      }
      if (seen.some((s) => s !== 'in')) console.log(tag, 'tab order', seen)
      // Chrome lets Tab move to the browser chrome (body) from a modal; only flag page content outside.
      if (seen.some((s) => s.startsWith('out:') && !/out:BODY#$/.test(s))) fails.push(`${tag} focus escaped ${seen}`)

      // Backdrop tap (above the sheet) cancels.
      await page.touchscreen.tap(w / 2, 40)
      await expect(page.locator('dialog.sheet')).toHaveCount(0)
      const after = await page.evaluate(() => document.activeElement?.id)
      if (after !== 'ss-import') fails.push(`${tag} focus after backdrop cancel ${after}`)
      // Tap inside the card (not on a button) does not cancel.
      await pick()
      const facts = (await page.locator('dialog.sheet .sheet-facts').boundingBox())!
      await page.touchscreen.tap(facts.x + 10, facts.y + facts.height / 2)
      await expect(page.locator('dialog.sheet')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('dialog.sheet')).toHaveCount(0)
      expect(await page.evaluate(() => localStorage.getItem('drag-on:v1'))).toBe(rawBefore)
      // Back gesture-ish: history back while sheet open should not leave data changed.
      if (msgs.length) fails.push(`${tag} console ${msgs.join(' | ')}`)
      await context.close()
    }
  }
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test('reminder bubble: clear of head and task buttons, at several stages, both sizes, light/dark', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const fails: string[] = []
  const cases: [string, number, string | undefined][] = [
    ['egg', 10, undefined],
    ['hatchling', 300, 'hatchling'],
    ['whelp', 700, 'whelp'],
    ['juvenile', 1600, 'juvenile'],
    ['adult', 4100, 'adult'],
    ['elder', 8400, 'elder'],
  ]
  for (const [w, h] of SIZES) {
    for (const [name, xp, stage] of cases) {
      for (const scheme of ['light', 'dark'] as const) {
        if (scheme === 'dark' && !['egg', 'hatchling'].includes(name)) continue
        const { page, context, msgs } = await freshPage(browser, info, w, h, scheme, dueData(xp, stage))
        await expect(page.locator('#speech')).toHaveClass(/is-showing/)
        await settle(page)
        const g = await page.evaluate(() => {
          const q = (s: string) => document.querySelector(s)
          const sp = q('#speech')!.getBoundingClientRect()
          const cover = (x: DOMRect | undefined) => {
            if (!x || !x.width) return 0
            const ix = Math.max(0, Math.min(sp.right, x.right) - Math.max(sp.left, x.left))
            const iy = Math.max(0, Math.min(sp.bottom, x.bottom) - Math.max(sp.top, x.top))
            return Math.round(((ix * iy) / (x.width * x.height)) * 1000) / 10
          }
          const headEl = q('#dragon-art .dragon-head-box') ?? q('#dragon-art svg')
          const firstTask = q('button.task')!.getBoundingClientRect()
          const header = q('.top')!.getBoundingClientRect()
          const text = q('#speech')!
          const range = document.createRange()
          range.selectNodeContents(text)
          const tr = range.getBoundingClientRect()
          return {
            text: text.textContent,
            rect: { l: Math.round(sp.left), t: Math.round(sp.top), w: Math.round(sp.width), h: Math.round(sp.height) },
            headCover: cover(headEl?.getBoundingClientRect()),
            hasHeadBox: !!q('#dragon-art .dragon-head-box'),
            overTasks: sp.bottom > firstTask.top,
            underHeader: sp.top < header.bottom,
            inView: sp.left >= 0 && sp.right <= innerWidth && sp.top >= 0 && sp.bottom <= innerHeight,
            clipped: tr.left < sp.left - 0.5 || tr.right > sp.right + 0.5 || tr.top < sp.top - 0.5 || tr.bottom > sp.bottom + 0.5,
            tail: q('#speech')!.getAttribute('data-tail'),
          }
        })
        const tag = `${w}x${h} ${name} ${scheme}`
        console.log(tag, JSON.stringify(g))
        if (!BACKUP_REMINDER.includes(g.text ?? '')) fails.push(`${tag} not reminder: ${g.text}`)
        if (g.headCover > 0) fails.push(`${tag} covers head ${g.headCover}% (headbox ${g.hasHeadBox})`)
        if (g.overTasks) fails.push(`${tag} over task buttons`)
        if (g.underHeader) fails.push(`${tag} under header`)
        if (!g.inView) fails.push(`${tag} off screen`)
        if (g.clipped) fails.push(`${tag} text clipped`)
        if (g.rect.h < 44 || g.rect.w < 44) fails.push(`${tag} bubble ${g.rect.w}x${g.rect.h}`)
        await page.screenshot({ path: `${dir}/${PFX}-reminder-${w}-${name}-${scheme}.png` })
        if (msgs.length) fails.push(`${tag} console ${msgs.join(' | ')}`)
        await context.close()
      }
    }
  }
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test('home task buttons: big, in the lower half, one-tap log with feedback, with five tabs', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const fails: string[] = []
  for (const [w, h] of SIZES) {
    const { page, context, msgs } = await freshPage(browser, info, w, h, 'light', dueData())
    await settle(page)
    const g = await page.evaluate(() => {
      const bar = document.querySelector('.tabbar')!.getBoundingClientRect()
      const tasks = [...document.querySelectorAll('button.task')].map((b) => {
        const r = b.getBoundingClientRect()
        return { id: (b as HTMLElement).dataset.taskId, t: Math.round(r.top), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height) }
      })
      return { tasks, barTop: Math.round(bar.top), vh: innerHeight }
    })
    console.log(`${w}x${h}`, JSON.stringify(g))
    const visible = g.tasks.filter((t) => t.b <= g.barTop)
    for (const t of g.tasks) if (t.h < 44 || t.w < 44) fails.push(`${w} task ${t.id} ${t.w}x${t.h}`)
    // Most of the task list must sit in the lower half (at 360x800 the first button starts ~33px above it, unchanged by this slice).
    const lowerHalf = g.tasks.filter((t) => (t.t + t.b) / 2 >= g.vh / 2).length
    if (lowerHalf < g.tasks.length - 1) fails.push(`${w} only ${lowerHalf} tasks centred in lower half`)
    if (visible.length < 3) fails.push(`${w} only ${visible.length} tasks visible above tab bar`)
    // One tap logs, with a toast.
    await page.locator('button.task').first().tap()
    await expect(page.locator('#toast')).toHaveClass(/is-showing/)
    await page.screenshot({ path: `${dir}/${PFX}-home-logged-${w}.png` })
    if (msgs.length) fails.push(`${w} console ${msgs.join(' | ')}`)
    await context.close()
  }
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test('offline: export, import, log and reload all work with the network off', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context, msgs } = await freshPage(browser, info, 410, 914, 'light', dueData())
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()

  await page.locator('.tabbar a.tab[data-route="settings"]').tap()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#ss-export').tap()])
  const exported = JSON.parse(await readFile((await dl.path())!, 'utf8'))
  expect(exported.events).toHaveLength(2)
  await expect(page.locator('.ss-last')).toHaveText('Last backup: today')

  // Import a different backup offline.
  const file = { schemaVersion: 1, events: dueData(300, 'hatchling').events, settings: { dragonName: 'Offline' }, exportedAt: NOW.getTime() - 2 * DAY }
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('#ss-import').tap()])
  await chooser.setFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.locator('dialog.sheet')).toBeVisible()
  await page.locator('#sheet-confirm').tap()
  await expect(page.locator('dialog.sheet')).toHaveCount(0)

  // Log on Home, then reload offline: both the import and the log are kept.
  await page.locator('.tabbar a.tab[data-route="home"]').tap()
  await expect(page.locator('#dragon-name')).toHaveText('Offline')
  const before = Number(await page.locator('#xp-total').textContent())
  await page.locator('button.task[data-task-id="gym"]').tap()
  await expect(page.locator('#toast')).toHaveClass(/is-showing/)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await expect(page.locator('#dragon-name')).toHaveText('Offline')
  expect(Number(await page.locator('#xp-total').textContent())).toBeGreaterThan(before)
  await page.screenshot({ path: `${dir}/${PFX}-offline-home.png` })
  await context.setOffline(false)
  console.log('offline console', JSON.stringify(msgs))
  expect(msgs.filter((m) => !/net::ERR_INTERNET_DISCONNECTED/.test(m))).toEqual([])
  await context.close()
})
