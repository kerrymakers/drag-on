// "Welcome back": plays at most once per gap per mood level. The first time the app
// finds the dragon sleepy during a gap, and once more if the same gap reaches curled
// up. A new log starts a new gap. Also "kept our streak cosy": said once per day a
// streak freeze covered, and "shall we save a backup?" at most once per game day
// while a backup is due, and "still hoping we make our goal" at most once per game day
// while the dragon is wistful about the weekly goal, and "I've got a secret wish today"
// at most once per game day while the day's wish is open. State lives under its own UI key, never in the game data,
// and falls back to memory if storage isn't available.

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
  /**
   * True if the dragon should say a freeze kept the streak cosy over `frozenDay` (see
   * latestFrozenDay): never for null, and never again for that day or an earlier one.
   */
  shouldSayCosy(frozenDay: string | null): boolean
  /** Remember that the cosy line has been said for `frozenDay`. */
  markCosy(frozenDay: string): void
  /** True if the backup reminder hasn't been said on game day `today` (or a later one). Day keys sort as strings. */
  shouldRemindBackup(today: string): boolean
  /** Remember that the backup reminder has been said on `today`. */
  markBackupReminded(today: string): void
  /** True if the wistful goal line hasn't been said on game day `today` (or a later one). */
  shouldSayWistful(today: string): boolean
  /** Remember that the wistful goal line has been said on `today`. */
  markWistful(today: string): void
  /** True if the secret-wish hint hasn't been said on game day `today` (or a later one). */
  shouldHintWish(today: string): boolean
  /** Remember that the secret-wish hint has been said on `today`. */
  markWishHinted(today: string): void
}

/** The bubbles the dragon can open with, most important first. */
export const OPENING_ORDER = ['cosy', 'welcome', 'wistful', 'wish', 'backup'] as const
export type OpeningLine = (typeof OPENING_ORDER)[number]

/**
 * Which bubble to say on opening, given which ones are due: only one per opening, in
 * OPENING_ORDER (a streak freeze's cosy line, welcome back, the wistful goal line, the
 * secret-wish hint, the backup reminder). Null with none due.
 */
export function openingLine(due: Partial<Record<OpeningLine, boolean>>): OpeningLine | null {
  return OPENING_ORDER.find((line) => due[line] === true) ?? null
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
  /** The latest frozen day the cosy line has been said for. Day keys sort as strings. */
  let cosyDay: string | null = typeof saved.cosyDay === 'string' ? saved.cosyDay : null
  /** The game day the backup reminder was last said. */
  let backupDay: string | null = typeof saved.backupReminderDay === 'string' ? saved.backupReminderDay : null
  /** The game day the wistful goal line was last said. */
  let wistfulDay: string | null = typeof saved.wistfulDay === 'string' ? saved.wistfulDay : null
  /** The game day the secret-wish hint was last said. */
  let wishHintDay: string | null = typeof saved.wishHintDay === 'string' ? saved.wishHintDay : null

  /** Merge `fields` into the UI key, keeping anything else there. */
  function write(fields: Record<string, unknown>) {
    const store = getStore()
    if (!store) return
    try {
      // Drop the old once-a-day field; keep anything else.
      const { lastWelcomedDay: _old, ...rest } = readUi(store)
      void _old
      store.setItem(UI_KEY, JSON.stringify({ ...rest, ...fields }))
    } catch {
      // Memory is enough: worst case, one repeat after a reload.
    }
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
      write({ gapFrom: state.gapFrom, shown: state.shown })
    },
    shouldSayCosy(frozenDay) {
      return frozenDay !== null && (cosyDay === null || frozenDay > cosyDay)
    },
    markCosy(frozenDay) {
      if (cosyDay !== null && frozenDay <= cosyDay) return
      cosyDay = frozenDay
      write({ cosyDay })
    },
    shouldRemindBackup(today) {
      return backupDay === null || today > backupDay
    },
    markBackupReminded(today) {
      backupDay = today
      write({ backupReminderDay: today })
    },
    shouldSayWistful(today) {
      return wistfulDay === null || today > wistfulDay
    },
    markWistful(today) {
      wistfulDay = today
      write({ wistfulDay: today })
    },
    shouldHintWish(today) {
      return wishHintDay === null || today > wishHintDay
    },
    markWishHinted(today) {
      wishHintDay = today
      write({ wishHintDay: today })
    },
  }
}
