import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GOING_BACK_TIMEOUT_MS, TABS, goingBackGuard, navAction, routeFromHash, tabTap, type GuardHost } from './nav'

describe('routeFromHash', () => {
  it('maps the tab hashes to their routes', () => {
    expect(routeFromHash('#/')).toBe('home')
    expect(routeFromHash('#/dragon')).toBe('dragon')
    expect(routeFromHash('#/collection')).toBe('collection')
    expect(routeFromHash('#/history')).toBe('history')
  })

  it('treats empty, unknown and sloppy hashes kindly', () => {
    expect(routeFromHash('')).toBe('home')
    expect(routeFromHash('#')).toBe('home')
    expect(routeFromHash('#/nowhere')).toBe('home')
    expect(routeFromHash('#dragon')).toBe('dragon')
    expect(routeFromHash('#/dragon/')).toBe('dragon')
    expect(routeFromHash('#/Dragon')).toBe('dragon')
    expect(routeFromHash('#collection/')).toBe('collection')
    expect(routeFromHash('#/History/')).toBe('history')
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

  it('replaces between two non-Home tabs, so back still reaches Home', () => {
    expect(navAction('home', 'collection', false)).toBe('push')
    expect(navAction('dragon', 'collection', true)).toBe('replace')
    expect(navAction('collection', 'dragon', true)).toBe('replace')
    expect(navAction('collection', 'home', true)).toBe('back')
  })

  it('treats History like the other tabs', () => {
    expect(navAction('home', 'history', false)).toBe('push')
    expect(navAction('history', 'dragon', true)).toBe('replace')
    expect(navAction('collection', 'history', true)).toBe('replace')
    expect(navAction('history', 'home', true)).toBe('back')
    expect(navAction('history', 'home', false)).toBe('replace')
  })
})

describe('TABS', () => {
  it('has Home, Dragon, Collection and History, in that order', () => {
    expect(TABS.map((t) => [t.route, t.hash, t.label])).toEqual([
      ['home', '#/', 'Home'],
      ['dragon', '#/dragon', 'Dragon'],
      ['collection', '#/collection', 'Collection'],
      ['history', '#/history', 'History'],
    ])
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

describe('goingBackGuard', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  /** A stand-in window: real (faked) timers and a plain event target. */
  function fakeWindow() {
    const events = new EventTarget()
    const host: GuardHost = {
      setTimeout: (fn, ms) => setTimeout(fn, ms) as unknown as number,
      clearTimeout: (id) => clearTimeout(id),
      addEventListener: (type, fn) => events.addEventListener(type, fn),
    }
    return { host, fire: (type: 'popstate' | 'pageshow') => events.dispatchEvent(new Event(type)) }
  }

  it('starts clear', () => {
    expect(goingBackGuard(fakeWindow().host).active).toBe(false)
  })

  it('clears itself after GOING_BACK_TIMEOUT_MS if no popstate arrives', () => {
    const guard = goingBackGuard(fakeWindow().host)
    guard.set(true)
    vi.advanceTimersByTime(GOING_BACK_TIMEOUT_MS - 1)
    expect(guard.active).toBe(true)
    vi.advanceTimersByTime(1)
    expect(guard.active).toBe(false)
  })

  it('clears on popstate', () => {
    const { host, fire } = fakeWindow()
    const guard = goingBackGuard(host)
    guard.set(true)
    fire('popstate')
    expect(guard.active).toBe(false)
  })

  it('clears on pageshow (a page restored from the back/forward cache)', () => {
    const { host, fire } = fakeWindow()
    const guard = goingBackGuard(host)
    guard.set(true)
    fire('pageshow')
    expect(guard.active).toBe(false)
    expect(vi.getTimerCount()).toBe(0) // the timeout was cancelled too
  })

  it('restarts the timeout when set again, and an old timer never clears a newer back()', () => {
    const { host, fire } = fakeWindow()
    const guard = goingBackGuard(host)
    guard.set(true)
    vi.advanceTimersByTime(GOING_BACK_TIMEOUT_MS - 100)
    fire('popstate')
    guard.set(true) // a second back() soon after
    vi.advanceTimersByTime(100) // when the first timer would have fired
    expect(guard.active).toBe(true)
    vi.advanceTimersByTime(GOING_BACK_TIMEOUT_MS - 100)
    expect(guard.active).toBe(false)
  })
})
