import { registerSW } from 'virtual:pwa-register'
import { startApp } from './ui/app'
import './ui/styles/base.css'
import './ui/styles/home.css'
import './ui/styles/celebrate.css'
import './ui/styles/tabs.css'
import './ui/styles/dragon.css'
import './ui/styles/collection.css'
import './ui/styles/history.css'
import './ui/styles/settings.css'

// The e2e fixtures set __dragOnNoWishSeed (as they pin Math.random for reward rolls) so
// no secret wish surprises their exact XP and toasts; a spec that wants one saves a
// seed. A page global is the only way a Playwright init script can reach this call.
const noWishSeed = (window as { __dragOnNoWishSeed?: unknown }).__dragOnNoWishSeed === true
const app = startApp(document, noWishSeed ? { makeSeed: () => null } : {})

// Precaches the app shell so it opens offline. A new deploy's service worker
// activates straight away (skipWaiting + clientsClaim); the page reload that shows
// it waits until it won't interrupt anything (see src/ui/updates.ts).
registerSW({
  immediate: true,
  onNeedReload: () => app.requestReload(),
  onRegisteredSW(_url, registration) {
    // An installed PWA can stay open for days: look for updates whenever it's reopened.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration?.update().catch(() => {})
    })
  },
})
