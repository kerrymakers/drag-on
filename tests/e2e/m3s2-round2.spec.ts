// Phone-tester round 2 for Milestone 3, Slice 2: the welcome bubble in sleepy and
// curled-up moods, at every stage and look, across the user's viewports.
import { test, expect, type Page } from '@playwright/test'
import { STAGES } from '../../src/config/stages'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB' })
const TUE_1000 = new Date('2026-10-06T10:00:00+01:00')
const from = (id: string) => STAGES.find((s) => s.id === id)!.xpFrom
const dir = 'tests/screenshots/m3s2-round2'

const SIZES = [
  [410, 840],
  [410, 914],
  [360, 800],
  [410, 800],
  [360, 680],
] as const
const LOOKS = { strength: 'gym', discipline: 'avoided', wisdom: 'read', heart: 'selfcare' } as const
const MOODS = [['sleepy', 3], ['grumpy', 5]] as const
const CASES: { stage: string; look: string; taskId: string }[] = [
  { stage: 'egg', look: 'neutral', taskId: 'gym' },
  { stage: 'hatchling', look: 'neutral', taskId: 'gym' },
  { stage: 'whelp', look: 'neutral', taskId: 'gym' },
  ...['juvenile', 'adult', 'elder'].flatMap((stage) => Object.entries(LOOKS).map(([look, taskId]) => ({ stage, look, taskId }))),
]

function collectConsole(page: Page) {
  const msgs: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') msgs.push(`${m.type()}: ${m.text()}`)
  })
  page.on('pageerror', (e) => msgs.push(`pageerror: ${e.message}`))
  return msgs
}

type B = { l: number; t: number; r: number; b: number }
const overlap = (a: B, b: B) => Math.max(0, Math.min(a.r, b.r) - Math.max(a.l, b.l)) * Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t))

for (const [w, h] of SIZES) {
  test.describe(`${w}x${h}`, () => {
    test.use({ viewport: { width: w, height: h }, deviceScaleFactor: 3.125 })
    test.beforeEach(({}, info) => test.skip(info.project.name !== 'pixel10pro'))

    for (const scheme of ['light', 'dark'] as const) {
      for (const motion of ['reduce', 'no-preference'] as const) {
        // Animated pass only at the two key sizes, to keep the run short.
        if (motion === 'no-preference' && !(w === 410 && h === 914) && !(w === 360 && h === 680)) continue
        test(`welcome bubble, every stage and look (${scheme}, motion ${motion})`, async ({ page }) => {
          test.setTimeout(300_000)
          const msgs = collectConsole(page)
          await page.emulateMedia({ colorScheme: scheme, reducedMotion: motion })
          await page.clock.install({ time: TUE_1000 })
          await page.goto('./')
          const problems: string[] = []
          const rows: string[] = []
          for (const c of CASES) {
            for (const [mood, daysAgo] of MOODS) {
              const tag = `${c.stage} ${c.look} ${mood}`
              await page.evaluate(({ xp, taskId, stage, ts }) => {
                localStorage.removeItem('drag-on:ui')
                const ev: Record<string, unknown> = { id: 's', type: 'log', taskId, timestamp: ts, xpAwarded: xp }
                if (stage !== 'egg') ev.stageReached = stage
                localStorage.setItem('drag-on:v1', JSON.stringify({ schemaVersion: 1, events: [ev] }))
              }, { xp: c.stage === 'egg' ? 10 : from(c.stage) + 10, taskId: c.taskId, stage: c.stage, ts: TUE_1000.getTime() - daysAgo * 86_400_000 })
              await page.reload()
              const svg = page.locator('#dragon-art .dragon-svg')
              await expect(svg).toHaveAttribute('data-mood', mood)
              if (c.look !== 'neutral') await expect(svg).toHaveAttribute('data-evolution', c.look)
              await expect(page.locator('#speech')).toHaveClass(/is-showing/)
              // Let the pose transition (600ms) and the bubble fade-in settle.
              await page.waitForTimeout(motion === 'reduce' ? 450 : 900)
              const f = await page.evaluate(() => {
                const bx = (r: DOMRect) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom })
                const q = (s: string) => document.querySelector(s)
                const sp = q('#speech')!
                const cs = getComputedStyle(sp)
                // Painted face features and head accessories, measured independently of the head box.
                // Body accessories (sash, plates, wing marks) may sit under the bubble by design.
                const face = [...document.querySelectorAll('#dragon-art :is(.hd-eye, .hd-mouth, .hd-nostril, .hd-fang, .hd-cheek, .mood-lid-fill, .mood-lid-line, .hd-horn, .look-glasses, .lk-forehead, .lk-nosehorn, .lk-flower, .lk-petal, .lk-flower-centre)')]
                  .flatMap((e) => (e.matches('g') ? [...e.querySelectorAll('path,ellipse,circle,rect,polygon,line,polyline')] : [e]))
                  .filter((e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0 })
                  .map((e) => ({ cls: e.getAttribute('class'), ...bx(e.getBoundingClientRect()) }))
                  .filter((r) => r.r > r.l || r.b > r.t)
                const range = document.createRange(); range.selectNodeContents(sp)
                const textRects = [...range.getClientRects()].map(bx)
                return {
                  speech: bx(sp.getBoundingClientRect()),
                  head: q('#dragon-art .dragon-head-box') ? bx(q('#dragon-art .dragon-head-box')!.getBoundingClientRect()) : null,
                  header: bx(q('.top')!.getBoundingClientRect()),
                  growth: bx(q('.growth-row')!.getBoundingClientRect()),
                  area: bx(sp.parentElement!.getBoundingClientRect()),
                  compact: sp.classList.contains('is-compact'),
                  font: parseFloat(cs.fontSize), opacity: Number(cs.opacity),
                  overflow: sp.scrollWidth > sp.clientWidth + 1 || sp.scrollHeight > sp.clientHeight + 1,
                  textRects, face, text: sp.textContent,
                  tail: (sp as HTMLElement).dataset.tail,
                  docW: document.documentElement.scrollWidth, docH: document.documentElement.scrollHeight,
                }
              })
              const s = f.speech
              if (s.l < 0 || s.r > w || s.t < 0 || s.b > h) problems.push(`${tag}: speech off-screen`)
              if (f.head && overlap(s, f.head) > 4) problems.push(`${tag}: speech overlaps head box by ${overlap(s, f.head).toFixed(0)}px²`)
              const faceHits = f.face.map((r) => ({ cls: r.cls, a: overlap(s, r) })).filter((x) => x.a > 4)
              if (faceHits.length) problems.push(`${tag}: speech covers face parts ${faceHits.map((x) => `${x.cls}=${x.a.toFixed(0)}`).join(', ')}`)
              if (s.t < f.header.b - 1) problems.push(`${tag}: speech overlaps header by ${(f.header.b - s.t).toFixed(1)}`)
              if (s.b > f.growth.t + 1) problems.push(`${tag}: speech overlaps XP row by ${(s.b - f.growth.t).toFixed(1)}`)
              if (f.font < 12) problems.push(`${tag}: font ${f.font}px too small`)
              // (scroll size includes the tail pseudo-element, so check the text rects instead)
              for (const tr of f.textRects) if (tr.l < s.l - 1 || tr.r > s.r + 1 || tr.t < s.t - 1 || tr.b > s.b + 1) { problems.push(`${tag}: text outside bubble`); break }
              if (f.opacity < 0.99) problems.push(`${tag}: bubble opacity ${f.opacity}`)
              if (f.docW > w || f.docH > h) problems.push(`${tag}: page scrolls`)
              rows.push(`${tag}: compact=${f.compact} tail=${f.tail} font=${f.font} speech=${[s.l, s.t, s.r, s.b].map(Math.round)} head=${f.head ? [f.head.l, f.head.t, f.head.r, f.head.b].map(Math.round) : '-'} growthTop=${Math.round(f.growth.t)} "${f.text}"`)
              await page.screenshot({ path: `${dir}/${w}x${h}-${scheme}-${motion}-${c.stage}-${c.look}-${mood}.png` })
            }
          }
          test.info().annotations.push({ type: 'rows', description: rows.join('\n') })
          console.log(`--- ${w}x${h} ${scheme} ${motion}\n` + rows.join('\n'))
          expect(problems).toEqual([])
          expect(msgs).toEqual([])
        })
      }
    }
  })
}
