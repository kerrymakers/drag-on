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

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

/** "HH:MM" wall-clock time in Europe/London, or null for no target that day. */
export type WakeSchedule = Record<Weekday, string | null>

export interface Settings {
  wakeSchedule: WakeSchedule
  /** null means the UI says "your dragon". */
  dragonName: string | null
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
  /** The variable-reward roll, saved at log time. Its shape arrives in Milestone 4. */
  reward?: unknown
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
