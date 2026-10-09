import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../config/settings'
import { TASK_LIMITS, TASKS } from '../config/tasks'
import { archiveTask, effectiveTasks, updateTask, withTasks } from '../game/tasks'
import { totalXp } from '../game/state'
import type { GameEvent } from '../game/types'
import {
  CORRUPT_KEY_PREFIX,
  STORAGE_KEY,
  defaultData,
  load,
  parseSave,
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

  it('round-trips logs with a treat (schema stays at 1)', () => {
    const treat: GameEvent = { ...logEvent, id: 't', reward: { kind: 'treat', bonusXp: 20 } }
    const store = new FakeStore()
    const data = { ...defaultData(), events: [logEvent, treat] }
    save(data, store)
    const loaded = load(store)
    expect(loaded).toEqual({ data, readOnly: false, notice: 'ok' })
    expect(totalXp(loaded.data.events)).toBe(40 + 40 + 20)
  })

  it('keeps a reward it does not recognise, untouched, and counts only the base XP', () => {
    const later = { ...logEvent, id: 'l', reward: { kind: 'sparkle', colour: 'gold', bonusXp: 500 } }
    const odd = { ...logEvent, id: 'o', reward: 'mystery' }
    const raw = JSON.stringify({ schemaVersion: 1, events: [later, odd], settings: DEFAULT_SETTINGS })
    const store = withRaw(raw)
    const loaded = load(store)
    expect(loaded.notice).toBe('ok')
    expect(loaded.data.events).toEqual([later, odd])
    expect(totalXp(loaded.data.events)).toBe(80)
    save(loaded.data, store)
    expect(JSON.parse(store.getItem(STORAGE_KEY)!).events).toEqual([later, odd])
    expect(store.corruptKeys()).toEqual([])
  })

  it('keeps a log with a malformed treat, but never counts the bad bonus', () => {
    const bad = [
      { ...logEvent, id: 'n', reward: { kind: 'treat', bonusXp: -40 } },
      { ...logEvent, id: 's', reward: { kind: 'treat', bonusXp: '999' } },
      { ...logEvent, id: 'm', reward: { kind: 'treat' } },
      { ...logEvent, id: 'z', reward: null },
    ]
    const loaded = load(withRaw(JSON.stringify({ schemaVersion: 1, events: bad, settings: DEFAULT_SETTINGS })))
    expect(loaded.notice).toBe('ok')
    expect(loaded.data.events).toHaveLength(4)
    expect(totalXp(loaded.data.events)).toBe(4 * 40)
  })

  it('loads logs with and without a recorded stage (schema stays at 1)', () => {
    const held: GameEvent = { ...logEvent, id: 'h', stageReached: 'hatchling' }
    const store = new FakeStore()
    save({ ...defaultData(), events: [logEvent, held] }, store)
    expect(load(store)).toMatchObject({ notice: 'ok', data: { schemaVersion: 1, events: [logEvent, held] } })
  })

  it('treats a non-string stageReached as a malformed event', () => {
    const raw = JSON.stringify({ schemaVersion: 1, events: [logEvent, { ...logEvent, id: 'x', stageReached: 3 }] })
    const result = load(withRaw(raw), 4)
    expect(result.notice).toBe('repaired')
    expect(result.data.events).toEqual([logEvent])
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

  describe('wake schedule history', () => {
    const WEEKDAYS_ONLY = { ...DEFAULT_SETTINGS.wakeSchedule }
    const SAT_TOO = { ...WEEKDAYS_ONLY, sat: '08:00' }

    it('loads older saves without one as no history', () => {
      expect('wakeScheduleHistory' in loadSettings({ wakeSchedule: WEEKDAYS_ONLY })).toBe(false)
      expect('wakeScheduleHistory' in loadSettings({ wakeScheduleHistory: 'nope' })).toBe(false)
      expect('wakeScheduleHistory' in loadSettings({ wakeScheduleHistory: [] })).toBe(false)
    })

    it('keeps good entries, sorted oldest first', () => {
      const s = loadSettings({
        wakeSchedule: SAT_TOO,
        wakeScheduleHistory: [
          { from: '2026-10-09', schedule: SAT_TOO },
          { from: '1970-01-01', schedule: WEEKDAYS_ONLY },
        ],
      })
      expect(s.wakeScheduleHistory).toEqual([
        { from: '1970-01-01', schedule: WEEKDAYS_ONLY },
        { from: '2026-10-09', schedule: SAT_TOO },
      ])
    })

    it('drops malformed entries: a bad day key or a schedule that is not an object', () => {
      const s = loadSettings({
        wakeScheduleHistory: [
          null,
          'soon',
          { from: '2026-10-01' },
          { from: '2026-10-02', schedule: 'weekdays' },
          { from: '2026-10-03', schedule: [] },
          { from: '2026-13-01', schedule: WEEKDAYS_ONLY },
          { from: '2026-02-30', schedule: WEEKDAYS_ONLY },
          { from: '9 Oct', schedule: WEEKDAYS_ONLY },
          { from: 20261009, schedule: WEEKDAYS_ONLY },
          { schedule: WEEKDAYS_ONLY },
          { from: '2026-10-05', schedule: SAT_TOO },
        ],
      })
      expect(s.wakeScheduleHistory).toEqual([{ from: '2026-10-05', schedule: SAT_TOO }])
    })

    it('turns bad times inside a schedule into null, and a missing day into no target', () => {
      const s = loadSettings({
        wakeScheduleHistory: [{ from: '2026-10-05', schedule: { mon: '25:00', tue: '07:00', wed: 7 } }],
      })
      expect(s.wakeScheduleHistory?.[0]?.schedule).toEqual({
        mon: null,
        tue: '07:00',
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      })
    })

    it('keeps one entry per day (the later one in the list)', () => {
      const s = loadSettings({
        wakeScheduleHistory: [
          { from: '2026-10-05', schedule: WEEKDAYS_ONLY },
          { from: '2026-10-05', schedule: SAT_TOO },
        ],
      })
      expect(s.wakeScheduleHistory).toEqual([{ from: '2026-10-05', schedule: SAT_TOO }])
    })

    it('loads nothing if every entry is malformed', () => {
      expect('wakeScheduleHistory' in loadSettings({ wakeScheduleHistory: [{ from: 'x', schedule: {} }] })).toBe(false)
    })

    it('round-trips, with unknown fields in settings still kept', () => {
      const store = new FakeStore()
      const settings = {
        ...defaultData().settings,
        wakeSchedule: SAT_TOO,
        wakeScheduleHistory: [
          { from: '1970-01-01', schedule: WEEKDAYS_ONLY },
          { from: '2026-10-09', schedule: SAT_TOO },
        ],
        theme: 'moss',
      }
      save({ ...defaultData(), settings }, store)
      const loaded = load(store).data.settings
      expect(loaded).toEqual(settings)
    })
  })

  it('ignores a non-string dragon name', () => {
    expect(loadSettings({ dragonName: 42 }).dragonName).toBeNull()
  })

  it('loads a save from before wearing existed as nothing worn, and keeps the rest', () => {
    const s = loadSettings({ wakeSchedule: { mon: '07:00' }, dragonName: 'Ember' })
    expect(s.wearing).toEqual({ head: null, neck: null, held: null })
    expect(s.dragonName).toBe('Ember')
    expect(s.wakeSchedule.mon).toBe('07:00')
  })

  it('round-trips what the dragon is wearing', () => {
    const store = new FakeStore()
    const data = { ...defaultData(), settings: { ...defaultData().settings, wearing: { head: 'bow', neck: null, held: 'book' } } }
    save(data, store)
    expect(load(store).data.settings.wearing).toEqual({ head: 'bow', neck: null, held: 'book' })
  })

  it('turns malformed wearing into nothing worn, spot by spot', () => {
    for (const bad of [null, 42, 'bow', ['bow'], true]) {
      expect(loadSettings({ wearing: bad }).wearing, JSON.stringify(bad)).toEqual({ head: null, neck: null, held: null })
    }
    expect(loadSettings({ wearing: { head: 7, neck: '', held: { id: 'book' } } }).wearing).toEqual({
      head: null,
      neck: null,
      held: null,
    })
    expect(loadSettings({ wearing: { head: 'bow', neck: false } }).wearing).toEqual({ head: 'bow', neck: null, held: null })
  })

  it('keeps an id it does not know (game logic decides what shows) and spots a later version adds', () => {
    const store = withRaw(
      JSON.stringify({ schemaVersion: 1, events: [], settings: { wearing: { head: 'from-later', tail: 'ribbon' } } }),
    )
    const loaded = load(store).data.settings.wearing
    expect(loaded).toMatchObject({ head: 'from-later', neck: null, held: null, tail: 'ribbon' })
    save(load(store).data, store)
    expect(JSON.parse(store.map.get(STORAGE_KEY) as string).settings.wearing).toMatchObject({ tail: 'ribbon' })
  })

  it('never shares the default outfit object between loads', () => {
    const a = load(new FakeStore()).data.settings
    a.wearing.head = 'bow'
    expect(load(new FakeStore()).data.settings.wearing.head).toBeNull()
    expect(DEFAULT_SETTINGS.wearing.head).toBeNull()
  })

  describe('tasks', () => {
    const good = { id: 'my-1', name: 'Stretch', stat: 'heart', xp: 15, rules: { kind: 'oncePerDay' }, archived: false }

    it('loads older saves without a task list as none (the config tasks apply)', () => {
      expect('tasks' in loadSettings({ dragonName: 'Ember' })).toBe(false)
      expect('tasks' in loadSettings({ tasks: 'nope' })).toBe(false)
      expect('tasks' in loadSettings({ tasks: { 0: good } })).toBe(false)
    })

    it('keeps good tasks in order, every known rules shape included', () => {
      const tasks = [
        { ...good, id: 'wake', rules: { kind: 'wakeUp' } },
        good,
        { ...good, id: 'my-2', rules: { kind: 'maxPerDay', max: 3 }, archived: true },
      ]
      expect(loadSettings({ tasks }).tasks).toEqual(tasks)
    })

    const bad = [
      null,
      'gym',
      { ...good, id: '' },
      { ...good, id: 7 },
      { ...good, name: '' },
      { ...good, name: '   ' },
      { ...good, name: null },
      { ...good, stat: 'luck' },
      { ...good, stat: undefined },
      { ...good, xp: 0 },
      { ...good, xp: -5 },
      { ...good, xp: '15' },
      { ...good, xp: null }, // what JSON makes of Infinity or NaN
      { ...good, rules: null },
      { ...good, rules: { kind: 'weekly' } },
      { ...good, rules: { kind: 'maxPerDay' } },
      { ...good, rules: { kind: 'maxPerDay', max: 0 } },
      { ...good, rules: { kind: 'maxPerDay', max: 1.5 } },
      { ...good, rules: 'oncePerDay' },
    ]

    it('keeps tasks it cannot read exactly as they are, but never uses them', () => {
      for (const t of bad) {
        const s = loadSettings({ tasks: [t] })
        expect(s.tasks, JSON.stringify(t)).toEqual([t])
        expect(effectiveTasks(s, TASKS), JSON.stringify(t)).toEqual(TASKS)
      }
      const s = loadSettings({ tasks: [...bad, good] })
      expect(s.tasks).toEqual([...bad, good])
      expect(effectiveTasks(s, TASKS).map((t) => t.id)).toEqual(['my-1', ...TASKS.map((t) => t.id)])
    })

    it('reads a missing or odd archived flag as not archived', () => {
      const { archived: _a, ...noFlag } = good
      expect(loadSettings({ tasks: [noFlag] }).tasks).toEqual([good])
      expect(loadSettings({ tasks: [{ ...good, archived: 'yes' }] }).tasks).toEqual([good])
      // Unreadable for another reason: left exactly as it was.
      const { archived: _b, ...noFlagBadStat } = { ...good, stat: 'luck' }
      expect(loadSettings({ tasks: [noFlagBadStat] }).tasks).toEqual([noFlagBadStat])
    })

    it('keeps both of two tasks with one id, and uses the first', () => {
      const s = loadSettings({ tasks: [good, { ...good, name: 'Second' }] })
      expect(s.tasks).toEqual([good, { ...good, name: 'Second' }])
      expect(effectiveTasks(s, TASKS).filter((t) => t.id === 'my-1')).toEqual([good])
    })

    it('a task with an unknown rules kind survives load, an edit to another task, save and load', () => {
      const later = { ...good, id: 'my-later', rules: { kind: 'weekly', days: 3 } }
      const store = withRaw(JSON.stringify({ schemaVersion: 1, events: [], settings: { tasks: [later, good] } }))
      const loaded = load(store).data
      const tasks = effectiveTasks(loaded.settings, TASKS)
      expect(tasks.some((t) => t.id === 'my-later')).toBe(false)
      const edited = archiveTask(updateTask(tasks, 'my-1', { name: 'Stretch more' }, TASK_LIMITS), 'gym')
      save({ ...loaded, settings: withTasks(loaded.settings, edited, TASKS) }, store)
      const again = load(store).data.settings
      expect(again.tasks?.[0]).toEqual(later)
      expect(again.tasks?.[1]).toMatchObject({ id: 'my-1', name: 'Stretch more' })
      expect(effectiveTasks(again, TASKS).find((t) => t.id === 'gym')?.archived).toBe(true)
    })

    it('a built-in task it cannot read gets its default back, in its place', () => {
      const badGym = { ...TASKS.find((t) => t.id === 'gym')!, xp: 'lots' }
      const store = withRaw(JSON.stringify({ schemaVersion: 1, events: [], settings: { tasks: [good, badGym] } }))
      const s = load(store).data.settings
      expect(s.tasks).toEqual([good, badGym])
      const tasks = effectiveTasks(s, TASKS)
      expect(tasks.map((t) => t.id)).toEqual(['my-1', 'gym', ...TASKS.filter((t) => t.id !== 'gym').map((t) => t.id)])
      expect(tasks[1]).toEqual(TASKS.find((t) => t.id === 'gym'))
    })

    it('keeps unknown fields on a task and its rules through a load and save', () => {
      const store = withRaw(
        JSON.stringify({
          schemaVersion: 1,
          events: [],
          settings: { tasks: [{ ...good, colour: 'moss', rules: { kind: 'oncePerDay', from: 'later' } }] },
        }),
      )
      save(load(store).data, store)
      const saved = JSON.parse(store.map.get(STORAGE_KEY) as string)
      expect(saved.settings.tasks).toEqual([{ ...good, colour: 'moss', rules: { kind: 'oncePerDay', from: 'later' } }])
    })
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

describe('parseSave (shared by load and import)', () => {
  it('sorts strings into unreadable, not a save, newer and ok', () => {
    expect(parseSave('{')).toEqual({ kind: 'unreadable' })
    expect(parseSave('[1]').kind).toBe('notSave')
    expect(parseSave('{"schemaVersion":1}').kind).toBe('notSave')
    expect(parseSave('{"schemaVersion":9,"events":[]}').kind).toBe('newerVersion')
    expect(parseSave(JSON.stringify(defaultData()))).toMatchObject({ kind: 'ok', dropped: 0, data: defaultData() })
  })

  it('counts and drops events it cannot read', () => {
    const raw = JSON.stringify({ ...defaultData(), events: [logEvent, { id: 1 }] })
    expect(parseSave(raw)).toMatchObject({ kind: 'ok', dropped: 1, data: { events: [logEvent] } })
  })
})
