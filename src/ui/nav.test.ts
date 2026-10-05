import { describe, expect, it } from 'vitest'
import { TABS, navAction, routeFromHash, tabTap } from './nav'

describe('routeFromHash', () => {
  it('maps the tab hashes to their routes', () => {
    expect(routeFromHash('#/')).toBe('home')
    expect(routeFromHash('#/dragon')).toBe('dragon')
  })

  it('treats empty, unknown and sloppy hashes kindly', () => {
    expect(routeFromHash('')).toBe('home')
    expect(routeFromHash('#')).toBe('home')
    expect(routeFromHash('#/nowhere')).toBe('home')
    expect(routeFromHash('#dragon')).toBe('dragon')
    expect(routeFromHash('#/dragon/')).toBe('dragon')
    expect(routeFromHash('#/Dragon')).toBe('dragon')
  })

  it('round-trips every tab', () => {
    for (const tab of TABS) expect(routeFromHash(tab.hash)).toBe(tab.route)
  })
})

describe('navAction', () => {
  it('does nothing when tapping the current tab', () => {
    expect(navAction('home', 'home', false)).toBe('none')
    expect(navAction('dragon', 'dragon', true)).toBe('none')
  })

  it('pushes when leaving Home, so back returns to it', () => {
    expect(navAction('home', 'dragon', false)).toBe('push')
  })

  it('goes back to Home when the entry was pushed from Home', () => {
    expect(navAction('dragon', 'home', true)).toBe('back')
  })

  it('replaces when opened straight onto another tab (no Home entry to go back to)', () => {
    expect(navAction('dragon', 'home', false)).toBe('replace')
  })
})

describe('tabTap', () => {
  it('ignores a second Home tap while the first back() is on its way', () => {
    const first = tabTap(false, 'dragon', 'home', true)
    expect(first).toEqual({ action: 'back', goingBack: true })
    // route is still 'dragon' until popstate arrives
    expect(tabTap(first.goingBack, 'dragon', 'home', true)).toEqual({ action: 'none', goingBack: true })
    expect(tabTap(first.goingBack, 'dragon', 'dragon', true).action).toBe('none')
  })

  it('works normally once popstate has cleared the flag', () => {
    expect(tabTap(false, 'home', 'dragon', false)).toEqual({ action: 'push', goingBack: false })
    expect(tabTap(false, 'dragon', 'home', false)).toEqual({ action: 'replace', goingBack: false })
  })
})
