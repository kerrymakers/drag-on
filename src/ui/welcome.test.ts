import { describe, expect, it } from 'vitest'
import type { KeyValueStore } from '../storage'
import { MOOD_LABELS, WELCOME_BACK, welcomeLine } from './copy'
import { UI_KEY, createWelcome } from './welcome'

class FakeStore implements KeyValueStore {
  map = new Map<string, string>()
  fail = false
  getItem(k: string) {
    if (this.fail) throw new Error('SecurityError')
    return this.map.get(k) ?? null
  }
  setItem(k: string, v: string) {
    if (this.fail) throw new Error('QuotaExceededError')
    this.map.set(k, v)
  }
}

describe('welcome back', () => {
  const GAP = '2026-10-05'

  it('welcomes a sleepy or curled-up dragon, but not a happy or content one', () => {
    const w = createWelcome(() => new FakeStore())
    expect(w.shouldWelcome('sleepy', GAP)).toBe(true)
    expect(w.shouldWelcome('grumpy', GAP)).toBe(true)
    expect(w.shouldWelcome('happy', GAP)).toBe(false)
    expect(w.shouldWelcome('content', GAP)).toBe(false)
  })

  it('never welcomes when there are no logs (no gap)', () => {
    expect(createWelcome(() => undefined).shouldWelcome('sleepy', null)).toBe(false)
  })

  it('plays once at sleepy and once more at curled up in the same gap, then stops', () => {
    const store = new FakeStore()
    const w = createWelcome(() => store)
    expect(w.shouldWelcome('sleepy', GAP)).toBe(true)
    w.markWelcomed('sleepy', GAP)
    expect(w.shouldWelcome('sleepy', GAP)).toBe(false) // later days, still sleepy
    expect(w.shouldWelcome('grumpy', GAP)).toBe(true) // the same gap reaches curled up
    w.markWelcomed('grumpy', GAP)
    expect(w.shouldWelcome('grumpy', GAP)).toBe(false)
    expect(JSON.parse(store.map.get(UI_KEY) as string)).toEqual({ gapFrom: GAP, shown: ['sleepy', 'grumpy'] })
  })

  it('first finding the dragon curled up plays once, with no sleepy welcome after', () => {
    const w = createWelcome(() => new FakeStore())
    w.markWelcomed('grumpy', GAP)
    expect(w.shouldWelcome('grumpy', GAP)).toBe(false)
  })

  it('starts afresh after a new log (a new gap)', () => {
    const w = createWelcome(() => new FakeStore())
    w.markWelcomed('sleepy', GAP)
    w.markWelcomed('grumpy', GAP)
    expect(w.shouldWelcome('sleepy', '2026-10-20')).toBe(true)
    w.markWelcomed('sleepy', '2026-10-20')
    expect(w.shouldWelcome('sleepy', '2026-10-20')).toBe(false)
    expect(w.shouldWelcome('grumpy', '2026-10-20')).toBe(true)
  })

  it('is remembered across reloads', () => {
    const store = new FakeStore()
    createWelcome(() => store).markWelcomed('sleepy', GAP)
    const later = createWelcome(() => store)
    expect(later.shouldWelcome('sleepy', GAP)).toBe(false)
    expect(later.shouldWelcome('grumpy', GAP)).toBe(true)
  })

  it('keeps other UI fields, drops the old once-a-day field, and never touches game data', () => {
    const store = new FakeStore()
    store.map.set(UI_KEY, JSON.stringify({ somethingElse: 1, lastWelcomedDay: '2026-10-01' }))
    createWelcome(() => store).markWelcomed('sleepy', GAP)
    expect(JSON.parse(store.map.get(UI_KEY) as string)).toEqual({ somethingElse: 1, gapFrom: GAP, shown: ['sleepy'] })
    expect(store.map.has('drag-on:v1')).toBe(false)
  })

  it('falls back to memory when storage fails', () => {
    const store = new FakeStore()
    store.fail = true
    const w = createWelcome(() => store)
    expect(w.shouldWelcome('sleepy', GAP)).toBe(true)
    w.markWelcomed('sleepy', GAP)
    expect(w.shouldWelcome('sleepy', GAP)).toBe(false)
  })

  it('asks for the store at write time, so turning read-only later writes nothing', () => {
    const store = new FakeStore()
    let readOnly = false
    const w = createWelcome(() => (readOnly ? undefined : store))
    readOnly = true
    w.markWelcomed('sleepy', GAP)
    expect(store.map.has(UI_KEY)).toBe(false)
    expect(w.shouldWelcome('sleepy', GAP)).toBe(false) // still remembered in memory
  })

  it('copes with unreadable saved UI state', () => {
    const store = new FakeStore()
    store.map.set(UI_KEY, '{nope')
    const w = createWelcome(() => store)
    expect(w.shouldWelcome('sleepy', GAP)).toBe(true)
    w.markWelcomed('sleepy', GAP)
    expect(JSON.parse(store.map.get(UI_KEY) as string)).toEqual({ gapFrom: GAP, shown: ['sleepy'] })
  })
})

describe('welcome copy', () => {
  it('picks the same line all day, from the mood’s variants', () => {
    const a = welcomeLine('grumpy', '2026-10-10')
    expect(a).toBe(welcomeLine('grumpy', '2026-10-10'))
    expect(WELCOME_BACK.grumpy).toContain(a)
    const days = Array.from({ length: 20 }, (_, i) => welcomeLine('sleepy', `2026-10-${String(i + 1).padStart(2, '0')}`))
    expect(new Set(days).size).toBeGreaterThan(1)
  })

  it('has nothing to say for happy or content', () => {
    expect(welcomeLine('happy', '2026-10-10')).toBeNull()
    expect(welcomeLine('content', '2026-10-10')).toBeNull()
  })

  it('never shows "grumpy" or guilt-tripping words', () => {
    const all = [...Object.values(MOOD_LABELS), ...(WELCOME_BACK.sleepy ?? []), ...(WELCOME_BACK.grumpy ?? [])]
      .join(' ')
      .toLowerCase()
    for (const word of ['grumpy', 'where were you', 'abandon', 'sad', 'lonely', 'forgot', 'finally', 'days', 'neglect']) {
      expect(all).not.toContain(word)
    }
  })
})
