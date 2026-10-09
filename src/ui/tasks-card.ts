// Settings' Tasks card (Milestone 6, slice 3): the active tasks, an "Add a task"
// button and the archived tasks, folded away. Tapping a task opens a bottom sheet to
// change its name, how hard it is (Milestone 7: an effort level, which sets its XP)
// and times a day, or archive it. Adding uses the same sheet plus
// a stat picker; the stat is fixed once the task exists.
//
// Changes apply on Done, never while typing. Archiving needs no confirmation: it can
// be undone with Unarchive, and the task's history is kept either way.

import { cutText } from '../game/settings'
import {
  cleanTaskName,
  effortLevel,
  hasRoomForTask,
  shownEffort,
  maxTimesADay,
  timesADay,
  type NewTask,
  type TaskChanges,
  type TaskLimits,
} from '../game/tasks'
import type { EffortId, EffortLevel, Stat, StatId, Task } from '../game/types'
import {
  SETTINGS,
  TASKS_COPY,
  effortChoiceLabel,
  effortTimesHint,
  effortXp,
  legacyTimesHint,
  legacyXpHint,
  taskAdded,
  taskArchived,
  taskRowLabel,
  taskStatLine,
  taskUnarchived,
  timesADayLabel,
  unarchiveLabel,
  xpValue,
} from './copy'
import { ICONS } from './icons'

export interface TasksCardConfig {
  stats: readonly Stat[]
  limits: TaskLimits
  /** "How hard is this for you?": the effort levels (config). */
  levels: readonly EffortLevel[]
  /** A new task's starting effort level and times a day (config). */
  newTask: { effort: EffortId; timesADay: number }
  /** Each returns whether the change was made. */
  onAdd(draft: NewTask): boolean
  onUpdate(id: string, changes: TaskChanges): boolean
  onArchive(id: string): boolean
  onUnarchive(id: string): boolean
  /** A short message in Settings' toast. */
  say(message: string): void
  /** The small "Saved" beside the card's title. */
  saved(): void
  /** Whether the app can't save on this phone right now (says why a change didn't save). */
  readOnly(): boolean
  reducedMotion(): boolean
}

export interface TasksCard {
  /** The card, with its title row (the caller adds the "Saved" note to `head`). */
  el: HTMLElement
  head: HTMLElement
  render(tasks: readonly Task[], readOnly: boolean): void
  /** Closes an open task sheet without saving anything (e.g. on leaving Settings). */
  closeSheet(): void
}

const STAT_ICON: Record<StatId, string> = {
  strength: ICONS.strength,
  discipline: ICONS.discipline,
  wisdom: ICONS.wisdom,
  heart: ICONS.heart,
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string) {
  const e = doc.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * Arrow keys for a group of role="radio" buttons, with a roving tabindex: Tab reaches
 * the group once (on the checked one, or the first if none is), and the arrows move
 * between choices and choose, wrapping at the ends, as native radios do.
 */
function rovingRadios(buttons: readonly HTMLButtonElement[]) {
  buttons.forEach((b) => {
    b.addEventListener('keydown', (e) => {
      // Choices that are off right now (e.g. more times a day than a level allows) are skipped.
      const open = buttons.filter((x) => !x.disabled)
      const i = open.indexOf(b)
      const n = open.length
      const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
      const to = e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : step && i >= 0 ? (i + step + n) % n : -1
      if (to < 0 || n === 0) return
      e.preventDefault()
      const next = open[to]
      next?.focus()
      next?.click()
    })
  })
}

/**
 * After the checked state changes: only the checked radio (or the first one that's on)
 * is in the Tab order.
 */
function syncRoving(buttons: readonly HTMLButtonElement[]) {
  const checked = buttons.findIndex((b) => b.getAttribute('aria-checked') === 'true' && !b.disabled)
  const stop = checked >= 0 ? checked : buttons.findIndex((b) => !b.disabled)
  buttons.forEach((b, i) => (b.tabIndex = i === stop ? 0 : -1))
}

function button(doc: Document, className: string, text = ''): HTMLButtonElement {
  const b = el(doc, 'button', className, text)
  b.type = 'button'
  return b
}

export function createTasksCard(doc: Document, config: TasksCardConfig): TasksCard {
  const statName = (id: StatId) => config.stats.find((s) => s.id === id)?.name ?? id

  const card = el(doc, 'section', 'ds-card ss-tasks')
  card.setAttribute('aria-labelledby', 'ss-tasks-title')
  const head = el(doc, 'div', 'ss-card-head')
  const title = el(doc, 'h2', 'ds-card-title', TASKS_COPY.title)
  title.id = 'ss-tasks-title'
  title.tabIndex = -1
  head.append(title)
  const intro = el(doc, 'p', 'ss-text', TASKS_COPY.intro)
  const list = el(doc, 'ul', 'ss-task-list')
  list.setAttribute('aria-labelledby', 'ss-tasks-title')
  const addButton = button(doc, 'ss-button', TASKS_COPY.add)
  addButton.id = 'ss-add-task'
  const full = el(doc, 'p', 'ss-note', TASKS_COPY.full(config.limits.maxActive))
  full.id = 'ss-tasks-full'
  full.hidden = true
  const archived = el(doc, 'details', 'ss-archived')
  const archivedSummary = el(doc, 'summary', 'ss-archived-summary')
  const archivedList = el(doc, 'ul', 'ss-task-list is-archived')
  archived.append(archivedSummary, archivedList)
  const paused = el(doc, 'p', 'ss-note', SETTINGS.editsPaused)
  paused.hidden = true
  card.append(head, intro, list, addButton, full, archived, paused)

  /** A small round icon in the stat's colours. */
  function statIcon(stat: StatId): HTMLElement {
    const icon = el(doc, 'span', 'ss-task-icon tinted')
    icon.dataset.stat = stat
    icon.innerHTML = STAT_ICON[stat]
    icon.setAttribute('aria-hidden', 'true')
    return icon
  }

  let shown: readonly Task[] = []
  /** Closes the open sheet without saving, if there is one. */
  let closeOpenSheet: ((restoreFocus: boolean) => void) | null = null
  let readOnlyNow = false
  let signature = ''

  function row(task: Task): HTMLLIElement {
    const li = el(doc, 'li', 'ss-task')
    const b = button(doc, 'ss-task-row')
    b.dataset.taskId = task.id
    b.disabled = readOnlyNow
    const stat = statName(task.stat)
    // How hard it is, or its XP for an older task with no level yet.
    const hardness = shownEffort(task, config.levels)?.label ?? xpValue(task.xp)
    b.setAttribute('aria-label', taskRowLabel(task.name, stat, hardness))
    const text = el(doc, 'span', 'ss-task-text')
    const meta = el(doc, 'span', 'ss-task-meta')
    meta.setAttribute('aria-hidden', 'true')
    meta.append(statIcon(task.stat), el(doc, 'span', 'ss-task-stat', stat), el(doc, 'span', 'ss-task-xp', hardness))
    text.append(el(doc, 'span', 'ss-task-name', task.name), meta)
    const chevron = el(doc, 'span', 'ss-task-chevron')
    chevron.innerHTML = ICONS.chevronRight
    b.append(text, chevron)
    li.append(b)
    return li
  }

  function archivedRow(task: Task, room: boolean): HTMLLIElement {
    const li = el(doc, 'li', 'ss-task is-archived')
    const text = el(doc, 'span', 'ss-task-text')
    const meta = el(doc, 'span', 'ss-task-meta')
    meta.append(statIcon(task.stat), el(doc, 'span', 'ss-task-stat', statName(task.stat)))
    text.append(el(doc, 'span', 'ss-task-name', task.name), meta)
    const b = button(doc, 'ss-small-button', TASKS_COPY.unarchive)
    b.dataset.unarchive = task.id
    b.setAttribute('aria-label', unarchiveLabel(task.name))
    b.disabled = readOnlyNow || !room
    if (!room && !readOnlyNow) b.setAttribute('aria-describedby', full.id)
    li.append(text, b)
    return li
  }

  function render(tasks: readonly Task[], readOnly: boolean) {
    shown = tasks
    readOnlyNow = readOnly
    const room = hasRoomForTask(tasks, config.limits)
    const sig = JSON.stringify([readOnly, tasks.map((t) => [t.id, t.name, t.stat, t.xp, t.effort ?? null, t.archived])])
    if (sig === signature) return
    signature = sig
    // Rebuilt only when something changed, keeping focus on the same row if it had it.
    const focused = (doc.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-task-id],[data-unarchive]')
    const refocus = focused && card.contains(focused) ? { ...focused.dataset } : null

    const active = tasks.filter((t) => !t.archived)
    const gone = tasks.filter((t) => t.archived)
    list.replaceChildren(...active.map(row))
    archivedList.replaceChildren(...gone.map((t) => archivedRow(t, room)))
    archived.hidden = gone.length === 0
    archivedSummary.textContent = TASKS_COPY.archivedTitle(gone.length)
    addButton.disabled = readOnly || !room
    full.hidden = readOnly || room
    if (!room && !readOnly) addButton.setAttribute('aria-describedby', full.id)
    else addButton.removeAttribute('aria-describedby')
    paused.hidden = !readOnly

    if (refocus?.taskId) list.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(refocus.taskId)}"]`)?.focus({ preventScroll: true })
    if (refocus?.unarchive) {
      const again = archivedList.querySelector<HTMLButtonElement>(`[data-unarchive="${CSS.escape(refocus.unarchive)}"]`)
      ;(again && !again.disabled ? again : archivedSummary).focus({ preventScroll: true })
    }
  }

  list.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button.ss-task-row')
    const task = shown.find((t) => t.id === b?.dataset.taskId)
    if (!b || !task || readOnlyNow) return
    openSheet(task)
  })
  archivedList.addEventListener('click', (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-unarchive]')
    const task = shown.find((t) => t.id === b?.dataset.unarchive)
    if (!b || !task || readOnlyNow) return
    if (config.onUnarchive(task.id)) config.say(taskUnarchived(task.name))
  })
  addButton.addEventListener('click', () => {
    if (readOnlyNow || !hasRoomForTask(shown, config.limits)) return
    openSheet(null)
  })

  /** The edit sheet for `task`, or the add sheet for null. */
  function openSheet(task: Task | null) {
    const adding = task === null
    const limits = config.limits
    const levels = config.levels
    // The chosen level: its saved one, or for an older task the one worth exactly its XP
    // (saved onto it on Done), else none (it keeps its XP until one is picked).
    let effort: EffortId | null = task ? (shownEffort(task, levels)?.id ?? null) : config.newTask.effort
    /** The most times a day for the level chosen (or the task's XP, with none). */
    const topTimes = () => maxTimesADay({ xp: task?.xp ?? 0, ...(effort !== null ? { effort } : {}) }, levels, limits)
    const storedTimes = task ? timesADay(task) : null
    const fixedRules = task !== null && timesADay(task) === null
    // A level shown for an older task is saved on Done, so its cap shows from the start.
    let times = Math.min(task ? (timesADay(task) ?? 1) : config.newTask.timesADay, effort !== null ? topTimes() : Infinity)
    let stat: StatId | null = task?.stat ?? null

    const sheet = el(doc, 'dialog', 'sheet task-sheet')
    sheet.setAttribute('aria-labelledby', 'task-sheet-title')
    if (config.reducedMotion()) sheet.classList.add('is-calm')
    const body = el(doc, 'div', 'sheet-card')
    const heading = el(doc, 'h2', 'sheet-title', adding ? TASKS_COPY.addHeading : TASKS_COPY.editHeading)
    heading.id = 'task-sheet-title'
    // Focus lands on the heading, so the keyboard doesn't pop up over the sheet.
    heading.tabIndex = -1
    heading.autofocus = true

    // Name
    const nameField = el(doc, 'label', 'ts-field')
    const nameLabel = el(doc, 'span', 'ts-label', TASKS_COPY.nameLabel)
    const name = el(doc, 'input', 'ss-input')
    name.id = 'task-sheet-name'
    name.type = 'text'
    name.value = task?.name ?? ''
    name.placeholder = TASKS_COPY.namePlaceholder
    name.autocomplete = 'off'
    name.setAttribute('autocapitalize', 'sentences')
    name.enterKeyHint = 'done'
    nameField.append(nameLabel, name)

    // Stat: chosen when adding, then shown as a plain line.
    const statBlock = el(doc, 'div', 'ts-field')
    const statButtons = new Map<StatId, HTMLButtonElement>()
    if (adding) {
      const label = el(doc, 'span', 'ts-label', TASKS_COPY.statLabel)
      label.id = 'task-sheet-stat'
      const group = el(doc, 'div', 'ts-stats')
      group.setAttribute('role', 'radiogroup')
      group.setAttribute('aria-labelledby', label.id)
      for (const s of config.stats) {
        const b = button(doc, 'ts-stat')
        b.setAttribute('role', 'radio')
        b.dataset.stat = s.id
        b.classList.add('tinted')
        const icon = el(doc, 'span', 'ts-stat-icon')
        icon.innerHTML = STAT_ICON[s.id]
        b.append(icon, el(doc, 'span', 'ts-stat-name', s.name))
        b.addEventListener('click', () => {
          stat = s.id
          update()
        })
        group.append(b)
        statButtons.set(s.id, b)
      }
      rovingRadios([...statButtons.values()])
      const note = el(doc, 'p', 'sheet-text ts-note', TASKS_COPY.statFixed)
      statBlock.append(label, group, note)
    } else if (task) {
      const line = el(doc, 'p', 'ts-stat-line')
      line.append(statIcon(task.stat), el(doc, 'span', '', taskStatLine(statName(task.stat))))
      statBlock.append(line)
    }

    // How hard is this for you? One level each, worth its XP.
    const effortField = el(doc, 'div', 'ts-field')
    const effortLabel = el(doc, 'span', 'ts-label', TASKS_COPY.effortLabel)
    effortLabel.id = 'task-sheet-effort'
    const effortGroup = el(doc, 'div', 'ts-efforts')
    effortGroup.setAttribute('role', 'radiogroup')
    effortGroup.setAttribute('aria-labelledby', effortLabel.id)
    const effortButtons = new Map<EffortId, HTMLButtonElement>()
    for (const level of levels) {
      const b = button(doc, 'ts-effort')
      b.setAttribute('role', 'radio')
      b.dataset.effort = level.id
      b.setAttribute('aria-label', effortChoiceLabel(level.label, level.xp))
      b.append(el(doc, 'span', 'ts-effort-name', level.label), el(doc, 'span', 'ts-effort-xp', effortXp(level.xp)))
      b.addEventListener('click', () => {
        effort = level.id
        // A harder level brings times a day down to fit.
        times = Math.min(times, topTimes())
        update()
      })
      effortGroup.append(b)
      effortButtons.set(level.id, b)
    }
    rovingRadios([...effortButtons.values()])
    effortField.append(effortLabel, effortGroup)
    // An older task with no level: what it's worth now, until a level is picked.
    const legacyHint = el(doc, 'p', 'sheet-text ts-note')
    legacyHint.id = 'task-sheet-effort-hint'
    if (task && effort === null) {
      legacyHint.textContent = legacyXpHint(task.xp)
      effortGroup.setAttribute('aria-describedby', legacyHint.id)
      effortField.append(legacyHint)
    }

    // Times a day: 1 / 2 / 3. Not for the wake-up task (its schedule decides). A harder
    // level allows fewer: those choices are off, with a short line saying why.
    const timesField = el(doc, 'div', 'ts-field')
    const timesHint = el(doc, 'p', 'sheet-text ts-note')
    timesHint.id = 'task-sheet-times-hint'
    timesHint.setAttribute('aria-live', 'polite')
    const timesButtons = new Map<number, HTMLButtonElement>()
    if (!fixedRules) {
      const label = el(doc, 'span', 'ts-label', TASKS_COPY.timesLabel)
      label.id = 'task-sheet-times'
      const group = el(doc, 'div', 'ts-segments')
      group.setAttribute('role', 'radiogroup')
      group.setAttribute('aria-labelledby', label.id)
      for (let n = 1; n <= limits.timesADayMax; n++) {
        const b = button(doc, 'ts-segment', String(n))
        b.setAttribute('role', 'radio')
        b.setAttribute('aria-label', timesADayLabel(n))
        b.dataset.times = String(n)
        b.addEventListener('click', () => {
          times = n
          update()
        })
        group.append(b)
        timesButtons.set(n, b)
      }
      rovingRadios([...timesButtons.values()])
      timesField.append(label, group, timesHint)
    }

    // Why Done didn't save, if it couldn't. Stays until the sheet closes.
    const problem = el(doc, 'p', 'ss-status')
    problem.id = 'task-sheet-problem'
    problem.setAttribute('role', 'status')
    problem.hidden = true
    const actions = el(doc, 'div', 'sheet-actions')
    const done = button(doc, 'ss-button is-primary', TASKS_COPY.done)
    done.id = 'task-sheet-done'
    const cancel = button(doc, 'ss-button', TASKS_COPY.cancel)
    cancel.id = 'task-sheet-cancel'
    actions.append(done, cancel)

    body.append(heading, nameField, statBlock, effortField)
    if (!fixedRules) body.append(timesField)
    if (!adding) body.append(el(doc, 'p', 'sheet-text ts-next', TASKS_COPY.nextLog))
    body.append(problem, actions)
    let archive: HTMLButtonElement | null = null
    if (task) {
      const archiveBox = el(doc, 'div', 'ts-archive')
      archive = button(doc, 'ts-archive-button', TASKS_COPY.archive)
      archive.id = 'task-sheet-archive'
      const note = el(doc, 'p', 'sheet-text ts-note', TASKS_COPY.archiveNote)
      note.id = 'task-sheet-archive-note'
      archive.setAttribute('aria-describedby', note.id)
      archiveBox.append(archive, note)
      body.append(archiveBox)
      archive.addEventListener('click', () => {
        if (closed) return
        if (!config.onArchive(task.id)) return couldNotSave()
        close()
        config.say(taskArchived(task.name))
      })
    }
    sheet.append(body)
    doc.body.append(sheet)

    function update() {
      const top = topTimes()
      for (const [n, b] of timesButtons) {
        b.setAttribute('aria-checked', String(n === times))
        // An older task's own times a day stays on until a level is picked, even over its cap.
        b.disabled = n > top && !(effort === null && n === storedTimes)
      }
      // An older task already saved over its own cap keeps that choice: no line that
      // would contradict it.
      const capped = top < limits.timesADayMax && times <= top
      const level = effort !== null ? effortLevel(effort, levels) : null
      timesHint.textContent = !capped ? '' : level ? effortTimesHint(level.label, top) : legacyTimesHint(task?.xp ?? 0, top)
      timesHint.hidden = !capped
      const group = timesField.querySelector('[role="radiogroup"]')
      if (capped) group?.setAttribute('aria-describedby', timesHint.id)
      else group?.removeAttribute('aria-describedby')
      // Once a level is picked, "Currently 30 XP" no longer applies.
      legacyHint.hidden = effort !== null
      if (effort !== null) effortGroup.removeAttribute('aria-describedby')
      for (const [id, b] of effortButtons) b.setAttribute('aria-checked', String(id === effort))
      for (const [id, b] of statButtons) b.setAttribute('aria-checked', String(id === stat))
      syncRoving([...timesButtons.values()])
      syncRoving([...effortButtons.values()])
      syncRoving([...statButtons.values()])
      done.disabled = blocked || cleanTaskName(name.value, limits) === null || stat === null || (adding && effort === null)
    }

    /**
     * Done (or Archive) couldn't save: say why and keep the sheet open, so nothing typed
     * is lost. While the app can't save, Done and Archive stay off and focus goes to Cancel.
     */
    let blocked = false
    function couldNotSave() {
      const paused = config.readOnly()
      problem.textContent = paused ? SETTINGS.editsPaused : TASKS_COPY.full(limits.maxActive)
      problem.hidden = false
      blocked = true
      if (archive) archive.disabled = paused
      update()
      cancel.focus({ preventScroll: true })
    }
    name.addEventListener('input', () => {
      // Kept within the limit as it's typed, counted as people count characters.
      const cut = cutText(name.value, limits.nameMax)
      if (cut !== name.value) name.value = cut
      update()
    })
    name.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return
      e.preventDefault()
      name.blur()
    })
    update()

    let closed = false
    const close = (restoreFocus = true) => {
      if (closed) return
      closed = true
      closeOpenSheet = null
      sheet.close()
      sheet.remove()
      if (!restoreFocus) return
      // Back to where the sheet was opened from (a rebuilt row is found again by id),
      // else Add, else the card's title, never nowhere.
      const back =
        (task && list.querySelector<HTMLButtonElement>(`[data-task-id="${CSS.escape(task.id)}"]`)) || addButton
      if (!back.disabled) back.focus({ preventScroll: true })
      else title.focus({ preventScroll: true })
    }
    closeOpenSheet?.(false)
    closeOpenSheet = close

    done.addEventListener('click', () => {
      if (closed || done.disabled) return
      const cleanName = cleanTaskName(name.value, limits)
      if (cleanName === null) return
      if (adding) {
        if (stat === null || effort === null) return
        if (!config.onAdd({ name: cleanName, stat, effort, timesADay: times })) return couldNotSave()
        close()
        config.say(taskAdded(cleanName))
        return
      }
      const changes: TaskChanges = {}
      if (cleanName !== task.name) changes.name = cleanName
      // Picking a level (a new one, or a first one for an older task) sets its XP.
      if (effort !== null && effort !== task.effort) changes.effort = effort
      if (!fixedRules && times !== timesADay(task)) changes.timesADay = times
      if (Object.keys(changes).length === 0) return close()
      if (!config.onUpdate(task.id, changes)) return couldNotSave()
      close()
      config.saved()
    })
    cancel.addEventListener('click', () => close())
    // Escape, or the back gesture's cancel.
    sheet.addEventListener('close', () => close())
    // A tap on the dimmed backdrop (outside the card) is a cancel. Only when it starts
    // there too: a text selection dragged out of the name field ends with a click on the
    // dialog, and that mustn't throw the edits away.
    let downOnBackdrop = false
    sheet.addEventListener('pointerdown', (e) => {
      downOnBackdrop = e.target === sheet
    })
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet && downOnBackdrop) close()
      downOnBackdrop = false
    })
    sheet.showModal()
    heading.focus({ preventScroll: true })
  }

  return { el: card, head, render, closeSheet: () => closeOpenSheet?.(false) }
}
