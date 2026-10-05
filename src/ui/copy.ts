// Words the app says. Warm, never guilt-tripping. Not game logic, not balancing.

import { daysBetween } from '../game/day'
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

/** Words on the Dragon screen, in the dragon's voice. */
export const DRAGON_SCREEN = {
  statsTitle: "What I'm good at",
  /** Before any log has gone towards a stat. */
  statsEmpty: "Log something and I'll start getting stronger!",
  historyTitle: "How I've grown",
  /** The first stage, before the first log. */
  firstStageWaiting: 'Waiting for you',
  /** An upcoming stage: never its name. */
  locked: '???',
  lockedLabel: 'A surprise for later',
} as const

/** A short, cheerful line under the name, by how many stages have been reached. */
export function dragonScreenLine(stagesReached: number): string {
  if (stagesReached <= 1) return "I can't wait to see who I'll become."
  return "Look how far we've come together!"
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * A game day ("YYYY-MM-DD") as a friendly date: "Today", "Yesterday", "5 Oct",
 * or "5 Oct 2025" when it's from another year than `todayKey`.
 */
export function friendlyDay(dayKey: string, todayKey: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayKey)
  if (!m) return dayKey
  const ago = daysBetween(dayKey, todayKey)
  if (ago === 0) return 'Today'
  if (ago === 1) return 'Yesterday'
  const label = `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? ''}`.trim()
  return m[1] === todayKey.slice(0, 4) ? label : `${label} ${m[1]}`
}
