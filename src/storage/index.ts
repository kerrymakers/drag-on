// Saving and loading the event log and settings in localStorage.
// Everything is kept under one key, so a save is a single atomic write.

import { DEFAULT_SETTINGS } from '../config/settings'
import type { GameEvent, ScheduleEntry, Settings, WakeSchedule, Wearing } from '../game/types'
import { isReadableTask } from '../game/tasks'
import { isClockTime } from '../game/day'
import { WEEKDAYS } from '../game/settings'
import { WEAR_SLOTS } from '../game/wearing'

export const STORAGE_KEY = 'drag-on:v1'
export const CORRUPT_KEY_PREFIX = 'drag-on:corrupt-'
export const SCHEMA_VERSION = 1

export interface SaveData {
  schemaVersion: typeof SCHEMA_VERSION
  events: GameEvent[]
  settings: Settings
}

/** The bit of the Storage API we use, so tests can pass a fake. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStore(): KeyValueStore {
  return globalThis.localStorage
}

export function defaultData(): SaveData {
  return {
    schemaVersion: SCHEMA_VERSION,
    events: [],
    settings: {
      ...DEFAULT_SETTINGS,
      wakeSchedule: { ...DEFAULT_SETTINGS.wakeSchedule },
      wearing: { ...DEFAULT_SETTINGS.wearing },
    },
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/**
 * Whether a stored value is an event we can use. A log's `reward` isn't checked here:
 * a shape this version doesn't know (from a later version) or a malformed treat keeps
 * the event, so its base XP and history survive and the data round-trips untouched.
 * Game logic counts only a well-formed treat's bonus (see logXp), so a bad reward can
 * never add XP.
 */
function isEvent(v: unknown): v is GameEvent {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.timestamp !== 'number') return false
  if (!Number.isFinite(v.timestamp)) return false
  if (v.type === 'log') {
    return (
      typeof v.taskId === 'string' &&
      typeof v.xpAwarded === 'number' &&
      Number.isFinite(v.xpAwarded) &&
      (v.note === undefined || typeof v.note === 'string') &&
      (v.stageReached === undefined || typeof v.stageReached === 'string')
    )
  }
  if (v.type === 'undo') return typeof v.targetEventId === 'string'
  return false
}

/**
 * The outfit, checked for shape: each spot is a non-empty string id or null. Saves
 * from before wearing existed (no `wearing`) and anything malformed load as nothing
 * worn. Whether an id is a real, found item in the right spot is decided later, by
 * game logic (wornItems), so a bad id here can never show anything. Spots a later
 * version adds are kept, so they survive a round trip.
 */
function readWearing(v: unknown, defaults: Wearing): Wearing {
  if (!isObject(v)) return { ...defaults }
  const wearing: Wearing = { ...v, ...defaults }
  for (const slot of WEAR_SLOTS) {
    const id = v[slot]
    wearing[slot] = typeof id === 'string' && id !== '' ? id : null
  }
  return wearing
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/**
 * A stored schedule laid over `base`: each day it names is kept if it's a real "HH:MM"
 * and becomes null (skipped) otherwise, never a guessed time. Days it doesn't name
 * keep `base`'s.
 */
function readSchedule(v: Record<string, unknown>, base: WakeSchedule): WakeSchedule {
  const schedule: WakeSchedule = { ...base }
  for (const day of WEEKDAYS) {
    if (!(day in v)) continue
    const t = v[day]
    schedule[day] = isClockTime(t) ? t : null
  }
  return schedule
}

/** Whether a "YYYY-MM-DD" names a real calendar date. */
function isDayKey(v: unknown): v is string {
  if (typeof v !== 'string' || !DAY_KEY.test(v)) return false
  const [y, m, d] = v.split('-').map(Number)
  const date = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1))
  return date.getUTCFullYear() === y && date.getUTCMonth() + 1 === m && date.getUTCDate() === d
}

/**
 * The dated schedule history, or undefined if there isn't a usable one (older saves
 * have none). An entry without a real day key or a schedule object is dropped; a bad
 * time inside a schedule becomes null, like the current schedule's. A schedule that
 * leaves a day out has no target that day. Sorted oldest first; of two entries on
 * the same day, the later one in the list wins.
 */
function readScheduleHistory(v: unknown): ScheduleEntry[] | undefined {
  if (!Array.isArray(v)) return undefined
  const NONE: WakeSchedule = { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null }
  const byDay = new Map<string, ScheduleEntry>()
  for (const entry of v) {
    if (!isObject(entry) || !isDayKey(entry.from) || !isObject(entry.schedule)) continue
    byDay.set(entry.from, { from: entry.from, schedule: readSchedule(entry.schedule, NONE) })
  }
  if (byDay.size === 0) return undefined
  return [...byDay.values()].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))
}

/**
 * The stored task list, or undefined if there isn't one (older saves, or never edited:
 * then the config's tasks apply). Nothing in it is ever dropped: an entry this version
 * can't read is kept exactly as it is, so the next save doesn't lose it, and game logic
 * leaves it out (see effectiveTasks). The one tidy-up: a task that's readable apart
 * from a missing or odd `archived` reads as not archived.
 */
function readTasks(v: unknown): unknown[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v.map((t) => {
    if (!isObject(t) || t.archived === true || t.archived === false) return t
    const tidied = { ...t, archived: false }
    return isReadableTask(tidied) ? tidied : t
  })
}

/**
 * Fills in anything missing from the defaults. Fields we don't recognise are kept,
 * so data written by a later version survives a round trip. A wake time that isn't
 * a real "HH:MM" becomes null (skipped), never a guessed time. `lastBackupAt` is kept
 * only if it's a finite number. The wake schedule history is checked entry by entry
 * (see readScheduleHistory), and the task list task by task (see readTasks).
 */
function readSettings(v: unknown): Settings {
  const defaults = defaultData().settings
  if (!isObject(v)) return defaults
  const schedule = isObject(v.wakeSchedule) ? readSchedule(v.wakeSchedule, defaults.wakeSchedule) : defaults.wakeSchedule
  const history = readScheduleHistory(v.wakeScheduleHistory)
  const tasks = readTasks(v.tasks)
  const { lastBackupAt, wakeScheduleHistory: _history, tasks: _tasks, ...rest } = v
  return {
    ...rest,
    wakeSchedule: schedule,
    // Older saves have none: then the current schedule applies to every day.
    ...(history ? { wakeScheduleHistory: history } : {}),
    dragonName: typeof v.dragonName === 'string' ? v.dragonName : defaults.dragonName,
    wearing: readWearing(v.wearing, defaults.wearing),
    // Older saves have none (never backed up). Anything that isn't a real time is dropped.
    ...(typeof lastBackupAt === 'number' && Number.isFinite(lastBackupAt) ? { lastBackupAt } : {}),
    // Older saves have none: then the config's tasks apply (see effectiveTasks).
    ...(tasks ? { tasks } : {}),
  }
}

export type LoadNotice =
  /** Nothing saved yet: a fresh start. */
  | 'new'
  /** Saved data read cleanly. */
  | 'ok'
  /** Some or all of the saved data was unreadable. The original is backed up; we kept what we could. */
  | 'repaired'
  /** Saved by a newer version of the app. Loaded what we could, but it must not be overwritten. */
  | 'newerVersion'
  /** Unreadable data that couldn't be backed up, so it must not be overwritten. */
  | 'backupFailed'
  /** Storage couldn't be read at all. */
  | 'unavailable'

export interface LoadResult {
  data: SaveData
  /** When true, never save: doing so could overwrite data we couldn't read or back up. */
  readOnly: boolean
  notice: LoadNotice
}

/**
 * What a saved string holds, checked the same way for loading and for importing a
 * backup file:
 * - unreadable: not JSON at all.
 * - notSave: JSON, but not Drag-on save data (no schema version or no events list).
 * - newerVersion: written by a newer app. `data` is what this version understands of it.
 * - ok: this version's data. `dropped` counts events that couldn't be read and were left out.
 * `json` is the parsed value, for fields outside the save data (a backup's exportedAt).
 */
export type ParsedSave =
  | { kind: 'unreadable' }
  | { kind: 'notSave'; json: unknown }
  | { kind: 'newerVersion'; data: SaveData; json: Record<string, unknown> }
  | { kind: 'ok'; data: SaveData; dropped: number; json: Record<string, unknown> }

export function parseSave(raw: string): ParsedSave {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return { kind: 'unreadable' }
  }
  if (!isObject(json)) return { kind: 'notSave', json }
  const version = json.schemaVersion
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    const events = Array.isArray(json.events) ? json.events.filter(isEvent) : []
    return {
      kind: 'newerVersion',
      data: { schemaVersion: SCHEMA_VERSION, events, settings: readSettings(json.settings) },
      json,
    }
  }
  if (version === SCHEMA_VERSION && Array.isArray(json.events)) {
    const events = json.events.filter(isEvent)
    return {
      kind: 'ok',
      data: { schemaVersion: SCHEMA_VERSION, events, settings: readSettings(json.settings) },
      dropped: json.events.length - events.length,
      json,
    }
  }
  return { kind: 'notSave', json }
}

/**
 * Loads saved data. It never throws and never silently loses anything:
 * - unreadable parts are dropped only after the raw string is copied to `drag-on:corrupt-<now>`;
 * - if that copy can't be written, or the data is from a newer version, the result is read-only.
 */
export function load(store: KeyValueStore = defaultStore(), now: number = Date.now()): LoadResult {
  let raw: string | null
  try {
    raw = store.getItem(STORAGE_KEY)
  } catch {
    return { data: defaultData(), readOnly: true, notice: 'unavailable' }
  }
  if (raw === null) return { data: defaultData(), readOnly: false, notice: 'new' }

  const parsed = parseSave(raw)
  switch (parsed.kind) {
    case 'newerVersion':
      // A newer app wrote this. Show what we understand, but leave it exactly as it is.
      return { data: parsed.data, readOnly: true, notice: 'newerVersion' }
    case 'ok':
      if (parsed.dropped === 0) return { data: parsed.data, readOnly: false, notice: 'ok' }
      return repair(store, raw, parsed.data, now)
    default:
      return repair(store, raw, defaultData(), now)
  }
}

/** Backs up the raw string, then saves what we could recover. Read-only if the backup fails. */
function repair(store: KeyValueStore, raw: string, recovered: SaveData, now: number): LoadResult {
  try {
    store.setItem(`${CORRUPT_KEY_PREFIX}${now}`, raw)
  } catch {
    return { data: recovered, readOnly: true, notice: 'backupFailed' }
  }
  try {
    // Saving straight away means the backup is made once, not on every load.
    save(recovered, store)
  } catch {
    // The backup exists, so a later save may overwrite the original safely.
  }
  return { data: recovered, readOnly: false, notice: 'repaired' }
}

export function save(data: SaveData, store: KeyValueStore = defaultStore()): void {
  store.setItem(STORAGE_KEY, JSON.stringify(data))
}

/** The bit of StorageManager we use. */
export interface PersistentStorage {
  persisted?: () => Promise<boolean>
  persist?: () => Promise<boolean>
}

let persistRequest: Promise<boolean> | null = null

/**
 * Asks the browser not to evict our data under storage pressure. Runs at most
 * once per page load. Resolves true if storage is (now) persistent.
 */
export function requestPersistence(
  manager: PersistentStorage | undefined = globalThis.navigator?.storage,
): Promise<boolean> {
  persistRequest ??= (async () => {
    try {
      if (!manager?.persist) return false
      if (manager.persisted && (await manager.persisted())) return true
      return await manager.persist()
    } catch {
      return false
    }
  })()
  return persistRequest
}

/** For tests: forget that persistence was already requested. */
export function resetPersistenceRequestForTests(): void {
  persistRequest = null
}
