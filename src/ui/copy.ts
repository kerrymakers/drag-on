// Words the app says. Warm, never guilt-tripping. Not game logic, not balancing.

import type { LoadNotice } from '../storage'

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
