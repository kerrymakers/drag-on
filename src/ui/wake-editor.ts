// The wake-up times editor: a row per day, Monday first, each with a time and an
// on/off switch (off is a lie-in). Used by the Settings card and first-run setup; the
// caller saves each change and owns the card around it.

import { isClockTime } from '../game/day'
import { WEEKDAYS } from '../game/settings'
import type { WakeSchedule, Weekday } from '../game/types'
import { SETTINGS, WEEKDAY_NAMES, wakeSwitchLabel, wakeTimeLabel } from './copy'

export interface WakeEditorConfig {
  /** Starts every id inside, so two editors on one page never clash (e.g. 'ss' gives #ss-wake-mon). */
  idPrefix: string
  /** The time a day gets when switched on, with no earlier time this session (config). */
  defaultWakeTime: string
  /** A new schedule, after a change. The editor already shows it. */
  onChange(schedule: WakeSchedule): void
}

export interface WakeEditor {
  /** The day list, for the caller to place. */
  el: HTMLUListElement
  render(schedule: WakeSchedule, readOnly: boolean): void
}

export function createWakeEditor(doc: Document, config: WakeEditorConfig): WakeEditor {
  const list = doc.createElement('ul')
  list.className = 'ss-days'
  const rows = new Map<Weekday, { time: HTMLInputElement; off: HTMLElement; toggle: HTMLButtonElement }>()
  for (const day of WEEKDAYS) {
    const name = WEEKDAY_NAMES[day]
    const li = doc.createElement('li')
    li.className = 'ss-day'
    li.dataset.day = day
    const label = doc.createElement('span')
    label.className = 'ss-day-name'
    label.textContent = name
    label.setAttribute('aria-hidden', 'true')
    const time = doc.createElement('input')
    time.className = 'ss-time'
    time.type = 'time'
    time.id = `${config.idPrefix}-wake-${day}`
    time.setAttribute('aria-label', wakeTimeLabel(name))
    const off = doc.createElement('span')
    off.className = 'ss-day-off'
    off.textContent = SETTINGS.wakeOff
    off.setAttribute('aria-hidden', 'true')
    const toggle = doc.createElement('button')
    toggle.type = 'button'
    toggle.className = 'ss-switch'
    toggle.id = `${config.idPrefix}-wake-${day}-on`
    toggle.setAttribute('role', 'switch')
    toggle.setAttribute('aria-label', wakeSwitchLabel(name))
    const track = doc.createElement('span')
    track.className = 'ss-switch-track'
    toggle.append(track)
    li.append(label, time, off, toggle)
    list.append(li)
    rows.set(day, { time, off, toggle })
  }

  /** What the editor last showed, so a change knows what it's changing. */
  let shown: WakeSchedule | null = null
  /** The last time each day had this session, brought back when it's switched on again. */
  const lastTimes = new Map<Weekday, string>()

  function show(schedule: WakeSchedule) {
    for (const [day, row] of rows) {
      const target = schedule[day]
      const on = target !== null
      row.toggle.setAttribute('aria-checked', String(on))
      row.time.hidden = !on
      row.off.hidden = on
      if (on && row.time.value !== target) row.time.value = target
    }
  }
  function change(schedule: WakeSchedule) {
    shown = schedule
    show(schedule)
    config.onChange(schedule)
  }
  for (const [day, row] of rows) {
    row.toggle.addEventListener('click', () => {
      if (!shown) return
      const now = shown[day]
      if (now !== null) lastTimes.set(day, now)
      change({ ...shown, [day]: now === null ? (lastTimes.get(day) ?? config.defaultWakeTime) : null })
    })
    row.time.addEventListener('change', () => {
      if (!shown) return
      const value = row.time.value
      // Cleared (or something odd): put back what's saved rather than guess.
      if (!isClockTime(value)) {
        row.time.value = shown[day] ?? ''
        return
      }
      if (value === shown[day]) return
      lastTimes.set(day, value)
      change({ ...shown, [day]: value })
    })
  }

  return {
    el: list,
    render(schedule, readOnly) {
      shown = { ...schedule }
      show(shown)
      for (const row of rows.values()) {
        row.time.disabled = readOnly
        row.toggle.disabled = readOnly
      }
    },
  }
}
