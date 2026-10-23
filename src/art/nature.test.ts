import { describe, expect, it } from 'vitest'
import { NATURE } from '../config/nature'
import { NATURE_PICTURES, natureSvg } from './nature'

describe('natureSvg', () => {
  it('draws every configured find with a known picture and its own tint', () => {
    for (const f of NATURE) {
      expect(NATURE_PICTURES, f.id).toContain(f.picture)
      const svg = natureSvg(f.id, f.picture)
      expect(svg, f.id).toContain(`data-nature="${f.id}"`)
      expect(svg, f.id).toContain(`data-picture="${f.picture}"`)
      expect(svg, f.id).toMatch(/--nature-tint:#[0-9a-f]{6}/)
    }
  })

  it('draws an unknown picture as a leaf, and keeps odd characters out of the markup', () => {
    const svg = natureSvg('a"b<c', 'from-later')
    expect(svg).toContain('data-picture="leaf"')
    expect(svg).toContain('data-nature="abc"')
  })
})
