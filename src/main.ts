import { registerSW } from 'virtual:pwa-register'
import { startApp } from './ui/app'
import './ui/styles.css'

startApp(document)

// Precaches the app shell so it opens offline. A new deploy's service worker
// activates immediately (skipWaiting + clientsClaim) and the plugin reloads the page.
registerSW({ immediate: true })
