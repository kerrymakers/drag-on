/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// The site is served from https://kerrymakers.github.io/drag-on/
const base = '/drag-on/'

export default defineConfig({
  base,
  plugins: [
    VitePWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      injectRegister: false, // registered from src/main.ts via virtual:pwa-register
      // workbox.globPatterns already precaches every icon in public/, so don't add them twice.
      includeManifestIcons: false,
      manifest: {
        name: 'Drag-on',
        short_name: 'Drag-on',
        description: 'Raise a little dragon by doing the hard things.',
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#fff6ec',
        background_color: '#fff6ec',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The plugin adds manifest.webmanifest to the precache itself.
        globPatterns: ['**/*.{html,js,css,svg,png,ico}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Activate a new deploy straight away instead of waiting for every window to close.
        skipWaiting: true,
        clientsClaim: true,
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
