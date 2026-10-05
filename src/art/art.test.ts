import { describe, expect, it } from 'vitest'
import { CRACK_BIG_AT, CRACK_SMALL_AT, crackLevel } from './index'

describe('crackLevel', () => {
  it('shows no crack below the small threshold', () => {
    expect(crackLevel(0)).toBe(0)
    expect(crackLevel(CRACK_SMALL_AT - 0.01)).toBe(0)
  })
  it('shows a small crack from the small threshold', () => {
    expect(crackLevel(CRACK_SMALL_AT)).toBe(1)
    expect(crackLevel(CRACK_BIG_AT - 0.01)).toBe(1)
  })
  it('shows a bigger crack from the big threshold', () => {
    expect(crackLevel(CRACK_BIG_AT)).toBe(2)
    expect(crackLevel(1)).toBe(2)
  })
})
