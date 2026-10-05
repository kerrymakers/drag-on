import { describe, expect, it } from 'vitest'
import html from '../index.html?raw'
import viteConfig from '../vite.config'

describe('scaffold', () => {
  it('serves the app from /drag-on/ for GitHub Pages', () => {
    expect(viteConfig.base).toBe('/drag-on/')
  })

  it('ships the home screen shell the UI renders into', () => {
    expect(html).toContain('viewport-fit=cover')
    for (const id of ['dragon-name', 'stage-name', 'xp-total', 'xp-gain', 'task-list', 'undo']) {
      expect(html).toContain(`id="${id}"`)
    }
  })
})
