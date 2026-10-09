import { describe, expect, it } from 'vitest'
import { withScheduleEdit } from '../game/settings'
import type { GameEvent } from '../game/types'
import { at } from '../testing/helpers'
import {
  BEFORE_IMPORT_KEEP,
  BEFORE_IMPORT_KEY_PREFIX,
  pruneBeforeImportCopies,
  type ListableStore,
  backupFileName,
  backupText,
  exportContents,
  importBackup,
  readBackup,
  withLastBackup,
} from './backup'
import { STORAGE_KEY, defaultData, load, save, type SaveData } from './index'

class FakeStore implements ListableStore {
  map = new Map<string, string>()
  failReads = false
  /** Writes to keys starting with this fail. */
  failWritesTo: string | null = null
  getItem(key: string) {
    if (this.failReads) throw new Error('SecurityError')
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failWritesTo !== null && key.startsWith(this.failWritesTo)) throw new Error('QuotaExceededError')
    this.map.set(key, value)
  }
  failRemoves = false
  get length() {
    return this.map.size
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    if (this.failRemoves) throw new Error('SecurityError')
    this.map.delete(key)
  }
  keysStartingWith(prefix: string) {
    return [...this.map.keys()].filter((k) => k.startsWith(prefix))
  }
}

const NOW = at('2026-10-09T12:00:00+01:00')
const gym = (id: string, ts: number): GameEvent => ({ id, type: 'log', taskId: 'gym', timestamp: ts, xpAwarded: 40 })

function sample(): SaveData {
  const d = defaultData()
  return {
    ...d,
    events: [
      gym('a', at('2026-10-01T18:00:00+01:00')),
      gym('b', at('2026-10-02T18:00:00+01:00')),
      { id: 'u', type: 'undo', targetEventId: 'b', timestamp: at('2026-10-02T18:01:00+01:00') },
      gym('c', at('2026-10-03T18:00:00+01:00')),
    ],
    settings: { ...d.settings, dragonName: 'Ember', wearing: { head: 'bow', neck: null, held: null } },
  }
}

describe('backupFileName', () => {
  it('is dated by the game day', () => {
    expect(backupFileName(NOW)).toBe('drag-on-backup-2026-10-09.json')
    // 01:30 on the 10th is still game day the 9th.
    expect(backupFileName(at('2026-10-10T01:30:00+01:00'))).toBe('drag-on-backup-2026-10-09.json')
    expect(backupFileName(at('2026-10-10T04:00:00+01:00'))).toBe('drag-on-backup-2026-10-10.json')
  })
})

describe('export then import', () => {
  it('round-trips everything, and the import records the export time', () => {
    const data = sample()
    const check = readBackup(backupText(data, NOW))
    expect(check).toEqual({ ok: true, data, exportedAt: NOW, dropped: 0 })
    if (!check.ok) return
    const store = new FakeStore()
    const result = importBackup(defaultData(), check.data, check.exportedAt, NOW + 1, store)
    expect(result.ok).toBe(true)
    const loaded = load(store)
    expect(loaded.notice).toBe('ok')
    expect(loaded.data).toEqual({ ...data, settings: { ...data.settings, lastBackupAt: NOW } })
  })

  it('carries the wake schedule history both ways', () => {
    const d = sample()
    const data: SaveData = {
      ...d,
      settings: withScheduleEdit(d.settings, { ...d.settings.wakeSchedule, sat: '08:00' }, NOW),
    }
    expect(data.settings.wakeScheduleHistory).toHaveLength(2)
    const check = readBackup(backupText(data, NOW))
    expect(check.ok && check.data.settings.wakeScheduleHistory).toEqual(data.settings.wakeScheduleHistory)
    if (!check.ok) return
    const store = new FakeStore()
    importBackup(defaultData(), check.data, check.exportedAt, NOW + 1, store)
    expect(load(store).data.settings.wakeScheduleHistory).toEqual(data.settings.wakeScheduleHistory)
    expect(load(store).data.settings.wakeSchedule.sat).toBe('08:00')
  })

  it('the export holds the save data plus exportedAt, and nothing else', () => {
    const json = JSON.parse(backupText(sample(), NOW))
    expect(Object.keys(json).sort()).toEqual(['events', 'exportedAt', 'schemaVersion', 'settings'])
  })
})

describe('readBackup', () => {
  it('refuses junk that is not JSON', () => {
    expect(readBackup('')).toEqual({ ok: false, reason: 'unreadable' })
    expect(readBackup('not json {')).toEqual({ ok: false, reason: 'unreadable' })
  })

  it('refuses JSON that is not a Drag-on backup', () => {
    for (const text of ['null', '42', '"hello"', '[]', '{}', '{"events":[]}', '{"schemaVersion":1}', '{"schemaVersion":"1","events":[]}', '{"schemaVersion":0,"events":[]}'])
      expect(readBackup(text)).toEqual({ ok: false, reason: 'notBackup' })
  })

  it('refuses a backup from a newer schema version', () => {
    const text = JSON.stringify({ ...sample(), schemaVersion: 2, exportedAt: NOW })
    expect(readBackup(text)).toEqual({ ok: false, reason: 'newerVersion' })
  })

  it('accepts a backup with no exportedAt (a copied save), or a bad one, as unknown', () => {
    const data = sample()
    expect(readBackup(JSON.stringify(data))).toMatchObject({ ok: true, exportedAt: null })
    expect(readBackup(JSON.stringify({ ...data, exportedAt: 'yesterday' }))).toMatchObject({ ok: true, exportedAt: null })
  })

  it('leaves out unreadable entries, as load() would, and counts them', () => {
    const data = sample()
    const text = JSON.stringify({ ...data, events: [...data.events, { id: 'x', type: 'log' }, 'junk'], exportedAt: NOW })
    const check = readBackup(text)
    expect(check).toMatchObject({ ok: true, dropped: 2 })
    if (check.ok) expect(check.data.events).toEqual(data.events)
  })

  it('reads an older save without lastBackupAt', () => {
    const { lastBackupAt: _, ...settings } = { ...sample().settings, lastBackupAt: 1 }
    void _
    const check = readBackup(JSON.stringify({ schemaVersion: 1, events: [], settings }))
    expect(check.ok).toBe(true)
    if (check.ok) expect('lastBackupAt' in check.data.settings).toBe(false)
  })
})

describe('exportContents', () => {
  it('exports memory, with exportedAt, when writable', () => {
    const store = new FakeStore()
    store.map.set(STORAGE_KEY, '{"something":"else"}')
    const out = exportContents(sample(), false, NOW, store)
    expect(out.raw).toBe(false)
    expect(JSON.parse(out.text)).toEqual({ ...sample(), exportedAt: NOW })
  })

  it('exports the stored string untouched when read-only', () => {
    const raw = '{"schemaVersion":2,"events":[],"futureThing":{"a":1}}'
    const store = new FakeStore()
    store.map.set(STORAGE_KEY, raw)
    expect(exportContents(sample(), true, NOW, store)).toEqual({ text: raw, raw: true })
    const junk = 'not json at all'
    store.map.set(STORAGE_KEY, junk)
    expect(exportContents(sample(), true, NOW, store)).toEqual({ text: junk, raw: true })
  })

  it('falls back to memory when read-only and storage is unavailable or empty', () => {
    const store = new FakeStore()
    store.failReads = true
    expect(JSON.parse(exportContents(sample(), true, NOW, store).text)).toEqual({ ...sample(), exportedAt: NOW })
    expect(JSON.parse(exportContents(sample(), true, NOW, undefined).text)).toEqual({ ...sample(), exportedAt: NOW })
    expect(exportContents(sample(), true, NOW, new FakeStore()).raw).toBe(false)
  })
})

describe('importBackup', () => {
  const incoming = (): SaveData => ({ ...defaultData(), events: [gym('z', at('2026-09-01T18:00:00+01:00'))] })

  it('copies the stored string aside first, then replaces the data', () => {
    const store = new FakeStore()
    const before = '{"schemaVersion":1,"events":[],"settings":{"odd":true}}'
    store.map.set(STORAGE_KEY, before)
    const result = importBackup(sample(), incoming(), NOW - 5, NOW, store)
    expect(result.ok).toBe(true)
    expect(store.map.get(`${BEFORE_IMPORT_KEY_PREFIX}${NOW}`)).toBe(before)
    expect(load(store).data.events).toEqual(incoming().events)
    expect(load(store).data.settings.lastBackupAt).toBe(NOW - 5)
  })

  it('copies what is in memory when nothing is stored', () => {
    const store = new FakeStore()
    importBackup(sample(), incoming(), null, NOW, store)
    expect(JSON.parse(store.map.get(`${BEFORE_IMPORT_KEY_PREFIX}${NOW}`)!)).toEqual(sample())
  })

  it('aborts, replacing nothing, if the safety copy fails', () => {
    const store = new FakeStore()
    save(sample(), store)
    const saved = store.map.get(STORAGE_KEY)
    store.failWritesTo = BEFORE_IMPORT_KEY_PREFIX
    expect(importBackup(sample(), incoming(), NOW, NOW, store)).toEqual({ ok: false, reason: 'safetyCopy' })
    expect(store.map.get(STORAGE_KEY)).toBe(saved)
    store.failWritesTo = null
    store.failReads = true
    expect(importBackup(sample(), incoming(), NOW, NOW, store)).toEqual({ ok: false, reason: 'safetyCopy' })
  })

  it('says so if the new data cannot be saved (the copy is kept)', () => {
    const store = new FakeStore()
    save(sample(), store)
    const saved = store.map.get(STORAGE_KEY)
    store.failWritesTo = STORAGE_KEY
    expect(importBackup(sample(), incoming(), NOW, NOW, store)).toEqual({ ok: false, reason: 'save' })
    expect(store.map.get(STORAGE_KEY)).toBe(saved)
    expect(store.keysStartingWith(BEFORE_IMPORT_KEY_PREFIX)).toHaveLength(1)
  })

  it("leaves lastBackupAt unset when the file has no exportedAt, even if the file's settings had one", () => {
    const store = new FakeStore()
    const file = withLastBackup(incoming(), 123)
    const result = importBackup(sample(), file, null, NOW, store)
    expect(result.ok && 'lastBackupAt' in result.data.settings).toBe(false)
  })
})

describe('lastBackupAt in saved settings', () => {
  const withSettings = (settings: object) => {
    const store = new FakeStore()
    store.map.set(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, events: [], settings }))
    return load(store)
  }

  it('loads older saves without it as never backed up', () => {
    const loaded = withSettings({ dragonName: null })
    expect(loaded.notice).toBe('ok')
    expect('lastBackupAt' in loaded.data.settings).toBe(false)
  })

  it('keeps a finite number', () => {
    expect(withSettings({ lastBackupAt: NOW }).data.settings.lastBackupAt).toBe(NOW)
  })

  it('drops anything else', () => {
    for (const bad of ['2026-10-09', null, true, {}, [], 'NaN']) {
      expect('lastBackupAt' in withSettings({ lastBackupAt: bad }).data.settings).toBe(false)
    }
    // JSON can't hold Infinity or NaN; they arrive as null, covered above.
  })

  it('round-trips through save and load', () => {
    const store = new FakeStore()
    const data = withLastBackup(sample(), NOW)
    save(data, store)
    expect(load(store).data).toEqual(data)
  })
})

describe('keeping only the newest before-import copies', () => {
  const incoming = (): SaveData => ({ ...defaultData(), events: [gym('z', at('2026-09-01T18:00:00+01:00'))] })

  it('keeps 2', () => {
    expect(BEFORE_IMPORT_KEEP).toBe(2)
  })

  it('after an import, keeps the newest 2 copies and leaves every other key alone', () => {
    const store = new FakeStore()
    save(sample(), store)
    store.map.set(`${BEFORE_IMPORT_KEY_PREFIX}100`, 'oldest')
    store.map.set(`${BEFORE_IMPORT_KEY_PREFIX}300`, 'older')
    store.map.set(`${BEFORE_IMPORT_KEY_PREFIX}200`, 'middle')
    store.map.set(`${BEFORE_IMPORT_KEY_PREFIX}notatime`, 'odd')
    store.map.set('drag-on:corrupt-50', 'corrupt')
    store.map.set('drag-on:ui', '{}')
    expect(importBackup(sample(), incoming(), null, NOW, store).ok).toBe(true)
    expect(store.keysStartingWith(BEFORE_IMPORT_KEY_PREFIX).sort()).toEqual(
      [`${BEFORE_IMPORT_KEY_PREFIX}${NOW}`, `${BEFORE_IMPORT_KEY_PREFIX}300`, `${BEFORE_IMPORT_KEY_PREFIX}notatime`].sort(),
    )
    expect(store.map.get('drag-on:corrupt-50')).toBe('corrupt')
    expect(store.map.get('drag-on:ui')).toBe('{}')
  })

  it('removes nothing when the import fails', () => {
    for (const failAt of [BEFORE_IMPORT_KEY_PREFIX, STORAGE_KEY]) {
      const store = new FakeStore()
      save(sample(), store)
      for (const t of [1, 2, 3]) store.map.set(`${BEFORE_IMPORT_KEY_PREFIX}${t}`, 'x')
      store.failWritesTo = failAt
      expect(importBackup(sample(), incoming(), null, NOW, store).ok).toBe(false)
      expect(store.map.has(`${BEFORE_IMPORT_KEY_PREFIX}1`)).toBe(true)
    }
  })

  it('three imports in a row leave two copies, the newest holding the data from just before the last', () => {
    const store = new FakeStore()
    save(sample(), store)
    for (const t of [1, 2, 3]) importBackup(sample(), incoming(), null, NOW + t, store)
    expect(store.keysStartingWith(BEFORE_IMPORT_KEY_PREFIX).sort()).toEqual([
      `${BEFORE_IMPORT_KEY_PREFIX}${NOW + 2}`,
      `${BEFORE_IMPORT_KEY_PREFIX}${NOW + 3}`,
    ])
  })

  it('always keeps the copy just made, even if the clock has gone backwards', () => {
    const store = new FakeStore()
    save(sample(), store)
    store.map.set(`${BEFORE_IMPORT_KEY_PREFIX}${NOW + 1000}`, 'future a')
    store.map.set(`${BEFORE_IMPORT_KEY_PREFIX}${NOW + 2000}`, 'future b')
    expect(importBackup(sample(), incoming(), null, NOW, store).ok).toBe(true)
    expect(store.keysStartingWith(BEFORE_IMPORT_KEY_PREFIX).sort()).toEqual(
      [`${BEFORE_IMPORT_KEY_PREFIX}${NOW}`, `${BEFORE_IMPORT_KEY_PREFIX}${NOW + 2000}`].sort(),
    )
  })

  it('never throws if a copy cannot be removed, and still reports the import as done', () => {
    const store = new FakeStore()
    for (const t of [1, 2, 3]) store.map.set(`${BEFORE_IMPORT_KEY_PREFIX}${t}`, 'x')
    store.failRemoves = true
    expect(() => pruneBeforeImportCopies(store, 2)).not.toThrow()
    expect(importBackup(sample(), incoming(), null, NOW, store).ok).toBe(true)
  })
})
