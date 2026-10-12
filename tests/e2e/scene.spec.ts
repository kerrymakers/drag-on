// The scene behind the dragon on Home: the sky follows the London clock (dawn, day,
// evening, night), cross-fades without moving anything, keeps text readable in every
// sky in light and dark mode, and stays clear of the heading and the task buttons.
import { test, expect, settle, type Page } from './fixtures'
import { SCENE } from '../../src/config/scene'
import { sunOn } from '../../src/game/scene'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })

const DAY = 86_400_000
type Sky = 'dawn' | 'day' | 'evening' | 'night'
const SKIES: readonly Sky[] = ['dawn', 'day', 'evening', 'night']

// 13 October 2026 is BST (+01:00); the config's sun times are GMT.
// 13 October's sun, blended between the mid-month rows (game/scene.ts), in GMT minutes.
const OCT = sunOn(2026, 10, 13, SCENE.sun)!
const RISE = Math.ceil(OCT.rise) + 60
const SET = Math.ceil(OCT.set) + 60
const T = SCENE.twilightMinutes
const pad = (n: number) => String(n).padStart(2, '0')
const at = (m: number) => new Date(`2026-10-13T${pad(Math.floor(m / 60))}:${pad(m % 60)}:00+01:00`)
/** A time well inside each sky on 13 October. */
const TIME: Record<Sky, Date> = { dawn: at(RISE), day: at(12 * 60), evening: at(SET), night: at(22 * 60) }

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

/**
 * A hatchling logged today and yesterday (so the streak chip shows), with no backup
 * for weeks, so the dragon mentions it in a speech bubble: every piece of text on Home.
 */
function dataFor(now: Date) {
  const t = now.getTime()
  return {
    schemaVersion: 1,
    events: [
      { id: 'a', type: 'log', taskId: 'read', timestamp: t - 20 * DAY, xpAwarded: 100, stageReached: 'hatchling' },
      { id: 'b', type: 'log', taskId: 'read', timestamp: t - DAY, xpAwarded: 25 },
      { id: 'c', type: 'log', taskId: 'walk', timestamp: t - 60_000, xpAwarded: 15 },
    ],
    settings: {},
  }
}

async function open(page: Page, now: Date, opts: { install?: boolean; data?: object } = {}) {
  if (opts.install) await page.clock.install({ time: now })
  else await page.clock.setFixedTime(now)
  await page.goto('./')
  await page.evaluate((d) => {
    localStorage.clear()
    localStorage.setItem('drag-on:v1', JSON.stringify(d))
  }, opts.data ?? dataFor(now))
  await page.reload()
  await expect(page.locator('#task-list button.task').first()).toBeVisible()
}

type R = { l: number; t: number; r: number; b: number }
const overlaps = (a: R, b: R) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b

/** Where everything on Home is, to check nothing moves or overlaps. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const r = (e: Element | null): R | null => {
      if (!e) return null
      const b = e.getBoundingClientRect()
      return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) }
    }
    const q = (s: string) => document.querySelector(s)
    /** The box the words themselves take up (a heading's own box is the full width). */
    const words = (s: string) => {
      const range = document.createRange()
      range.selectNodeContents(q(s)!)
      return r(range as unknown as Element)
    }
    return {
      scene: r(q('#scene'))!,
      top: r(q('.top'))!,
      name: words('#dragon-name')!,
      stage: words('#stage-name')!,
      chip: r(q('#mood-chip'))!,
      dragon: r(q('#dragon-art .dragon-svg'))!,
      floor: r(q('#scene-floor svg'))!,
      growth: r(q('.growth'))!,
      firstTask: r(q('#task-list .task'))!,
      tasks: [...document.querySelectorAll('#task-list .task')].map((e) => r(e)!),
      // The sky's decorations showing now (sun, moon, clouds), as they sit.
      decor: [...document.querySelectorAll('#scene .scene-sun, #scene .scene-moon, #scene .scene-cloud')]
        .filter((e) => Number(getComputedStyle(e).opacity) > 0.05)
        .map((e) => ({ cls: e.className as unknown as string, ...r(e)! })),
    }
  })
}

/**
 * The worst contrast between an element's text colour and what's behind its text:
 * hides the text, photographs the box its words take up, and measures every pixel
 * there (ignoring the faintest 2%, for edges).
 */
async function contrastOf(page: Page, selector: string): Promise<{ ratio: number; color: string }> {
  const info = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)!
    const range = document.createRange()
    range.selectNodeContents(el)
    const b = range.getBoundingClientRect()
    const color = getComputedStyle(el.querySelector('button') ?? el).color
    el.dataset.hideText = '1'
    return { color, x: b.left, y: b.top, w: b.width, h: b.height }
  }, selector)
  await page.addStyleTag({ content: '[data-hide-text], [data-hide-text] * { color: transparent !important; text-shadow: none !important; }' })
  const png = await page.screenshot({ clip: { x: info.x, y: info.y, width: Math.max(1, info.w), height: Math.max(1, info.h) } })
  await page.evaluate((sel) => delete document.querySelector<HTMLElement>(sel)!.dataset.hideText, selector)
  const ratio = await page.evaluate(
    async ({ b64, color }) => {
      const img = new Image()
      img.src = `data:image/png;base64,${b64}`
      await img.decode()
      const c = document.createElement('canvas')
      c.width = img.width
      c.height = img.height
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0)
      const px = ctx.getImageData(0, 0, c.width, c.height).data
      const lin = (v: number) => {
        const s = v / 255
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
      const [tr, tg, tb] = color.match(/[\d.]+/g)!.map(Number) as [number, number, number]
      const lt = lum(tr, tg, tb)
      const ratios: number[] = []
      for (let i = 0; i < px.length; i += 4) {
        const lb = lum(px[i]!, px[i + 1]!, px[i + 2]!)
        ratios.push((Math.max(lt, lb) + 0.05) / (Math.min(lt, lb) + 0.05))
      }
      ratios.sort((a, b) => a - b)
      return ratios[Math.floor(ratios.length * 0.02)]!
    },
    { b64: png.toString('base64'), color: info.color },
  )
  return { ratio: Math.round(ratio * 100) / 100, color: info.color }
}

test('shows each sky at the right time of day', async ({ page }) => {
  const msgs = collectConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const cases: [Date, Sky][] = [
    [at(RISE - T - 1), 'night'],
    [at(RISE - T), 'dawn'],
    [at(RISE + T - 1), 'dawn'],
    [at(RISE + T), 'day'],
    [at(SET - T - 1), 'day'],
    [at(SET - T), 'evening'],
    [at(SET + T), 'night'],
    [new Date('2026-10-13T00:00:00+01:00'), 'night'],
    [new Date('2026-10-14T04:00:00+01:00'), 'night'],
    // After the clocks go back (25 October), evening comes an hour earlier on the clock.
    [new Date(`2026-10-26T${pad(Math.floor(Math.round(sunOn(2026, 10, 26, SCENE.sun)!.set) / 60))}:${pad(Math.round(sunOn(2026, 10, 26, SCENE.sun)!.set) % 60)}:00Z`), 'evening'],
  ]
  for (const [time, sky] of cases) {
    await open(page, time)
    await expect(page.locator('#scene'), time.toISOString()).toHaveAttribute('data-sky', sky)
    await expect(page.locator('#scene-floor')).toHaveAttribute('data-sky', sky)
    await settle(page)
    // Only that sky's layer is showing.
    const shown = await page.$$eval('#scene .scene-sky', (els) => els.filter((e) => getComputedStyle(e).opacity === '1').map((e) => e.className))
    expect(shown, time.toISOString()).toEqual([`scene-sky scene-for-${sky}`])
  }
  expect(msgs).toEqual([])
})

test('moves on to the next sky by itself, and on coming back, without moving anything', async ({ page }) => {
  const msgs = collectConsole(page)
  // Two minutes before day starts: dawn.
  await open(page, at(RISE + T - 2), { install: true })
  await expect(page.locator('#scene')).toHaveAttribute('data-sky', 'dawn')
  await settle(page)
  const before = await layout(page)
  // The once-a-minute refresh brings the day in.
  await page.clock.runFor(3 * 60_000)
  await expect(page.locator('#scene')).toHaveAttribute('data-sky', 'day')
  // Mid cross-fade (it takes 1.6s): dawn fading out and day fading in, both partly
  // showing, and nothing has moved.
  await page.waitForTimeout(500)
  const fading = await page.$$eval('#scene .scene-sky', (els) =>
    els.map((e) => ({ cls: e.className, o: Number(getComputedStyle(e).opacity) })).filter(({ o }) => o > 0.02 && o < 0.98),
  )
  expect(fading.map((f) => f.cls).sort(), JSON.stringify(fading)).toEqual(['scene-sky scene-for-dawn', 'scene-sky scene-for-day'])
  const mid = await layout(page)
  for (const k of ['scene', 'top', 'name', 'stage', 'chip', 'dragon', 'floor', 'growth', 'firstTask'] as const) expect(mid[k], k).toEqual(before[k])
  await settle(page)
  const after = await layout(page)
  for (const k of ['scene', 'top', 'name', 'stage', 'chip', 'dragon', 'floor', 'growth', 'firstTask'] as const) expect(after[k], k).toEqual(before[k])
  // Coming back to the app later in the day: the sky catches up straight away.
  await page.clock.setSystemTime(at(SET))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('#scene')).toHaveAttribute('data-sky', 'evening')
  expect(msgs).toEqual([])
})

for (const scheme of ['light', 'dark'] as const)
  test(`keeps text readable and clear in every sky (${scheme})`, async ({ page }, info) => {
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
    const vp = page.viewportSize()!
    const report: string[] = []
    for (const sky of SKIES) {
      await open(page, TIME[sky])
      await expect(page.locator('#scene')).toHaveAttribute('data-sky', sky)
      await expect(page.locator('#speech')).toHaveClass(/is-showing/)
      await expect(page.locator('#streak-chip')).toBeVisible()
      await settle(page)
      for (const [what, sel] of [
        ['dragon name', '#dragon-name'],
        ['stage name', '#stage-name'],
        ['mood chip', '#mood-chip'],
        ['growth label', '#growth-label'],
        ['xp total', '.growth-total'],
        ['streak chip', '#streak-chip'],
        ['speech bubble', '#speech'],
      ] as const) {
        const c = await contrastOf(page, sel)
        report.push(`${sky} ${what} ${c.ratio}`)
        expect(c.ratio, `${info.project.name} ${scheme} ${sky}: ${what} (${c.color})`).toBeGreaterThanOrEqual(4.5)
      }
      const g = await layout(page)
      // The scene sits behind the heading and the dragon only: the XP bar and tasks are below it.
      expect(g.scene.b, sky).toBeLessThanOrEqual(g.growth.t)
      expect(g.scene.l).toBeGreaterThanOrEqual(0)
      expect(g.scene.r).toBeLessThanOrEqual(vp.width)
      expect(g.top.t).toBeGreaterThanOrEqual(g.scene.t)
      expect(g.dragon.b).toBeLessThanOrEqual(g.scene.b)
      // The ground lines up with the dragon: the floor is the same box as the drawing.
      expect(g.floor).toEqual(g.dragon)
      // Sun, moon and clouds keep off the heading (clouds drift, so with room to spare).
      for (const d of g.decor)
        for (const [what, box] of [['name', g.name], ['stage', g.stage], ['chip', g.chip]] as const) {
          const pad = d.cls.includes('cloud') ? 24 : 0
          expect(overlaps({ l: d.l - pad, t: d.t, r: d.r + pad, b: d.b }, box), `${sky}: ${d.cls} over the ${what}`).toBe(false)
        }
      // Task buttons stay big, in the lower half (at 360 × 800 the first starts just above the middle, as before the scene).
      expect(g.firstTask.t, JSON.stringify(g.firstTask)).toBeGreaterThanOrEqual(vp.height * 0.45)
      expect((g.tasks[0]!.t + g.tasks.at(-1)!.b) / 2).toBeGreaterThanOrEqual(vp.height / 2)
      for (const t of g.tasks) expect(t.b - t.t).toBeGreaterThanOrEqual(44)
    }
    console.log('CONTRAST', info.project.name, scheme, report.join(' | '))
    expect(msgs).toEqual([])
  })

test('the egg sits in a nest and a dragon on a grassy patch', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const now = TIME.day
  await open(page, now, { data: { schemaVersion: 1, events: [{ id: 'a', type: 'log', taskId: 'read', timestamp: now.getTime() - 60_000, xpAwarded: 20 }], settings: { lastBackupAt: now.getTime() } } })
  await expect(page.locator('#scene-floor')).toHaveAttribute('data-ground', 'nest')
  await expect(page.locator('#scene-floor .scene-nest')).toBeVisible()
  await expect(page.locator('#scene-floor .scene-patch')).toBeHidden()
  await open(page, now)
  await expect(page.locator('#scene-floor')).toHaveAttribute('data-ground', 'patch')
  await expect(page.locator('#scene-floor .scene-patch')).toBeVisible()
  // Only on Home: the Dragon screen's drawing has no scene.
  await page.getByRole('link', { name: 'Dragon' }).click()
  await expect(page.locator('#scene')).toBeHidden()
  await expect(page.locator('#dragon-screen .scene-floor, #dragon-screen .scene')).toHaveCount(0)
})

test('moves gently, and not at all under reduced motion', async ({ page }) => {
  const running = () =>
    page.evaluate(() =>
      document
        .getAnimations()
        .filter((a) => {
          const t = (a.effect as KeyframeEffect | null)?.target
          return t instanceof Element && !!t.closest('#scene, #scene-floor') && a.playState === 'running'
        })
        .map((a) => (a as CSSAnimation).animationName),
    )
  await open(page, TIME.night)
  expect(await running()).toContain('scene-twinkle')
  await open(page, TIME.day)
  expect(await running()).toContain('scene-drift')
  expect(await running()).not.toContain('scene-twinkle')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const sky of SKIES) {
    await open(page, TIME[sky])
    expect(await running(), sky).toEqual([])
  }
})
