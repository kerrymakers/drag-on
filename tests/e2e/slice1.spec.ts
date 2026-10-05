import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

const shotDir = 'tests/screenshots'

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

for (const scheme of ['light', 'dark'] as const) {
  test(`home screenshot ${scheme}`, async ({ page }, info) => {
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'An egg is waiting…' })).toBeVisible()
    await page.screenshot({ path: `${shotDir}/home-${info.project.name}-${scheme}.png` })

    // Layout: card fully inside viewport, no horizontal overflow
    const vp = page.viewportSize()!
    const card = await page.locator('.card').boundingBox()
    console.log(info.project.name, scheme, 'card', card, 'vp', vp)
    expect(card!.x).toBeGreaterThanOrEqual(0)
    expect(card!.x + card!.width).toBeLessThanOrEqual(vp.width)
    expect(card!.y + card!.height).toBeLessThanOrEqual(vp.height)
    const sw = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(sw).toBeLessThanOrEqual(vp.width)

    // Tap targets
    const targets = await page.$$eval('button, a, [role=button], input, select, textarea, [onclick]', (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return { tag: e.tagName, text: e.textContent?.trim(), w: r.width, h: r.height }
      }),
    )
    console.log('tap targets', JSON.stringify(targets))
    for (const t of targets) {
      expect(t.w).toBeGreaterThanOrEqual(44)
      expect(t.h).toBeGreaterThanOrEqual(44)
    }

    // Contrast info
    const colours = await page.evaluate(() => {
      const g = (s: string) => getComputedStyle(document.querySelector(s)!)
      return { bg: g('body').backgroundColor, surface: g('.card').backgroundColor, title: g('.card-title').color, text: g('.card-text').color }
    })
    console.log('colours', scheme, JSON.stringify(colours))

    await page.waitForTimeout(500)
    expect(msgs, msgs.join('\n')).toEqual([])
  })
}

test('egg wobbles normally and stops with reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./')
  const anim = await page.locator('.egg').evaluate((e) => getComputedStyle(e).animationName)
  expect(anim).toBe('egg-wobble')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const anim2 = await page.locator('.egg').evaluate((e) => ({
    name: getComputedStyle(e).animationName,
    running: e.getAnimations().length,
  }))
  console.log('reduced motion', anim2)
  expect(anim2.name).toBe('none')
  expect(anim2.running).toBe(0)
})

test('mid-wobble screenshot (motion on)', async ({ page }, info) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto('./')
  // jump to ~68% of 3.2s cycle via animation currentTime
  await page.locator('.egg').evaluate((e) => e.getAnimations().forEach((a) => { a.pause(); a.currentTime = 3200 * 0.68 }))
  await page.screenshot({ path: `${shotDir}/home-${info.project.name}-wobble.png` })
})

test('manifest is served and valid; icons load', async ({ page, request }) => {
  await page.goto('./')
  const href = await page.locator('link[rel=manifest]').getAttribute('href')
  expect(href).toBeTruthy()
  const murl = new URL(href!, page.url()).toString()
  const res = await request.get(murl)
  expect(res.ok()).toBeTruthy()
  console.log('manifest content-type', res.headers()['content-type'])
  const m = await res.json()
  console.log('manifest', JSON.stringify(m))
  expect(m.name).toBe('Drag-on')
  expect(m.display).toBe('standalone')
  expect(new URL(m.start_url, murl).pathname).toBe('/drag-on/')
  expect(new URL(m.scope, murl).pathname).toBe('/drag-on/')
  expect(m.icons.some((i: any) => i.sizes === '192x192')).toBeTruthy()
  expect(m.icons.some((i: any) => i.sizes === '512x512')).toBeTruthy()
  for (const icon of m.icons) {
    const u = new URL(icon.src, murl).toString()
    const r = await request.get(u)
    console.log('icon', u, r.status(), r.headers()['content-type'])
    expect(r.ok()).toBeTruthy()
    expect(r.headers()['content-type']).toContain('image/png')
  }
  // favicon / apple-touch links in <head>
  const links = await page.$$eval('link[rel~=icon], link[rel=apple-touch-icon]', (ls) => ls.map((l) => (l as HTMLLinkElement).href))
  for (const l of links) {
    const r = await request.get(l)
    console.log('head icon', l, r.status())
    expect(r.ok(), `${l} -> ${r.status()}`).toBeTruthy()
  }
})

test('service worker registers and page reloads offline', async ({ page, context }, info) => {
  const msgs = collectConsole(page)
  await page.goto('./')
  const scope = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.scope
  })
  console.log('sw scope', scope)
  expect(new URL(scope).pathname).toBe('/drag-on/')
  // Wait for SW to control the page (autoUpdate + clientsClaim)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 2000 }).catch(async () => {
    await page.reload()
  })
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'An egg is waiting…' })).toBeVisible()
  const cssOk = await page.locator('.card').evaluate((e) => getComputedStyle(e).borderRadius)
  expect(cssOk).toBe('28px')
  await page.screenshot({ path: `${shotDir}/home-${info.project.name}-offline.png` })
  // deep link offline falls back to index.html
  await page.goto('./some/deep/link')
  await expect(page.getByRole('heading', { name: 'An egg is waiting…' })).toBeVisible()
  await context.setOffline(false)
  const relevant = msgs.filter((m) => !m.includes('ERR_INTERNET_DISCONNECTED'))
  console.log('sw console', msgs)
  expect(relevant, relevant.join('\n')).toEqual([])
})

test('offline reload straight after first load (no extra online reload)', async ({ page, context }) => {
  await page.goto('./')
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return reg.active?.state
  })
  const controlledBefore = await page.evaluate(() => !!navigator.serviceWorker.controller)
  console.log('controlled on first load:', controlledBefore)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'An egg is waiting…' })).toBeVisible()
  await context.setOffline(false)
})
