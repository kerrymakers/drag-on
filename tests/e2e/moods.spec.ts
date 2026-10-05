// Milestone 2, Slice 2: moods, the mood chip and the welcome back.
import { test, expect, type Page } from '@playwright/test'
import { STAGES } from '../../src/config/stages'
import { TASKS } from '../../src/config/tasks'
import { MOODS } from '../../src/config/mood'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const shotDir = 'tests/screenshots'
// Tuesday 13 Oct 2026 (BST), mid-morning: wake window closed.
const NOW = new Date('2026-10-13T10:00:00+01:00')
const DAY = 86_400_000
const XP = (id: string) => TASKS.find((t) => t.id === id)!.xp
const from = (id: string) => STAGES.find((s) => s.id === id)!.xpFrom
// Days since the last log for each mood, read from config (happy 0, content 1, sleepy 3, curled up 5+).
const startOf = (id: string) => MOODS.find((m) => m.id === id)!.fromDays
const SLEEPY = startOf('sleepy')
const CURLED = startOf('grumpy') + 1
const LABEL: Record<number, [string, string]> = {
  0: ['happy', 'Happy'],
  [startOf('content')]: ['content', 'Content'],
  [SLEEPY]: ['sleepy', 'Sleepy'],
  [CURLED]: ['grumpy', 'Curled up'],
}
const MOOD_DAYS = [0, startOf('content'), SLEEPY, CURLED]

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

/** Base XP from long ago, plus the newest log `daysAgo` game days before NOW (at 09:00). */
function events(baseXp: number, daysAgo: number, baseStage?: string) {
  const newest = NOW.getTime() - daysAgo * DAY - 3_600_000
  return [
    { id: 'base', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-09-01T12:00:00+01:00'), xpAwarded: Math.max(0, baseXp - 15), ...(baseStage ? { stageReached: baseStage } : {}) },
    { id: 'last', type: 'log', taskId: 'walk', timestamp: newest, xpAwarded: 15 },
  ]
}
async function seed(page: Page, ev: object[], ui?: object) {
  await page.addInitScript(
    ([d, u]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: d }))
        if (u) localStorage.setItem('drag-on:ui', JSON.stringify(u))
        sessionStorage.setItem('seeded', '1')
      }
    },
    [ev, ui ?? null] as const,
  )
}
const chip = (page: Page) => page.locator('#mood-chip')
const speechShowing = (page: Page) => page.evaluate(() => document.querySelector('#speech')!.classList.contains('is-showing'))
const xpTotal = async (page: Page) => Number(await page.locator('#xp-total').textContent())
const visible = (page: Page) => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

function overlap(a: DOMRectLike | null, b: DOMRectLike | null) {
  if (!a || !b) return 0
  const w = Math.min(a.r, b.r) - Math.max(a.l, b.l)
  const h = Math.min(a.b, b.b) - Math.max(a.t, b.t)
  return w > 0 && h > 0 ? Math.round(w * h) : 0
}
type DOMRectLike = { l: number; t: number; r: number; b: number }

async function geo(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element | null | undefined) => {
      if (!e) return null
      const b = e.getBoundingClientRect()
      return b.width || b.height ? { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom) } : null
    }
    const union = (sel: string) => {
      const rs = [...document.querySelectorAll(sel)]
        .filter((e) => Number(getComputedStyle(e).opacity) > 0 && getComputedStyle(e.closest('.mood-part') ?? e).opacity !== '0')
        .map((e) => e.getBoundingClientRect())
        .filter((r) => r.width > 0)
      if (!rs.length) return null
      return {
        l: Math.round(Math.min(...rs.map((r) => r.left))),
        t: Math.round(Math.min(...rs.map((r) => r.top))),
        r: Math.round(Math.max(...rs.map((r) => r.right))),
        b: Math.round(Math.max(...rs.map((r) => r.bottom))),
      }
    }
    const svg = document.querySelector('#dragon-art svg')!
    return {
      svgMood: svg.getAttribute('data-mood') ?? svg.querySelector('[data-mood]')?.getAttribute('data-mood'),
      speech: document.querySelector('#speech.is-showing') ? box(document.querySelector('#speech')) : null,
      zzz: union('#dragon-art .mood-zzz text'),
      head: box(document.querySelector('#dragon-art .dragon-head-box')),
      art: union('#dragon-art svg :is(path,ellipse,circle,rect,polygon)'),
      header: box(document.querySelector('.top')),
      chip: box(document.querySelector('#mood-chip')),
      stage: box(document.querySelector('#stage-name')),
      firstTask: box(document.querySelector('.task')),
      lastTask: box(document.querySelector('#task-list li:last-child .task')),
      undo: box(document.querySelector('#undo')),
      label: box(document.querySelector('.growth-row')),
      scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
      text: document.body.innerText,
    }
  })
}

const SIZES = [
  [410, 914],
  [360, 800],
  [410, 800],
  [360, 680],
] as const

// 1 + 2. Screenshots, chip labels, layout
for (const [w, h] of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    for (const [stage, baseXp] of [['egg', 50], ['hatchling', 150]] as const) {
      test(`moods ${stage} ${w}x${h} ${scheme}`, async ({ page }, info) => {
        test.skip(info.project.name !== 'pixel10pro')
        const msgs = collectConsole(page)
        await page.setViewportSize({ width: w, height: h })
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await page.clock.setFixedTime(NOW)
        await page.goto('./')
        for (const d of MOOD_DAYS) {
          await page.evaluate((ev) => {
            localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: ev }))
            localStorage.removeItem('drag-on:ui')
          }, events(baseXp, d))
          await page.reload()
          await page.waitForTimeout(700) // mood fades and bubble entrance
          const [id, label] = LABEL[d]!
          await expect(chip(page)).toHaveText(label)
          await expect(chip(page)).toHaveAttribute('data-mood', id)
          const g = await geo(page)
          expect(g.svgMood).toBe(id)
          expect(g.text).not.toMatch(/grumpy/i)
          expect(g.scroll[0]).toBeLessThanOrEqual(w)
          expect(g.scroll[1]).toBeLessThanOrEqual(h)
          expect(g.lastTask!.b).toBeLessThanOrEqual(h)
          expect(g.undo!.b).toBeLessThanOrEqual(h)
          expect(g.art!.t).toBeGreaterThanOrEqual(g.header!.b - 1)
          expect(g.art!.b).toBeLessThanOrEqual(g.label!.t + 1)
          expect(g.chip!.r).toBeLessThanOrEqual(w)
          if (d >= SLEEPY) {
            expect(g.speech, 'bubble shows').not.toBeNull()
            expect(g.speech!.b).toBeLessThanOrEqual(g.firstTask!.t)
            expect(overlap(g.speech, g.head), 'bubble clear of head and headgear').toBe(0)
            expect(overlap(g.speech, g.zzz), 'bubble clear of zzz').toBe(0)
            expect(g.speech!.r).toBeLessThanOrEqual(w)
            expect(g.speech!.t).toBeGreaterThanOrEqual(0)
          } else expect(g.speech).toBeNull()
          console.log(`${stage} ${w}x${h} ${scheme} d${d}`, JSON.stringify({ speech: g.speech, zzz: g.zzz, art: g.art, speechOverZzz: overlap(g.speech, g.zzz), speechOverArt: overlap(g.speech, g.art) }))
          await page.screenshot({ path: `${shotDir}/m2s2-${w}x${h}-${scheme}-${stage}-${id}.png` })
        }
        expect(msgs, msgs.join('\n')).toEqual([])
      })
    }
  }
}

// Quick pass: later stages, sleepy and curled up
for (const [w, h] of SIZES) {
  for (const scheme of ['light', 'dark'] as const) {
    test(`moods later stages ${w}x${h} ${scheme}`, async ({ page }, info) => {
      test.skip(info.project.name !== 'pixel10pro')
      const msgs = collectConsole(page)
      await page.setViewportSize({ width: w, height: h })
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.clock.setFixedTime(NOW)
      await page.goto('./')
      for (const stage of ['whelp', 'juvenile', 'adult', 'elder']) {
        for (const d of [SLEEPY, CURLED]) {
          await page.evaluate((ev) => {
            localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: ev }))
            localStorage.removeItem('drag-on:ui')
          }, events(from(stage) + 100, d, stage))
          await page.reload()
          await page.waitForTimeout(700)
          const [id, label] = LABEL[d]!
          await expect(chip(page)).toHaveText(label)
          const g = await geo(page)
          expect(g.svgMood).toBe(id)
          expect(g.lastTask!.b).toBeLessThanOrEqual(h)
          expect(g.undo!.b).toBeLessThanOrEqual(h)
          expect(g.scroll[1]).toBeLessThanOrEqual(h)
          expect(g.art!.t).toBeGreaterThanOrEqual(g.header!.b - 1)
          expect(g.art!.b).toBeLessThanOrEqual(g.label!.t + 1)
          expect(g.art!.l).toBeGreaterThanOrEqual(-1)
          expect(g.art!.r).toBeLessThanOrEqual(w + 1)
          expect(g.speech!.b).toBeLessThanOrEqual(g.firstTask!.t)
          expect(overlap(g.speech, g.head), 'bubble clear of head and headgear').toBe(0)
          expect(overlap(g.speech, g.zzz), 'bubble clear of zzz').toBe(0)
          console.log(`later ${stage} ${w}x${h} ${scheme} ${id}`, JSON.stringify({ speechOverZzz: overlap(g.speech, g.zzz), speechOverArt: overlap(g.speech, g.art), speech: g.speech, art: g.art }))
          await page.screenshot({ path: `${shotDir}/m2s2-later-${w}x${h}-${scheme}-${stage}-${id}.png` })
        }
      }
      expect(msgs, msgs.join('\n')).toEqual([])
    })
  }
}

// 3. Welcome
test('welcome: shows when sleepy or curled up, not happy or content; not repeated in the same gap; ~4s; never over tasks; one-tap log hides it', async ({ page }) => {
  const msgs = collectConsole(page)
  await page.clock.install({ time: NOW })
  await page.goto('./')
  for (const d of MOOD_DAYS) {
    await page.evaluate((ev) => {
      localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: ev }))
      localStorage.removeItem('drag-on:ui')
    }, events(150, d))
    await page.reload()
    const showing = await speechShowing(page)
    console.log(`welcome at ${d} days:`, showing, showing ? await page.locator('#speech').textContent() : '')
    expect(showing).toBe(d >= SLEEPY)
  }
  // Same gap and mood: a reload doesn't repeat it
  const ui = await page.evaluate(() => localStorage.getItem('drag-on:ui'))
  console.log('drag-on:ui', ui)
  expect(JSON.parse(ui!)).toMatchObject({ gapFrom: expect.any(String), shown: ['grumpy'] })
  await page.reload()
  expect(await speechShowing(page)).toBe(false)
  await visible(page)
  expect(await speechShowing(page)).toBe(false)

  // Lasts about 4s
  await page.evaluate(() => localStorage.removeItem('drag-on:ui'))
  await page.reload()
  expect(await speechShowing(page)).toBe(true)
  await page.clock.runFor(3800)
  expect(await speechShowing(page)).toBe(true)
  await page.clock.runFor(400)
  expect(await speechShowing(page)).toBe(false)

  // Never intercepts taps on a task: every task centre hits its own button
  await page.evaluate(() => localStorage.removeItem('drag-on:ui'))
  await page.reload()
  expect(await speechShowing(page)).toBe(true)
  const hits = await page.evaluate(() =>
    [...document.querySelectorAll('button.task')].map((b) => {
      const r = b.getBoundingClientRect()
      return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('button.task') === b
    }),
  )
  expect(hits.every(Boolean)).toBe(true)
  const pe = await page.locator('#speech').evaluate((e) => getComputedStyle(e).pointerEvents)
  expect(pe).toBe('none')

  // One tap logs while it's showing, and hides it
  const before = await xpTotal(page)
  await page.locator('button.task[data-task-id="gym"]').click()
  expect(await xpTotal(page)).toBe(before + XP('gym'))
  expect(await speechShowing(page)).toBe(false)
  await expect(chip(page)).toHaveText('Happy')
  expect(msgs, msgs.join('\n')).toEqual([])
})

test('welcome: once at sleepy, once more at curled up in the same gap, then not until a new log', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, events(150, SLEEPY))
  await page.clock.install({ time: NOW })
  await page.goto('./')
  await expect(chip(page)).toHaveText('Sleepy')
  expect(await speechShowing(page)).toBe(true)
  await page.clock.runFor(5000)
  expect(await speechShowing(page)).toBe(false)
  // Same day, back to the app: no repeat
  await visible(page)
  expect(await speechShowing(page)).toBe(false)
  // Each following day: sleepy again is silent, until it reaches curled up
  let welcomed = 0
  for (let extra = 1; SLEEPY + extra <= CURLED + 1; extra++) {
    await page.clock.setSystemTime(new Date(NOW.getTime() + extra * DAY))
    await visible(page)
    const days = SLEEPY + extra
    const showing = await speechShowing(page)
    console.log(`day +${extra} (${days} days):`, await chip(page).textContent(), showing)
    if (days === startOf('grumpy')) {
      await expect(chip(page)).toHaveText('Curled up')
      expect(showing).toBe(true)
      welcomed++
    } else expect(showing).toBe(false)
    await page.clock.runFor(5000)
  }
  expect(welcomed).toBe(1)
  // A new log starts a new gap; nothing plays while happy
  await page.locator('button.task[data-task-id="gym"]').click()
  await expect(chip(page)).toHaveText('Happy')
  const ui = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:ui')!))
  console.log('ui after the gap', ui)
  expect(ui.shown).toEqual(['sleepy', 'grumpy'])
  expect(msgs, msgs.join('\n')).toEqual([])
})

test('welcome: not used up while the app opens in the background', async ({ page }) => {
  await seed(page, events(150, SLEEPY))
  await page.addInitScript(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (window as any).__vis ?? 'hidden' })
  })
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  expect(await speechShowing(page)).toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('drag-on:ui'))).toBeNull()
  await page.evaluate(() => {
    ;(window as any).__vis = 'visible'
    document.dispatchEvent(new Event('visibilitychange'))
  })
  expect(await speechShowing(page)).toBe(true)
})

// 4. Recovery
test('recovery: first log after a long gap turns Happy at once with normal feedback', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, events(150, CURLED))
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(chip(page)).toHaveText('Curled up')
  await page.locator('button.task[data-task-id="read"]').click()
  const fb = await page.evaluate(() => ({
    chip: document.querySelector('#mood-chip')!.textContent,
    svg: document.querySelector('#dragon-art svg')!.getAttribute('data-mood'),
    float: document.querySelector('.float-xp')?.textContent,
    toast: document.querySelector('#toast-text')!.textContent,
    wiggle: !!document.querySelector('#dragon-art .react-log'),
  }))
  console.log('recovery feedback', fb)
  expect(fb).toEqual({ chip: 'Happy', svg: 'happy', float: `+${XP('read')} XP`, toast: `+${XP('read')} XP · Read for 20 minutes`, wiggle: true })
  expect(msgs).toEqual([])
})

// 5. Undo
test('undo: undoing today\'s only log brings back Content (last log yesterday)', async ({ page }) => {
  const msgs = collectConsole(page)
  await seed(page, events(150, 1))
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(chip(page)).toHaveText('Content')
  await page.locator('button.task[data-task-id="gym"]').click()
  await expect(chip(page)).toHaveText('Happy')
  await page.locator('#toast-undo').click()
  await expect(chip(page)).toHaveText('Content')
  await expect(page.locator('#dragon-art svg')).toHaveAttribute('data-mood', 'content')
  expect(msgs).toEqual([])
})

// 6. Rollover
test('rollover: left open across 04:00, chip goes Happy -> Content without reload', async ({ page }) => {
  const msgs = collectConsole(page)
  // Log at 20:00 Monday; open at 03:59:20 Tuesday (still Monday's game day)
  await seed(page, [{ id: 'm', type: 'log', taskId: 'gym', timestamp: Date.parse('2026-10-12T20:00:00+01:00'), xpAwarded: 150 }])
  await page.clock.install({ time: new Date('2026-10-13T03:59:20+01:00') })
  await page.goto('./')
  await expect(chip(page)).toHaveText('Happy')
  await page.clock.runFor(39_000)
  await expect(chip(page)).toHaveText('Happy')
  await page.clock.runFor(1_600)
  await expect(chip(page)).toHaveText('Content')
  await expect(page.locator('#dragon-art svg')).toHaveAttribute('data-mood', 'content')
  expect(await speechShowing(page)).toBe(false) // content doesn't welcome
  expect(msgs).toEqual([])
})

// 7. Hop + log wiggle
test('hop and log wiggle do not clash or leave stray transforms', async ({ page }, info) => {
  const msgs = collectConsole(page)
  await seed(page, events(150, 0))
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(chip(page)).toHaveText('Happy')
  const anims = await page.evaluate(() =>
    document.getAnimations().map((a: any) => `${a.animationName}@${(a.effect?.target as Element)?.getAttribute?.('class')}`),
  )
  console.log('happy idle animations', anims)
  // Line up the log with the hop (hop peak is at 88% of 5.5s)
  await page.evaluate(() => {
    for (const a of document.getAnimations() as any[]) if (a.animationName === 'mood-hop') a.currentTime = 4700
  })
  await page.locator('button.task[data-task-id="read"]').click()
  const samples: object[] = []
  for (let i = 0; i < 8; i++) {
    samples.push(
      await page.evaluate(() => {
        const wrap = document.querySelector('#dragon-art .dragon-react')!
        const pose = document.querySelector('#dragon-art .dragon-pose')!
        const art = document.querySelector('#dragon-art')!.getBoundingClientRect()
        const svg = wrap.querySelector('svg')!.getBoundingClientRect()
        return { wrap: getComputedStyle(wrap).transform, pose: getComputedStyle(pose).transform, svgTop: Math.round(svg.top - art.top) }
      }),
    )
    if (i === 2) await page.screenshot({ path: `${shotDir}/m2s2-${info.project.name}-hop-wiggle.png` })
    await page.waitForTimeout(90)
  }
  console.log('hop+wiggle samples', JSON.stringify(samples))
  await page.waitForTimeout(900)
  const after = await page.evaluate(() => {
    const wrap = document.querySelector('#dragon-art .dragon-react')!
    return { cls: wrap.className, transform: getComputedStyle(wrap).transform, inline: (wrap as HTMLElement).style.transform }
  })
  console.log('after wiggle', after)
  expect(after.cls).toBe('dragon-react')
  expect(after.transform).toBe('none')
  expect(after.inline).toBe('')
  expect(msgs).toEqual([])
})

// 8. Reduced motion
test('reduced motion: no hop, zzz drift, wag or pulses; moods still fade', async ({ page }) => {
  const msgs = collectConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  const leaks: string[] = []
  for (const [stage, xp] of [['egg', 50], ['hatchling', 150], ['whelp', 600], ['elder', 7500]] as const) {
    for (const d of MOOD_DAYS) {
      await page.evaluate((ev) => {
        localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: ev }))
        localStorage.setItem('drag-on:ui', JSON.stringify({}))
      }, events(xp, d, stage === 'egg' || stage === 'hatchling' ? undefined : stage))
      await page.reload()
      await page.waitForTimeout(300)
      const running = await page.evaluate(() =>
        document
          .getAnimations()
          .map((a: any) => a.animationName ?? `transition:${a.transitionProperty}`)
          .filter((n: string) => !n.startsWith('transition:opacity')),
      )
      if (running.length) {
        console.log(`reduced ${stage} d${d} running`, running)
        leaks.push(`${stage} d${d}: ${running.join(',')}`)
      }
      const speechT = await page.locator('#speech').evaluate((e) => getComputedStyle(e).transform)
      expect(speechT).toBe('none')
    }
  }
  expect(leaks, leaks.join('\n')).toEqual([])
  // Moods still fade: mood parts keep an opacity transition
  const fade = await page.evaluate(() => getComputedStyle(document.querySelector('#dragon-art .mood-part')!).transition)
  console.log('mood-part transition under reduce', fade)
  expect(fade).toContain('opacity')
  // Curled-up posture is static, not animated in
  const poseT = await page.evaluate(() => getComputedStyle(document.querySelector('#dragon-art .dragon-pose')!).transitionDuration)
  expect(poseT).toBe('0s')
  expect(msgs, msgs.join('\n')).toEqual([])
})

test('offline: mood and welcome work offline; log persists', async ({ page, context }) => {
  const msgs = collectConsole(page)
  await seed(page, events(150, SLEEPY))
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await page.evaluate(async () => navigator.serviceWorker.ready)
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 5000 })
  await context.setOffline(true)
  await page.evaluate(() => localStorage.removeItem('drag-on:ui'))
  await page.reload()
  await expect(chip(page)).toHaveText('Sleepy')
  expect(await speechShowing(page)).toBe(true)
  await page.locator('button.task[data-task-id="gym"]').click()
  await page.reload()
  await expect(chip(page)).toHaveText('Happy')
  expect(await xpTotal(page)).toBe(150 + XP('gym'))
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(false)
  expect(msgs.filter((m) => !m.includes('ERR_INTERNET_DISCONNECTED'))).toEqual([])
})

test('tap targets with chip and bubble showing', async ({ page }) => {
  await seed(page, events(150, CURLED))
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  expect(await speechShowing(page)).toBe(true)
  const t = await page.$$eval('button:not([hidden]), a, [role=button]', (els) =>
    els
      .filter((e) => (e as HTMLElement).offsetParent !== null && getComputedStyle(e).visibility !== 'hidden')
      .map((e) => {
        const r = e.getBoundingClientRect()
        return { id: (e as HTMLElement).dataset.taskId ?? e.id ?? e.className, w: r.width, h: r.height }
      }),
  )
  console.log('targets', JSON.stringify(t))
  for (const x of t) {
    expect(x.w, x.id).toBeGreaterThanOrEqual(44)
    expect(x.h, x.id).toBeGreaterThanOrEqual(44)
  }
  const chipInteractive = await chip(page).evaluate((e) => e.tagName + ':' + (e.getAttribute('role') ?? '') + ':' + getComputedStyle(e).cursor)
  console.log('chip element', chipInteractive)
})

test('welcome walk-through: 7 days with no logs, then a log and a new gap', async ({ page }) => {
  const msgs = collectConsole(page)
  // Last log on day 0 (NOW); then step forward a game day at a time with the app open.
  await seed(page, events(150, 0))
  await page.clock.install({ time: NOW })
  await page.goto('./')
  const seen: Record<number, [string, boolean]> = {}
  for (let d = 1; d <= 7; d++) {
    await page.clock.setSystemTime(new Date(NOW.getTime() + d * DAY))
    await visible(page)
    seen[d] = [(await chip(page).textContent())!, await speechShowing(page)]
    await page.clock.runFor(5000)
    // A second return the same day never repeats it
    await visible(page)
    expect(await speechShowing(page), `day ${d} second return`).toBe(false)
  }
  console.log('walk-through', JSON.stringify(seen))
  expect(seen[1]![1]).toBe(false)
  expect(seen[2]![1]).toBe(false)
  expect(seen[3]).toEqual(['Sleepy', true])
  expect(seen[4]).toEqual(['Sleepy', false])
  expect(seen[5]).toEqual(['Curled up', true])
  expect(seen[6]).toEqual(['Curled up', false])
  expect(seen[7]![1]).toBe(false)
  // A reload late in the gap doesn't replay it either
  await page.reload()
  expect(await speechShowing(page)).toBe(false)

  // Log, then a new gap: day 3 welcomes again
  await page.locator('button.task[data-task-id="gym"]').click()
  await expect(chip(page)).toHaveText('Happy')
  const logDay = NOW.getTime() + 7 * DAY
  for (let d = 1; d <= 3; d++) {
    await page.clock.setSystemTime(new Date(logDay + d * DAY))
    await visible(page)
    const s = await speechShowing(page)
    console.log(`new gap day ${d}`, await chip(page).textContent(), s)
    expect(s).toBe(d === 3)
    await page.clock.runFor(5000)
  }
  expect(msgs, msgs.join('\n')).toEqual([])
})
