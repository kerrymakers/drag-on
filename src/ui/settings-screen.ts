// The Settings screen: the dragon's name and colour, the tasks, the weekly goal, the wake-up
// times, sounds and Backup
// (export and import), each a card in one scrolling column. The Tasks card and its
// edit sheet live in tasks-card.ts.
//
// The name, the colour and the wake-up times save as soon as they change, with a small "Saved"
// beside the card's title. There's no save button and nothing to confirm.
//
// Import asks first, in a sheet that says what's in the file. That's fine here: it's
// nowhere near the logging path, and it replaces everything on the phone.

import { DRAGON_COLOURS, renderDragon, type DragonLook } from '../art'
import type { GoalConfig } from '../config/goal'
import { activeLogs } from '../game/active'
import { dayKey, isClockTime } from '../game/day'
import { cleanDragonName, WEEKDAYS } from '../game/settings'
import { dragonStage } from '../game/state'
import type { NewTask, TaskChanges, TaskLimits } from '../game/tasks'
import type { EffortId, EffortLevel, Goal, Stage, Stat, Task, WakeSchedule, Weekday } from '../game/types'
import type { SaveData } from '../storage'
import { readBackup, type BackupCheck } from '../storage/backup'
import {
  IMPORT_CONFIRM,
  IMPORT_REFUSED,
  SETTINGS,
  WEEKDAY_NAMES,
  friendlyDay,
  goalDays,
  goalWakeCap,
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
  /** The chosen colour id, or undefined for none ("classic"). */
  dragonColour: string | undefined
  /** The dragon as it looks now (stage, look, mood, outfit, colour), for the colour preview. */
  dragon: DragonLook
  /** The wake schedule in force today. */
  wakeSchedule: WakeSchedule
  /** Every task, archived ones too (see effectiveTasks). */
  tasks: readonly Task[]
  /** When the last backup was made (or the imported one was exported), if ever. */
  lastBackupAt: number | undefined
  /** Whether sounds are on. */
  soundOn: boolean
  /** The weekly goal as saved (its task may be archived), or null for none. */
  goal: Goal | null
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
  /** Save the dragon's colour (an id from DRAGON_COLOURS). */
  onColour(id: string): void
  /** Save a new wake schedule, from today on. */
  onSchedule(schedule: WakeSchedule): void
  stats: readonly Stat[]
  /** Bounds for task editing (config). */
  taskLimits: TaskLimits
  /** "How hard is this for you?": the effort levels (config). */
  effortLevels: readonly EffortLevel[]
  /** A new task's starting effort level and times a day (config). */
  newTask: { effort: EffortId; timesADay: number }
  /** Task edits. Each returns whether the change was made. */
  onAddTask(draft: NewTask): boolean
  onUpdateTask(id: string, changes: TaskChanges): boolean
  onArchiveTask(id: string): boolean
  onUnarchiveTask(id: string): boolean
  /** Turn sounds on or off. */
  onSound(on: boolean): void
  /** The weekly goal's bounds (config). */
  goal: GoalConfig
  /** Save the weekly goal (null for none), from this week on. */
  onGoal(goal: Goal | null): void
  /** The most days a week a goal for `task` can ask for this week (fewer for wake-up). */
  goalMaxDays(task: Task): number
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

  // Colour: a preview of the dragon as it is now, and a round swatch per colour.
  const colourCard = el(doc, 'section', 'ds-card ss-colour')
  colourCard.setAttribute('aria-labelledby', 'ss-colour-title')
  const colourHead = el(doc, 'div', 'ss-card-head')
  const colourTitle = el(doc, 'h2', 'ds-card-title', SETTINGS.colourTitle)
  colourTitle.id = 'ss-colour-title'
  const colourSaved = savedNote()
  colourHead.append(colourTitle, colourSaved.el)
  const colourIntro = el(doc, 'p', 'ss-text', SETTINGS.colourIntro)
  const colourArt = el(doc, 'div', 'ss-colour-art')
  colourArt.setAttribute('aria-hidden', 'true')
  const swatchGroup = el(doc, 'div', 'ss-swatches')
  swatchGroup.id = 'ss-colour'
  swatchGroup.setAttribute('role', 'radiogroup')
  swatchGroup.setAttribute('aria-label', SETTINGS.colourLabel)
  const swatches = DRAGON_COLOURS.map(({ id, label }) => {
    const swatch = button(doc, 'ss-swatch colour-swatch', '')
    swatch.dataset.colour = id
    swatch.setAttribute('role', 'radio')
    swatch.setAttribute('aria-checked', 'false')
    swatch.setAttribute('aria-label', label)
    swatchGroup.append(swatch)
    return swatch
  })
  colourCard.append(colourHead, colourIntro, colourArt, swatchGroup)

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

  // Weekly goal: a task picker (active tasks, or none) and a days-a-week stepper.
  const goalCard = el(doc, 'section', 'ds-card ss-goal')
  goalCard.setAttribute('aria-labelledby', 'ss-goal-title')
  const goalHead = el(doc, 'div', 'ss-card-head')
  const goalTitle = el(doc, 'h2', 'ds-card-title', SETTINGS.goalTitle)
  goalTitle.id = 'ss-goal-title'
  const goalSaved = savedNote()
  goalHead.append(goalTitle, goalSaved.el)
  const goalIntro = el(doc, 'p', 'ss-text', SETTINGS.goalIntro)
  const goalTask = el(doc, 'select', 'ss-input ss-select')
  goalTask.id = 'ss-goal-task'
  goalTask.setAttribute('aria-label', SETTINGS.goalTaskLabel)
  const goalArchived = el(doc, 'p', 'ss-note', SETTINGS.goalArchived)
  goalArchived.id = 'ss-goal-archived'
  goalArchived.hidden = true
  const goalStepper = el(doc, 'div', 'ss-stepper')
  const goalFewer = button(doc, 'ss-step', '−')
  goalFewer.id = 'ss-goal-fewer'
  goalFewer.setAttribute('aria-label', SETTINGS.goalFewer)
  const goalCount = el(doc, 'span', 'ss-step-value')
  goalCount.id = 'ss-goal-days'
  goalCount.setAttribute('aria-live', 'polite')
  const goalMore = button(doc, 'ss-step', '+')
  goalMore.id = 'ss-goal-more'
  goalMore.setAttribute('aria-label', SETTINGS.goalMore)
  goalStepper.append(goalFewer, goalCount, goalMore)
  const goalCap = el(doc, 'p', 'ss-note')
  goalCap.id = 'ss-goal-cap'
  goalCap.hidden = true
  goalCard.append(goalHead, goalIntro, goalTask, goalArchived, goalStepper, goalCap)

  // Sounds: one switch, off to start with.
  const soundCard = el(doc, 'section', 'ds-card ss-sound')
  soundCard.setAttribute('aria-labelledby', 'ss-sound-title')
  const soundHead = el(doc, 'div', 'ss-card-head')
  const soundTitle = el(doc, 'h2', 'ds-card-title', SETTINGS.soundTitle)
  soundTitle.id = 'ss-sound-title'
  const soundSaved = savedNote()
  soundHead.append(soundTitle, soundSaved.el)
  const soundRow = el(doc, 'div', 'ss-sound-row')
  const soundLabel = el(doc, 'span', 'ss-sound-label', SETTINGS.soundLabel)
  soundLabel.id = 'ss-sound-label'
  const soundToggle = button(doc, 'ss-switch', '')
  soundToggle.id = 'ss-sound-on'
  soundToggle.setAttribute('role', 'switch')
  soundToggle.setAttribute('aria-labelledby', 'ss-sound-label')
  soundToggle.setAttribute('aria-checked', 'false')
  soundToggle.append(el(doc, 'span', 'ss-switch-track'))
  soundRow.append(soundLabel, soundToggle)
  soundCard.append(soundHead, soundRow)

  // While nothing can be saved, each card says so rather than pretending to save.
  const editsPaused = [nameCard, colourCard, goalCard, wakeCard, soundCard].map((card) => {
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
    levels: config.effortLevels,
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

  scroller.append(title, nameCard, colourCard, tasksCard.el, goalCard, wakeCard, soundCard, backup)

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

  // A tap on a swatch saves it straight away. Arrow keys move along the swatches and
  // choose as they go, like any radio group; only the chosen one (or the first, with
  // none chosen) is in the tab order.
  let shownColour: string | undefined
  function showColour(colour: string | undefined, readOnly: boolean) {
    shownColour = colour
    const tabbable = swatches.find((s) => s.dataset.colour === colour) ?? swatches[0]
    for (const swatch of swatches) {
      swatch.setAttribute('aria-checked', String(swatch.dataset.colour === colour))
      swatch.tabIndex = swatch === tabbable ? 0 : -1
      swatch.disabled = readOnly
    }
  }
  function chooseColour(swatch: HTMLButtonElement) {
    const id = swatch.dataset.colour
    if (!id || swatch.disabled || id === shownColour) return
    showColour(id, false)
    config.onColour(id)
    colourSaved.show()
  }
  swatchGroup.addEventListener('click', (e) => {
    const swatch = (e.target as Element).closest<HTMLButtonElement>('.ss-swatch')
    if (swatch) chooseColour(swatch)
  })
  swatchGroup.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    const at = swatches.indexOf(e.target as HTMLButtonElement)
    if (step === undefined || at < 0) return
    e.preventDefault()
    const next = swatches[(at + step + swatches.length) % swatches.length]!
    next.focus()
    chooseColour(next)
  })

  // The whole row is the switch's tap area: the label taps it too.
  soundLabel.addEventListener('click', () => soundToggle.click())
  soundToggle.addEventListener('click', () => {
    const on = soundToggle.getAttribute('aria-checked') !== 'true'
    soundToggle.setAttribute('aria-checked', String(on))
    config.onSound(on)
    soundSaved.show()
  })

  // The weekly goal: saves as soon as it changes, like the rest of Settings.
  let shownGoal: Goal | null = null
  let goalTasks: readonly Task[] = []
  const NO_GOAL = ''
  /** The picker's placeholder value while the goal's task is archived (task ids are never written like this). */
  const ARCHIVED_GOAL_TASK = '__archived-goal-task__'
  /** The most days a goal on `taskId` can ask for this week (at least the config's least). */
  function topDays(taskId: string): number {
    const task = goalTasks.find((t) => t.id === taskId)
    const cap = task ? config.goalMaxDays(task) : config.goal.maxDays
    return Math.max(config.goal.minDays, Math.min(config.goal.maxDays, cap))
  }
  function saveGoal(goal: Goal | null) {
    shownGoal = goal
    config.onGoal(goal)
    goalSaved.show()
  }
  goalTask.addEventListener('change', () => {
    const id = goalTask.value
    if (id === ARCHIVED_GOAL_TASK) return
    if (id === NO_GOAL) return saveGoal(null)
    // Keep the days already chosen, held to what the new task allows this week.
    const days = Math.min(shownGoal?.daysPerWeek ?? config.goal.defaultDays, topDays(id))
    saveGoal({ taskId: id, daysPerWeek: Math.max(config.goal.minDays, days) })
  })
  function step(delta: number) {
    if (!shownGoal) return
    const days = Math.min(topDays(shownGoal.taskId), Math.max(config.goal.minDays, shownGoal.daysPerWeek + delta))
    if (days === shownGoal.daysPerWeek) return
    saveGoal({ ...shownGoal, daysPerWeek: days })
  }
  goalFewer.addEventListener('click', () => step(-1))
  goalMore.addEventListener('click', () => step(1))

  function showGoal(goal: Goal | null, tasks: readonly Task[], readOnly: boolean) {
    shownGoal = goal
    goalTasks = tasks
    const active = tasks.filter((t) => !t.archived)
    const resting = goal !== null && !active.some((t) => t.id === goal.taskId)
    const options: HTMLOptionElement[] = []
    const option = (value: string, text: string) => {
      const o = el(doc, 'option', '', text)
      o.value = value
      options.push(o)
      return o
    }
    if (resting) option(ARCHIVED_GOAL_TASK, SETTINGS.goalPick).disabled = true
    option(NO_GOAL, SETTINGS.goalNone)
    for (const t of active) option(t.id, t.name)
    // Only rebuild the list when it changed, so an open picker isn't swapped out.
    const signature = options.map((o) => `${o.value}:${o.textContent}`).join('|')
    if (goalTask.dataset.options !== signature) {
      goalTask.dataset.options = signature
      goalTask.replaceChildren(...options)
    }
    goalTask.value = resting ? ARCHIVED_GOAL_TASK : (goal?.taskId ?? NO_GOAL)
    goalTask.disabled = readOnly
    goalArchived.hidden = !resting
    const editing = goal !== null && !resting
    goalStepper.hidden = !editing
    goalCap.hidden = true
    if (!editing || !goal) return
    const top = topDays(goal.taskId)
    const days = Math.min(goal.daysPerWeek, top)
    goalCount.textContent = goalDays(days)
    goalFewer.disabled = readOnly || days <= config.goal.minDays
    goalMore.disabled = readOnly || days >= top
    if (top < config.goal.maxDays) {
      goalCap.textContent = goalWakeCap(top)
      goalCap.hidden = false
    }
  }

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
    render({ dragonName, dragonColour, dragon, wakeSchedule, tasks, lastBackupAt, soundOn, goal, readOnly, now }) {
      // Never rewrite the name while it's being typed.
      shownName = dragonName
      if (doc.activeElement !== nameInput) nameInput.value = dragonName ?? ''
      shownSchedule = { ...wakeSchedule }
      showSchedule(shownSchedule)
      nameInput.disabled = readOnly
      showColour(dragonColour, readOnly)
      renderDragon(colourArt, dragon)
      for (const row of rows.values()) {
        row.time.disabled = readOnly
        row.toggle.disabled = readOnly
      }
      soundToggle.setAttribute('aria-checked', String(soundOn))
      soundToggle.disabled = readOnly
      readOnlyNow = readOnly
      for (const note of editsPaused) note.hidden = !readOnly
      tasksCard.render(tasks, readOnly)
      showGoal(goal, tasks, readOnly)

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
