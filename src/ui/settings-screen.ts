// The Settings screen: the dragon's name, the tasks, the wake-up times and Backup
// (export and import), each a card in one scrolling column. The Tasks card and its
// edit sheet live in tasks-card.ts.
//
// The name and the wake-up times save as soon as they change, with a small "Saved"
// beside the card's title. There's no save button and nothing to confirm.
//
// Import asks first, in a sheet that says what's in the file. That's fine here: it's
// nowhere near the logging path, and it replaces everything on the phone.

import { activeLogs } from '../game/active'
import { dayKey, isClockTime } from '../game/day'
import { cleanDragonName, WEEKDAYS } from '../game/settings'
import { dragonStage } from '../game/state'
import type { NewTask, TaskChanges, TaskLimits } from '../game/tasks'
import type { Stage, Stat, Task, WakeSchedule, Weekday } from '../game/types'
import type { SaveData } from '../storage'
import { readBackup, type BackupCheck } from '../storage/backup'
import {
  IMPORT_CONFIRM,
  IMPORT_REFUSED,
  SETTINGS,
  WEEKDAY_NAMES,
  friendlyDay,
  importDropped,
  lastBackupLine,
  wakeSwitchLabel,
  wakeTimeLabel,
} from './copy'
import { watchScrollFade } from './scroll-fade'
import { createTasksCard } from './tasks-card'
import { createToast } from './toast'

export type ReadyBackup = Extract<BackupCheck, { ok: true }>

export interface SettingsScreenState {
  dragonName: string | null
  /** The wake schedule in force today. */
  wakeSchedule: WakeSchedule
  /** Every task, archived ones too (see effectiveTasks). */
  tasks: readonly Task[]
  /** When the last backup was made (or the imported one was exported), if ever. */
  lastBackupAt: number | undefined
  /** Import, the name, the tasks and the wake-up times are off while the app can't save on this phone. */
  readOnly: boolean
  now: number
}

/** What the app does when asked. Each returns a message for the screen to show. */
export type SettingsOutcome = { ok: true; message: string } | { ok: false; message: string }

export interface SettingsScreenConfig {
  stages: readonly Stage[]
  /** The longest name allowed (config). */
  nameMax: number
  /** The time a day gets when switched on, with no earlier time this session (config). */
  defaultWakeTime: string
  /** Save a new name (already tidied; null for none). */
  onRename(name: string | null): void
  /** Save a new wake schedule, from today on. */
  onSchedule(schedule: WakeSchedule): void
  stats: readonly Stat[]
  /** Bounds for task editing (config). */
  taskLimits: TaskLimits
  /** A new task's starting XP and times a day (config). */
  newTask: { xp: number; timesADay: number }
  /** Task edits. Each returns whether the change was made. */
  onAddTask(draft: NewTask): boolean
  onUpdateTask(id: string, changes: TaskChanges): boolean
  onArchiveTask(id: string): boolean
  onUnarchiveTask(id: string): boolean
  /** Download a backup file. */
  onExport(): SettingsOutcome
  /** Replace this phone's data with a checked backup the user has confirmed. */
  onImport(backup: ReadyBackup): SettingsOutcome
  /** The clock, for the confirm sheet's dates. */
  now(): number
  reducedMotion(): boolean
}

export interface SettingsScreen {
  render(state: SettingsScreenState): void
  /** Scrolls the Backup card into view (instantly under reduced motion). */
  revealBackup(): void
  /** Closes any open sheet without changing anything (on leaving Settings). */
  closeSheets(): void
}

const SAVED_MS = 2000

export interface ImportSummary {
  /** Logs that count (undone ones left out). */
  logs: number
  /** The stage the file's logs reach, by this version's thresholds. */
  stage: string
  /** The export date as a friendly day ("5 Oct"), or null if the file doesn't say. */
  saved: string | null
}

/** What the confirm sheet says about a backup: how much is in it and how grown the dragon is. */
export function importSummary(
  data: SaveData,
  exportedAt: number | null,
  now: number,
  stages: readonly Stage[],
): ImportSummary {
  return {
    logs: activeLogs(data.events).length,
    stage: dragonStage(data.events, stages).name,
    saved: exportedAt === null ? null : friendlyDay(dayKey(exportedAt), dayKey(now)),
  }
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string) {
  const e = doc.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

function button(doc: Document, className: string, text: string): HTMLButtonElement {
  const b = el(doc, 'button', className, text)
  b.type = 'button'
  return b
}

export function createSettingsScreen(doc: Document, root: HTMLElement, config: SettingsScreenConfig): SettingsScreen {
  const scroller = el(doc, 'div', 'ss-scroll scroll-fade')
  const title = el(doc, 'h1', 'ss-title', SETTINGS.title)
  title.id = 'ss-title'

  // Backup
  const backup = el(doc, 'section', 'ds-card ss-backup')
  backup.setAttribute('aria-labelledby', 'ss-backup-title')
  const backupTitle = el(doc, 'h2', 'ds-card-title', SETTINGS.backupTitle)
  backupTitle.id = 'ss-backup-title'
  const intro = el(doc, 'p', 'ss-text', SETTINGS.backupIntro)
  const last = el(doc, 'p', 'ss-last')
  const exportButton = button(doc, 'ss-button is-primary', SETTINGS.export)
  exportButton.id = 'ss-export'
  const importButton = button(doc, 'ss-button', SETTINGS.import)
  importButton.id = 'ss-import'
  const paused = el(doc, 'p', 'ss-note', SETTINGS.importPaused)
  paused.id = 'ss-import-paused'
  paused.hidden = true
  // Problems stay on the card until the next try, rather than vanishing with a toast.
  const status = el(doc, 'p', 'ss-status')
  status.setAttribute('role', 'status')
  status.hidden = true
  const picker = el(doc, 'input', 'visually-hidden')
  picker.type = 'file'
  picker.accept = 'application/json,.json'
  picker.tabIndex = -1
  picker.setAttribute('aria-hidden', 'true')
  picker.id = 'ss-import-file'
  backup.append(backupTitle, intro, last, exportButton, importButton, paused, status, picker)

  // Name
  const nameCard = el(doc, 'section', 'ds-card ss-name')
  nameCard.setAttribute('aria-labelledby', 'ss-name-title')
  const nameHead = el(doc, 'div', 'ss-card-head')
  const nameTitle = el(doc, 'h2', 'ds-card-title', SETTINGS.nameTitle)
  nameTitle.id = 'ss-name-title'
  const nameSaved = savedNote()
  nameHead.append(nameTitle, nameSaved.el)
  const nameInput = el(doc, 'input', 'ss-input')
  nameInput.id = 'ss-name'
  nameInput.type = 'text'
  nameInput.placeholder = SETTINGS.namePlaceholder
  nameInput.autocomplete = 'off'
  nameInput.spellcheck = false
  nameInput.setAttribute('autocapitalize', 'words')
  nameInput.enterKeyHint = 'done'
  nameInput.setAttribute('aria-label', SETTINGS.nameLabel)
  nameCard.append(nameHead, nameInput)

  // Wake-up times: a row per day, Monday first.
  const wakeCard = el(doc, 'section', 'ds-card ss-wake')
  wakeCard.setAttribute('aria-labelledby', 'ss-wake-title')
  const wakeHead = el(doc, 'div', 'ss-card-head')
  const wakeTitle = el(doc, 'h2', 'ds-card-title', SETTINGS.wakeTitle)
  wakeTitle.id = 'ss-wake-title'
  const wakeSaved = savedNote()
  wakeHead.append(wakeTitle, wakeSaved.el)
  const wakeIntro = el(doc, 'p', 'ss-text', SETTINGS.wakeIntro)
  const dayList = el(doc, 'ul', 'ss-days')
  const rows = new Map<Weekday, { time: HTMLInputElement; off: HTMLElement; toggle: HTMLButtonElement }>()
  for (const day of WEEKDAYS) {
    const name = WEEKDAY_NAMES[day]
    const li = el(doc, 'li', 'ss-day')
    li.dataset.day = day
    const label = el(doc, 'span', 'ss-day-name', name)
    label.setAttribute('aria-hidden', 'true')
    const time = el(doc, 'input', 'ss-time')
    time.type = 'time'
    time.id = `ss-wake-${day}`
    time.setAttribute('aria-label', wakeTimeLabel(name))
    const off = el(doc, 'span', 'ss-day-off', SETTINGS.wakeOff)
    off.setAttribute('aria-hidden', 'true')
    const toggle = button(doc, 'ss-switch', '')
    toggle.id = `ss-wake-${day}-on`
    toggle.setAttribute('role', 'switch')
    toggle.setAttribute('aria-label', wakeSwitchLabel(name))
    toggle.append(el(doc, 'span', 'ss-switch-track'))
    li.append(label, time, off, toggle)
    dayList.append(li)
    rows.set(day, { time, off, toggle })
  }
  wakeCard.append(wakeHead, wakeIntro, dayList)
  // While nothing can be saved, each card says so rather than pretending to save.
  const editsPaused = [nameCard, wakeCard].map((card) => {
    const note = el(doc, 'p', 'ss-note', SETTINGS.editsPaused)
    note.hidden = true
    card.append(note)
    return note
  })

  // Tasks
  const tasksSaved = savedNote()
  const tasksCard = createTasksCard(doc, {
    stats: config.stats,
    limits: config.taskLimits,
    newTask: config.newTask,
    onAdd: (draft) => config.onAddTask(draft),
    onUpdate: (id, changes) => config.onUpdateTask(id, changes),
    onArchive: (id) => config.onArchiveTask(id),
    onUnarchive: (id) => config.onUnarchiveTask(id),
    say: (message) => say({ ok: true, message }),
    saved: () => tasksSaved.show(),
    readOnly: () => readOnlyNow,
    reducedMotion: config.reducedMotion,
  })
  tasksCard.head.append(tasksSaved.el)

  scroller.append(title, nameCard, tasksCard.el, wakeCard, backup)

  // A short, warm toast above the tab bar.
  const dock = el(doc, 'div', 'ss-toast-dock')
  const toastEl = el(doc, 'div', 'toast ss-toast')
  toastEl.setAttribute('role', 'status')
  toastEl.setAttribute('aria-live', 'polite')
  const toastText = el(doc, 'span', 'toast-text')
  const toastUndo = button(doc, 'toast-undo', 'Undo')
  toastUndo.hidden = true
  toastUndo.disabled = true
  toastEl.append(toastText, toastUndo)
  dock.append(toastEl)
  root.replaceChildren(scroller, dock)
  const toast = createToast(toastEl, toastText, toastUndo)
  const refreshFade = watchScrollFade(scroller)

  function say(outcome: SettingsOutcome) {
    if (outcome.ok) {
      status.hidden = true
      toast.show(outcome.message)
    } else {
      toast.hide()
      showProblem(outcome.message)
    }
  }
  function showProblem(message: string) {
    status.textContent = message
    status.hidden = false
  }

  exportButton.addEventListener('click', () => say(config.onExport()))

  /** A small "Saved" beside a card's title that shows for a moment after each change. */
  function savedNote() {
    const note = el(doc, 'span', 'ss-saved', SETTINGS.saved)
    note.setAttribute('role', 'status')
    note.setAttribute('aria-live', 'polite')
    // Empty while hidden, so a screen reader hears it each time it appears.
    note.textContent = ''
    let timer: number | undefined
    return {
      el: note,
      show() {
        window.clearTimeout(timer)
        note.textContent = SETTINGS.saved
        note.classList.remove('is-showing')
        void note.offsetWidth // replay the fade when one save follows another
        note.classList.add('is-showing')
        timer = window.setTimeout(() => {
          note.classList.remove('is-showing')
          note.textContent = ''
        }, SAVED_MS)
      },
    }
  }

  /** Whether the app can't save on this phone, as of the last render. */
  let readOnlyNow = false
  /** Cancels the import confirm sheet, while it's open. */
  let cancelImport: (() => void) | null = null

  // What the screen last showed, so a change knows what it's changing.
  let shownName: string | null = null
  let shownSchedule: WakeSchedule | null = null
  /** The last time each day had this session, brought back when it's switched on again. */
  const lastTimes = new Map<Weekday, string>()

  function saveName() {
    const name = cleanDragonName(nameInput.value, config.nameMax)
    nameInput.value = name ?? ''
    if (name === shownName) return
    shownName = name
    config.onRename(name)
    nameSaved.show()
  }
  nameInput.addEventListener('change', saveName)
  // A name still being typed when the app is swiped away or hidden is saved too.
  const saveIfTyping = () => {
    if (doc.activeElement === nameInput) saveName()
  }
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') saveIfTyping()
  })
  doc.defaultView?.addEventListener('pagehide', saveIfTyping)
  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return
    e.preventDefault()
    saveName()
    nameInput.blur()
  })

  function saveSchedule(schedule: WakeSchedule) {
    shownSchedule = schedule
    showSchedule(schedule)
    config.onSchedule(schedule)
    wakeSaved.show()
  }
  for (const [day, row] of rows) {
    row.toggle.addEventListener('click', () => {
      if (!shownSchedule) return
      const now = shownSchedule[day]
      if (now !== null) lastTimes.set(day, now)
      saveSchedule({ ...shownSchedule, [day]: now === null ? (lastTimes.get(day) ?? config.defaultWakeTime) : null })
    })
    row.time.addEventListener('change', () => {
      if (!shownSchedule) return
      const value = row.time.value
      // Cleared (or something odd): put back what's saved rather than guess.
      if (!isClockTime(value)) {
        row.time.value = shownSchedule[day] ?? ''
        return
      }
      if (value === shownSchedule[day]) return
      lastTimes.set(day, value)
      saveSchedule({ ...shownSchedule, [day]: value })
    })
  }

  function showSchedule(schedule: WakeSchedule) {
    for (const [day, row] of rows) {
      const target = schedule[day]
      const on = target !== null
      row.toggle.setAttribute('aria-checked', String(on))
      row.time.hidden = !on
      row.off.hidden = on
      if (on && row.time.value !== target) row.time.value = target
    }
  }

  importButton.addEventListener('click', () => {
    status.hidden = true
    picker.value = '' // so picking the same file again still fires change
    picker.click()
  })

  picker.addEventListener('change', async () => {
    const file = picker.files?.[0]
    picker.value = ''
    if (!file) return
    let text: string
    try {
      text = await file.text()
    } catch {
      showProblem(IMPORT_REFUSED.unreadable)
      return
    }
    const check = readBackup(text)
    if (!check.ok) {
      showProblem(IMPORT_REFUSED[check.reason])
      return
    }
    confirmImport(check)
  })

  function confirmImport(backupFile: ReadyBackup) {
    const summary = importSummary(backupFile.data, backupFile.exportedAt, config.now(), config.stages)
    const sheet = el(doc, 'dialog', 'sheet')
    sheet.setAttribute('aria-labelledby', 'sheet-title')
    if (config.reducedMotion()) sheet.classList.add('is-calm')
    const card = el(doc, 'div', 'sheet-card')
    const heading = el(doc, 'h2', 'sheet-title', IMPORT_CONFIRM.heading)
    heading.id = 'sheet-title'
    const facts = el(doc, 'dl', 'sheet-facts')
    const fact = (name: string, value: string) => {
      const row = el(doc, 'div', 'sheet-fact')
      row.append(el(doc, 'dt', '', name), el(doc, 'dd', '', value))
      facts.append(row)
    }
    fact(IMPORT_CONFIRM.logs, String(summary.logs))
    fact(IMPORT_CONFIRM.stage, summary.stage)
    fact(IMPORT_CONFIRM.saved, summary.saved ?? IMPORT_CONFIRM.savedUnknown)
    const replaces = el(doc, 'p', 'sheet-text', IMPORT_CONFIRM.replaces)
    card.append(heading, facts)
    if (backupFile.dropped > 0) card.append(el(doc, 'p', 'sheet-text', importDropped(backupFile.dropped)))
    const actions = el(doc, 'div', 'sheet-actions')
    const confirm = button(doc, 'ss-button is-primary', IMPORT_CONFIRM.confirm)
    confirm.id = 'sheet-confirm'
    const cancel = button(doc, 'ss-button', IMPORT_CONFIRM.cancel)
    cancel.id = 'sheet-cancel'
    actions.append(confirm, cancel)
    card.append(replaces, actions)
    sheet.append(card)
    doc.body.append(sheet)

    let done = false
    const close = (restoreFocus = true) => {
      if (done) return
      done = true
      cancelImport = null
      sheet.close()
      sheet.remove()
      if (restoreFocus) importButton.focus({ preventScroll: true })
    }
    cancelImport = () => close(false)
    confirm.addEventListener('click', () => {
      if (done) return
      const outcome = config.onImport(backupFile)
      close()
      say(outcome)
    })
    cancel.addEventListener('click', () => close())
    // Escape, or the back gesture's cancel.
    sheet.addEventListener('close', () => close())
    // A tap on the dimmed backdrop (outside the card) is a cancel, if it started there too.
    let downOnBackdrop = false
    sheet.addEventListener('pointerdown', (e) => {
      downOnBackdrop = e.target === sheet
    })
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet && downOnBackdrop) close()
      downOnBackdrop = false
    })
    sheet.showModal()
    // Focus the safe choice, so a stray Enter never replaces anything.
    cancel.focus({ preventScroll: true })
  }

  return {
    render({ dragonName, wakeSchedule, tasks, lastBackupAt, readOnly, now }) {
      // Never rewrite the name while it's being typed.
      shownName = dragonName
      if (doc.activeElement !== nameInput) nameInput.value = dragonName ?? ''
      shownSchedule = { ...wakeSchedule }
      showSchedule(shownSchedule)
      nameInput.disabled = readOnly
      for (const row of rows.values()) {
        row.time.disabled = readOnly
        row.toggle.disabled = readOnly
      }
      readOnlyNow = readOnly
      for (const note of editsPaused) note.hidden = !readOnly
      tasksCard.render(tasks, readOnly)

      last.textContent = lastBackupLine(
        lastBackupAt === undefined ? null : friendlyDay(dayKey(lastBackupAt), dayKey(now)),
      )
      importButton.disabled = readOnly
      paused.hidden = !readOnly
      if (readOnly) importButton.setAttribute('aria-describedby', paused.id)
      else importButton.removeAttribute('aria-describedby')
      refreshFade()
    },
    closeSheets() {
      tasksCard.closeSheet()
      cancelImport?.()
    },
    revealBackup() {
      const top = scroller.scrollTop + backup.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12
      scroller.scrollTo({ top: Math.max(0, top), behavior: config.reducedMotion() ? 'instant' : 'smooth' })
      refreshFade()
    },
  }
}
