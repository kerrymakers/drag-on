import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Regenerate with `npm run icons`. Output PNGs are committed to public/.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { background: '#fff6ec' },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { background: '#fff6ec' },
    },
  },
  images: ['public/favicon.svg'],
})
