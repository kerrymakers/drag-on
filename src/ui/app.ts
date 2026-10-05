// The home screen: wires game logic and storage to the DOM.
// This is the only layer that reads the clock (Date.now) and generates ids.

import { STAGES } from '../config/stages'
import { TASKS } from '../config/tasks'
import { createLogEvent, createUndoEvent, undoableLog } from '../game/log'
import { stageFor, taskAvailability, totalXp, wakeDeadline } from '../game/state'
import { dayMinutesToClock } from '../game/day'
import type { GameEvent, Settings, Task, TaskAvailability } from '../game/types'
import { STORAGE_KEY, load, requestPersistence, save } from '../storage'
import { newId } from './ids'

const CAPTIONS: Record<string, string> = {
  egg: 'An egg is waiting…',
  hatchling: 'Your dragon has hatched!',
}

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

export function startApp(doc: Document): void {
  let { data, readOnly, notice } = load()
  if (readOnly) console.warn(`Not saving on this device (${notice}), so nothing stored is overwritten.`)
  void requestPersistence()

  const el = {
    name: byId(doc, 'dragon-name'),
    stage: byId(doc, 'stage-name'),
    xp: byId(doc, 'xp-total'),
    gain: byId(doc, 'xp-gain'),
    caption: byId(doc, 'dragon-caption'),
    list: byId<HTMLUListElement>(doc, 'task-list'),
    undo: byId<HTMLButtonElement>(doc, 'undo'),
  }

  let gainTimer: number | undefined
  function flash(text: string) {
    el.gain.textContent = text
    el.gain.classList.remove('is-showing')
    void el.gain.offsetWidth // restart the fade
    el.gain.classList.add('is-showing')
    window.clearTimeout(gainTimer)
    gainTimer = window.setTimeout(() => {
      el.gain.classList.remove('is-showing')
      el.gain.textContent = ''
    }, 1600)
  }

  function render(now = Date.now()) {
    const xp = totalXp(data.events)
    const stage = stageFor(xp, STAGES)
    el.name.textContent = data.settings.dragonName ?? 'your dragon'
    el.stage.textContent = stage.name
    el.xp.textContent = String(xp)
    el.caption.textContent = CAPTIONS[stage.id] ?? ''

    const items: HTMLLIElement[] = []
    for (const task of TASKS) {
      const a = taskAvailability(task, data.events, data.settings, now)
      if (a.visible) items.push(taskButton(doc, task, a, data.settings, now))
    }
    el.list.replaceChildren(...items)
    // The Undo row always keeps its space, so task buttons never shift under the thumb.
    const canUndo = undoableLog(data.events, now) !== null
    el.undo.classList.toggle('is-idle', !canUndo)
    el.undo.disabled = !canUndo
    el.undo.setAttribute('aria-hidden', String(!canUndo))
  }

  /**
   * Memory is the source of truth for this session, and the whole state is saved
   * from it. A failed save never loses the tap. In read-only mode we never save,
   * so data we couldn't read or back up is never overwritten.
   */
  function commit(event: GameEvent) {
    data = { ...data, events: [...data.events, event] }
    if (readOnly) return
    try {
      save(data)
    } catch (err) {
      console.warn('Could not save to this device', err)
    }
  }

  el.list.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button.task')
    const task = TASKS.find((t) => t.id === button?.dataset.taskId)
    if (!task) return
    const now = Date.now()
    const event = createLogEvent(task, data.events, data.settings, now, newId())
    if (event) {
      commit(event)
      flash(`+${event.xpAwarded} XP`)
    }
    render(now)
  })

  el.undo.addEventListener('click', () => {
    const now = Date.now()
    const event = createUndoEvent(data.events, now, newId())
    if (event) {
      commit(event)
      flash('Undone')
    }
    render(now)
  })

  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'visible') render()
  })

  // Another tab saved: pick up its events. In read-only mode, keep this session's
  // in-memory taps on screen instead.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY && !readOnly) {
      ;({ data, readOnly, notice } = load())
      render()
    }
  })

  render()
}
