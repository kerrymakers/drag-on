import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'
import viteConfig from '../vite.config'

describe('scaffold', () => {
  it('serves the app from /drag-on/ for GitHub Pages', () => {
    expect(viteConfig.base).toBe('/drag-on/')
  })

  it('ships the placeholder home screen', () => {
    expect(html).toContain('An egg is waiting…')
    expect(html).toContain('viewport-fit=cover')
  })
})
