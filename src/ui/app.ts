// The app shell: wires game logic, storage and art to the Home, Dragon, Collection, History and Settings screens.
// This is the only layer that reads the clock (Date.now), generates ids and rolls dice.

import { react, renderDragon, speechAnchor, speechKeepClear, type WearLook } from '../art'
import { BACKUP_REMINDER_DAYS } from '../config/backup'
import { EVOLVES_AT_STAGE, LOOK_CHANGE_MARGIN } from '../config/evolution'
import { REWARDS } from '../config/rewards'
import { DRAGON_NAME_MAX } from '../config/settings'
import { DEFAULT_WAKE_TIME } from '../config/time'
import { MOODS } from '../config/mood'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { STREAK_CHIP_FROM, STREAKS } from '../config/streaks'
import { NEW_TASK_ID_PREFIX, NEW_TASK_TIMES_A_DAY, NEW_TASK_XP, TASK_LIMITS, TASKS } from '../config/tasks'
import { backupDue } from '../game/backup'
import { dayKey, dayMinutesToClock } from '../game/day'
import { evolutionLook, lookChange, type Evolution } from '../game/evolution'
import { createLogEvent, createUndoEvent, undoableLog } from '../game/log'
import { foundItems, itemFor, rewardMilestone, treatBonus } from '../game/rewards'
import { withScheduleEdit } from '../game/settings'
import {
  nextRefreshAt,
  dragonProgress,
  dragonStage,
  moodFor,
  stageUp,
  taskAvailability,
  totalXp,
  wakeDeadline,
} from '../game/state'
import { latestFrozenDay, logEarnsFreeze, overallStreak } from '../game/streaks'
import {
  addTask,
  archiveTask,
  effectiveTasks,
  newTaskId,
  unarchiveTask,
  updateTask,
  withTasks,
  type NewTask,
  type TaskChanges,
} from '../game/tasks'
import type { GameEvent, Item, RewardRoll, Settings, Task, TaskAvailability, WakeSchedule, Wearing } from '../game/types'
import { isWorn, toggleWear, wearOnFind, wornItems, type WornItems } from '../game/wearing'
import { STORAGE_KEY, load, requestPersistence, save } from '../storage'
import { backupFileName, exportContents, importBackup, type ListableStore } from '../storage/backup'
import { celebrate } from './celebrate'
import { createCollectionScreen } from './collection-screen'
import {
  MOOD_LABELS,
  IMPORT_REFUSED,
  SETTINGS,
  TREAT_FLOAT,
  backupReminderLine,
  freezeUsedLine,
  loggedToast,
  NOTICES,
  noticeFor,
  progressLabel,
  streakChip,
  streakChipLabel,
  undoneToast,
  welcomeLine,
} from './copy'
import { createDragonScreen } from './dragon-screen'
import { createHistoryScreen } from './history-screen'
import { newId } from './ids'
import { showItemFound } from './item-found'
import { createNav, type Route } from './nav'
import { outfitOf } from './outfit'
import { watchScrollFade } from './scroll-fade'
import { createSettingsScreen, type ReadyBackup, type SettingsOutcome } from './settings-screen'
import { placeSpeech } from './speech'
import { createToast } from './toast'
import { createUpdateGate } from './updates'
import { createWelcome } from './welcome'

const SPEECH_MS = 4000
/** The backup line stays a little longer, so there's time to tap it. */
const SPEECH_TAPPABLE_MS = 8000

const EVOLUTION_RULES = { evolvesAt: EVOLVES_AT_STAGE, margin: LOOK_CHANGE_MARGIN }

/** The dragon's evolution look and every look it has had, derived from the log. */
function evolution(events: readonly GameEvent[], tasks: readonly Task[]): Evolution {
  return evolutionLook(events, tasks, STATS, STAGES, EVOLUTION_RULES)
}

/** The task list in use: as edited in Settings, or the config's (see effectiveTasks). */
function tasksOf(settings: Settings): readonly Task[] {
  return effectiveTasks(settings, TASKS)
}

/** What's worn right now: only found, known items in their own spot (see wornItems). */
function wornNow(events: readonly GameEvent[], wearing: Wearing): WornItems {
  return wornItems(wearing, foundItems(events, REWARDS.items), REWARDS.items)
}

const TICK_MS = 60_000
/** setTimeout's ceiling; anything longer fires immediately. */
const MAX_TIMEOUT = 2 ** 31 - 1

function byId<T extends HTMLElement>(doc: Document, id: string): T {
  const el = doc.getElementById(id)
  if (!el) throw new Error(`Missing #${id}`)
  return el as T
}

function taskButton(
  doc: Document,
  task: Task,
  a: TaskAvailability,
  settings: Settings,
  now: number,
): HTMLLIElement {
  const li = doc.createElement('li')
  const button = doc.createElement('button')
  button.type = 'button'
  button.className = 'task'
  button.dataset.taskId = task.id
  const done = !a.canLog
  if (done) {
    button.classList.add('is-done')
    button.disabled = true
  }

  const label = doc.createElement('span')
  label.className = 'task-label'
  const name = doc.createElement('span')
  name.className = 'task-name'
  name.textContent = task.name
  label.append(name)
  if (task.rules.kind === 'wakeUp' && !done) {
    const deadline = wakeDeadline(settings, now)
    if (deadline != null) {
      const hint = doc.createElement('span')
      hint.className = 'task-hint'
      hint.textContent = `by ${dayMinutesToClock(deadline)}`
      label.append(hint)
    }
  }

  const meta = doc.createElement('span')
  meta.className = 'task-meta'
  if (a.limit > 1 && a.countToday > 0) {
    const count = doc.createElement('span')
    count.className = 'task-count'
    count.textContent = `${a.countToday}/${a.limit}`
    meta.append(count)
  }
  const reward = doc.createElement('span')
  reward.className = done ? 'task-tick' : 'task-xp'
  reward.textContent = done ? '✓ Done' : `+${task.xp} XP`
  meta.append(reward)

  button.append(label, meta)
  li.append(button)
  return li
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** A short buzz on every log; a treat gets a happy double buzz, a find a little trill. */
const HAPTIC_LOG = 30
const HAPTIC_TREAT = [30, 60, 45]
const HAPTIC_ITEM = [25, 50, 25, 50, 60]

function haptic(pattern: number | number[] = HAPTIC_LOG) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // Not supported or not allowed: the visual feedback is enough.
  }
}

/** This device's storage, or undefined if even asking for it throws (e.g. blocked site data). */
function localStore(): ListableStore | undefined {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}

/** Saves `text` as a file through the browser's download. Works offline: it's a blob, not a request. */
function download(doc: Document, text: string, fileName: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = doc.createElement('a')
  a.href = url
  a.download = fileName
  a.hidden = true
  doc.body.append(a)
  a.click()
  a.remove()
  // Long enough for the download to start; then free the memory.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000)
}

/** The dice for a log's variable reward. Math.random is plenty for a pet dragon. */
function rewardRoll(): RewardRoll {
  return { chance: Math.random(), pick: Math.random() }
}

/**
 * "+40 XP" rising from the button that was tapped. A treat float ("+20 treat")
 * follows just after it, in its own warm style, starting at the button's top edge so
 * it never parks over the button's own count or XP. Under reduced motion the floats
 * don't rise, so both sit just above the button instead.
 */
function floatXp(doc: Document, from: DOMRect, text: string, treat = false) {
  const el = doc.createElement('span')
  el.className = treat ? 'float-xp float-treat' : 'float-xp'
  el.textContent = text
  el.setAttribute('aria-hidden', 'true')
  const still = prefersReducedMotion()
  const top = still ? from.top - (treat ? 34 : 8) : from.top + (treat ? -12 : 6)
  // A still treat pill also moves left, off the XP label of the button above.
  const inset = treat ? (still ? 96 : 32) : 24
  el.style.left = `${from.right - inset}px`
  el.style.top = `${top}px`
  doc.body.append(el)
  // The treat float starts after a CSS delay, so it lives a little longer.
  window.setTimeout(() => el.remove(), treat ? 1300 : 900)
}

export interface App {
  /** A new version is active; reload when it won't interrupt anything. */
  requestReload(): void
}

export function startApp(doc: Document): App {
  let { data, readOnly, notice } = load()
  void requestPersistence()

  const el = {
    notice: byId(doc, 'notice'),
    noticeText: byId(doc, 'notice-text'),
    noticeClose: byId<HTMLButtonElement>(doc, 'notice-close'),
    name: byId(doc, 'dragon-name'),
    stage: byId(doc, 'stage-name'),
    mood: byId(doc, 'mood-chip'),
    speech: byId(doc, 'speech'),
    art: byId(doc, 'dragon-art'),
    label: byId(doc, 'growth-label'),
    xp: byId(doc, 'xp-total'),
    bar: byId(doc, 'xp-bar'),
    fill: byId(doc, 'xp-fill'),
    list: byId<HTMLUListElement>(doc, 'task-list'),
    undo: byId<HTMLButtonElement>(doc, 'undo'),
    home: byId(doc, 'home'),
    dragonScreen: byId(doc, 'dragon-screen'),
    collectionScreen: byId(doc, 'collection-screen'),
    historyScreen: byId(doc, 'history-screen'),
    settingsScreen: byId(doc, 'settings-screen'),
    streakChip: byId<HTMLButtonElement>(doc, 'streak-chip'),
  }
  const dragonScreen = createDragonScreen(doc, el.dragonScreen, { stats: STATS, stages: STAGES })
  const collectionScreen = createCollectionScreen(doc, el.collectionScreen, { items: REWARDS.items, onWear: wear })
  const historyScreen = createHistoryScreen(doc, el.historyScreen, { items: REWARDS.items, streaks: STREAKS })
  const settingsScreen = createSettingsScreen(doc, el.settingsScreen, {
    stages: STAGES,
    nameMax: DRAGON_NAME_MAX,
    defaultWakeTime: DEFAULT_WAKE_TIME,
    onRename: rename,
    onSchedule: setSchedule,
    stats: STATS,
    taskLimits: TASK_LIMITS,
    newTask: { xp: NEW_TASK_XP, timesADay: NEW_TASK_TIMES_A_DAY },
    onAddTask: addNewTask,
    onUpdateTask: editTask,
    onArchiveTask: archive,
    onUnarchiveTask: unarchive,
    onExport: exportBackup,
    onImport: importFile,
    now: () => Date.now(),
    reducedMotion: prefersReducedMotion,
  })
  const refreshTaskFade = watchScrollFade(byId(doc, 'tasks'))
  let route: Route = 'home'
  const toast = createToast(
    byId(doc, 'toast'),
    byId(doc, 'toast-text'),
    byId<HTMLButtonElement>(doc, 'toast-undo'),
  )
  const updates = createUpdateGate(doc)
  // While read-only, nothing at all is written to this device, UI state included.
  // The store is chosen at each write, so a session that turns read-only later is covered.
  const welcome = createWelcome(() => (readOnly ? undefined : globalThis.localStorage))

  // The speech bubble by the dragon: non-blocking, no tap needed, fades on its own.
  let speechTimer: number | undefined
  /** What tapping the bubble does, while it's a tappable one. */
  let speechTap: (() => void) | null = null
  function say(text: string, onTap?: () => void) {
    const bubble = el.speech
    // A tappable line is a real button inside the bubble (the bubble itself stays a
    // plain live region), sized for a thumb.
    speechTap = onTap ?? null
    bubble.classList.toggle('is-tappable', speechTap !== null)
    if (speechTap) {
      const button = doc.createElement('button')
      button.type = 'button'
      button.className = 'speech-tap'
      button.textContent = text
      button.addEventListener('click', tapSpeech)
      bubble.replaceChildren(button)
    } else {
      bubble.textContent = text
    }
    // Beside the dragon's head, clear of its face, headgear and zzz.
    const area = bubble.parentElement?.getBoundingClientRect()
    const avoid = speechAnchor(el.art)
    if (area && avoid) {
      const p = placeSpeech(
        area,
        avoid,
        (maxWidth, compact) => {
          bubble.style.maxWidth = `${maxWidth}px`
          bubble.classList.toggle('is-compact', compact)
          return { width: bubble.offsetWidth, height: bubble.offsetHeight }
        },
        speechKeepClear(el.art),
      )
      bubble.style.maxWidth = `${p.maxWidth}px`
      bubble.classList.toggle('is-compact', p.compact)
      bubble.style.left = `${Math.round(p.left)}px`
      bubble.style.top = `${Math.round(p.top)}px`
      bubble.dataset.tail = p.tail
    }
    bubble.classList.add('is-showing')
    window.clearTimeout(speechTimer)
    speechTimer = window.setTimeout(hush, speechTap ? SPEECH_TAPPABLE_MS : SPEECH_MS)
  }
  function hush() {
    window.clearTimeout(speechTimer)
    el.speech.classList.remove('is-showing')
    // The words stay for the fade-out, but the button can't be reached once it's hidden.
    if (speechTap) {
      speechTap = null
      const button = el.speech.querySelector<HTMLButtonElement>('.speech-tap')
      if (button) button.disabled = true
    }
  }
  function tapSpeech() {
    const tap = speechTap
    if (!tap) return
    hush()
    tap()
  }

  /**
   * On opening (or coming back to) the app after a gap: a pleased hello, at most once
   * per gap per mood level (sleepy, then curled up). Only while the page is visible,
   * so a PWA restored in the background doesn't use it up.
   *
   * If a streak freeze covered a quiet day since the last log (and the run is still
   * going), the dragon says so instead, once per frozen day. Only one bubble per
   * opening: the cosy line is the hello, so it also uses up a welcome that was due.
   *
   * With neither to say, and a backup due, it suggests one (at most once per game
   * day); tapping that bubble opens Settings. Not while read-only: nothing can be
   * remembered then, so it would repeat on every open, and the notice says enough.
   */
  function maybeWelcome(now = Date.now()) {
    if (doc.visibilityState !== 'visible' || route !== 'home') return
    const { mood, lastLogDay } = moodFor(data.events, now, MOODS)
    const frozen = latestFrozenDay(data.events, now, STREAKS)
    if (frozen !== null && welcome.shouldSayCosy(frozen)) {
      welcome.markCosy(frozen)
      if (welcome.shouldWelcome(mood, lastLogDay)) welcome.markWelcomed(mood, lastLogDay)
      say(freezeUsedLine(frozen))
      react(el.art, 'perk')
      return
    }
    if (welcome.shouldWelcome(mood, lastLogDay)) {
      const line = welcomeLine(mood, dayKey(now))
      if (line) {
        welcome.markWelcomed(mood, lastLogDay)
        say(line) // place it first, before the perk-up moves the art
        react(el.art, 'perk')
        return
      }
    }
    const today = dayKey(now)
    if (!readOnly && isBackupDue(now) && welcome.shouldRemindBackup(today)) {
      welcome.markBackupReminded(today)
      say(backupReminderLine(today), () => {
        nav.go('settings')
        settingsScreen.revealBackup()
      })
    }
  }

  function isBackupDue(now: number): boolean {
    return backupDue(data.events, data.settings.lastBackupAt, now, BACKUP_REMINDER_DAYS)
  }

  // Gentle notices: shown once per session at most, and dismissible.
  let noticeDismissed = false
  function showNotice(text: string) {
    if (noticeDismissed) return
    el.noticeText.textContent = text
    el.notice.hidden = false
  }
  el.noticeClose.addEventListener('click', () => {
    noticeDismissed = true
    el.notice.hidden = true
  })
  const loadNotice = noticeFor(notice)
  if (readOnly) console.warn(`Not saving on this device (${notice}), so nothing stored is overwritten.`)
  if (loadNotice) showNotice(loadNotice)

  /**
   * While a find's card is pending (and any stage-up before it), Home keeps the outfit
   * from before the find, so the card is where the item first appears. The real
   * outfit is already saved; it shows once the card closes.
   */
  let homeOutfitHold: WearLook | null = null

  let refreshTimer: number | undefined
  let taskSignature = ''
  function scheduleRefresh(now: number) {
    window.clearTimeout(refreshTimer)
    const wait = Math.min(MAX_TIMEOUT, Math.max(0, nextRefreshAt(data.settings, now) - now) + 500)
    refreshTimer = window.setTimeout(() => render(), wait)
  }

  function render(now = Date.now()) {
    const xp = totalXp(data.events)
    const progress = dragonProgress(data.events, STAGES)
    el.name.textContent = data.settings.dragonName ?? 'your dragon'
    el.stage.textContent = progress.stage.name
    const { mood } = moodFor(data.events, now, MOODS)
    const tasks = tasksOf(data.settings)
    const { look } = evolution(data.events, tasks)
    const worn = wornNow(data.events, data.settings.wearing)
    const wearing = outfitOf(worn)
    el.mood.textContent = MOOD_LABELS[mood]
    el.mood.dataset.mood = mood
    renderDragon(el.art, { stage: progress.stage.id, progress: progress.fraction, mood, look, wearing: homeOutfitHold ?? wearing })

    const label = progressLabel(progress.stage.id, progress.xpToNext, progress.next !== null)
    el.label.textContent = label
    el.xp.textContent = String(xp)
    const percent = Math.round(progress.fraction * 100)
    el.fill.style.width = `${percent}%`
    el.bar.setAttribute('aria-valuenow', String(percent))
    el.bar.setAttribute('aria-valuetext', label)

    // A small, quiet streak chip: only from 2 days, and never a warning.
    const streak = overallStreak(data.events, now, STREAKS).current
    const showChip = streak >= STREAK_CHIP_FROM
    el.streakChip.hidden = !showChip
    if (showChip) {
      el.streakChip.textContent = streakChip(streak)
      el.streakChip.setAttribute('aria-label', streakChipLabel(streak))
    }

    // Only rebuild the buttons when something about them changed, so a tick never
    // swaps a button out from under a finger or drops keyboard focus.
    const visible = tasks.map((task) => ({
      task,
      a: taskAvailability(task, data.events, data.settings, now),
    })).filter(({ a }) => a.visible)
    const signature = visible
      .map(({ task, a }) => `${task.id}:${a.canLog}:${a.countToday}/${a.limit}:${task.name}:${task.xp}`)
      .join('|')
      .concat(`|${wakeDeadline(data.settings, now)}`)
    if (signature !== taskSignature) {
      taskSignature = signature
      el.list.replaceChildren(...visible.map(({ task, a }) => taskButton(doc, task, a, data.settings, now)))
      refreshTaskFade()
    }

    // The Undo row always keeps its space, so task buttons never shift under the thumb.
    const canUndo = undoableLog(data.events, now) !== null
    el.undo.classList.toggle('is-idle', !canUndo)
    el.undo.disabled = !canUndo
    el.undo.setAttribute('aria-hidden', String(!canUndo))

    if (route === 'dragon') {
      dragonScreen.render({
        events: data.events,
        tasks,
        settings: data.settings,
        stage: progress.stage,
        progress: progress.fraction,
        mood,
        look,
        worn,
        now,
      })
    }
    if (route === 'collection') {
      collectionScreen.render({
        events: data.events,
        now,
        worn,
        dragon: { stage: progress.stage.id, progress: progress.fraction, mood, look, wearing },
      })
    }

    if (route === 'history') historyScreen.render({ events: data.events, settings: data.settings, tasks, now })
    if (route === 'settings') {
      settingsScreen.render({
        dragonName: data.settings.dragonName,
        wakeSchedule: data.settings.wakeSchedule,
        tasks,
        lastBackupAt: data.settings.lastBackupAt,
        readOnly,
        now,
      })
    }

    // A small dot on Settings while a backup is due. Never anything louder. Not while
    // read-only: a backup can't be recorded then, so the dot could never clear.
    nav.setDot('settings', !readOnly && isBackupDue(now) ? SETTINGS.tabDotLabel : null)

    scheduleRefresh(now)
  }

  /**
   * Memory is the source of truth for this session, and the whole state is saved
   * from it. A failed save never loses the tap. In read-only mode we never save,
   * so data we couldn't read or back up is never overwritten.
   */
  function commit(event: GameEvent) {
    data = { ...data, events: [...data.events, event] }
    updates.noteActivity()
    persist()
  }

  function persist() {
    if (readOnly) return
    try {
      save(data)
    } catch (err) {
      console.warn('Could not save to this device', err)
      showNotice(NOTICES.saveFailed)
    }
  }

  /** The outfit is a setting: saved straight away, never part of the event log. */
  function setWearing(wearing: Wearing) {
    data = { ...data, settings: { ...data.settings, wearing } }
    persist()
  }

  /** A new name from Settings (already tidied). Home and Dragon show it from the next render. */
  function rename(name: string | null) {
    if (readOnly) return
    data = { ...data, settings: { ...data.settings, dragonName: name } }
    persist()
    render()
  }

  /**
   * A new wake schedule from Settings. It applies from today's game day on, so earlier
   * days keep theirs (withScheduleEdit). Today's change shows on Home straight away:
   * render rebuilds the task buttons when the wake deadline changes.
   */
  function setSchedule(schedule: WakeSchedule) {
    if (readOnly) return
    data = { ...data, settings: withScheduleEdit(data.settings, schedule, Date.now()) }
    persist()
    render()
  }

  /**
   * Task edits from Settings. Each applies a pure edit to the task list in use and saves
   * the whole list (so the first edit stores it). XP and times a day count from the
   * next log: each log keeps the XP it was made with. Returns whether anything changed.
   */
  function setTasks(next: readonly Task[] | null): boolean {
    if (readOnly || next === null) return false
    data = { ...data, settings: withTasks(data.settings, next, TASKS) }
    persist()
    render()
    return true
  }
  function addNewTask(draft: NewTask): boolean {
    return setTasks(addTask(tasksOf(data.settings), draft, newTaskId(NEW_TASK_ID_PREFIX, newId()), TASK_LIMITS))
  }
  function editTask(id: string, changes: TaskChanges): boolean {
    return setTasks(updateTask(tasksOf(data.settings), id, changes, TASK_LIMITS))
  }
  function archive(id: string): boolean {
    return setTasks(archiveTask(tasksOf(data.settings), id))
  }
  function unarchive(id: string): boolean {
    return setTasks(unarchiveTask(tasksOf(data.settings), id, TASK_LIMITS))
  }

  /**
   * Downloads a backup. A successful export counts as the latest backup, unless the
   * app is read-only (then nothing is written, and the stored data goes out untouched).
   */
  function exportBackup(): SettingsOutcome {
    const now = Date.now()
    const { text } = exportContents(data, readOnly, now, localStore())
    download(doc, text, backupFileName(now))
    if (!readOnly) {
      data = { ...data, settings: { ...data.settings, lastBackupAt: now } }
      persist()
    }
    render(now)
    return { ok: true, message: SETTINGS.exported }
  }

  /** Replaces everything with a confirmed backup, after copying what's stored aside. */
  function importFile(backup: ReadyBackup): SettingsOutcome {
    if (readOnly) return { ok: false, message: SETTINGS.importPaused }
    const store = localStore()
    if (!store) return { ok: false, message: IMPORT_REFUSED.safetyCopy }
    const now = Date.now()
    const result = importBackup(data, backup.data, backup.exportedAt, now, store)
    if (!result.ok) return { ok: false, message: IMPORT_REFUSED[result.reason] }
    data = result.data
    homeOutfitHold = null
    toast.hide()
    hush()
    render(now)
    return { ok: true, message: SETTINGS.imported }
  }

  /** A found tile in Collection was tapped: put it on, or take it off. */
  function wear(item: Item): boolean {
    setWearing(toggleWear(data.settings.wearing, item))
    render()
    return isWorn(wornNow(data.events, data.settings.wearing), item)
  }

  function undoLast() {
    const now = Date.now()
    const target = undoableLog(data.events, now)
    const event = createUndoEvent(data.events, now, newId())
    if (event) {
      commit(event)
      toast.show(undoneToast(target !== null && itemFor(target, REWARDS.items) !== null))
    }
    render(now)
  }

  el.list.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button.task')
    const tasks = tasksOf(data.settings)
    const task = tasks.find((t) => t.id === button?.dataset.taskId)
    if (!button || !task) return
    const now = Date.now()
    const before = data.events
    // The outfit before this log, for any stage-up moment: a find stays a surprise until its card.
    const outfitBefore: WearLook = outfitOf(wornNow(before, data.settings.wearing))
    const event = createLogEvent(task, data.events, data.settings, now, newId(), rewardRoll(), { stages: STAGES, rewards: REWARDS, streaks: STREAKS })
    if (!event) {
      render(now) // the screen was stale (e.g. the wake window just closed)
      return
    }

    // Save first: everything after this is feedback.
    const rect = button.getBoundingClientRect()
    commit(event)
    // A treat or a find is always good news, on top of the usual feedback. A normal log is unchanged.
    const bonus = treatBonus(event)
    const item = itemFor(event, REWARDS.items)
    // After the save: a find goes straight on if its spot is free. Never replaces a choice.
    if (item) {
      const next = wearOnFind(data.settings.wearing, item, foundItems(data.events, REWARDS.items), REWARDS.items)
      if (next !== data.settings.wearing) setWearing(next)
    }
    const wearingFind = item !== null && isWorn(wornNow(data.events, data.settings.wearing), item)
    if (item) homeOutfitHold = outfitBefore
    hush()
    haptic(item ? HAPTIC_ITEM : bonus > 0 ? HAPTIC_TREAT : HAPTIC_LOG)
    render(now)

    const fresh = el.list.querySelector<HTMLElement>(`button.task[data-task-id="${task.id}"]`)
    fresh?.classList.add('is-logged')
    floatXp(doc, rect, `+${event.xpAwarded} XP`)
    if (bonus > 0) floatXp(doc, rect, TREAT_FLOAT(bonus), true)
    react(el.art, item ? 'perk' : bonus > 0 ? 'treat' : 'log')
    const earnedFreeze = logEarnsFreeze(before, event, STREAKS)
    const logged = loggedToast(event.xpAwarded, task.name, bonus, item !== null, earnedFreeze)
    toast.show(logged, undoLast)
    // After a find's card the card has already celebrated it, so the toast is just the log.
    const afterCard = item ? loggedToast(event.xpAwarded, task.name, 0, false, earnedFreeze) : logged

    // The tapped button if it can still take focus (a once-a-day task is now done
    // and disabled), else the next task to log, else the dragon.
    const returnFocus = () =>
      el.list.querySelector<HTMLElement>(`button.task[data-task-id="${task.id}"]:not(:disabled)`) ??
      el.list.querySelector<HTMLElement>('button.task:not(:disabled)') ??
      el.art
    const background = doc.getElementById('app')

    // After every overlay has closed.
    const done = () => {
      updates.setBusy(false)
      // The find's card has been seen: now Home wears it (if it went on), with a little hop.
      if (homeOutfitHold) {
        homeOutfitHold = null
        render()
        if (wearingFind) react(el.art, 'perk')
      }
      // The overlay hid the treat's floats (or the find) and outlasted its toast: say it
      // again, with Undo while this log is still the one Undo would take back. After a
      // find it drops "Found something!", which the card has just said.
      if (bonus > 0 || item) {
        const stillLatest = undoableLog(data.events, Date.now())?.id === event.id
        toast.show(afterCard, stillLatest ? undoLast : undefined)
      }
    }
    // A find gets its own little card, after any stage-up or new-look moment.
    const showFind = () => {
      if (!item) return done()
      showItemFound(doc, {
        item,
        wearing: wearingFind,
        egg: dragonStage(data.events, STAGES).id === 'egg',
        milestone: rewardMilestone(event),
        reducedMotion: prefersReducedMotion(),
        background,
        returnFocus,
        onClose: done,
      })
    }

    // A stage-up gets the full moment. A look the dragon has never had gets a gentle
    // one; changing back to a look it has had before happens quietly (render did it).
    const reached = stageUp(before, data.events, STAGES)
    const lookBefore = evolution(before, tasks)
    const lookAfter = evolution(data.events, tasks)
    const newLook = lookChange(lookBefore, lookAfter)
    if (reached || newLook?.firstTime) {
      const from = dragonStage(before, STAGES)
      updates.setBusy(true)
      celebrate(doc, {
        from,
        to: reached ?? from,
        fromLook: lookBefore.look,
        toLook: lookAfter.look,
        newLook: newLook?.firstTime ? newLook.look : null,
        wearing: outfitBefore,
        reducedMotion: prefersReducedMotion(),
        background,
        // With a find to show next, focus goes straight to its card instead.
        returnFocus: item ? undefined : returnFocus,
        onClose: showFind,
      })
    } else if (item) {
      updates.setBusy(true)
      showFind()
    }
  })

  el.undo.addEventListener('click', undoLast)

  // The streak chip opens History, the same way its tab would.
  el.streakChip.addEventListener('click', () => nav.go('history'))

  // Decorative: a little bounce. Never logs anything.
  el.art.addEventListener('click', () => react(el.art, 'tap'))

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') {
      render()
      maybeWelcome()
    }
  })
  window.setInterval(() => render(), TICK_MS)

  // Another tab saved: pick up its events. In read-only mode, keep this session's
  // in-memory taps on screen instead.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && !readOnly) {
      ;({ data, readOnly, notice } = load())
      render()
    }
  })

  // Screens. Switching never logs or undoes anything, and Home keeps its state
  // (toast, task buttons) while hidden.
  const nav = createNav(doc, byId(doc, 'tabbar'), (next, from) => {
    route = next
    el.home.hidden = next !== 'home'
    el.dragonScreen.hidden = next !== 'dragon'
    el.collectionScreen.hidden = next !== 'collection'
    el.historyScreen.hidden = next !== 'history'
    el.settingsScreen.hidden = next !== 'settings'
    // History opens on this month with today selected.
    if (next === 'history') historyScreen.reset()
    if (from === null) return // the first render happens below
    if (from === 'settings' && next !== 'settings') {
      // Leaving Settings (a tab, back, or the address bar) closes any sheet without
      // saving. Focus was in it, so it goes to the tab for the screen now showing.
      const hadSheet = doc.querySelector('dialog.sheet[open]') !== null
      settingsScreen.closeSheets()
      if (hadSheet) doc.querySelector<HTMLElement>('#tabbar a.tab.is-active')?.focus({ preventScroll: true })
    }
    if (next !== 'home') {
      hush()
      // "+XP" floats live on <body> (position: fixed): don't let one drift over another screen.
      doc.querySelectorAll('.float-xp').forEach((f) => f.remove())
    }
    render()
    // Coming back to Home can show a welcome that hasn't been seen yet, never a repeat.
    if (next === 'home') maybeWelcome()
  })

  render()
  maybeWelcome()
  return { requestReload: () => updates.requestReload() }
}
