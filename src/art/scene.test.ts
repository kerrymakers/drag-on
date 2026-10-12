import { describe, expect, it } from 'vitest'
import sceneCss from './scene.css?raw'
import { SKY_LOOKS, renderScene, sceneBackdrop, sceneFloor, sceneFront } from './scene'

const css = sceneCss.replace(/\/\*[\s\S]*?\*\//g, '')
const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)]
const ids = (markup: string) => [...markup.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!)

/** Just enough of an element for renderScene. */
function fakeEl() {
  return { innerHTML: '', dataset: {} as Record<string, string>, hasChildNodes() { return this.innerHTML !== '' } }
}

describe('scene', () => {
  it('draws every sky, each with something to show', () => {
    const markup = sceneBackdrop('1')
    for (const sky of SKY_LOOKS) {
      expect(markup, sky).toContain(`scene-sky scene-for-${sky}`)
      expect(css, sky).toContain(`[data-sky='${sky}'] .scene-for-${sky}`)
      // Each sky has its own colours in light and dark mode.
      expect(css.match(new RegExp(`\\[data-sky='${sky}'\\] \\{`, 'g'))?.length, sky).toBe(2)
      expect(css.match(new RegExp(`\\.scene-sky\\.scene-for-${sky} \\{`, 'g'))?.length, sky).toBe(2)
    }
    expect(markup).toContain('scene-for-night') // stars and moon
    expect(markup).toContain('scene-sun-high scene-for-day')
    expect(markup).toContain('scene-sun-dawn scene-for-dawn')
    expect(markup).toContain('scene-sun-evening scene-for-evening')
  })

  it('has no NaN or undefined anywhere', () => {
    for (const m of [sceneBackdrop('7'), sceneFloor(), sceneFront()]) expect(m).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('gives each backdrop its own gradient ids, and points at them', () => {
    const a = sceneBackdrop('a')
    const b = sceneBackdrop('b')
    expect(ids(a).length).toBeGreaterThan(0)
    expect(new Set(ids(a)).size).toBe(ids(a).length)
    for (const id of ids(a)) expect(ids(b)).not.toContain(id)
    for (const [, ref] of a.matchAll(/url\(#([^)]+)\)/g)) expect(ids(a)).toContain(ref)
    expect(ids(sceneFloor())).toEqual([])
  })

  it("puts the nest's lip in front of the egg, in the same units as the drawing", () => {
    expect(sceneFront()).toContain('viewBox="0 0 512 512"')
    expect(sceneFront()).toContain('class="scene-nest"')
    expect(sceneFront()).not.toContain('scene-patch')
  })

  it('lays a nest under the egg and grass under the dragon', () => {
    const floor = sceneFloor()
    expect(floor).toContain('viewBox="0 0 512 512"') // the dragon drawing's own units
    expect(floor).toContain('class="scene-nest"')
    expect(floor).toContain('class="scene-patch"')
    expect(css).toContain("[data-ground='nest'] .scene-nest")
    expect(css).toContain("[data-ground='patch'] .scene-patch")
  })

  it('draws once and then only changes the sky and ground', () => {
    const backdrop = fakeEl()
    const floor = fakeEl()
    const front = fakeEl()
    const r = (sky: string, stage: string) =>
      renderScene(backdrop as unknown as HTMLElement, floor as unknown as HTMLElement, front as unknown as HTMLElement, { sky: sky as never, stage })
    r('night', 'egg')
    const first = backdrop.innerHTML
    expect(backdrop.dataset.sky).toBe('night')
    expect(floor.dataset.sky).toBe('night')
    expect(floor.dataset.ground).toBe('nest')
    expect(front.dataset.ground).toBe('nest')
    expect(front.innerHTML).toContain('scene-nest-rim')
    expect(backdrop.dataset.sceneReady).toBe('')
    r('dawn', 'hatchling')
    expect(backdrop.innerHTML).toBe(first)
    expect(backdrop.dataset.sky).toBe('dawn')
    expect(floor.dataset.ground).toBe('patch')
    expect(front.dataset.ground).toBe('patch')
    r('teatime', 'elder')
    expect(backdrop.dataset.sky).toBe('day')
  })

  describe('scene.css', () => {
    it('animates transform and opacity only', () => {
      expect(keyframes.length).toBeGreaterThan(0)
      for (const [, name, body] of keyframes)
        for (const decl of body!.matchAll(/([\w-]+)\s*:/g)) expect(['transform', 'opacity'], `${name}: ${decl[1]}`).toContain(decl[1])
    })

    it('stills every scene animation under reduced motion', () => {
      const at = css.indexOf('@media (prefers-reduced-motion: reduce)')
      expect(at).toBeGreaterThan(-1)
      const reduced = css.slice(at)
      expect(reduced).toMatch(/\.scene \*,\s*\.scene-floor \*\s*\{\s*animation: none !important;/)
      // Every animated rule is on something inside the backdrop or the floor.
      const markup = sceneBackdrop('x') + sceneFloor() + sceneFront()
      const before = css.slice(0, at).replace(/@keyframes\s+[\w-]+\s*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '')
      for (const m of before.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        if (!/(?:^|;)\s*animation\s*:/.test(m[2]!)) continue
        for (const sel of m[1]!.split(',')) {
          const last = sel.trim().split(/\s+/).pop()!
          const cls = [...last.matchAll(/\.([\w-]+)/g)].map((c) => c[1]!)
          expect(cls.length, sel).toBeGreaterThan(0)
          for (const c of cls) expect(markup, `${sel.trim()}: .${c} is drawn in the scene`).toContain(c)
        }
      }
    })
  })
})
