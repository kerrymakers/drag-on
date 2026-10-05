import { registerSW } from 'virtual:pwa-register'
import { startApp } from './ui/app'
import './ui/styles.css'

const app = startApp(document)

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
