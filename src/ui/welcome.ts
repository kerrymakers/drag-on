// "Welcome back": plays at most once per gap per mood level. The first time the app
// finds the dragon sleepy during a gap, and once more if the same gap reaches curled
// up. A new log starts a new gap. State lives under its own UI key, never in the game
// data, and falls back to memory if storage isn't available.

import type { MoodId } from '../game/types'
import type { KeyValueStore } from '../storage'

export const UI_KEY = 'drag-on:ui'

const WELCOMING_MOODS: readonly MoodId[] = ['sleepy', 'grumpy']

interface WelcomeState {
  /** Day key of the newest log when the gap began. */
  gapFrom: string | null
  /** Moods already welcomed during this gap. */
  shown: MoodId[]
}

export interface Welcome {
  /** True if the dragon should welcome you back now, for a gap that began on `gapFrom`. */
  shouldWelcome(mood: MoodId, gapFrom: string | null): boolean
  /** Remember that this mood has been welcomed during this gap. */
  markWelcomed(mood: MoodId, gapFrom: string | null): void
}

const isMood = (v: unknown): v is MoodId =>
  v === 'happy' || v === 'content' || v === 'sleepy' || v === 'grumpy'

function readUi(store: KeyValueStore | undefined): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(store?.getItem(UI_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {} // unreadable or unavailable: start fresh
  }
}

/**
 * `getStore` is asked at every read and write, so the caller can withhold storage
 * (return undefined) at any point, e.g. once the app turns read-only. Everything
 * then stays in memory.
 */
export function createWelcome(getStore: () => KeyValueStore | undefined): Welcome {
  const saved = readUi(getStore())
  let state: WelcomeState = {
    gapFrom: typeof saved.gapFrom === 'string' ? saved.gapFrom : null,
    shown: Array.isArray(saved.shown) ? saved.shown.filter(isMood) : [],
  }

  return {
    shouldWelcome(mood, gapFrom) {
      if (gapFrom === null || !WELCOMING_MOODS.includes(mood)) return false
      return state.gapFrom !== gapFrom || !state.shown.includes(mood)
    },
    markWelcomed(mood, gapFrom) {
      state =
        state.gapFrom === gapFrom
          ? { gapFrom, shown: [...new Set([...state.shown, mood])] }
          : { gapFrom, shown: [mood] }
      const store = getStore()
      if (!store) return
      try {
        // Drop the old once-a-day field; keep anything else.
        const { lastWelcomedDay: _old, ...rest } = readUi(store)
        void _old
        store.setItem(UI_KEY, JSON.stringify({ ...rest, gapFrom: state.gapFrom, shown: state.shown }))
      } catch {
        // Memory is enough: worst case, one repeat after a reload.
      }
    },
  }
}
