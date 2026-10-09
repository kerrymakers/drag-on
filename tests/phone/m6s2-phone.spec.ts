// Phone-tester round checks for M6 slice 2 (Settings: name, wake-up times, reminder reveal).
// Screenshots: tests/screenshots/m6s2-phone-*
import { test, expect, settle, type Page, type Browser, type TestInfo } from '../e2e/fixtures'
import { TASKS } from '../../src/config/tasks'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = 'm6s2-phone'
// Friday 9 October 2026 (BST).
const FRI = (hm: string) => new Date(`2026-10-09T${hm}:00+01:00`)
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

/** First log 30 days ago, never backed up, last log yesterday: the reminder is due. */
function dueData(settings: object = {}) {
  const now = FRI('10:00').getTime()
  return {
    schemaVersion: 1,
    events: [
      { id: 'old', type: 'log', taskId: 'gym', timestamp: now - 30 * DAY, xpAwarded: XP('gym') },
      { id: 'y', type: 'log', taskId: 'gym', timestamp: now - DAY, xpAwarded: XP('gym') },
    ],
    settings,
  }
}

async function freshPage(
  browser: Browser,
  info: TestInfo,
  o: {
    w: number
    h: number
    scheme?: 'light' | 'dark'
    data?: object | null
    hash?: string
    motion?: 'reduce' | 'no-preference'
    time?: Date
  },
) {
  const context = await browser.newContext({
    ...info.project.use,
    viewport: { width: o.w, height: o.h },
    deviceScaleFactor: 3.125,
    colorScheme: o.scheme ?? 'light',
    reducedMotion: o.motion ?? 'reduce',
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  })
  const page = await context.newPage()
  const msgs = collectConsole(page)
  await page.addInitScript(() => (Math.random = () => 0.9999))
  if (o.data) {
    await page.addInitScript((d) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.clear()
        localStorage.setItem('drag-on:v1', d)
        sessionStorage.setItem('seeded', '1')
      }
    }, JSON.stringify(o.data))
  }
  await page.clock.install({ time: o.time ?? FRI('10:00') })
  await page.goto(`./${o.hash ?? ''}`)
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  return { page, context, msgs }
}

const tab = (page: Page, route: string) => page.locator(`.tabbar a.tab[data-route="${route}"]`)
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1') ?? 'null'))

// ---------------------------------------------------------------------------
test('settings layout: fits, tap targets, contrast, switches, light+dark, both sizes', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  test.setTimeout(120_000)
  const fails: string[] = []
  for (const [w, h] of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      // Saturday on so both states show; a name so the field has a value.
      const { page, context, msgs } = await freshPage(browser, info, {
        w,
        h,
        scheme,
        hash: '#/settings',
        data: { schemaVersion: 1, events: [], settings: {} },
      })
      await expect(page.locator('.ss-day')).toHaveCount(7)
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-settings-top-${w}-${scheme}.png` })

      const g = await page.evaluate(() => {
        const all = (s: string) => [...document.querySelectorAll<HTMLElement>(s)]
        const lum = (c: string) => {
          const m = c.match(/[\d.]+/g)!.map(Number)
          const f = (v: number) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
          return 0.2126 * f(m[0]!) + 0.7152 * f(m[1]!) + 0.0722 * f(m[2]!)
        }
        const ratio = (a: string, b: string) => {
          const x = lum(a)
          const y = lum(b)
          return Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100
        }
        const bgOf = (e: Element | null): string => {
          while (e) {
            const b = getComputedStyle(e).backgroundColor
            if (b && b !== 'rgba(0, 0, 0, 0)' && b !== 'transparent') return b
            e = e.parentElement
          }
          return 'rgb(255, 255, 255)'
        }
        const textC = (e: Element) => ratio(getComputedStyle(e).color, bgOf(e))
        const sizes = (s: string) =>
          all(s)
            .filter((e) => e.getBoundingClientRect().width > 0)
            .map((e) => {
              const r = e.getBoundingClientRect()
              return { s: e.id || e.className, w: Math.round(r.width), h: Math.round(r.height) }
            })
        const sw = all('.ss-switch')
        const onSw = sw.find((s) => s.getAttribute('aria-checked') === 'true')!
        const offSw = sw.find((s) => s.getAttribute('aria-checked') === 'false')!
        const knob = (s: HTMLElement) => getComputedStyle(s.querySelector('.ss-switch-track')!, '::after').backgroundColor
        const track = (s: HTMLElement) => getComputedStyle(s.querySelector('.ss-switch-track')!).backgroundColor
        const card = bgOf(document.querySelector('.ss-wake'))
        const scroller = document.querySelector('.ss-scroll') as HTMLElement
        const input = document.querySelector('#ss-name') as HTMLInputElement
        return {
          docW: document.documentElement.scrollWidth,
          vw: innerWidth,
          scrollerOverflowX: scroller.scrollWidth > scroller.clientWidth + 0.5,
          beyond: all('#settings-screen *')
            .filter((e) => {
              const r = e.getBoundingClientRect()
              return r.width > 0 && (r.right > innerWidth + 0.5 || r.left < -0.5)
            })
            .map((e) => e.className || e.tagName),
          clippedText: all('.ss-day-name, .ss-day-off, .ds-card-title, .ss-text, .ss-saved')
            .filter((e) => e.getBoundingClientRect().width > 0 && e.scrollWidth > e.clientWidth + 0.5)
            .map((e) => e.className + ':' + e.textContent),
          rowOverlap: all('.ss-day').flatMap((li) => {
            const kids = [...li.children].filter((k) => (k as HTMLElement).getBoundingClientRect().width > 0)
            const rs = kids.map((k) => k.getBoundingClientRect())
            const out: string[] = []
            for (let i = 1; i < rs.length; i++) if (rs[i]!.left < rs[i - 1]!.right - 0.5) out.push(`${li.dataset.day} ${kids[i - 1]!.className}/${kids[i]!.className}`)
            const lr = li.getBoundingClientRect()
            // The switch's tap area overhangs the row on purpose (a negative right margin),
            // so its track lines up with the card's edge. Allow exactly that much.
            const allowed = (k: Element) => Math.max(0, -parseFloat(getComputedStyle(k).marginRight) || 0)
            kids.forEach((k, i) => {
              const r = rs[i]!
              if (r.right > lr.right + allowed(k) + 0.5) out.push(`${li.dataset.day} ${k.className} past row (${r.right} > ${lr.right})`)
            })
            return out
          }),
          dayNameWidths: all('.ss-day-name').map((e) => Math.round(e.getBoundingClientRect().width)),
          targets: [
            ...sizes('#ss-name'),
            ...sizes('.ss-switch'),
            ...sizes('.ss-time'),
            ...sizes('#ss-export'),
            ...sizes('#ss-import'),
          ],
          contrast: {
            title: textC(document.querySelector('.ss-title')!),
            cardTitle: textC(document.querySelector('.ss-wake .ds-card-title')!),
            intro: textC(document.querySelector('.ss-wake .ss-text')!),
            dayName: textC(document.querySelector('.ss-day-name')!),
            lieIn: textC(all('.ss-day-off').find((e) => e.getBoundingClientRect().width > 0)!),
            time: ratio(getComputedStyle(document.querySelector('.ss-time')!).color, bgOf(document.querySelector('.ss-time'))),
            input: ratio(getComputedStyle(input).color, bgOf(input)),
            placeholder: ratio(getComputedStyle(input, '::placeholder').color, bgOf(input)),
            saved: ratio(getComputedStyle(document.querySelector('.ss-saved')!).color, card),
          },
          switch: {
            onTrack: track(onSw),
            onKnob: knob(onSw),
            offTrack: track(offSw),
            offKnob: knob(offSw),
            card,
            knobVsOnTrack: ratio(knob(onSw), track(onSw)),
            knobVsOffTrack: ratio(knob(offSw), track(offSw)),
            offTrackVsCard: ratio(track(offSw), card),
            onTrackVsCard: ratio(track(onSw), card),
          },
          inputBorderVsCard: ratio(getComputedStyle(input).borderTopColor, card),
          transitions: {
            knob: getComputedStyle(onSw.querySelector('.ss-switch-track')!, '::after').transitionDuration,
            saved: getComputedStyle(document.querySelector('.ss-saved')!).transitionDuration,
          },
        }
      })
      const tag = `${w}x${h} ${scheme}`
      console.log(tag, JSON.stringify(g))
      if (g.docW > g.vw || g.scrollerOverflowX) fails.push(`${tag} sideways scroll`)
      if (g.beyond.length) fails.push(`${tag} off-screen: ${g.beyond.join(',')}`)
      if (g.clippedText.length) fails.push(`${tag} clipped text: ${g.clippedText.join(',')}`)
      if (g.rowOverlap.length) fails.push(`${tag} row overlap: ${g.rowOverlap.join(',')}`)
      for (const t of g.targets) if (t.w < 44 || t.h < 44) fails.push(`${tag} target ${t.s} ${t.w}x${t.h}`)
      for (const [k, v] of Object.entries(g.contrast)) {
        const min = k === 'placeholder' ? 3 : 4.5
        if (v < min) fails.push(`${tag} contrast ${k} ${v}`)
      }
      if (g.switch.knobVsOnTrack < 1.5) fails.push(`${tag} on knob hard to see vs track (${g.switch.knobVsOnTrack})`)
      if (g.switch.knobVsOffTrack < 1.5) fails.push(`${tag} off knob hard to see vs track (${g.switch.knobVsOffTrack})`)
      // An off switch must still read as a switch against the card, but never louder than an on one.
      if (g.switch.offTrackVsCard < 1.5) fails.push(`${tag} off track faint vs card (${g.switch.offTrackVsCard})`)
      if (g.switch.knobVsOffTrack > g.switch.knobVsOnTrack) fails.push(`${tag} off knob stands out more than on knob`)
      if (g.transitions.knob !== '0s' || g.transitions.saved !== '0s') fails.push(`${tag} reduced motion transitions ${JSON.stringify(g.transitions)}`)

      // Close-ups of the wake card's switches, and the bottom of the page.
      await page.locator('.ss-wake').scrollIntoViewIfNeeded()
      await page.locator('.ss-wake').screenshot({ path: `${dir}/${PFX}-wake-card-${w}-${scheme}.png` })
      await page.locator('.ss-scroll').evaluate((s) => s.scrollTo({ top: s.scrollHeight, behavior: 'instant' }))
      await settle(page)
      await page.screenshot({ path: `${dir}/${PFX}-settings-bottom-${w}-${scheme}.png` })
      // Bottom of the scroll: backup buttons above the tab bar.
      const bottom = await page.evaluate(() => ({
        imp: document.querySelector('#ss-import')!.getBoundingClientRect().bottom,
        bar: document.querySelector('.tabbar')!.getBoundingClientRect().top,
      }))
      if (bottom.imp > bottom.bar) fails.push(`${tag} import under tab bar at bottom of scroll`)

      // "Saved" after a toggle, and the switch close-up after it.
      await page.locator('.ss-scroll').evaluate((s) => s.scrollTo({ top: 0, behavior: 'instant' }))
      await page.getByRole('switch', { name: 'Saturday wake-up' }).tap()
      await expect(page.locator('.ss-wake .ss-saved')).toHaveText('Saved')
      await page.locator('.ss-wake').screenshot({ path: `${dir}/${PFX}-wake-saved-${w}-${scheme}.png` })
      if (w === 410) {
        await page.locator('.ss-day[data-day="fri"]').screenshot({ path: `${dir}/${PFX}-switch-on-${scheme}.png`, scale: 'device' })
        await page.locator('.ss-day[data-day="sun"]').screenshot({ path: `${dir}/${PFX}-switch-off-${scheme}.png`, scale: 'device' })
      }
      if (msgs.length) fails.push(`${tag} console ${msgs.join(' | ')}`)
      await context.close()
    }
  }
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test('name input with the keyboard up: stays visible, clear of the tab bar', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const fails: string[] = []
  // Keyboard sizes: Gboard on a Pixel takes ~ 40-45% of the height.
  const cases = [
    [410, 914, 520],
    [410, 914, 440],
    [360, 800, 430],
    [360, 800, 360],
  ] as const
  for (const [w, h, kh] of cases) {
    for (const scheme of ['light', 'dark'] as const) {
      const { page, context, msgs } = await freshPage(browser, info, { w, h, scheme, hash: '#/settings' })
      const input = page.locator('#ss-name')
      await input.tap()
      await expect(input).toBeFocused()
      // Like Chrome with interactive-widget=resizes-content: the layout shrinks.
      await page.setViewportSize({ width: w, height: kh })
      await page.evaluate(() => document.activeElement?.scrollIntoView({ block: 'nearest' }))
      await settle(page)
      await input.pressSequentially('Ember')
      const g = await page.evaluate(() => {
        const r = document.querySelector('#ss-name')!.getBoundingClientRect()
        const bar = document.querySelector('.tabbar')!.getBoundingClientRect()
        const vv = window.visualViewport!
        return { top: r.top, bottom: r.bottom, barTop: bar.top, vh: vv.height, docW: document.documentElement.scrollWidth, vw: innerWidth }
      })
      const tag = `${w}x${h} kb->${kh} ${scheme}`
      console.log(tag, JSON.stringify(g))
      if (g.top < 0 || g.bottom > g.vh) fails.push(`${tag} input outside visible area`)
      if (g.bottom > g.barTop) fails.push(`${tag} input behind tab bar`)
      if (g.docW > g.vw) fails.push(`${tag} sideways scroll`)
      await page.screenshot({ path: `${dir}/${PFX}-keyboard-${w}-${kh}-${scheme}.png` })
      if (msgs.length) fails.push(`${tag} console ${msgs.join(' | ')}`)
      await context.close()
    }
  }
  // Default Chrome (resizes-visual): layout stays, keyboard covers the bottom. The input
  // must still sit above where the keyboard would be.
  for (const [w, h] of SIZES) {
    const { page, context } = await freshPage(browser, info, { w, h, hash: '#/settings' })
    const b = (await page.locator('#ss-name').boundingBox())!
    console.log(`${w}x${h} name input bottom ${b.y + b.height} (keyboard top ~${Math.round(h * 0.55)})`)
    if (b.y + b.height > h * 0.55) fails.push(`${w}x${h} input would be under a 45% keyboard`)
    await context.close()
  }
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test('renaming shows on Home and Dragon, incl. a 20-char wide name at both sizes', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const fails: string[] = []
  for (const [w, h] of SIZES) {
    for (const scheme of ['light', 'dark'] as const) {
      for (const name of ['Ember', 'WWWWWWWWWWWWWWWWWWWW']) {
        const { page, context, msgs } = await freshPage(browser, info, { w, h, scheme, data: dueData({ lastBackupAt: FRI('09:00').getTime() }) })
        await tab(page, 'settings').tap()
        const input = page.locator('#ss-name')
        await input.tap()
        await input.fill('')
        await input.pressSequentially(name + 'XYZ')
        await input.press('Enter')
        await expect(input).toHaveValue((name + 'XYZ').slice(0, 20))
        const saved = (await input.inputValue())
        await expect(page.locator('.ss-name .ss-saved')).toHaveText('Saved')
        if (name === 'Ember') await page.screenshot({ path: `${dir}/${PFX}-name-saved-${w}-${scheme}.png` })
        await tab(page, 'home').tap()
        await expect(page.locator('#dragon-name')).toHaveText(saved)
        await settle(page)
        const short = name === 'Ember' ? 'short' : 'long'
        const hg = await page.evaluate(() => {
          const n = document.querySelector<HTMLElement>('#dragon-name')!
          const r = n.getBoundingClientRect()
          return { clipped: n.scrollWidth > n.clientWidth + 0.5, right: r.right, left: r.left, vw: innerWidth, docW: document.documentElement.scrollWidth }
        })
        await page.screenshot({ path: `${dir}/${PFX}-home-name-${short}-${w}-${scheme}.png` })
        await tab(page, 'dragon').tap()
        await expect(page.locator('#dragon-screen .dragon-name')).toContainText(saved)
        await settle(page)
        const dg = await page.evaluate(() => {
          const n = document.querySelector<HTMLElement>('#dragon-screen .dragon-name')!
          const r = n.getBoundingClientRect()
          return { clipped: n.scrollWidth > n.clientWidth + 0.5, right: r.right, left: r.left, vw: innerWidth, docW: document.documentElement.scrollWidth }
        })
        await page.screenshot({ path: `${dir}/${PFX}-dragon-name-${short}-${w}-${scheme}.png` })
        const tag = `${w} ${scheme} ${short}`
        console.log(tag, saved, JSON.stringify({ hg, dg }))
        for (const [k, g] of Object.entries({ home: hg, dragon: dg })) {
          if (g.right > g.vw + 0.5 || g.left < -0.5 || g.docW > g.vw) fails.push(`${tag} ${k} name off-screen`)
          if (g.clipped) fails.push(`${tag} ${k} name clipped`)
        }
        if (msgs.length) fails.push(`${tag} console ${msgs.join(' | ')}`)
        await context.close()
      }
    }
  }
  expect(fails).toEqual([])
})

// ---------------------------------------------------------------------------
test("today's target off hides Got up on time; on brings it back (both sizes)", async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  for (const [w, h] of SIZES) {
    const scheme = w === 410 ? 'light' : 'dark'
    const { page, context, msgs } = await freshPage(browser, info, { w, h, scheme, time: FRI('06:00') })
    const wake = page.locator('#task-list button.task[data-task-id="wake"]')
    await expect(wake).toBeVisible()
    await tab(page, 'settings').tap()
    const sw = page.getByRole('switch', { name: 'Friday wake-up' })
    await sw.tap()
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await expect(page.locator('.ss-day[data-day="fri"] .ss-day-off')).toBeVisible()
    await tab(page, 'home').tap()
    await expect(wake).toHaveCount(0)
    await settle(page)
    await page.screenshot({ path: `${dir}/${PFX}-home-wake-off-${w}-${scheme}.png` })
    // Remaining tasks still >= 44px and above the tab bar.
    const t = await page.evaluate(() => {
      const bar = document.querySelector('.tabbar')!.getBoundingClientRect().top
      return [...document.querySelectorAll<HTMLElement>('#task-list button.task')].map((b) => {
        const r = b.getBoundingClientRect()
        return { id: b.dataset.taskId, w: r.width, h: r.height, under: r.bottom > bar }
      })
    })
    console.log(w, JSON.stringify(t))
    for (const x of t) {
      expect(x.w, x.id).toBeGreaterThanOrEqual(44)
      expect(x.h, x.id).toBeGreaterThanOrEqual(44)
    }
    // A one-tap log still works with wake off.
    await page.locator('#task-list button.task').first().tap()
    await expect(page.locator('#toast')).toHaveClass(/is-showing/)

    await tab(page, 'settings').tap()
    await sw.tap()
    await expect(sw).toHaveAttribute('aria-checked', 'true')
    await tab(page, 'home').tap()
    await expect(wake).toBeVisible()
    await expect(wake).toBeEnabled()
    await settle(page)
    await page.screenshot({ path: `${dir}/${PFX}-home-wake-on-${w}-${scheme}.png` })
    expect(msgs).toEqual([])
    await context.close()
  }
})

// ---------------------------------------------------------------------------
test('reminder bubble lands on Settings with Backup buttons fully visible (motion on/off, both sizes)', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const fails: string[] = []
  for (const [w, h] of SIZES) {
    for (const motion of ['reduce', 'no-preference'] as const) {
      for (const scheme of ['light', 'dark'] as const) {
        const { page, context, msgs } = await freshPage(browser, info, { w, h, scheme, motion, data: dueData() })
        await expect(page.locator('#speech')).toHaveClass(/is-showing/)
        if (motion === 'reduce') await page.screenshot({ path: `${dir}/${PFX}-reminder-home-${w}-${scheme}.png` })
        await page.locator('#speech .speech-tap').tap()
        await expect(page).toHaveURL(/#\/settings$/)
        // Let a smooth scroll finish.
        await page.waitForTimeout(motion === 'reduce' ? 50 : 1200)
        await settle(page)
        const g = await page.evaluate(() => {
          const r = (s: string) => document.querySelector(s)!.getBoundingClientRect()
          const sc = document.querySelector('.ss-scroll') as HTMLElement
          return {
            scrollTop: Math.round(sc.scrollTop),
            maxScroll: sc.scrollHeight - sc.clientHeight,
            cardTop: Math.round(r('.ss-backup').top),
            scrollerTop: Math.round(r('.ss-scroll').top),
            exportTop: Math.round(r('#ss-export').top),
            importBottom: Math.round(r('#ss-import').bottom),
            barTop: Math.round(r('.tabbar').top),
          }
        })
        const tag = `${w}x${h} ${motion} ${scheme}`
        console.log(tag, JSON.stringify(g))
        if (g.scrollTop === 0) fails.push(`${tag} did not scroll at all`)
        if (g.importBottom > g.barTop) fails.push(`${tag} import button under tab bar (${g.importBottom} > ${g.barTop})`)
        if (g.exportTop < g.scrollerTop) fails.push(`${tag} export above the top`)
        try {
          await expect(page.locator('#ss-export')).toBeInViewport({ ratio: 1, timeout: 500 })
          await expect(page.locator('#ss-import')).toBeInViewport({ ratio: 1, timeout: 500 })
        } catch {
          fails.push(`${tag} buttons not fully in viewport`)
        }
        await page.screenshot({ path: `${dir}/${PFX}-reminder-settings-${w}-${motion}-${scheme}.png` })
        if (msgs.length) fails.push(`${tag} console ${msgs.join(' | ')}`)
        await context.close()
      }
    }
  }
  expect(fails).toEqual([])
})

// Smooth scroll mid-flight: does the reveal start from the top and is it short?
test('reminder: smooth-scroll frames (motion on)', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context } = await freshPage(browser, info, { w: 410, h: 914, motion: 'no-preference', data: dueData() })
  await expect(page.locator('#speech')).toHaveClass(/is-showing/)
  await page.locator('#speech .speech-tap').tap()
  const samples: number[] = []
  for (let i = 0; i < 12; i++) {
    samples.push(await page.locator('.ss-scroll').evaluate((s) => Math.round(s.scrollTop)))
    await page.waitForTimeout(60)
  }
  console.log('smooth samples', JSON.stringify(samples))
  await page.screenshot({ path: `${dir}/${PFX}-reminder-after-smooth.png` })
  await context.close()
})

// ---------------------------------------------------------------------------
test('offline: name and wake edits save and survive a reload', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  const { page, context, msgs } = await freshPage(browser, info, { w: 410, h: 914, time: FRI('06:00') })
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 15000 }).toBe(true)
  await context.setOffline(true)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()

  await tab(page, 'settings').tap()
  await page.locator('#ss-name').fill('Nimbus')
  await page.locator('#ss-name').press('Enter')
  await page.getByRole('switch', { name: 'Friday wake-up' }).tap()
  await page.getByLabel('Monday wake-up time').fill('07:10')
  await page.getByRole('switch', { name: 'Sunday wake-up' }).tap()
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  await expect(page.locator('#ss-name')).toHaveValue('Nimbus')
  await expect(page.getByRole('switch', { name: 'Friday wake-up' })).toHaveAttribute('aria-checked', 'false')
  await expect(page.getByLabel('Monday wake-up time')).toHaveValue('07:10')
  await expect(page.getByRole('switch', { name: 'Sunday wake-up' })).toHaveAttribute('aria-checked', 'true')
  await tab(page, 'home').tap()
  await expect(page.locator('#dragon-name')).toHaveText('Nimbus')
  await expect(page.locator('#task-list button.task[data-task-id="wake"]')).toHaveCount(0)
  // A log offline, one tap, and it lasts.
  await page.locator('#task-list button.task').first().tap()
  await expect(page.locator('#toast')).toHaveClass(/is-showing/)
  await page.reload()
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  const s = await stored(page)
  expect(s.events.length).toBe(1)
  expect(s.settings.dragonName).toBe('Nimbus')
  await page.screenshot({ path: `${dir}/${PFX}-offline-home.png` })
  await context.setOffline(false)
  console.log('offline console', JSON.stringify(msgs))
  expect(msgs.filter((m) => !/net::ERR_INTERNET_DISCONNECTED/.test(m))).toEqual([])
  await context.close()
})
