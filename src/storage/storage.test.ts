import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import type { GameEvent } from '../game/types'
import {
  CORRUPT_KEY_PREFIX,
  STORAGE_KEY,
  defaultData,
  load,
  requestPersistence,
  resetPersistenceRequestForTests,
  save,
  type KeyValueStore,
} from './index'

class FakeStore implements KeyValueStore {
  map = new Map<string, string>()
  failWrites = false
  writes = 0
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  setItem(key: string, value: string) {
    if (this.failWrites) throw new Error('QuotaExceededError')
    this.writes++
    this.map.set(key, value)
  }
  corruptKeys() {
    return [...this.map.keys()].filter((k) => k.startsWith(CORRUPT_KEY_PREFIX))
  }
}

const logEvent: GameEvent = { id: 'a', type: 'log', taskId: 'gym', timestamp: 1000, xpAwarded: 40 }
const undoEvent: GameEvent = { id: 'b', type: 'undo', targetEventId: 'a', timestamp: 2000 }

const withRaw = (raw: string) => {
  const store = new FakeStore()
  store.map.set(STORAGE_KEY, raw)
  return store
}

describe('load', () => {
  it('starts fresh and writable when nothing is saved', () => {
    expect(load(new FakeStore())).toEqual({
      data: { schemaVersion: 1, events: [], settings: DEFAULT_SETTINGS },
      readOnly: false,
      notice: 'new',
    })
  })

  it('round-trips saved data', () => {
    const store = new FakeStore()
    const data = { ...defaultData(), events: [logEvent, undoEvent] }
    save(data, store)
    expect(load(store)).toEqual({ data, readOnly: false, notice: 'ok' })
  })

  it('backs up corrupt JSON, then starts fresh', () => {
    const store = withRaw('{not json')
    const result = load(store, 1234)
    expect(result.data.events).toEqual([])
    expect(result.readOnly).toBe(false)
    expect(result.notice).toBe('repaired')
    expect(store.map.get(`${CORRUPT_KEY_PREFIX}1234`)).toBe('{not json')
  })

  it('treats unreadable shapes and older or missing versions as corrupt', () => {
    for (const raw of [
      JSON.stringify({ schemaVersion: 0, events: [] }),
      JSON.stringify({ events: [] }),
      JSON.stringify({ schemaVersion: 1, events: 'nope' }),
      'null',
    ]) {
      const store = withRaw(raw)
      const result = load(store, 5)
      expect(result.notice).toBe('repaired')
      expect(result.data.events).toEqual([])
      expect(store.map.get(`${CORRUPT_KEY_PREFIX}5`)).toBe(raw)
    }
  })

  it('keeps the valid events when one is malformed, and backs up the original', () => {
    const raw = JSON.stringify({
      schemaVersion: 1,
      events: [logEvent, { id: 'x', type: 'log' }, undoEvent],
      settings: DEFAULT_SETTINGS,
    })
    const store = withRaw(raw)
    const result = load(store, 7)
    expect(result).toEqual({
      data: { schemaVersion: 1, events: [logEvent, undoEvent], settings: DEFAULT_SETTINGS },
      readOnly: false,
      notice: 'repaired',
    })
    expect(store.map.get(`${CORRUPT_KEY_PREFIX}7`)).toBe(raw)
    // The repaired copy is saved, so the next load is clean and makes no second backup.
    expect(load(store, 8).notice).toBe('ok')
    expect(store.corruptKeys()).toEqual([`${CORRUPT_KEY_PREFIX}7`])
  })

  it('is read-only and leaves the original alone if the backup cannot be written', () => {
    const raw = JSON.stringify({ schemaVersion: 1, events: [logEvent, 42] })
    const store = withRaw(raw)
    store.failWrites = true
    const result = load(store, 1)
    expect(result.readOnly).toBe(true)
    expect(result.notice).toBe('backupFailed')
    expect(result.data.events).toEqual([logEvent])
    expect(store.map.get(STORAGE_KEY)).toBe(raw)
    expect(store.corruptKeys()).toEqual([])
  })

  it('treats data from a newer version as read-only, without backing it up or rewriting it', () => {
    const raw = JSON.stringify({
      schemaVersion: 2,
      events: [logEvent, { id: 'z', type: 'someFutureThing', timestamp: 3 }],
      settings: { dragonName: 'Ember' },
      somethingNew: true,
    })
    const store = withRaw(raw)
    const result = load(store, 9)
    expect(result.readOnly).toBe(true)
    expect(result.notice).toBe('newerVersion')
    expect(result.data.events).toEqual([logEvent])
    expect(result.data.settings.dragonName).toBe('Ember')
    expect(store.writes).toBe(0)
    expect(store.map.get(STORAGE_KEY)).toBe(raw)
  })

  it('is read-only if storage cannot be read', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {},
    }
    expect(load(broken)).toMatchObject({ readOnly: true, notice: 'unavailable' })
  })
})

describe('settings', () => {
  const loadSettings = (settings: unknown) =>
    load(withRaw(JSON.stringify({ schemaVersion: 1, events: [], settings }))).data.settings

  it('fills in missing fields from the defaults', () => {
    const s = loadSettings({ wakeSchedule: { mon: '07:00' } })
    expect(s.wakeSchedule).toEqual({ ...DEFAULT_SETTINGS.wakeSchedule, mon: '07:00' })
    expect(s.dragonName).toBeNull()
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS)
  })

  it('turns invalid wake times into null (skipped)', () => {
    const s = loadSettings({
      wakeSchedule: { mon: '24:00', tue: '06:60', wed: '6:30', thu: 'soon', fri: 630, sat: null, sun: '23:59' },
    })
    expect(s.wakeSchedule).toEqual({
      mon: null,
      tue: null,
      wed: null,
      thu: null,
      fri: null,
      sat: null,
      sun: '23:59',
    })
  })

  it('accepts the full range of real times', () => {
    const s = loadSettings({ wakeSchedule: { mon: '00:00', tue: '19:59', wed: '23:59' } })
    expect(s.wakeSchedule.mon).toBe('00:00')
    expect(s.wakeSchedule.tue).toBe('19:59')
    expect(s.wakeSchedule.wed).toBe('23:59')
  })

  it('ignores a non-string dragon name', () => {
    expect(loadSettings({ dragonName: 42 }).dragonName).toBeNull()
  })

  it('keeps unrecognised fields through a load and save', () => {
    const store = withRaw(
      JSON.stringify({ schemaVersion: 1, events: [], settings: { soundOn: false, theme: 'moss' } }),
    )
    save(load(store).data, store)
    const saved = JSON.parse(store.map.get(STORAGE_KEY) as string)
    expect(saved.settings).toMatchObject({ soundOn: false, theme: 'moss' })
  })
})

describe('requestPersistence', () => {
  beforeEach(() => resetPersistenceRequestForTests())

  it('asks once per page load', async () => {
    const persist = vi.fn(async () => true)
    const manager = { persisted: async () => false, persist }
    expect(await requestPersistence(manager)).toBe(true)
    expect(await requestPersistence(manager)).toBe(true)
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('does not ask if storage is already persistent', async () => {
    const persist = vi.fn(async () => true)
    expect(await requestPersistence({ persisted: async () => true, persist })).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })

  it('copes when the API is missing or fails', async () => {
    expect(await requestPersistence(undefined)).toBe(false)
    resetPersistenceRequestForTests()
    expect(
      await requestPersistence({
        persist: async () => {
          throw new Error('nope')
        },
      }),
    ).toBe(false)
  })
})
