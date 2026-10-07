// Domain types shared by game logic, config, storage and UI.

export type StatId = 'strength' | 'discipline' | 'wisdom' | 'heart'

export interface Stat {
  id: StatId
  name: string
}

export type TaskRules =
  | { kind: 'wakeUp' } // only counts before that day's wake target + grace
  | { kind: 'oncePerDay' }
  | { kind: 'maxPerDay'; max: number }

export interface Task {
  id: string
  name: string
  stat: StatId
  xp: number
  rules: TaskRules
  archived: boolean
}

/** A stage id from config, e.g. 'egg' or 'hatchling'. */
export type StageId = string

export interface Stage {
  id: StageId
  name: string
  xpFrom: number
}

export type MoodId = 'happy' | 'content' | 'sleepy' | 'grumpy'

/** A mood that starts once this many whole game days have passed since the last log. */
export interface MoodLevel {
  id: MoodId
  fromDays: number
}

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/** "HH:MM" wall-clock time in Europe/London, or null for no target that day. */
export type WakeSchedule = Record<Weekday, string | null>

export interface Settings {
  wakeSchedule: WakeSchedule
  /** null means the UI says "your dragon". */
  dragonName: string | null
}

/**
 * A variable reward, rolled once at log time and saved on the log.
 * - treat: bonus XP on top of `xpAwarded`, counted toward the task's stat.
 * - item: a rare collectible from config/items.ts, worth no XP.
 */
export type Reward = { kind: 'treat'; bonusXp: number } | { kind: 'item'; itemId: string }

/** Where an item sits on the dragon once equipping arrives (Milestone 4 slice 3). */
export type ItemSlot = 'head' | 'neck' | 'held'

/** A rare collectible. Ids are stable: saved rewards refer to them, so never rename one. */
export interface Item {
  id: string
  name: string
  slot: ItemSlot
}

/**
 * A saved reward this version doesn't recognise (from a later version, or a malformed
 * one). Storage keeps it as-is, so LogEvent.reward is typed to include it: code must
 * check the shape at run time before trusting a field (see treatBonus). Hand-edited
 * data could even hold a non-object; the run-time checks cover that too.
 */
export interface UnrecognisedReward {
  readonly kind?: unknown
}

/** Two independent numbers in [0, 1), drawn by the caller (the UI) for one log. */
export interface RewardRoll {
  /** Decides whether there's a reward, and which kind. */
  chance: number
  /** Picks which item, for a rare roll. */
  pick: number
}

/** A logged task. `xpAwarded` is fixed at log time, so later XP edits don't rewrite history. */
export interface LogEvent {
  id: string
  type: 'log'
  taskId: string
  /** Milliseconds since the Unix epoch. */
  timestamp: number
  xpAwarded: number
  /**
   * The dragon's stage right after this log, recorded when it went higher than any
   * stage recorded before. It holds the stage even if a threshold is raised later.
   * Undoing this log removes the hold. Older logs don't have it.
   */
  stageReached?: StageId
  /**
   * The variable reward rolled at log time, if any. Saved data written by a later
   * version may hold a shape this version doesn't know; game logic ignores it (see logXp).
   */
  reward?: Reward | UnrecognisedReward
  note?: string
}

/** Cancels an earlier LogEvent. The log is append-only, so undo never deletes anything. */
export interface UndoEvent {
  id: string
  type: 'undo'
  targetEventId: string
  timestamp: number
}

export type GameEvent = LogEvent | UndoEvent

/** What the home screen needs to know about one task right now. */
export interface TaskAvailability {
  /** Whether the task appears on the home screen today. */
  visible: boolean
  /** Whether a tap right now would log it. */
  canLog: boolean
  /** Active (not undone) logs of this task today. */
  countToday: number
  /** Most logs allowed per day. */
  limit: number
}
