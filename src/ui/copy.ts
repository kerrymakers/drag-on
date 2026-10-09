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

/** One of `lines`, fixed for a given key, so it never flickers between renders. */
function lineFor(lines: readonly string[], key: string): string | null {
  if (lines.length === 0) return null
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return lines[hash % lines.length] ?? null
}

/** The same line all day for a given mood, so it never flickers between renders. */
export function welcomeLine(mood: MoodId, dayKey: string): string | null {
  return lineFor(WELCOME_BACK[mood] ?? [], dayKey)
}

/**
 * What the dragon says, once, after a streak freeze kept the streak going over a
 * quiet day. Glad, never a telling-off; it doubles as the hello.
 */
export const FREEZE_USED: readonly string[] = [
  'Hello! I kept our streak cosy while you were away.',
  "You're here! I tucked our streak in with a freeze. All snug!",
]

/** The freeze line for the frozen day `dayKey`: the same one every time for that day. */
export const freezeUsedLine = (dayKey: string): string => lineFor(FREEZE_USED, dayKey) ?? FREEZE_USED[0]!

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

/**
 * The label above the XP bar. It never names the next stage: stages stay a surprise
 * until they're reached (decided 2026-10-08), so it says "to grow".
 */
export function progressLabel(stageId: string, xpToNext: number, hasNext: boolean): string {
  if (!hasNext) return 'Fully grown'
  if (stageId === 'egg') return `${xpToNext} XP to hatch`
  return `${xpToNext} XP to grow`
}

/**
 * The toast after a log, in two parts so only the task name ever shortens to "…".
 * A treat shows the total ("Treat! +38 XP · Read"); the floats carry the breakdown.
 * A find says so ("Found something! +25 XP · Read"); items are worth no XP.
 */
export interface LoggedToast {
  lead: string
  name: string
  /** A line of its own under them, e.g. when the log also earned a streak freeze. */
  note?: string
}
/** Under the log toast when the log earned a streak freeze. */
export const FREEZE_EARNED = '…and a streak freeze!'
export const loggedToast = (
  xp: number,
  taskName: string,
  treatBonus = 0,
  foundItem = false,
  earnedFreeze = false,
): LoggedToast => ({
  lead: foundItem
    ? `Found something! +${xp} XP · `
    : treatBonus > 0
      ? `Treat! +${xp + treatBonus} XP · `
      : `+${xp} XP · `,
  name: taskName,
  ...(earnedFreeze ? { note: FREEZE_EARNED } : {}),
})
/** The whole toast as one string. */
export const LOGGED = (xp: number, taskName: string, treatBonus = 0, foundItem = false, earnedFreeze = false): string => {
  const { lead, name, note } = loggedToast(xp, taskName, treatBonus, foundItem, earnedFreeze)
  return note ? `${lead}${name} ${note}` : lead + name
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
  return lineFor(ITEM_FOUND.lines, itemId) ?? ITEM_FOUND.lines[0]
}

/**
 * The find card's heading and line when the find was the guaranteed one for a streak
 * milestone, e.g. "7 days together!". Never hints at what's next.
 */
export function milestoneFound(days: number): { heading: string; line: string } {
  return { heading: `${dayCount(days)} together!`, line: 'I found you something to celebrate.' }
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
  /** The wake-up streak is 0 after an earlier run: never a loss, just the next start. */
  wakeFresh: 'Fresh start',
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

/** Under the streak on History, until the last milestone: "Next surprise at 30 days". */
export const nextSurprise = (days: number): string => `Next surprise at ${dayCount(days)}`

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

/** Words on the Settings screen. Backups are a cosy precaution, never a warning. */
export const SETTINGS = {
  title: 'Settings',
  backupTitle: 'Backup',
  backupIntro: "Keep a copy of your dragon somewhere safe, in case this phone's storage is ever cleared.",
  neverBackedUp: 'No backup yet',
  export: 'Export backup',
  import: 'Import backup',
  /** Under Import while the app can't save on this phone. */
  importPaused: "Importing is paused while your dragon can't save on this phone.",
  /** After an export. */
  exported: 'Backup saved. All snug!',
  /** After an import. */
  imported: 'Backup imported. Hello again!',
  /** The Settings tab's dot, for a screen reader. */
  tabDotLabel: 'time for a backup',
  nameTitle: 'Name',
  /** The name field's label, for a screen reader. */
  nameLabel: "Your dragon's name",
  /** Shown in the empty name field: what the app calls the dragon without a name. */
  namePlaceholder: 'your dragon',
  wakeTitle: 'Wake-up times',
  wakeIntro: 'Changes start from today. Days gone by keep the times they had.',
  /** In place of the time on a day with no wake-up target. */
  wakeOff: 'Lie-in',
  /** Beside a card's title, briefly, after a change is saved. */
  saved: 'Saved',
  /** Under the name, tasks and wake-up cards while the app can't save on this phone. */
  editsPaused: "Changes are paused while your dragon can't save on this phone.",
} as const

/** The Tasks card in Settings and its edit sheet. */
export const TASKS_COPY = {
  title: 'Tasks',
  intro: 'Tap a task to change it.',
  add: 'Add a task',
  /** Under Add (and Unarchive) when the list is full. Takes the cap. */
  full: (max: number) => `${max} tasks is a full list. Archiving one makes room for another.`,
  archivedTitle: (n: number) => `Archived (${n})`,
  unarchive: 'Unarchive',
  /** The edit sheet. */
  editHeading: 'Edit task',
  addHeading: 'New task',
  nameLabel: 'Name',
  namePlaceholder: 'What will you do?',
  xpLabel: 'XP',
  xpLess: 'Less XP',
  xpMore: 'More XP',
  timesLabel: 'Times a day',
  statLabel: 'Stat',
  /** On the add sheet, under the stat choices. */
  statFixed: "A task's stat can't be changed later.",
  /** On the edit sheet: XP and times a day never rewrite past logs. */
  nextLog: 'Changes count from your next log.',
  done: 'Done',
  cancel: 'Cancel',
  archive: 'Archive this task',
  archiveNote: 'Its history is kept, and you can bring it back any time.',
} as const

/** Under the XP stepper at the daily limit: "Up to 15 XP when it's three times a day". */
export const dailyXpHint = (xp: number, times: number): string =>
  `Up to ${xp} XP when it's ${times === 2 ? 'twice' : times === 3 ? 'three times' : `${times} times`} a day`

/** The edit sheet's line naming a task's stat, e.g. "Counts towards Strength". */
export const taskStatLine = (stat: string): string => `Counts towards ${stat}`
/** A task row's label for a screen reader: "Gym / workout, Strength, 40 XP. Edit". */
export const taskRowLabel = (name: string, stat: string, xp: number): string => `${name}, ${stat}, ${xp} XP. Edit`
/** "Unarchive Gym / workout", for a screen reader. */
export const unarchiveLabel = (name: string): string => `Unarchive ${name}`
/** The stepper's value, e.g. "15 XP". */
export const xpValue = (xp: number): string => `${xp} XP`
/** "Once", "Twice", "3 times" a day, for a screen reader on the 1 / 2 / 3 choice. */
export const timesADayLabel = (n: number): string => (n === 1 ? 'Once a day' : n === 2 ? 'Twice a day' : `${n} times a day`)
/** After the sheet's Done or the archive actions. */
export const taskAdded = (name: string): string => `${name} is on Home now. Have fun!`
export const taskArchived = (name: string): string => `${name} is archived. Its history is kept.`
export const taskUnarchived = (name: string): string => `${name} is back on Home.`

/** Settings' day names, Monday first. */
export const WEEKDAY_NAMES = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
} as const

/** "Monday wake-up time": the time field's label, for a screen reader. */
export function wakeTimeLabel(day: string): string {
  return `${day} wake-up time`
}

/** "Monday wake-up": the on/off switch's label, for a screen reader. */
export function wakeSwitchLabel(day: string): string {
  return `${day} wake-up`
}

/** "Last backup: 5 Oct", "Last backup: today". */
export function lastBackupLine(friendly: string | null): string {
  if (friendly === null) return SETTINGS.neverBackedUp
  const when = friendly === 'Today' || friendly === 'Yesterday' ? friendly.toLowerCase() : friendly
  return `Last backup: ${when}`
}

/** Why a file can't be imported. Gentle, and always says nothing here changed. */
export const IMPORT_REFUSED = {
  unreadable: "Your dragon couldn't read that file. Nothing here has changed.",
  notBackup: "That file doesn't look like a Drag‑on backup. Nothing here has changed.",
  newerVersion:
    'That backup is from a newer Drag‑on, so this one can’t open it yet. Nothing here has changed.',
  /** The current data couldn't be copied aside first, so the import stopped. */
  safetyCopy: "Your dragon couldn't keep a safe copy of what's here first, so nothing has changed.",
  /** The copy was kept, but the backup couldn't be saved. */
  save: "Your dragon couldn't save the backup on this phone, so nothing has changed.",
} as const

/** The sheet that asks before an import replaces anything. */
export const IMPORT_CONFIRM = {
  heading: 'Import this backup?',
  logs: 'Logs',
  stage: 'Stage',
  saved: 'Saved',
  /** A backup without an export date. */
  savedUnknown: 'Not recorded',
  replaces: "It replaces everything on this phone. Your dragon keeps a copy of what's here now, just in case.",
  confirm: 'Replace with backup',
  cancel: "Keep what's here",
} as const

/** Under the summary when some entries in the file couldn't be read. */
export const importDropped = (n: number): string =>
  `${n} ${n === 1 ? "entry couldn't" : "entries couldn't"} be read and will be left out.`

/** What the dragon says, at most once a day, when a backup is due. Warm, never a nudge. */
export const BACKUP_REMINDER: readonly string[] = [
  'Shall we save a backup of us?',
  "Shall we tuck a copy of us somewhere safe?",
]

/** The backup line for game day `dayKey`: the same one all day. */
export const backupReminderLine = (dayKey: string): string => lineFor(BACKUP_REMINDER, dayKey) ?? BACKUP_REMINDER[0]!
