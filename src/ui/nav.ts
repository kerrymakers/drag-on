// The bottom tab bar and hash routing (#/ and #/dragon, GitHub Pages friendly).
//
// History works like a phone app's tabs: going from Home to another tab pushes one
// history entry, and moving between other tabs replaces it. So Android's back button
// always returns to Home, and back from Home leaves the app.

import { ICONS, type IconName } from './icons'

export type Route = 'home' | 'dragon'

interface Tab {
  route: Route
  hash: string
  label: string
  icon: IconName
}

/** In display order. The bar lays out any number of tabs evenly (it's sized for five). */
export const TABS: readonly Tab[] = [
  { route: 'home', hash: '#/', label: 'Home', icon: 'home' },
  { route: 'dragon', hash: '#/dragon', label: 'Dragon', icon: 'dragon' },
]

/** The route for a location hash. Anything unknown (or empty) is Home. */
export function routeFromHash(hash: string): Route {
  const path = hash.replace(/^#\/?/, '').replace(/\/+$/, '').toLowerCase()
  return TABS.find((t) => t.hash.slice(2) === path)?.route ?? 'home'
}

export type NavAction = 'none' | 'back' | 'push' | 'replace'

/**
 * How to move between tabs. `pushedFromHome` is true when the current history entry
 * was pushed by leaving Home, so going back reaches Home again.
 */
export function navAction(from: Route, to: Route, pushedFromHome: boolean): NavAction {
  if (from === to) return 'none'
  if (to === 'home') return pushedFromHome ? 'back' : 'replace'
  return from === 'home' ? 'push' : 'replace'
}

export interface TabTap {
  action: NavAction
  /** True from a 'back' until the popstate that follows it. */
  goingBack: boolean
}

/**
 * A tab tap, given whether a history.back() is still on its way. While it is, taps
 * are ignored: a quick double tap on Home must not go back twice and leave the app.
 */
export function tabTap(goingBack: boolean, from: Route, to: Route, pushedFromHome: boolean): TabTap {
  if (goingBack) return { action: 'none', goingBack: true }
  const action = navAction(from, to, pushedFromHome)
  return { action, goingBack: action === 'back' }
}

const STATE_KEY = 'dragOnTab'

/**
 * How long a history.back() may take before the double-tap guard gives up. Normally
 * the popstate clears it within a frame or two; this only stops a lost popstate (or a
 * page restored from the back/forward cache) leaving the tabs ignoring every tap.
 */
export const GOING_BACK_TIMEOUT_MS = 500

/** The bits of a window the going-back guard needs (a real window, or a fake in tests). */
export interface GuardHost {
  setTimeout(fn: () => void, ms: number): number
  clearTimeout(id: number | undefined): void
  addEventListener(type: 'popstate' | 'pageshow', fn: () => void): void
}

export interface GoingBackGuard {
  /** True from a history.back() until its popstate, a pageshow or the timeout. */
  readonly active: boolean
  set(value: boolean): void
}

/**
 * Remembers that a history.back() is on its way, so a second tap can't go back again.
 * Cleared by the popstate that follows, by a pageshow (a page restored from the
 * back/forward cache) or after GOING_BACK_TIMEOUT_MS, so a lost popstate can't leave
 * the tabs ignoring every tap.
 */
export function goingBackGuard(host: GuardHost): GoingBackGuard {
  let active = false
  let timer: number | undefined
  function set(value: boolean) {
    active = value
    host.clearTimeout(timer)
    timer = value ? host.setTimeout(() => (active = false), GOING_BACK_TIMEOUT_MS) : undefined
  }
  host.addEventListener('popstate', () => set(false))
  host.addEventListener('pageshow', () => set(false))
  return {
    get active() {
      return active
    },
    set,
  }
}

export interface Nav {
  readonly route: Route
}

/**
 * Builds the tab bar into `bar` and calls `onRoute` with the starting route and every
 * change after it (from taps, the back button or an edited hash).
 */
export function createNav(doc: Document, bar: HTMLElement, onRoute: (route: Route, from: Route | null) => void): Nav {
  const win = doc.defaultView ?? window
  const links = TABS.map((tab) => {
    const a = doc.createElement('a')
    a.className = 'tab'
    a.href = tab.hash
    a.dataset.route = tab.route
    a.innerHTML = `<span class="tab-icon">${ICONS[tab.icon]}</span><span class="tab-label">${tab.label}</span>`
    bar.append(a)
    return a
  })

  let route: Route | null = null
  function apply(next: Route) {
    if (next === route) return
    const from = route
    route = next
    for (const a of links) {
      const active = a.dataset.route === next
      a.classList.toggle('is-active', active)
      if (active) a.setAttribute('aria-current', 'page')
      else a.removeAttribute('aria-current')
    }
    onRoute(next, from)
  }

  // Must be created before the popstate/pageshow listeners below, so the guard clears first.
  const goingBack = goingBackGuard(win)

  const pushedFromHome = () =>
    typeof win.history.state === 'object' && win.history.state !== null && STATE_KEY in win.history.state

  bar.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a.tab')
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    const to = (a.dataset.route as Route | undefined) ?? 'home'
    const tab = TABS.find((t) => t.route === to)
    const from = route ?? 'home'
    if (!tab) return
    const tap = tabTap(goingBack.active, from, to, pushedFromHome())
    if (tap.goingBack !== goingBack.active) goingBack.set(tap.goingBack)
    switch (tap.action) {
      case 'none':
        return
      case 'back':
        win.history.back() // popstate applies it
        return
      case 'push':
        win.history.pushState({ [STATE_KEY]: true }, '', tab.hash)
        break
      case 'replace':
        win.history.replaceState(to === 'home' ? null : win.history.state, '', tab.hash)
        break
    }
    apply(to)
  })

  const fromLocation = () => apply(routeFromHash(win.location.hash))
  // The guard clears itself on popstate and pageshow (any back() in flight is long gone).
  win.addEventListener('popstate', fromLocation)
  win.addEventListener('pageshow', (e) => {
    if (e.persisted) fromLocation()
  })
  win.addEventListener('hashchange', fromLocation)
  fromLocation()

  return {
    get route() {
      return route ?? 'home'
    },
  }
}
