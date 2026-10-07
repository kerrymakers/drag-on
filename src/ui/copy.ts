// Words the app says. Warm, never guilt-tripping. Not game logic, not balancing.

import { daysBetween } from '../game/day'
import type { DayStatus } from '../game/streaks'
import type { MoodId, StatId } from '../game/types'
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

/** A friendly name for each evolution look, shown on the Dragon screen from Juvenile on. */
export const LOOK_NAMES: Record<StatId, string> = {
  strength: 'Sturdy',
  discipline: 'Steadfast',
  wisdom: 'Scholarly',
  heart: 'Warm-hearted',
}

/** The look chip on the Dragon screen, e.g. "Sturdy dragon". */
export const lookLabel = (look: StatId): string => `${LOOK_NAMES[look]} dragon`

/** Under the stage-up message, the first time the dragon takes on a look (usually at Juvenile). */
export const LOOK_REVEAL: Record<StatId, string> = {
  strength: "I'm growing up Sturdy, all strong and solid, like you!",
  discipline: "I'm growing up Steadfast. We keep showing up, you and me!",
  wisdom: "I'm growing up Scholarly. All that reading rubbed off on me!",
  heart: "I'm growing up Warm-hearted, because you look after us both.",
}

/** A later look the dragon has never had before: a gentle, happy moment. */
export const LOOK_CHANGE: Record<StatId, StageUpCopy> = {
  strength: { message: "Ooh, I'm turning Sturdy! Feel how strong we're getting.", button: 'So strong!' },
  discipline: { message: "Ooh, I'm turning Steadfast! You've been so steady lately.", button: 'Looking sharp!' },
  wisdom: { message: "Ooh, I'm turning Scholarly! I even got reading glasses.", button: 'Very wise!' },
  heart: { message: "Ooh, I'm turning Warm-hearted! Thank you for being kind to us.", button: 'Aww, lovely' },
}

export interface CelebrationCopy {
  message: string
  /** A second, smaller line naming a new look, if there is one. */
  sub: string | null
  button: string
}

/**
 * What the celebration overlay says. A stage-up uses the stage's words, plus a line
 * naming the look if this log also brought a look the dragon has never had. A look
 * change on its own uses the look's words. `newLook` is null for no first-time look.
 */
export function celebrationCopy(stageUpTo: string | null, newLook: StatId | null): CelebrationCopy {
  if (stageUpTo !== null) {
    const stage = STAGE_UP[stageUpTo] ?? STAGE_UP_FALLBACK
    return { message: stage.message, sub: newLook ? LOOK_REVEAL[newLook] : null, button: stage.button }
  }
  const look = newLook ? LOOK_CHANGE[newLook] : STAGE_UP_FALLBACK
  return { message: look.message, sub: null, button: look.button }
}

/** The label above the XP bar. */
export function progressLabel(stageId: string, xpToNext: number, nextName: string | null): string {
  if (nextName == null) return 'Fully grown'
  if (stageId === 'egg') return `${xpToNext} XP to hatch`
  return `${xpToNext} XP to ${nextName}`
}

/**
 * The toast after a log, in two parts so only the task name ever shortens to "…".
 * A treat shows the total ("Treat! +38 XP · Read"); the floats carry the breakdown.
 * A find says so ("Found something! +25 XP · Read"); items are worth no XP.
 */
export interface LoggedToast {
  lead: string
  name: string
}
export const loggedToast = (xp: number, taskName: string, treatBonus = 0, foundItem = false): LoggedToast => ({
  lead: foundItem
    ? `Found something! +${xp} XP · `
    : treatBonus > 0
      ? `Treat! +${xp + treatBonus} XP · `
      : `+${xp} XP · `,
  name: taskName,
})
/** The whole toast as one string. */
export const LOGGED = (xp: number, taskName: string, treatBonus = 0, foundItem = false): string => {
  const { lead, name } = loggedToast(xp, taskName, treatBonus, foundItem)
  return lead + name
}
/** The second float on a treat, e.g. "+13 treat". */
export const TREAT_FLOAT = (bonus: number) => `+${bonus} treat`
export const UNDONE = 'Undone'
/** Undoing a log that found something: the find goes back, gently. */
export const UNDONE_ITEM = 'Undone. That find is hiding again for now.'
export const undoneToast = (hadItem: boolean): string => (hadItem ? UNDONE_ITEM : UNDONE)

/** The "found something" card: a little heading, the item's name, and a line from the dragon. */
export const ITEM_FOUND = {
  heading: 'Found something!',
  lines: [
    'Ooh, look what I found! Can we keep it?',
    'Look what turned up! I love it.',
    "I found this just for us. Isn't it lovely?",
    'Ooh, treasure! This is going in my collection.',
  ],
  button: 'Lovely!',
  /** Under the line: where it went. */
  saved: 'Added to your collection',
  /** …and it went straight on, because its spot was free. */
  savedWearing: 'Added to your collection, and wearing it now',
  /** …the same, before hatching: the egg wears nothing yet. */
  savedWearingEgg: 'Added to your collection, ready to wear after hatching',
} as const

/** Where a find went: the collection, and whether it went straight on. */
export function itemFoundSaved(wearing: boolean, egg: boolean): string {
  if (!wearing) return ITEM_FOUND.saved
  return egg ? ITEM_FOUND.savedWearingEgg : ITEM_FOUND.savedWearing
}

/** The dragon's line for a find. Fixed per item, so the same find always reads the same. */
export function itemFoundLine(itemId: string): string {
  const lines = ITEM_FOUND.lines
  let hash = 0
  for (const ch of itemId) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return lines[hash % lines.length] ?? lines[0]
}

/** Words on the Collection screen. Unfound items are a plain "?", never named. */
export const COLLECTION = {
  title: 'Collection',
  /** Before anything has been found. Warm, never a nudge. */
  empty: 'Nothing yet, your dragon is keeping an eye out.',
  /** Some found, more to come. */
  some: 'Every find is a little surprise.',
  /** Everything found. */
  all: 'Every one found! Your dragon is delighted.',
  unknown: '?',
  unknownLabel: 'Not found yet',
  /** The little badge on a tile that's being worn. */
  wearing: 'Wearing',
  /** Once something's found: how to wear it. */
  wearHint: 'Tap a find to try it on.',
  /** Before hatching: the egg wears nothing, but choices are kept. */
  eggLine: 'Your dragon will wear these once it hatches.',
  /** After taking something off. */
  takenOff: 'Taken off',
} as const

/** "ribbon bow" from "Ribbon bow", to sit mid-sentence. */
const midSentence = (name: string) => name.charAt(0).toLowerCase() + name.slice(1)

/** The toast after tapping a found tile. */
export function wearToast(name: string, on: boolean, egg: boolean): string {
  if (!on) return COLLECTION.takenOff
  return egg ? `Saving the ${midSentence(name)} for hatching day` : `Wearing the ${midSentence(name)}`
}

/** "3 of 18 found". */
export const collectionCount = (found: number, total: number): string => `${found} of ${total} found`

/** The line under the count. */
export function collectionLine(found: number, total: number): string {
  if (found <= 0) return COLLECTION.empty
  return found >= total ? COLLECTION.all : COLLECTION.some
}

/** A found tile's accessible name, e.g. "Tiny book, found 5 Oct" or "Tiny book, found today". */
export function foundTileLabel(name: string, friendly: string): string {
  const when = friendly === 'Today' || friendly === 'Yesterday' ? friendly.toLowerCase() : friendly
  return `${name}, found ${when}`
}

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
  wearingTitle: "What I'm wearing",
  /** Nothing worn. Never a nudge. */
  wearingEmpty: 'Nothing yet',
  /** Before hatching, with something chosen. */
  wearingEgg: "I'll put these on once I hatch!",
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

/** "1 day", "12 days". */
export const dayCount = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`

/** Words on the History screen. A streak that's ended is a fresh start, never a loss. */
export const HISTORY = {
  title: 'History',
  /** Under the big streak number. */
  streakLabel: 'in a row',
  /** The streak is 0 but there have been logs before. */
  freshStart: 'A fresh start today',
  /** Nothing logged ever. */
  noLogs: 'Your first log starts a streak',
  /** A screen reader's version of the snowflakes. */
  freezesNone: 'No streak freezes yet',
  wakeTitle: 'Up on time',
  /** Under the wake-up streak: weekends (or any day with no target) never count against it. */
  wakeNote: "Days with no wake-up time don't count",
  weekTitle: 'This week',
  /** A task not logged this week yet. */
  weekNone: 'Not yet',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  /** Day detail, nothing logged. */
  quietDay: 'A quiet day.',
  /** Day detail, today with nothing logged yet. */
  todayEmpty: 'Nothing logged yet today.',
  /** Day detail, a day a freeze covered. */
  frozenDay: 'A quiet day. A streak freeze kept things cosy.',
  /** A task id that's no longer in config. */
  unknownTask: 'A task',
} as const

/** "Best: 15 days". */
export const bestStreak = (n: number): string => `Best: ${dayCount(n)}`

/** "2 streak freezes ready" (or how one is earned, before any). */
export function freezesLine(held: number, everyDays: number): string {
  if (held <= 0) return `A streak freeze arrives every ${dayCount(everyDays)} in a row`
  return held === 1 ? '1 streak freeze ready' : `${held} streak freezes ready`
}

/** A task's line in "This week": "3 days · best 5". */
export function weekLine(thisWeek: number, bestWeek: number): string {
  const now = thisWeek > 0 ? dayCount(thisWeek) : HISTORY.weekNone
  return bestWeek > thisWeek ? `${now} · best ${bestWeek}` : now
}

/** The streak chip on Home, e.g. "12 days". */
export const streakChip = (n: number): string => dayCount(n)
/** Its accessible name. */
export const streakChipLabel = (n: number): string => `${dayCount(n)} in a row. Open History`

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "October 2026" from "2026-10". */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${MONTH_NAMES[(m ?? 1) - 1] ?? ''} ${y ?? ''}`.trim()
}

/** A calendar day's accessible name, e.g. "5 October, logged". Quiet days just say the date. */
export function calendarDayLabel(key: string, status: DayStatus | null, today: boolean): string {
  const [, m, d] = key.split('-').map(Number)
  const parts = [`${d ?? ''} ${MONTH_NAMES[(m ?? 1) - 1] ?? ''}`]
  if (today) parts.push('today')
  if (status === 'logged') parts.push('logged')
  if (status === 'frozen') parts.push('kept cosy by a streak freeze')
  return parts.join(', ')
}

/** A log in the day detail: "+38 XP", with any treat called out. */
export function historyLogXp(xp: number, treat: number): string {
  return treat > 0 ? `+${xp} XP (with a +${treat} treat)` : `+${xp} XP`
}

/** "Found the tiny book". */
export const historyFound = (name: string): string => `Found the ${midSentence(name)}`
