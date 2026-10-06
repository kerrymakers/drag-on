// The app shell: wires game logic, storage and art to the Home and Dragon screens.
// This is the only layer that reads the clock (Date.now) and generates ids.

import { react, renderDragon, speechAnchor } from '../art'
import { EVOLVES_AT_STAGE, LOOK_CHANGE_MARGIN } from '../config/evolution'
import { MOODS } from '../config/mood'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { TASKS } from '../config/tasks'
import { dayKey, dayMinutesToClock } from '../game/day'
import { evolutionLook, lookChange, type Evolution } from '../game/evolution'
import { createLogEvent, createUndoEvent, undoableLog } from '../game/log'
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
import type { GameEvent, Settings, Task, TaskAvailability } from '../game/types'
import { STORAGE_KEY, load, requestPersistence, save } from '../storage'
import { celebrate } from './celebrate'
import { LOGGED, MOOD_LABELS, NOTICES, UNDONE, noticeFor, progressLabel, welcomeLine } from './copy'
import { createDragonScreen } from './dragon-screen'
import { newId } from './ids'
import { createNav, type Route } from './nav'
import { watchScrollFade } from './scroll-fade'
import { placeSpeech } from './speech'
import { createToast } from './toast'
import { createUpdateGate } from './updates'
import { createWelcome } from './welcome'

const SPEECH_MS = 4000

const EVOLUTION_RULES = { evolvesAt: EVOLVES_AT_STAGE, margin: LOOK_CHANGE_MARGIN }

/** The dragon's evolution look and every look it has had, derived from the log. */
function evolution(events: readonly GameEvent[]): Evolution {
  return evolutionLook(events, TASKS, STATS, STAGES, EVOLUTION_RULES)
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

function haptic() {
  try {
    navigator.vibrate?.(30)
  } catch {
    // Not supported or not allowed: the visual feedback is enough.
  }
}

/** "+40 XP" rising from the button that was tapped. */
function floatXp(doc: Document, from: DOMRect, text: string) {
  const el = doc.createElement('span')
  el.className = 'float-xp'
  el.textContent = text
  el.setAttribute('aria-hidden', 'true')
  el.style.left = `${from.right - 24}px`
  el.style.top = `${from.top + 6}px`
  doc.body.append(el)
  window.setTimeout(() => el.remove(), 900)
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
  }
  const dragonScreen = createDragonScreen(doc, el.dragonScreen, { tasks: TASKS, stats: STATS, stages: STAGES })
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
  function say(text: string) {
    const bubble = el.speech
    bubble.textContent = text
    // Beside the dragon's head, clear of its face, headgear and zzz.
    const area = bubble.parentElement?.getBoundingClientRect()
    const avoid = speechAnchor(el.art)
    if (area && avoid) {
      const p = placeSpeech(area, avoid, (maxWidth, compact) => {
        bubble.style.maxWidth = `${maxWidth}px`
        bubble.classList.toggle('is-compact', compact)
        return { width: bubble.offsetWidth, height: bubble.offsetHeight }
      })
      bubble.style.maxWidth = `${p.maxWidth}px`
      bubble.classList.toggle('is-compact', p.compact)
      bubble.style.left = `${Math.round(p.left)}px`
      bubble.style.top = `${Math.round(p.top)}px`
      bubble.dataset.tail = p.tail
    }
    bubble.classList.add('is-showing')
    window.clearTimeout(speechTimer)
    speechTimer = window.setTimeout(hush, SPEECH_MS)
  }
  function hush() {
    window.clearTimeout(speechTimer)
    el.speech.classList.remove('is-showing')
  }

  /**
   * On opening (or coming back to) the app after a gap: a pleased hello, at most once
   * per gap per mood level (sleepy, then curled up). Only while the page is visible,
   * so a PWA restored in the background doesn't use it up.
   */
  function maybeWelcome(now = Date.now()) {
    if (doc.visibilityState !== 'visible' || route !== 'home') return
    const { mood, lastLogDay } = moodFor(data.events, now, MOODS)
    if (!welcome.shouldWelcome(mood, lastLogDay)) return
    const line = welcomeLine(mood, dayKey(now))
    if (!line) return
    welcome.markWelcomed(mood, lastLogDay)
    say(line) // place it first, before the perk-up moves the art
    react(el.art, 'perk')
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
    const { look } = evolution(data.events)
    el.mood.textContent = MOOD_LABELS[mood]
    el.mood.dataset.mood = mood
    renderDragon(el.art, { stage: progress.stage.id, progress: progress.fraction, mood, look })

    const label = progressLabel(progress.stage.id, progress.xpToNext, progress.next?.name ?? null)
    el.label.textContent = label
    el.xp.textContent = String(xp)
    const percent = Math.round(progress.fraction * 100)
    el.fill.style.width = `${percent}%`
    el.bar.setAttribute('aria-valuenow', String(percent))
    el.bar.setAttribute('aria-valuetext', label)

    // Only rebuild the buttons when something about them changed, so a tick never
    // swaps a button out from under a finger or drops keyboard focus.
    const visible = TASKS.map((task) => ({
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
        settings: data.settings,
        stage: progress.stage,
        progress: progress.fraction,
        mood,
        look,
        now,
      })
    }

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
    if (readOnly) return
    try {
      save(data)
    } catch (err) {
      console.warn('Could not save to this device', err)
      showNotice(NOTICES.saveFailed)
    }
  }

  function undoLast() {
    const now = Date.now()
    const event = createUndoEvent(data.events, now, newId())
    if (event) {
      commit(event)
      toast.show(UNDONE)
    }
    render(now)
  }

  el.list.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button.task')
    const task = TASKS.find((t) => t.id === button?.dataset.taskId)
    if (!button || !task) return
    const now = Date.now()
    const before = data.events
    const event = createLogEvent(task, data.events, data.settings, now, newId(), STAGES)
    if (!event) {
      render(now) // the screen was stale (e.g. the wake window just closed)
      return
    }

    // Save first: everything after this is feedback.
    const rect = button.getBoundingClientRect()
    commit(event)
    hush()
    haptic()
    render(now)

    const fresh = el.list.querySelector<HTMLElement>(`button.task[data-task-id="${task.id}"]`)
    fresh?.classList.add('is-logged')
    floatXp(doc, rect, `+${event.xpAwarded} XP`)
    react(el.art, 'log')
    toast.show(LOGGED(event.xpAwarded, task.name), undoLast)

    // A stage-up gets the full moment. A look the dragon has never had gets a gentle
    // one; changing back to a look it has had before happens quietly (render did it).
    const reached = stageUp(before, data.events, STAGES)
    const lookBefore = evolution(before)
    const lookAfter = evolution(data.events)
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
        reducedMotion: prefersReducedMotion(),
        background: doc.getElementById('app'),
        // The tapped button if it can still take focus (a once-a-day task is now done
        // and disabled), else the next task to log, else the dragon.
        returnFocus: () =>
          el.list.querySelector<HTMLElement>(`button.task[data-task-id="${task.id}"]:not(:disabled)`) ??
          el.list.querySelector<HTMLElement>('button.task:not(:disabled)') ??
          el.art,
        onClose: () => updates.setBusy(false),
      })
    }
  })

  el.undo.addEventListener('click', undoLast)

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
  createNav(doc, byId(doc, 'tabbar'), (next, from) => {
    route = next
    el.home.hidden = next !== 'home'
    el.dragonScreen.hidden = next !== 'dragon'
    if (from === null) return // the first render happens below
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
