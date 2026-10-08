// Phone-tester checks for M4 slice 3 (wearing items). Screenshots: tests/screenshots/m4s3-phone-* (or $SHOT_PREFIX-*)
import { test, expect, type Page } from '../e2e/fixtures'
import * as fs from 'node:fs'
import { ITEMS } from '../../src/config/items'
import { REWARDS } from '../../src/config/rewards'
import { STAGES } from '../../src/config/stages'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const dir = 'tests/screenshots'
const PFX = process.env.SHOT_PREFIX ?? 'm4s3-phone'
const NOW = new Date('2026-10-13T10:00:00+01:00')
const DAY = 86_400_000
const RARE_ROLL = REWARDS.rareChance / 3

const HEADS = ['bow', 'beanie', 'crown', 'flower', 'partyhat', 'acorn']
const NECKS = ['scarf', 'bell', 'bandana', 'pendant', 'bowtie', 'shells']
const HELDS = ['book', 'gem', 'teacup', 'lantern', 'mushroom', 'balloon']
const outfit = (i: number) => ({ head: HEADS[i]!, neck: NECKS[i]!, held: HELDS[i]! })
const MOOD_DAYS = { happy: 0, content: 1, sleepy: 3, grumpy: 5 } as const
const LOOK_TASK = { strength: 'gym', discipline: 'avoided', wisdom: 'read', heart: 'selfcare' } as const
const from = (s: string) => STAGES.find((x) => x.id === s)!.xpFrom

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

async function open(page: Page, roll: number | null = null) {
  if (roll !== null) await page.addInitScript((r) => (Math.random = () => r), roll)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  await expect(page.locator('#tabbar a').first()).toBeVisible()
}

/** Geometry of the worn items vs the svg, clipping ancestors, viewport and speech bubble. */
async function wornGeometry(page: Page, root = '#dragon-art') {
  return page.evaluate((root) => {
    const R = (e: Element) => {
      const b = e.getBoundingClientRect()
      return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }
    }
    const svg = document.querySelector(`${root} .dragon-svg`)!
    const sv = R(svg)
    const clips: { l: number; t: number; r: number; b: number }[] = []
    for (let e: Element | null = svg.parentElement; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (cs.overflowX !== 'visible' || cs.overflowY !== 'visible') clips.push(R(e))
    }
    const speech = document.querySelector('#speech')
    const sp = speech && speech.classList.contains('is-showing') && root === '#dragon-art' ? R(speech) : null
    const inter = (a: any, b: any) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))
    const worn = [...document.querySelectorAll(`${root} [data-worn]`)].map((e) => {
      const r = R(e)
      const out: string[] = []
      if (r.w < 1 || r.h < 1) out.push('zero-size')
      if (r.l < sv.l - 1 || r.r > sv.r + 1 || r.t < sv.t - 1 || r.b > sv.b + 1) out.push('outside-svg')
      if (r.l < 0 || r.r > innerWidth || r.t < 0) out.push('off-viewport')
      for (const c of clips) if (r.l < c.l - 1 || r.r > c.r + 1 || r.t < c.t - 1 || r.b > c.b + 1) out.push('clipped-by-ancestor')
      const op = Number(getComputedStyle(e).opacity)
      return {
        id: (e as HTMLElement).dataset.worn,
        cls: e.getAttribute('class'),
        rect: r,
        problems: out,
        opacity: op,
        speechOverlapPct: sp ? Math.round((inter(r, sp) / (r.w * r.h)) * 100) : null,
      }
    })
    return { svg: sv, speech: sp, worn }
  }, root)
}

// ---------------------------------------------------------------------------
// 1. Every stage, look and mood with a full outfit, light and dark.
// ---------------------------------------------------------------------------
const STAGE_LOOKS: { stage: string; look: string }[] = [
  { stage: 'hatchling', look: 'neutral' },
  { stage: 'whelp', look: 'neutral' },
  ...['juvenile', 'adult', 'elder'].flatMap((stage) => Object.keys(LOOK_TASK).map((look) => ({ stage, look }))),
]

test('art matrix: full outfit on every stage, look and mood', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  test.setTimeout(600_000)
  const msgs = collectConsole(page)
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  const problems: string[] = []
  const speechNotes: string[] = []
  const shots: Record<string, { label: string; file: string }[]> = {}
  const combos: { scheme: 'light' | 'dark'; stage: string; look: string; mood: keyof typeof MOOD_DAYS; o: number; sheet: string }[] = []
  for (const scheme of ['light', 'dark'] as const)
    for (const { stage, look } of STAGE_LOOKS) {
      for (const mood of Object.keys(MOOD_DAYS) as (keyof typeof MOOD_DAYS)[]) combos.push({ scheme, stage, look, mood, o: 4, sheet: `moods-${scheme}` })
      for (let o = 0; o < 6; o++) if (o !== 4) combos.push({ scheme, stage, look, mood: 'content', o, sheet: `outfits-${scheme}` })
    }
  for (const c of combos) {
    await page.emulateMedia({ colorScheme: c.scheme })
    const taskId = c.look === 'neutral' ? 'gym' : LOOK_TASK[c.look as keyof typeof LOOK_TASK]
    const d = data({ xp: from(c.stage) + 10, taskId, stage: c.stage, finds: ITEMS.map((i) => i.id), wearing: outfit(c.o), daysAgo: MOOD_DAYS[c.mood] })
    await page.evaluate((d) => {
      localStorage.clear()
      localStorage.setItem('drag-on:v1', JSON.stringify(d))
    }, d)
    await page.reload()
    const svg = page.locator('#dragon-art .dragon-svg')
    await expect(svg).toHaveAttribute('data-stage', c.stage)
    await expect(svg).toHaveAttribute('data-evolution', c.look)
    await expect(svg).toHaveAttribute('data-mood', c.mood)
    await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(3)
    await page.waitForTimeout(c.mood === 'sleepy' || c.mood === 'grumpy' ? 800 : 350)
    const g = await wornGeometry(page)
    const tag = `${c.scheme} ${c.stage}/${c.look}/${c.mood} outfit${c.o}`
    for (const w of g.worn) {
      if (w.problems.length) problems.push(`${tag} ${w.id}: ${w.problems.join(',')}`)
      if (w.speechOverlapPct) speechNotes.push(`${tag} ${w.id} (${w.cls}) covered ${w.speechOverlapPct}% by speech`)
    }
    const file = `${dir}/${PFX}-art-${c.scheme}-${c.stage}-${c.look}-${c.mood}-o${c.o}.png`
    // Include the speech bubble area: clip from the header bottom to the first task.
    const clip = await page.evaluate(() => {
      const a = document.querySelector('#dragon-art')!.getBoundingClientRect()
      const s = document.querySelector('#speech')!.getBoundingClientRect()
      const top = Math.max(0, Math.min(a.top, s.top) - 4)
      const bottom = Math.max(a.bottom, s.bottom) + 4
      return { x: 0, y: top, width: innerWidth, height: bottom - top }
    })
    await page.screenshot({ path: file, clip })
    ;(shots[c.sheet] ??= []).push({ label: `${c.stage} ${c.look} ${c.mood} o${c.o}`, file })
  }
  console.log('PROBLEMS', JSON.stringify(problems, null, 1))
  console.log('SPEECH', JSON.stringify(speechNotes, null, 1))
  // Contact sheets so the matrix can be looked at quickly.
  for (const [name, list] of Object.entries(shots)) {
    for (let k = 0; k < list.length; k += 28) {
      const chunk = list.slice(k, k + 28)
      const html = `<html><body style="margin:0;background:#888;font:11px sans-serif;display:grid;grid-template-columns:repeat(7,1fr);gap:2px">${chunk
        .map((s) => `<div><img style="width:100%;display:block" src="data:image/png;base64,${fs.readFileSync(s.file).toString('base64')}"><div style="background:#fff">${s.label}</div></div>`)
        .join('')}</body></html>`
      const p2 = await page.context().newPage()
      await p2.setViewportSize({ width: 1400, height: 900 })
      await p2.setContent(html)
      await p2.screenshot({ path: `${dir}/${PFX}-sheet-${name}-${k / 28}.png`, fullPage: true })
      await p2.close()
    }
  }
  expect.soft(problems).toEqual([])
  expect(msgs).toEqual([])
})

// ---------------------------------------------------------------------------
// 2. Home at 410x840 with every head item on every stage, sleepy (welcome bubble).
// ---------------------------------------------------------------------------
test('Home at 410x840: fits, hat clear of header and speech, every stage', async ({ page }, info) => {
  test.skip(info.project.name !== 'pixel10pro')
  test.setTimeout(300_000)
  const msgs = collectConsole(page)
  await page.setViewportSize({ width: 410, height: 840 })
  await page.clock.setFixedTime(NOW)
  await page.goto('./')
  const rows: string[] = []
  const fails: string[] = []
  for (const stage of ['hatchling', 'whelp', 'juvenile', 'adult', 'elder'])
    for (let o = 0; o < 6; o++) {
      await page.evaluate((d) => {
        localStorage.clear()
        localStorage.setItem('drag-on:v1', JSON.stringify(d))
      }, data({ xp: from(stage) + 10, stage, finds: ITEMS.map((i) => i.id), wearing: outfit(o), daysAgo: 3 }))
      await page.reload()
      await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(3)
      await expect(page.locator('#speech')).toHaveClass(/is-showing/)
      await page.waitForTimeout(700)
      const m = await page.evaluate(() => {
        const t = document.querySelector<HTMLElement>('#tasks')!
        const header = document.querySelector('.top')!.getBoundingClientRect()
        const hat = document.querySelector('#dragon-art .worn-head')!.getBoundingClientRect()
        const tasks = [...document.querySelectorAll('button.task')].map((e) => e.getBoundingClientRect())
        return {
          docH: document.documentElement.scrollHeight,
          over: t.scrollHeight - t.clientHeight,
          hatTop: Math.round(hat.top),
          headerBottom: Math.round(header.bottom),
          lastTaskBottom: Math.round(Math.max(...tasks.map((r) => r.bottom))),
          tabTop: Math.round(document.querySelector('.tabbar')!.getBoundingClientRect().top),
        }
      })
      const g = await wornGeometry(page)
      const ov = Object.fromEntries(g.worn.map((w) => [w.id, w.speechOverlapPct]))
      rows.push(`${stage} o${o} ${JSON.stringify(m)} speechOverlap=${JSON.stringify(ov)}`)
      if (m.docH > 840) fails.push(`${stage} o${o} docH ${m.docH}`)
      if (m.over > 0) fails.push(`${stage} o${o} tasks overflow ${m.over}`)
      if (m.hatTop < m.headerBottom) fails.push(`${stage} o${o} hat under header ${m.hatTop}<${m.headerBottom}`)
      if (m.lastTaskBottom > m.tabTop) fails.push(`${stage} o${o} task under tab bar`)
      const head = g.worn.find((w) => w.cls?.includes('worn-head'))
      if (head?.speechOverlapPct) fails.push(`${stage} o${o} speech covers hat ${head.speechOverlapPct}%`)
      if (o === 4 || o === 2) await page.screenshot({ path: `${dir}/${PFX}-home840-${stage}-o${o}.png` })
    }
  console.log(rows.join('\n'))
  expect.soft(fails).toEqual([])
  expect(msgs).toEqual([])
})

// ---------------------------------------------------------------------------
// 3. Collection, Dragon screen: both widths, both schemes. Hatchling (a reached stage).
// ---------------------------------------------------------------------------
for (const scheme of ['light', 'dark'] as const) {
  test(`Collection and Dragon screen (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await seedOnce(page, data({ xp: 300, finds: ['bow', 'scarf', 'book', 'beanie'] }))
    await open(page)
    await page.getByRole('link', { name: 'Dragon' }).tap()
    await page.locator('#dragon-screen .wear-empty').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/${PFX}-dragon-empty-${scheme}-${p}.png` })

    await page.getByRole('link', { name: 'Collection' }).tap()
    const screen = page.locator('#collection-screen')
    await expect(screen).toBeVisible()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/${PFX}-collection-none-${scheme}-${p}.png` })

    // Tile sizes, measured.
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('#collection-screen .item-tile')].map((e) => {
        const b = e.getBoundingClientRect()
        return { item: (e as HTMLElement).dataset.item ?? '?', tag: e.tagName, w: Math.round(b.width), h: Math.round(b.height) }
      }),
    )
    console.log(p, scheme, 'tiles', JSON.stringify(sizes))
    for (const s of sizes.filter((s) => s.tag === 'BUTTON')) {
      expect.soft(s.w).toBeGreaterThanOrEqual(44)
      expect.soft(s.h).toBeGreaterThanOrEqual(44)
    }

    // Layout: preview vs grid.
    const lay = await page.evaluate(() => {
      const r = (s: string) => {
        const e = document.querySelector(s)
        if (!e) return null
        const b = e.getBoundingClientRect()
        return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }
      }
      const tiles = [...document.querySelectorAll('#collection-screen .item-tile')].map((e) => e.getBoundingClientRect())
      const tab = document.querySelector('.tabbar')!.getBoundingClientRect()
      return {
        art: r('#collection-screen .cs-art'),
        svg: r('#collection-screen .cs-art .dragon-svg'),
        hint: r('#collection-screen .cs-hint'),
        firstTileTop: Math.round(tiles[0]!.top),
        tilesFullyVisibleAboveTab: tiles.filter((t) => t.bottom <= tab.top).length,
        tabTop: Math.round(tab.top),
        docW: document.documentElement.scrollWidth,
        vw: innerWidth,
      }
    })
    console.log(p, scheme, 'collection layout', JSON.stringify(lay))
    expect.soft(lay.docW).toBeLessThanOrEqual(lay.vw)

    // Wear three things.
    for (const id of ['bow', 'scarf', 'book']) {
      await page.locator(`#collection-screen button.item-tile[data-item="${id}"]`).tap()
      await expect(page.locator(`#collection-screen button.item-tile[data-item="${id}"]`)).toHaveAttribute('aria-pressed', 'true')
    }
    await page.waitForTimeout(450)
    const toast = await page.evaluate(() => {
      const t = document.querySelector('#collection-screen .cs-toast')!.getBoundingClientRect()
      const tab = document.querySelector('.tabbar')!.getBoundingClientRect()
      return { tBottom: Math.round(t.bottom), tabTop: Math.round(tab.top), l: Math.round(t.left), r: Math.round(t.right), text: document.querySelector('#collection-screen .cs-toast')!.textContent }
    })
    console.log(p, scheme, 'toast', JSON.stringify(toast))
    expect.soft(toast.tBottom).toBeLessThanOrEqual(toast.tabTop)
    await page.screenshot({ path: `${dir}/${PFX}-collection-worn-toast-${scheme}-${p}.png` })
    await page.waitForTimeout(3500)
    await page.screenshot({ path: `${dir}/${PFX}-collection-worn-${scheme}-${p}.png` })

    // Badge readability: contrast of badge text on its background.
    const badge = await page.evaluate(() => {
      const b = document.querySelector('#collection-screen .item-tile-badge') as HTMLElement
      const cs = getComputedStyle(b)
      let bgEl: Element | null = b
      let bg = cs.backgroundColor
      while (bgEl && (bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent')) {
        bgEl = bgEl.parentElement
        bg = bgEl ? getComputedStyle(bgEl).backgroundColor : 'rgb(255,255,255)'
      }
      const r = b.getBoundingClientRect()
      return { color: cs.color, bg, fontSize: cs.fontSize, fontWeight: cs.fontWeight, w: r.width, h: r.height, text: b.textContent, clipped: b.scrollWidth > b.clientWidth + 1 }
    })
    const lum = (c: string) => {
      const [r, g, b] = c.match(/[\d.]+/g)!.slice(0, 3).map(Number).map((v) => {
        v /= 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const [L1, L2] = [lum(badge.color), lum(badge.bg)].sort((a, b) => b - a)
    const contrast = (L1! + 0.05) / (L2! + 0.05)
    console.log(p, scheme, 'badge', JSON.stringify(badge), 'contrast', contrast.toFixed(2))
    expect.soft(contrast).toBeGreaterThanOrEqual(4.5)
    expect.soft(badge.clipped).toBe(false)
    await page.locator('#collection-screen button.item-tile[data-item="bow"]').screenshot({ path: `${dir}/${PFX}-badge-${scheme}-${p}.png` })

    // Take one off again.
    await page.locator('#collection-screen button.item-tile[data-item="bow"]').tap()
    await expect(page.locator('#collection-screen button.item-tile[data-item="bow"]')).toHaveAttribute('aria-pressed', 'false')
    await expect(page.locator('#collection-screen .cs-toast')).toContainText('Taken off')
    await expect(page.locator('#collection-screen .cs-art [data-worn="bow"]')).toHaveCount(0)
    await page.locator('#collection-screen button.item-tile[data-item="bow"]').tap()

    // Dragon screen card.
    await page.getByRole('link', { name: 'Dragon' }).tap()
    await page.locator('#dragon-screen .wear-list').scrollIntoViewIfNeeded()
    await page.waitForTimeout(400)
    const ds = await page.evaluate(() => {
      const items = [...document.querySelectorAll('#dragon-screen .wear-item')].map((e) => {
        const b = e.getBoundingClientRect()
        const n = e.querySelector('.wear-name') as HTMLElement | null
        return { text: e.textContent, w: Math.round(b.width), h: Math.round(b.height), r: Math.round(b.right), nameClipped: n ? n.scrollWidth > n.clientWidth + 1 : null }
      })
      return { items, vw: innerWidth, docW: document.documentElement.scrollWidth }
    })
    console.log(p, scheme, 'dragon screen wear', JSON.stringify(ds))
    for (const i of ds.items) {
      expect.soft(i.r).toBeLessThanOrEqual(ds.vw)
      expect.soft(i.nameClipped).toBe(false)
    }
    await page.screenshot({ path: `${dir}/${PFX}-dragon-worn-${scheme}-${p}.png` })
    await page.getByRole('link', { name: 'Home' }).tap()
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${dir}/${PFX}-home-worn-${scheme}-${p}.png` })
    expect(msgs).toEqual([])
  })

  test(`Collection at the egg stage (${scheme})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ colorScheme: scheme })
    await seedOnce(page, data({ xp: 40, finds: ['bow'] }))
    await open(page)
    await page.getByRole('link', { name: 'Collection' }).tap()
    await expect(page.locator('#collection-screen .cs-hint')).toHaveText('Your dragon will wear these once it hatches.')
    await page.locator('#collection-screen button.item-tile[data-item="bow"]').tap()
    await page.waitForTimeout(450)
    await page.screenshot({ path: `${dir}/${PFX}-collection-egg-${scheme}-${p}.png` })
    await page.getByRole('link', { name: 'Dragon' }).tap()
    await page.locator('#dragon-screen .wear-list').scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${dir}/${PFX}-dragon-egg-${scheme}-${p}.png` })
    expect(msgs).toEqual([])
  })
}

// ---------------------------------------------------------------------------
// 4. Finds: free spot and taken spot.
// ---------------------------------------------------------------------------
test('find with a free spot: card says it is on, Home shows it after', async ({ page }, info) => {
  const p = info.project.name
  const msgs = collectConsole(page)
  await seedOnce(page, data({ xp: 300 }))
  await open(page, RARE_ROLL)
  await page.locator('button.task[data-task-id="read"]').tap()
  const card = page.locator('.overlay.item-found')
  await expect(card).toBeVisible()
  await page.waitForTimeout(800)
  console.log(p, 'card saved line:', await card.locator('.item-found-saved').textContent())
  const behind = await page.locator('#dragon-art [data-worn]').count()
  console.log(p, 'worn on Home behind the card', behind)
  await page.screenshot({ path: `${dir}/${PFX}-find-free-card-${p}.png` })
  await page.touchscreen.tap(20, 20)
  await expect(card).toHaveCount(0)
  await expect(page.locator('#dragon-art [data-worn="bow"]')).toHaveCount(1)
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/${PFX}-find-free-home-${p}.png` })
  expect(msgs).toEqual([])
})

test('find with the spot taken: nothing changes', async ({ page }, info) => {
  const p = info.project.name
  const msgs = collectConsole(page)
  await seedOnce(page, data({ xp: 300, finds: ['beanie'], wearing: { head: 'beanie', neck: null, held: null } }))
  await open(page, RARE_ROLL)
  const before = await page.locator('#dragon-art .dragon-svg').innerHTML()
  await page.locator('button.task[data-task-id="read"]').tap()
  const card = page.locator('.overlay.item-found')
  await expect(card).toBeVisible()
  await expect(card.locator('.item-found-saved')).toHaveText('Added to your collection')
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${dir}/${PFX}-find-taken-card-${p}.png` })
  await page.touchscreen.tap(20, 20)
  await expect(card).toHaveCount(0)
  await expect(page.locator('#dragon-art [data-worn]')).toHaveCount(1)
  await expect(page.locator('#dragon-art [data-worn="beanie"]')).toHaveCount(1)
  const after = await page.locator('#dragon-art .dragon-svg').innerHTML()
  console.log(p, 'svg unchanged after taken find:', before === after)
  expect(msgs).toEqual([])
})

// ---------------------------------------------------------------------------
// 5. Stage-up plus find in one log.
// ---------------------------------------------------------------------------
for (const motion of ['no-preference', 'reduce'] as const) {
  test(`stage-up plus a find (${motion})`, async ({ page }, info) => {
    const p = info.project.name
    const msgs = collectConsole(page)
    await page.emulateMedia({ reducedMotion: motion })
    // Hatchling at 590: reading (25) reaches whelp. Already wearing a scarf.
    await seedOnce(page, data({ xp: 590, stage: 'hatchling', finds: ['scarf'], wearing: { head: null, neck: 'scarf', held: null } }))
    await open(page, RARE_ROLL)
    // Track the Home dragon's position over the whole sequence.
    await page.evaluate(() => {
      ;(window as any).__pos = []
      const tick = () => {
        const a = document.querySelector('#dragon-art')!.getBoundingClientRect()
        const ov = [...document.querySelectorAll('.overlay')].map((o) => o.className).join('|')
        ;(window as any).__pos.push(`${Math.round(a.top)},${Math.round(a.left)},${Math.round(a.height)} ${ov}`)
      }
      setInterval(tick, 100)
    })
    await page.locator('button.task[data-task-id="read"]').tap()
    const stage = page.locator('.overlay:not(.item-found)')
    await expect(stage).toBeVisible()
    const order1 = await page.evaluate(() => [...document.querySelectorAll('.overlay')].map((o) => o.className))
    const toWorn = await stage.locator('.is-to [data-worn]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.worn))
    const fromWorn = await stage.locator('.is-from [data-worn]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.worn))
    console.log(p, motion, 'overlays first', JSON.stringify(order1), 'from worn', fromWorn, 'to worn', toWorn)
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${dir}/${PFX}-stageup-${motion}-${p}.png` })
    await stage.locator('.overlay-button').tap()
    const card = page.locator('.overlay.item-found')
    await expect(card).toBeVisible()
    console.log(p, motion, 'card saved line:', await card.locator('.item-found-saved').textContent())
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${dir}/${PFX}-stageup-card-${motion}-${p}.png` })
    await page.touchscreen.tap(20, 20)
    await expect(page.locator('.overlay')).toHaveCount(0)
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${dir}/${PFX}-stageup-after-${motion}-${p}.png` })
    const pos = await page.evaluate(() => (window as any).__pos as string[])
    console.log(p, motion, 'position trace', JSON.stringify([...new Set(pos)]))
    console.log(p, motion, 'home worn after', await page.locator('#dragon-art [data-worn]').evaluateAll((e) => e.map((x) => (x as HTMLElement).dataset.worn)))
    expect(msgs).toEqual([])
  })
}

// ---------------------------------------------------------------------------
// 6. Offline: wearing changes save and survive reload while offline.
// ---------------------------------------------------------------------------
test('offline: wear, log, reload', async ({ page, context }, info) => {
  const p = info.project.name
  const msgs = collectConsole(page)
  await seedOnce(page, data({ xp: 300, finds: ['bow', 'scarf'] }))
  await open(page)
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
  await context.setOffline(true)
  await page.getByRole('link', { name: 'Collection' }).tap()
  await page.locator('#collection-screen button.item-tile[data-item="bow"]').tap()
  await page.locator('#collection-screen button.item-tile[data-item="scarf"]').tap()
  await page.getByRole('link', { name: 'Home' }).tap()
  await page.locator('button.task[data-task-id="gym"]').tap()
  await expect(page.locator('#toast')).toHaveClass(/is-showing/)
  await page.reload()
  await expect(page.locator('#dragon-art [data-worn="bow"]')).toHaveCount(1)
  await expect(page.locator('#dragon-art [data-worn="scarf"]')).toHaveCount(1)
  const n = await page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1')!).events.filter((e: any) => e.taskId === 'gym').length)
  expect(n).toBe(2)
  await page.getByRole('link', { name: 'Collection' }).tap()
  await page.locator('#collection-screen button.item-tile[data-item="bow"]').tap()
  await page.reload()
  await expect(page.locator('#dragon-art [data-worn="bow"]')).toHaveCount(0)
  await expect(page.locator('#dragon-art [data-worn="scarf"]')).toHaveCount(1)
  await page.screenshot({ path: `${dir}/${PFX}-offline-${p}.png` })
  await context.setOffline(false)
  // Offline network errors are expected noise only if they are about fetching.
  console.log(p, 'offline console', JSON.stringify(msgs))
  expect(msgs.filter((m) => !/ERR_INTERNET_DISCONNECTED|Failed to fetch/.test(m))).toEqual([])
})

// ---------------------------------------------------------------------------
// 7. Reduced motion: the Collection perk and toast.
// ---------------------------------------------------------------------------
test('reduced motion: wearing in Collection', async ({ page }, info) => {
  const p = info.project.name
  const msgs = collectConsole(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await seedOnce(page, data({ xp: 300, finds: ['bow'] }))
  await open(page)
  await page.getByRole('link', { name: 'Collection' }).tap()
  await page.waitForTimeout(500)
  await page.locator('#collection-screen button.item-tile[data-item="bow"]').tap()
  await page.waitForTimeout(30)
  const anims = await page.evaluate(() =>
    document.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName ?? 'transition',
      dur: a.effect?.getTiming().duration,
      iter: a.effect?.getTiming().iterations,
      target: ((a.effect as KeyframeEffect)?.target as Element | null)?.getAttribute?.('class')?.slice(0, 50),
    })),
  )
  console.log(p, 'rm collection animations', JSON.stringify(anims))
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${dir}/${PFX}-rm-collection-${p}.png` })
  // Same with motion on, for comparison.
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.locator('#collection-screen button.item-tile[data-item="bow"]').tap()
  await page.waitForTimeout(30)
  const anims2 = await page.evaluate(() =>
    document.getAnimations().map((a) => ({
      name: (a as CSSAnimation).animationName ?? 'transition',
      dur: a.effect?.getTiming().duration,
      iter: a.effect?.getTiming().iterations,
      target: ((a.effect as KeyframeEffect)?.target as Element | null)?.getAttribute?.('class')?.slice(0, 50),
    })),
  )
  console.log(p, 'motion collection animations', JSON.stringify(anims2))
  expect(msgs).toEqual([])
})
