// The Settings screen. For now it holds Backup (export and import); the dragon's
// name, the wake-up schedule and the tasks get their own sections in later slices,
// each a card in the same scrolling column.
//
// Import asks first, in a sheet that says what's in the file. That's fine here: it's
// nowhere near the logging path, and it replaces everything on the phone.

import { activeLogs } from '../game/active'
import { dayKey } from '../game/day'
import { dragonStage } from '../game/state'
import type { Stage } from '../game/types'
import type { SaveData } from '../storage'
import { readBackup, type BackupCheck } from '../storage/backup'
import { IMPORT_CONFIRM, IMPORT_REFUSED, SETTINGS, friendlyDay, importDropped, lastBackupLine } from './copy'
import { watchScrollFade } from './scroll-fade'
import { createToast } from './toast'

export type ReadyBackup = Extract<BackupCheck, { ok: true }>

export interface SettingsScreenState {
  /** When the last backup was made (or the imported one was exported), if ever. */
  lastBackupAt: number | undefined
  /** Import is off while the app can't save on this phone. */
  readOnly: boolean
  now: number
}

/** What the app does when asked. Each returns a message for the screen to show. */
export type SettingsOutcome = { ok: true; message: string } | { ok: false; message: string }

export interface SettingsScreenConfig {
  stages: readonly Stage[]
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
}

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

  // The name, schedule and task sections go here in later slices.
  scroller.append(title, backup)

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
    const close = () => {
      if (done) return
      done = true
      sheet.close()
      sheet.remove()
      importButton.focus({ preventScroll: true })
    }
    confirm.addEventListener('click', () => {
      if (done) return
      const outcome = config.onImport(backupFile)
      close()
      say(outcome)
    })
    cancel.addEventListener('click', close)
    // Escape, or the back gesture's cancel.
    sheet.addEventListener('close', close)
    // A tap on the dimmed backdrop (outside the card) is a cancel.
    sheet.addEventListener('click', (e) => {
      if (e.target === sheet) close()
    })
    sheet.showModal()
    // Focus the safe choice, so a stray Enter never replaces anything.
    cancel.focus({ preventScroll: true })
  }

  return {
    render({ lastBackupAt, readOnly, now }) {
      last.textContent = lastBackupLine(
        lastBackupAt === undefined ? null : friendlyDay(dayKey(lastBackupAt), dayKey(now)),
      )
      importButton.disabled = readOnly
      paused.hidden = !readOnly
      if (readOnly) importButton.setAttribute('aria-describedby', paused.id)
      else importButton.removeAttribute('aria-describedby')
      refreshFade()
    },
  }
}
