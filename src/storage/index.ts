// Saving and loading the event log and settings in localStorage.
// Everything is kept under one key, so a save is a single atomic write.

import { DEFAULT_SETTINGS } from '../config/settings'
import type { GameEvent, Settings, WakeSchedule, Weekday } from '../game/types'

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
    settings: { ...DEFAULT_SETTINGS, wakeSchedule: { ...DEFAULT_SETTINGS.wakeSchedule } },
  }
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function isEvent(v: unknown): v is GameEvent {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.timestamp !== 'number') return false
  if (!Number.isFinite(v.timestamp)) return false
  if (v.type === 'log') {
    return (
      typeof v.taskId === 'string' &&
      typeof v.xpAwarded === 'number' &&
      Number.isFinite(v.xpAwarded) &&
      (v.note === undefined || typeof v.note === 'string')
    )
  }
  if (v.type === 'undo') return typeof v.targetEventId === 'string'
  return false
}

const WEEKDAYS: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WAKE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * Fills in anything missing from the defaults. Fields we don't recognise are kept,
 * so data written by a later version survives a round trip. A wake time that isn't
 * a real "HH:MM" becomes null (skipped), never a guessed time.
 */
function readSettings(v: unknown): Settings {
  const defaults = defaultData().settings
  if (!isObject(v)) return defaults
  const schedule: WakeSchedule = { ...defaults.wakeSchedule }
  if (isObject(v.wakeSchedule)) {
    for (const day of WEEKDAYS) {
      if (!(day in v.wakeSchedule)) continue
      const t = v.wakeSchedule[day]
      schedule[day] = typeof t === 'string' && WAKE_TIME.test(t) ? t : null
    }
  }
  return {
    ...v,
    wakeSchedule: schedule,
    dragonName: typeof v.dragonName === 'string' ? v.dragonName : defaults.dragonName,
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

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    json = undefined
  }

  const version = isObject(json) ? json.schemaVersion : undefined
  if (isObject(json) && typeof version === 'number' && version > SCHEMA_VERSION) {
    // A newer app wrote this. Show what we understand, but leave it exactly as it is.
    const events = Array.isArray(json.events) ? json.events.filter(isEvent) : []
    return {
      data: { schemaVersion: SCHEMA_VERSION, events, settings: readSettings(json.settings) },
      readOnly: true,
      notice: 'newerVersion',
    }
  }

  if (isObject(json) && version === SCHEMA_VERSION && Array.isArray(json.events)) {
    const events = json.events.filter(isEvent)
    const data: SaveData = { schemaVersion: SCHEMA_VERSION, events, settings: readSettings(json.settings) }
    if (events.length === json.events.length) return { data, readOnly: false, notice: 'ok' }
    return repair(store, raw, data, now)
  }

  return repair(store, raw, defaultData(), now)
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
