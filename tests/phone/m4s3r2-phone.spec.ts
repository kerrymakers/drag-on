// Phone-tester round 2 checks for M4 slice 3 (wearing items). Screenshots: tests/screenshots/m4s3r2-phone-*
// Check 1 compares bubble placement with a build of the last commit, served at BASE_URL
// (skipped if it isn't running).
import { test, expect, type Page, type Browser, type TestInfo } from '../e2e/fixtures'
import * as fs from 'node:fs'
import { ITEMS } from '../../src/config/items'
import { REWARDS } from '../../src/config/rewards'
import { STAGES } from '../../src/config/stages'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = 'm4s3r2-phone'
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:4190/drag-on/'
const NOW = new Date('2026-10-13T10:00:00+01:00')
const DAY = 86_400_000
const RARE_ROLL = REWARDS.rareChance / 3

const HEADS = ['bow', 'beanie', 'crown', 'flower', 'partyhat', 'acorn']
const NECKS = ['scarf', 'bell', 'bandana', 'pendant', 'bowtie', 'shells']
const HELDS = ['book', 'gem', 'teacup', 'lantern', 'mushroom', 'balloon']
const outfit = (i: number) => ({ head: HEADS[i]!, neck: NECKS[i]!, held: HELDS[i]! })
const GROWN = ['hatchling', 'whelp', 'juvenile', 'adult', 'elder']
const LOOK_TASK = { neutral: 'gym', strength: 'gym', discipline: 'avoided', wisdom: 'read', heart: 'selfcare' } as const
const from = (s: string) => STAGES.find((x) => x.id === s)!.xpFrom
const SIZES = [
  [410, 914],
  [410, 840],
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

interface Data {
  xp: number
  taskId?: string
  stage?: string
  finds?: string[]
  wearing?: Record<string, string | null>
  daysAgo?: number
}
function data({ xp, taskId = 'gym', stage, finds = [], wearing, daysAgo = 1 }: Data) {
  const last = NOW.getTime() - daysAgo * DAY
  const events: object[] = []
  if (xp) events.push({ id: 'xp', type: 'log', taskId, timestamp: last - 60 * 60_000, xpAwarded: xp, ...(stage ? { stageReached: stage } : {}) })
  finds.forEach((id, k) =>
    events.push({ id: `f${k}`, type: 'log', taskId: 'avoided', timestamp: last - (finds.length - k) * 60_000, xpAwarded: 0, reward: { kind: 'item', itemId: id } }),
  )
  const d: Record<string, unknown> = { schemaVersion: 1, events }
  if (wearing) d.settings = { wearing }
  return d
}

async function seedOnce(page: Page, d: object) {
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear()
      localStorage.setItem('drag-on:v1', JSON.stringify(d))
      sessionStorage.setItem('seeded', '1')
    }
  }, d)
}

async function freshPage(browser: Browser, info: TestInfo, w: number, h: number, scheme: 'light' | 'dark', d: object, url = './', roll: number | null = null) {
  const context = await browser.newContext({
    ...info.project.use,
    viewport: { width: w, height: h },
    colorScheme: scheme,
    timezoneId: 'Europe/London',
    locale: 'en-GB',
  })
  const page = await context.newPage()
  const msgs = collectConsole(page)
  await page.addInitScript((r) => (Math.random = () => r), roll ?? 0.9999)
  await seedOnce(page, d)
  await page.clock.setFixedTime(NOW)
  await page.goto(url.startsWith('http') ? url : new URL(url, info.project.use.baseURL!).toString())
  await expect(page.locator('#tabbar a').first()).toBeVisible()
  return { page, context, msgs }
}

async function bubbleGeometry(page: Page) {
  return page.evaluate(() => {
    const q = (s: string) => document.querySelector(s)
    const R = (e: Element | null) => {
      if (!e) return null
      const b = e.getBoundingClientRect()
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }
    }
    const sp = q('#speech')!
    const b = R(sp)!
    const cover = (x: ReturnType<typeof R>) => {
      if (!x || x.w * x.h === 0) return null
      const ix = Math.max(0, Math.min(b.r, x.r) - Math.max(b.l, x.l))
      const iy = Math.max(0, Math.min(b.b, x.b) - Math.max(b.t, x.t))
      return Math.round(((ix * iy) / (x.w * x.h)) * 1000) / 10
    }
    const zzz = q('#dragon-art .dragon-svg[data-mood="sleepy"] .mood-zzz')
    const cs = getComputedStyle(sp)
    const text = (q('#speech .speech-text') ?? sp) as HTMLElement
    const range = document.createRange()
    range.selectNodeContents(text)
    const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
    const header = q('.top')!.getBoundingClientRect()
    const firstTask = document.querySelector('button.task')!.getBoundingClientRect()
    return {
      showing: sp.classList.contains('is-showing'),
      tail: sp.getAttribute('data-tail'),
      text: sp.textContent?.trim(),
      rect: { l: Math.round(b.l), t: Math.round(b.t), w: Math.round(b.w), h: Math.round(b.h) },
      compact: sp.classList.contains('is-compact'),
      fontSize: cs.fontSize,
      lines,
      clipped: (() => { const t = range.getBoundingClientRect(); return t.left < b.l - 0.5 || t.right > b.r + 0.5 || t.top < b.t - 0.5 || t.bottom > b.b + 0.5 })(),
      inView: b.l >= 0 && b.r <= innerWidth && b.t >= 0 && b.b <= innerHeight,
      underHeader: b.t < header.bottom,
      overTasks: b.b > firstTask.top,
      cover: {
        head: cover(R(q('#dragon-art .worn-head'))),
        neck: cover(R(q('#dragon-art .worn-neck'))),
        held: cover(R(q('#dragon-art .worn-held'))),
        zzz: cover(R(zzz)),
        headBox: cover(R(q('#dragon-art .dragon-head-box'))),
      },
    }
  })
}

// ---------------------------------------------------------------------------
// 1. Welcome bubble: every grown stage, every outfit and none, three sizes, both schemes.
// ---------------------------------------------------------------------------
for (const [w, h] of SIZES)
  for (const scheme of ['light', 'dark'] as const)
    test(`1 bubble: ${w}x${h} ${scheme}`, async ({ browser }, info) => {
      test.skip(info.project.name !== 'pixel10pro')
      test.setTimeout(400_000)
      const fails: string[] = []
      const rows: string[] = []
      const shots: { label: string; file: string }[] = []
      const allMsgs: string[] = []
      for (const stage of GROWN)
        for (const mood of ['sleepy', 'grumpy'] as const)
          for (const o of [-1, 0, 1, 2, 3, 4, 5]) {
            if (mood === 'grumpy' && o > 0) continue
            const d = data({
              xp: from(stage) + 10,
              stage,
              finds: ITEMS.map((i) => i.id),
              wearing: o >= 0 ? outfit(o) : undefined,
              daysAgo: mood === 'sleepy' ? 3 : 5,
            })
            const { page, context, msgs } = await freshPage(browser, info, w, h, scheme, d)
            await page.waitForTimeout(900)
            const g = await bubbleGeometry(page)
            const tag = `${stage}/${mood}/${o < 0 ? 'none' : `o${o}`}`
            rows.push(`${tag} ${JSON.stringify(g)}`)
            if (!g.showing) {
              rows.push(`${tag} no bubble`)
            } else {
              if (g.cover.neck) fails.push(`${tag} neck ${NECKS[o]} covered ${g.cover.neck}%`)
              if (g.cover.held) fails.push(`${tag} held ${HELDS[o]} covered ${g.cover.held}%`)
              if (g.cover.head) fails.push(`${tag} head ${HEADS[o]} covered ${g.cover.head}%`)
              if (g.cover.zzz) fails.push(`${tag} zzz covered ${g.cover.zzz}%`)
              if (!g.inView) fails.push(`${tag} bubble off-screen ${JSON.stringify(g.rect)}`)
              if (g.clipped) fails.push(`${tag} bubble text clipped`)
              if (g.underHeader) fails.push(`${tag} bubble under header`)
              if (g.overTasks) fails.push(`${tag} bubble over tasks`)
              if (parseFloat(g.fontSize) < 13) fails.push(`${tag} small font ${g.fontSize}`)
            }
            if (o < 0 || o === 1 || o === 4 || mood === 'grumpy') {
              const file = `${dir}/${PFX}-bubble-${w}x${h}-${scheme}-${stage}-${mood}-${o < 0 ? 'none' : `o${o}`}.png`
              const clip = await page.evaluate(() => {
                const a = document.querySelector('#dragon-art')!.getBoundingClientRect()
                const s = document.querySelector('#speech')!.getBoundingClientRect()
                const top = Math.max(0, Math.min(a.top, s.top) - 6)
                return { x: 0, y: top, width: innerWidth, height: Math.max(a.bottom, s.bottom) + 6 - top }
              })
              await page.screenshot({ path: file, clip })
              shots.push({ label: tag, file })
            }
            allMsgs.push(...msgs)
            await context.close()
          }
      console.log(`BUBBLE ${w}x${h} ${scheme}\n` + rows.join('\n'))
      console.log('BUBBLE FAILS', JSON.stringify(fails, null, 1))
      // A contact sheet.
      const p2 = await (await browser.newContext()).newPage()
      await p2.setViewportSize({ width: 1400, height: 900 })
      for (let k = 0; k < shots.length; k += 20) {
        const chunk = shots.slice(k, k + 20)
        await p2.setContent(
          `<html><body style="margin:0;background:#888;font:12px sans-serif;display:grid;grid-template-columns:repeat(5,1fr);gap:3px">${chunk
            .map((s) => `<div><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><div style="background:#fff">${s.label}</div></div>`)
            .join('')}</body></html>`,
        )
        await p2.screenshot({ path: `${dir}/${PFX}-sheet-bubble-${w}x${h}-${scheme}-${k / 20}.png`, fullPage: true })
      }
      expect.soft(fails).toEqual([])
      expect(allMsgs).toEqual([])
    })

// 1b. Nothing worn: placement identical to the last commit's build.
test('1b bubble with nothing worn matches the last commit', async ({ browser }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  // A one-off comparison: needs a build of the previous commit served at BASE_URL.
  test.skip(!process.env.BASE_URL, 'set BASE_URL to a build of the previous commit')
  test.setTimeout(400_000)
  const diffs: string[] = []
  const rows: string[] = []
  for (const [w, h] of SIZES)
    for (const stage of ['egg', ...GROWN])
      for (const mood of ['sleepy', 'grumpy'] as const) {
        // The no-wearing data, with finds (they don't change the drawing) left out to keep it like the old save.
        const d = data({ xp: stage === 'egg' ? 40 : from(stage) + 10, stage: stage === 'egg' ? undefined : stage, daysAgo: mood === 'sleepy' ? 3 : 5 })
        const out: (Awaited<ReturnType<typeof bubbleGeometry>> | null)[] = []
        for (const url of ['./', BASE_URL]) {
          const { page, context } = await freshPage(browser, info, w, h, 'light', d, url)
          await page.waitForTimeout(900)
          out.push(await bubbleGeometry(page))
          await context.close()
        }
        const [now, base] = out
        const line = `${w}x${h} ${stage}/${mood} now=${JSON.stringify(now!.rect)} ${now!.compact} base=${JSON.stringify(base!.rect)} ${base!.compact} showing ${now!.showing}/${base!.showing}`
        rows.push(line)
        if (JSON.stringify(now!.rect) !== JSON.stringify(base!.rect) || now!.compact !== base!.compact || now!.showing !== base!.showing || now!.text !== base!.text)
          diffs.push(line + ` text "${now!.text}" vs "${base!.text}"`)
      }
  console.log('BASELINE\n' + rows.join('\n'))
  expect(diffs).toEqual([])
})

// ---------------------------------------------------------------------------
// 2. The find reveal: Home behind the card, the hop after it closes.
// ---------------------------------------------------------------------------
async function watchHome(page: Page) {
  await page.evaluate(() => {
    const w = window as any
    w.__trace = []
    const art = document.querySelector('#dragon-art')!
    const note = () => {
      const worn = [...art.querySelectorAll('[data-worn]')].map((e) => (e as HTMLElement).dataset.worn).join(',')
      const react = art.querySelector(':scope > .dragon-react')?.className ?? ''
      const ov = [...document.querySelectorAll('.overlay')].map((o) => (o.classList.contains('item-found') ? 'card' : 'stage') + (o.classList.contains('is-closing') ? '~closing' : '')).join('+')
      const s = `${ov || 'none'} | worn=${worn} | ${react}`
      if (w.__trace.at(-1) !== s) w.__trace.push(s)
    }
    new MutationObserver(note).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] })
    note()
  })
}

for (const scheme of ['light', 'dark'] as const)
  for (const motion of ['no-preference', 'reduce'] as const) {
    test(`2 find reveal, plain (${scheme}, ${motion})`, async ({ page }, info) => {
      const p = info.project.name
      const msgs = collectConsole(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: motion })
      await seedOnce(page, data({ xp: 300, finds: ['scarf'], wearing: { head: null, neck: 'scarf', held: null } }))
      await page.addInitScript((r) => (Math.random = () => r), RARE_ROLL)
      await page.clock.setFixedTime(NOW)
      await page.goto('./')
      await watchHome(page)
      await page.locator('button.task[data-task-id="read"]').tap()
      const card = page.locator('.overlay.item-found')
      await expect(card).toBeVisible()
      await page.waitForTimeout(800)
      const behind = await page.locator('#dragon-art [data-worn]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.worn))
      console.log(p, scheme, motion, 'behind card', behind)
      expect.soft(behind).toEqual(['scarf'])
      await page.screenshot({ path: `${dir}/${PFX}-find-card-${scheme}-${motion}-${p}.png` })
      await page.touchscreen.tap(20, 20)
      await expect(card).toHaveCount(0)
      await page.waitForTimeout(60)
      await page.screenshot({ path: `${dir}/${PFX}-find-after-${scheme}-${motion}-${p}.png` })
      await page.waitForTimeout(800)
      const trace = await page.evaluate(() => (window as any).__trace as string[])
      console.log(p, scheme, motion, 'trace\n  ' + trace.join('\n  '))
      await expect(page.locator('#dragon-art [data-worn="bow"]')).toHaveCount(1)
      const hopped = trace.some((t) => t.startsWith('none') && t.includes('worn=scarf,bow') && t.includes('react-perk'))
      const bowWhileOverlay = trace.some((t) => !t.startsWith('none') && !/^[a-z+]*~closing \|/.test(t.replace(/~closing\+/g, '+')) && /worn=[^|]*bow/.test(t))
      console.log(p, scheme, motion, 'hop after close', hopped, 'bow shown while an overlay was up', bowWhileOverlay)
      expect.soft(bowWhileOverlay).toBe(false)
      if (motion === 'no-preference') expect.soft(hopped).toBe(true)
      else expect.soft(hopped).toBe(false)
      expect(msgs).toEqual([])
    })

    test(`2 find reveal after a stage-up (${scheme}, ${motion})`, async ({ page }, info) => {
      const p = info.project.name
      const msgs = collectConsole(page)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: motion })
      await seedOnce(page, data({ xp: 590, stage: 'hatchling', finds: ['scarf'], wearing: { head: null, neck: 'scarf', held: null } }))
      await page.addInitScript((r) => (Math.random = () => r), RARE_ROLL)
      await page.clock.setFixedTime(NOW)
      await page.goto('./')
      await watchHome(page)
      await page.locator('button.task[data-task-id="read"]').tap()
      const stage = page.locator('.overlay:not(.item-found)')
      await expect(stage).toBeVisible()
      const layers = await stage.locator('[data-worn]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.worn))
      console.log(p, scheme, motion, 'stage-up layers worn', layers)
      expect.soft(layers.includes('bow')).toBe(false)
      await page.waitForTimeout(1500)
      await stage.locator('.overlay-button').tap()
      const card = page.locator('.overlay.item-found')
      await expect(card).toBeVisible()
      await page.waitForTimeout(800)
      const behind = await page.locator('#dragon-art [data-worn]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.worn))
      console.log(p, scheme, motion, 'behind card after stage-up', behind)
      expect.soft(behind).toEqual(['scarf'])
      await page.screenshot({ path: `${dir}/${PFX}-stageup-card-${scheme}-${motion}-${p}.png` })
      await page.touchscreen.tap(20, 20)
      await expect(page.locator('.overlay')).toHaveCount(0)
      await page.waitForTimeout(900)
      await page.screenshot({ path: `${dir}/${PFX}-stageup-after-${scheme}-${motion}-${p}.png` })
      const trace = await page.evaluate(() => (window as any).__trace as string[])
      console.log(p, scheme, motion, 'stage-up trace\n  ' + trace.join('\n  '))
      await expect(page.locator('#dragon-art [data-worn="bow"]')).toHaveCount(1)
      const hopped = trace.some((t) => t.startsWith('none') && /worn=[^|]*bow/.test(t) && t.includes('react-perk'))
      const bowWhileOverlay = trace.some((t) => !t.startsWith('none') && !/^[a-z+]*~closing \|/.test(t.replace(/~closing\+/g, '+')) && /worn=[^|]*bow/.test(t))
      console.log(p, scheme, motion, 'hop after close', hopped, 'bow while overlay', bowWhileOverlay)
      expect.soft(bowWhileOverlay).toBe(false)
      if (motion === 'no-preference') expect.soft(hopped).toBe(true)
      else expect.soft(hopped).toBe(false)
      expect(msgs).toEqual([])
    })
  }

// ---------------------------------------------------------------------------
// 3. Elder neck items: z-order and room, every look, mood and theme.
// ---------------------------------------------------------------------------
test('3 elder neck items: nothing drawn over them', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  test.setTimeout(400_000)
  const msgs = collectConsole(page)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  const over: string[] = []
  const rows: string[] = []
  const shots: { label: string; file: string }[] = []
  for (const scheme of ['light', 'dark'] as const)
    for (const look of (Object.keys(LOOK_TASK) as (keyof typeof LOOK_TASK)[]).filter((l) => l !== 'neutral'))
      for (const mood of ['happy', 'content', 'sleepy', 'grumpy'] as const)
        for (let o = 0; o < 6; o++) {
          await page.emulateMedia({ colorScheme: scheme })
          const days = { happy: 0, content: 1, sleepy: 3, grumpy: 5 }[mood]
          await page.evaluate((d) => {
            localStorage.clear()
            localStorage.setItem('drag-on:v1', JSON.stringify(d))
          }, data({ xp: from('elder') + 10, taskId: LOOK_TASK[look], stage: 'elder', finds: ITEMS.map((i) => i.id), wearing: { head: null, neck: NECKS[o]!, held: null }, daysAgo: days }))
          await page.reload()
          const svg = page.locator('#dragon-art .dragon-svg')
          await expect(svg).toHaveAttribute('data-evolution', look)
          await expect(svg).toHaveAttribute('data-mood', mood)
          await page.waitForTimeout(mood === 'sleepy' || mood === 'grumpy' ? 800 : 300)
          // Freeze animations so sampling is stable.
          await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()))
          const r = await page.evaluate(() => {
            const style = document.createElement('style')
            style.textContent = '#dragon-art svg, #dragon-art svg * { pointer-events: visiblePainted !important }'
            document.head.append(style)
            const neck = document.querySelector('#dragon-art .worn-neck')!
            const nb = neck.getBoundingClientRect()
            const hits: Record<string, number> = {}
            let painted = 0
            for (let x = nb.left + 0.5; x < nb.right; x += 1)
              for (let y = nb.top + 0.5; y < nb.bottom; y += 1) {
                const visible = (e: Element) => {
                  for (let a: Element | null = e; a && a !== document.body; a = a.parentElement) {
                    const cs = getComputedStyle(a)
                    if (Number(cs.opacity) === 0 || cs.display === 'none' || cs.visibility === 'hidden') return false
                  }
                  return true
                }
                const stack = document.elementsFromPoint(x, y).filter(visible)
                const i = stack.findIndex((e) => neck.contains(e))
                if (i < 0) continue
                painted++
                const top = stack[0]!
                if (!neck.contains(top) && top.closest('#dragon-art svg')) {
                  const g = top.closest('[class]')!
                  const k = `${top.tagName}.${g.getAttribute('class')}`
                  hits[k] = (hits[k] ?? 0) + 1
                }
              }
            style.remove()
            // Room: gap between the neck item and the head box / held item / body bottom.
            const head = document.querySelector('#dragon-art .dragon-head-box')!.getBoundingClientRect()
            return { painted, hits, w: Math.round(nb.width), h: Math.round(nb.height), gapToHeadBox: Math.round(nb.top - head.bottom) }
          })
          const tag = `${scheme} elder/${look}/${mood} ${NECKS[o]}`
          rows.push(`${tag} ${JSON.stringify(r)}`)
          // Curled up, the blanket is meant to tuck over neck items.
          if (mood !== 'grumpy' && Object.keys(r.hits).length) over.push(`${tag} drawn over: ${JSON.stringify(r.hits)} of ${r.painted}px`)
          if (mood === 'content' || o === 0) {
            const box = await page.locator('#dragon-art .dragon-svg').boundingBox()
            const file = `${dir}/${PFX}-elderneck-${scheme}-${look}-${mood}-${NECKS[o]}.png`
            await page.screenshot({ path: file, clip: { x: box!.x, y: box!.y, width: box!.width, height: box!.height } })
            shots.push({ label: `${scheme} ${look} ${mood} ${NECKS[o]}`, file })
          }
        }
  console.log('ELDER\n' + rows.join('\n'))
  console.log('ELDER OVER', JSON.stringify(over, null, 1))
  const p2 = await page.context().newPage()
  await p2.setViewportSize({ width: 1400, height: 900 })
  for (let k = 0; k < shots.length; k += 24) {
    await p2.setContent(
      `<html><body style="margin:0;background:#888;font:12px sans-serif;display:grid;grid-template-columns:repeat(6,1fr);gap:3px">${shots
        .slice(k, k + 24)
        .map((s) => `<div><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><div style="background:#fff">${s.label}</div></div>`)
        .join('')}</body></html>`,
    )
    await p2.screenshot({ path: `${dir}/${PFX}-sheet-elderneck-${k / 24}.png`, fullPage: true })
  }
  expect.soft(over).toEqual([])
  expect(msgs).toEqual([])
})

// ---------------------------------------------------------------------------
// 4. The find card's saved line: no lone last word.
// ---------------------------------------------------------------------------
for (const scheme of ['light', 'dark'] as const)
  test(`4 find card line wraps evenly (${scheme})`, async ({ browser }, info) => {
    const results: string[] = []
    const fails: string[] = []
    const cases = [
      { name: 'wearing', d: data({ xp: 300 }) },
      { name: 'taken', d: data({ xp: 300, finds: ['beanie'], wearing: { head: 'beanie', neck: null, held: null } }) },
      { name: 'egg', d: data({ xp: 40 }) },
    ]
    const sizes = info.project.name === 'pixel10pro' ? [[410, 914], [410, 840]] : [[360, 800]]
    for (const [w, h] of sizes)
      for (const c of cases) {
        const { page, context, msgs } = await freshPage(browser, info, w!, h!, scheme, c.d, './', RARE_ROLL)
        await page.locator('button.task[data-task-id="read"]').tap()
        const card = page.locator('.overlay.item-found')
        await expect(card).toBeVisible()
        await page.waitForTimeout(800)
        const m = await card.locator('.item-found-saved').evaluate((e) => {
          const text = e.firstChild!
          const words: { w: string; top: number }[] = []
          const re = /\S+/g
          let mm: RegExpExecArray | null
          while ((mm = re.exec(text.textContent!))) {
            const r = document.createRange()
            r.setStart(text, mm.index)
            r.setEnd(text, mm.index + mm[0].length)
            words.push({ w: mm[0], top: Math.round(r.getBoundingClientRect().top) })
          }
          const lines: string[][] = []
          let last = -1
          for (const x of words) {
            if (x.top !== last) lines.push([])
            lines.at(-1)!.push(x.w)
            last = x.top
          }
          const b = e.getBoundingClientRect()
          return { lines: lines.map((l) => l.join(' ')), fs: getComputedStyle(e).fontSize, l: b.left, r: b.right }
        })
        results.push(`${w}x${h} ${c.name}: ${JSON.stringify(m)}`)
        const lastLine = m.lines.at(-1)!
        if (m.lines.length > 1 && !lastLine.includes(' ')) fails.push(`${w}x${h} ${c.name}: lone "${lastLine}"`)
        if (m.l < 0 || m.r > w!) fails.push(`${w}x${h} ${c.name}: off-screen`)
        await page.screenshot({ path: `${dir}/${PFX}-card-line-${c.name}-${w}x${h}-${scheme}.png` })
        expect.soft(msgs).toEqual([])
        await context.close()
      }
    console.log(info.project.name, scheme, 'CARD LINES\n' + results.join('\n'))
    expect(fails).toEqual([])
  })

// ---------------------------------------------------------------------------
// 5. Collection toast vs the bottom row.
// ---------------------------------------------------------------------------
for (const scheme of ['light', 'dark'] as const)
  test(`5 collection toast and the last row (${scheme})`, async ({ browser }, info) => {
    const sizes = info.project.name === 'pixel10pro' ? [[410, 914], [410, 840]] : [[360, 800]]
    const fails: string[] = []
    for (const [w, h] of sizes) {
      const { page, context, msgs } = await freshPage(browser, info, w!, h!, scheme, data({ xp: 4200, stage: 'adult', finds: ITEMS.map((i) => i.id) }))
      const tag = `${w}x${h} ${scheme}`
      await page.getByRole('link', { name: 'Collection' }).tap()
      await expect(page.locator('#collection-screen')).toBeVisible()
      const tiles = page.locator('#collection-screen button.item-tile')
      const n = await tiles.count()
      // Wear the first tile (top) to show the toast, then find a tile under the toast.
      await tiles.first().tap()
      await expect(page.locator('#collection-screen .cs-toast')).toHaveClass(/is-showing/)
      await page.waitForTimeout(300)
      const under = await page.evaluate(() => {
        const t = document.querySelector('#collection-screen .cs-toast')!.getBoundingClientRect()
        const cx = (t.left + t.right) / 2
        const cy = (t.top + t.bottom) / 2
        const hit = document.elementFromPoint(cx, cy)
        const tile = hit?.closest('button.item-tile') as HTMLElement | null
        return { cx, cy, hit: hit?.className, tile: tile?.dataset.item ?? null, pe: getComputedStyle(document.querySelector('#collection-screen .cs-toast')!).pointerEvents, t: { top: t.top, bottom: t.bottom } }
      })
      console.log(tag, 'under toast', JSON.stringify(under))
      await page.screenshot({ path: `${dir}/${PFX}-coll-toast-top-${w}x${h}-${scheme}.png` })
      if (under.tile) {
        const before = await page.locator(`#collection-screen button.item-tile[data-item="${under.tile}"]`).getAttribute('aria-pressed')
        await page.touchscreen.tap(under.cx, under.cy)
        await page.waitForTimeout(200)
        const after = await page.locator(`#collection-screen button.item-tile[data-item="${under.tile}"]`).getAttribute('aria-pressed')
        console.log(tag, 'tap through toast on', under.tile, before, '->', after)
        if (before === after) fails.push(`${tag}: tap through toast did not reach tile ${under.tile}`)
      } else console.log(tag, 'no tile under the toast centre; element', under.hit)

      // Scroll to the bottom; show the toast by tapping a last-row tile; is the last row clear?
      await page.locator('#collection-screen .cs-scroll').evaluate((e) => e.scrollTo(0, e.scrollHeight))
      await page.waitForTimeout(400)
      const last = tiles.nth(n - 1)
      await last.tap()
      await expect(page.locator('#collection-screen .cs-toast')).toHaveClass(/is-showing/)
      await page.waitForTimeout(400)
      const g = await page.evaluate(() => {
        const t = document.querySelector('#collection-screen .cs-toast')!.getBoundingClientRect()
        const tiles = [...document.querySelectorAll('#collection-screen .item-tile')].map((e) => e.getBoundingClientRect())
        const lastTop = Math.max(...tiles.map((r) => r.top))
        const lastRow = tiles.filter((r) => Math.abs(r.top - lastTop) < 1)
        const tab = document.querySelector('.tabbar')!.getBoundingClientRect()
        const s = document.querySelector('#collection-screen .cs-scroll')!
        return {
          toastTop: Math.round(t.top),
          toastBottom: Math.round(t.bottom),
          lastRowBottom: Math.round(Math.max(...lastRow.map((r) => r.bottom))),
          tabTop: Math.round(tab.top),
          atBottom: Math.abs(s.scrollHeight - s.clientHeight - s.scrollTop) < 2,
        }
      })
      console.log(tag, 'bottom', JSON.stringify(g))
      if (g.lastRowBottom > g.toastTop) fails.push(`${tag}: last row bottom ${g.lastRowBottom} under toast top ${g.toastTop}`)
      if (g.toastBottom > g.tabTop) fails.push(`${tag}: toast over tab bar`)
      await page.screenshot({ path: `${dir}/${PFX}-coll-toast-bottom-${w}x${h}-${scheme}.png` })
      // Tap-through at every last-row tile point under the toast.
      const hits = await page.evaluate(() => {
        const t = document.querySelector('#collection-screen .cs-toast')!.getBoundingClientRect()
        const out: string[] = []
        for (let x = t.left + 4; x < t.right; x += 20) {
          const e = document.elementFromPoint(x, (t.top + t.bottom) / 2)
          if (e?.closest('.cs-toast')) out.push(`toast caught at x=${Math.round(x)}`)
        }
        return out
      })
      if (hits.length) fails.push(`${tag}: ${hits.join(', ')}`)
      // Tap targets on this screen.
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('#collection-screen button, .tabbar a')]
          .filter((e) => (e as HTMLElement).offsetParent)
          .map((e) => ({ e: (e as HTMLElement).dataset.item ?? e.textContent?.trim(), r: e.getBoundingClientRect() }))
          .filter((x) => x.r.width < 44 || x.r.height < 44)
          .map((x) => `${x.e} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`),
      )
      if (small.length) fails.push(`${tag}: small targets ${small.join('; ')}`)
      expect.soft(msgs).toEqual([])
      await context.close()
    }
    expect(fails).toEqual([])
  })

// ---------------------------------------------------------------------------
// Regression: tap targets on Home and the Dragon screen, full outfit.
// ---------------------------------------------------------------------------
test('R tap targets on Home and Dragon screen', async ({ browser }, info) => {
  const [w, h] = info.project.name === 'pixel10pro' ? [410, 840] : [360, 800]
  const { page, context, msgs } = await freshPage(browser, info, w, h, 'light', data({ xp: 4200, stage: 'adult', finds: ITEMS.map((i) => i.id), wearing: outfit(4) }))
  const measure = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('button, a, [role="button"]')]
        .filter((e) => (e as HTMLElement).offsetParent && !(e as HTMLElement).closest('[hidden]'))
        .map((e) => {
          const r = e.getBoundingClientRect()
          return { id: e.id || (e as HTMLElement).dataset.taskId || e.textContent?.trim().slice(0, 20), w: Math.round(r.width), h: Math.round(r.height) }
        }),
    )
  const home = await measure()
  await page.getByRole('link', { name: 'Dragon' }).tap()
  await page.waitForTimeout(300)
  const ds = await measure()
  console.log(info.project.name, 'targets home', JSON.stringify(home), 'dragon', JSON.stringify(ds))
  const small = [...home, ...ds].filter((x) => x.w < 44 || x.h < 44)
  expect(small).toEqual([])
  expect(msgs).toEqual([])
  await context.close()
})
