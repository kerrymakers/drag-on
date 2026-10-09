// Backup files: exporting the save data to a JSON file and importing one back.
// Import checks a file exactly the way load() checks saved data (parseSave).

import { dayKey } from '../game/day'
import { STORAGE_KEY, parseSave, save, type KeyValueStore, type SaveData } from './index'

/** Before an import replaces anything, the stored data is copied to `drag-on:before-import-<now>`. */
export const BEFORE_IMPORT_KEY_PREFIX = 'drag-on:before-import-'

/** How many before-import copies to keep (the newest). Each is a full copy, so older ones go. */
export const BEFORE_IMPORT_KEEP = 2

/** A store whose keys can be listed and removed, as localStorage's can. */
export interface ListableStore extends KeyValueStore {
  readonly length: number
  key(index: number): string | null
  removeItem(key: string): void
}

/** "drag-on-backup-2026-10-09.json", dated by the game day (so 01:00 counts as the day before). */
export function backupFileName(now: number): string {
  return `drag-on-backup-${dayKey(now)}.json`
}

/** A backup file's contents: the save data plus when it was exported. */
export function backupText(data: SaveData, now: number): string {
  return JSON.stringify({ ...data, exportedAt: now }, null, 2)
}

export interface ExportContents {
  text: string
  /** True when it's the stored string, untouched (read-only mode). */
  raw: boolean
}

/**
 * What an export writes. Normally the data in memory, with `exportedAt`. While the
 * app is read-only (data from a newer version, or data it couldn't read or back up)
 * the stored string goes out exactly as it is, so nothing in it is lost; only if
 * storage can't be read (or holds nothing) does it fall back to what's in memory,
 * with `exportedAt`. A raw export has no `exportedAt`: adding one would change it.
 */
export function exportContents(
  data: SaveData,
  readOnly: boolean,
  now: number,
  store: KeyValueStore | undefined,
): ExportContents {
  if (readOnly) {
    try {
      const raw = store?.getItem(STORAGE_KEY) ?? null
      if (raw !== null) return { text: raw, raw: true }
    } catch {
      // Storage is unavailable: memory is all there is.
    }
  }
  return { text: backupText(data, now), raw: false }
}

export type BackupCheck =
  | {
      ok: false
      /** unreadable: not JSON; notBackup: not Drag-on data; newerVersion: from a newer app. */
      reason: 'unreadable' | 'notBackup' | 'newerVersion'
    }
  | {
      ok: true
      data: SaveData
      /** When the file was exported, or null if it doesn't say. */
      exportedAt: number | null
      /** Entries that couldn't be read and will be left out (as load() would). */
      dropped: number
    }

/** Checks a backup file's text the same way load() checks saved data. */
export function readBackup(text: string): BackupCheck {
  const parsed = parseSave(text)
  switch (parsed.kind) {
    case 'unreadable':
      return { ok: false, reason: 'unreadable' }
    case 'notSave':
      return { ok: false, reason: 'notBackup' }
    case 'newerVersion':
      return { ok: false, reason: 'newerVersion' }
    case 'ok': {
      const at = parsed.json.exportedAt
      return {
        ok: true,
        data: parsed.data,
        exportedAt: typeof at === 'number' && Number.isFinite(at) ? at : null,
        dropped: parsed.dropped,
      }
    }
  }
}

/** The data with `lastBackupAt` set to `at`, or with none if `at` is null. */
export function withLastBackup(data: SaveData, at: number | null): SaveData {
  const { lastBackupAt: _old, ...settings } = data.settings
  void _old
  return { ...data, settings: at === null ? settings : { ...settings, lastBackupAt: at } }
}

export type ImportResult =
  | { ok: true; data: SaveData }
  /** safetyCopy: the current data couldn't be copied aside, so nothing was replaced. save: the copy exists but the new data couldn't be saved; nothing was replaced. */
  | { ok: false; reason: 'safetyCopy' | 'save' }

/**
 * Replaces the saved data with an imported backup. First the stored string (or, if
 * nothing is stored, what's in memory) is copied to `drag-on:before-import-<now>`;
 * if that fails, nothing is replaced. The imported data's `lastBackupAt` becomes the
 * file's `exportedAt` (none if the file has none). Once it's saved, only the newest
 * BEFORE_IMPORT_KEEP copies are kept. Returns the data now in force.
 */
export function importBackup(
  current: SaveData,
  incoming: SaveData,
  exportedAt: number | null,
  now: number,
  store: ListableStore,
): ImportResult {
  const copyKey = `${BEFORE_IMPORT_KEY_PREFIX}${now}`
  try {
    const raw = store.getItem(STORAGE_KEY)
    store.setItem(copyKey, raw ?? JSON.stringify(current))
  } catch {
    return { ok: false, reason: 'safetyCopy' }
  }
  const data = withLastBackup(incoming, exportedAt)
  try {
    save(data, store)
  } catch {
    return { ok: false, reason: 'save' }
  }
  pruneBeforeImportCopies(store, BEFORE_IMPORT_KEEP, copyKey)
  return { ok: true, data }
}

/**
 * Removes all but the newest `keep` before-import copies (newest by the time in the
 * key). Keys whose suffix isn't a time are left alone, and so is every other key
 * (the `drag-on:corrupt-*` copies included). Never throws: a copy that can't be
 * removed just stays. `protect` (the copy just written) is always kept and counts
 * towards `keep`, even if the phone's clock has gone backwards since older copies.
 */
export function pruneBeforeImportCopies(store: ListableStore, keep: number, protect?: string): void {
  try {
    const copies: { key: string; at: number }[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key === null || !key.startsWith(BEFORE_IMPORT_KEY_PREFIX)) continue
      const suffix = key.slice(BEFORE_IMPORT_KEY_PREFIX.length)
      if (/^\d+$/.test(suffix)) copies.push({ key, at: Number(suffix) })
    }
    copies.sort((a, b) => (b.key === protect ? 1 : 0) - (a.key === protect ? 1 : 0) || b.at - a.at)
    for (const { key } of copies.slice(Math.max(0, keep))) store.removeItem(key)
  } catch {
    // Leaving an extra copy is harmless.
  }
}
