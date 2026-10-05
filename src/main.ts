import { registerSW } from 'virtual:pwa-register'
import './ui/styles.css'

// Precaches the app shell so it opens offline. A new deploy's service worker
// activates immediately (skipWaiting + clientsClaim) and the plugin reloads the page.
registerSW({ immediate: true })
