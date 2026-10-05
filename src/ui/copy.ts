// Words the app says. Warm, never guilt-tripping. Not game logic, not balancing.

import type { MoodId } from '../game/types'
import type { LoadNotice } from '../storage'

/** The mood chip. "Grumpy" is the internal id only; it's never shown. */
export const MOOD_LABELS: Record<MoodId, string> = {
  happy: 'Happy',
  content: 'Content',
  sleepy: 'Sleepy',
  grumpy: 'Curled up',
}

/** What the dragon says when you come back after a gap. Pleased, never guilty. */
export const WELCOME_BACK: Partial<Record<MoodId, readonly string[]>> = {
  sleepy: [
    "Oh! You're here! *yawn*",
    'Mmm… hello! I was just having a little nap.',
    "*stretch* Oh, hi! I'm so glad you came.",
  ],
  grumpy: [
    "You're back! I missed you.",
    "*peeks out* Oh, it's you! Hello!",
    "There you are! Come and snuggle, I'm so happy to see you.",
  ],
}

/** The same line all day for a given mood, so it never flickers between renders. */
export function welcomeLine(mood: MoodId, dayKey: string): string | null {
  const lines = WELCOME_BACK[mood]
  if (!lines || lines.length === 0) return null
  let hash = 0
  for (const ch of dayKey) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return lines[hash % lines.length] ?? null
}

export interface StageUpCopy {
  message: string
  button: string
}

/** What the dragon says when it reaches each stage. */
export const STAGE_UP: Record<string, StageUpCopy> = {
  hatchling: { message: "Hello! I'm so happy to meet you.", button: 'Hi there!' },
  whelp: { message: "Look how big I'm getting! Thank you for looking after me.", button: 'Look at you!' },
  juvenile: { message: 'My wings feel so strong now. We make a really good team.', button: 'We really do' },
  adult: { message: "Look at us! I grew this strong because you kept showing up.", button: 'So proud of you' },
  elder: { message: "We've come such a long way together. I'm so glad it was with you.", button: 'Me too' },
}

export const STAGE_UP_FALLBACK: StageUpCopy = {
  message: "Look at me! I'm growing, thanks to you.",
  button: 'Yay!',
}

/** The label above the XP bar. */
export function progressLabel(stageId: string, xpToNext: number, nextName: string | null): string {
  if (nextName == null) return 'Fully grown'
  if (stageId === 'egg') return `${xpToNext} XP to hatch`
  return `${xpToNext} XP to ${nextName}`
}

export const LOGGED = (xp: number, taskName: string) => `+${xp} XP · ${taskName}`
export const UNDONE = 'Undone'

type NoticeKind = Extract<LoadNotice, 'backupFailed' | 'newerVersion' | 'unavailable'> | 'saveFailed'

export const NOTICES: Record<NoticeKind, string> = {
  unavailable:
    "Your dragon can't reach this phone's storage right now. Today's logs will stay while the app is open.",
  backupFailed:
    "Your dragon found some saved data it couldn't read, so it's keeping it safe and not saving over it. Today's logs will stay while the app is open.",
  newerVersion:
    "This data was saved by a newer Drag\u2011on, so your dragon won't save over it. Today's logs will stay while the app is open, and the update should arrive soon.",
  saveFailed:
    "Your dragon can't save right now. Today's logs will stay while the app is open.",
}

export function noticeFor(notice: LoadNotice): string | null {
  return notice === 'backupFailed' || notice === 'newerVersion' || notice === 'unavailable'
    ? NOTICES[notice]
    : null
}
