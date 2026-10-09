// The History screen: a streak summary (overall streak, best, freezes, wake-up streak,
// this week per task), a month calendar (dot = logged, snowflake = frozen, ring =
// today) and, below it, what was logged on the day that's tapped. Quiet days are
// plain, never marked as failures. Days before the first log and after today are
// faded and can't be tapped.

import type { StreakConfig } from '../config/streaks'
import { dayKey, nextDayKey, weekdayOf } from '../game/day'
import { itemFor, logXp, treatBonus } from '../game/rewards'
import { activeLogs } from '../game/active'
import { firstLogDay, nextMilestone, overallStreak, wakeStreak, weeklyCounts, type DayStatus } from '../game/streaks'
import type { GameEvent, Item, Settings, Task, Weekday } from '../game/types'
import {
  HISTORY,
  bestStreak,
  calendarDayLabel,
  dayCount,
  freezesLine,
  friendlyDay,
  historyFound,
  historyLogXp,
  monthTitle,
  nextSurprise,
  weekLine,
} from './copy'
import { ICONS } from './icons'
import { watchScrollFade } from './scroll-fade'

export interface HistoryScreenState {
  events: readonly GameEvent[]
  /** Every task, archived ones too (old logs still need their names). */
  tasks: readonly Task[]
  settings: Settings
  now: number
}

export interface HistoryScreenConfig {
  items: readonly Item[]
  streaks: StreakConfig
}

export interface HistoryScreen {
  render(state: HistoryScreenState): void
  /** Back to this month with today selected (on opening the screen). */
  reset(): void
}

const WEEK: readonly Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WEEKDAY_LETTERS: Record<Weekday, string> = { mon: 'M', tue: 'T', wed: 'W', thu: 'T', fri: 'F', sat: 'S', sun: 'S' }
const WEEKDAY_NAMES: Record<Weekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
}

/** The days of the week in calendar column order, starting on `weekStart`. */
export function weekColumns(weekStart: Weekday): Weekday[] {
  const i = WEEK.indexOf(weekStart)
  return [...WEEK.slice(i), ...WEEK.slice(0, i)]
}

/** "2026-10" from a day key. */
export const monthOf = (key: string): string => key.slice(0, 7)

/** The month `delta` months from `month` ("YYYY-MM"). */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number)
  const total = (y ?? 1970) * 12 + ((m ?? 1) - 1) + delta
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${String((total % 12) + 1).padStart(2, '0')}`
}

/**
 * The calendar for a month: null for each blank before the 1st (so it lands in its
 * weekday column), then every day key of the month.
 */
export function monthCells(month: string, weekStart: Weekday): (string | null)[] {
  const first = `${month}-01`
  const blanks = weekColumns(weekStart).indexOf(weekdayOf(first))
  const cells: (string | null)[] = Array.from({ length: blanks }, () => null)
  for (let d = first; monthOf(d) === month; d = nextDayKey(d)) cells.push(d)
  return cells
}

/** The months the calendar can show: from the first log's month (or this month) to this month. */
export function monthBounds(firstDay: string | null, today: string): { min: string; max: string } {
  const max = monthOf(today)
  const min = firstDay !== null && firstDay < today ? monthOf(firstDay) : max
  return { min, max }
}

/**
 * The tasks with a line under "This week": not archived, and not wake-up. Wake-up has
 * a schedule, so a weekly count would be ambiguous; it has its own streak instead
 * (decided 2026-10-08).
 */
export function weeklyTasks(tasks: readonly Task[]): Task[] {
  return tasks.filter((t) => !t.archived && t.rules.kind !== 'wakeUp')
}

export interface DayEntry {
  logId: string
  taskName: string
  /** Base XP plus any treat. */
  xp: number
  treat: number
  /** The name of an item this log found, if any. */
  itemName: string | null
}

/** What was logged on game day `key`, in the order it was logged. Undone logs are left out. */
export function dayEntries(
  events: readonly GameEvent[],
  key: string,
  tasks: readonly Task[],
  items: readonly Item[],
): DayEntry[] {
  return activeLogs(events)
    .filter((l) => dayKey(l.timestamp) === key)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((l) => ({
      logId: l.id,
      taskName: tasks.find((t) => t.id === l.taskId)?.name ?? HISTORY.unknownTask,
      xp: logXp(l),
      treat: treatBonus(l),
      itemName: itemFor(l, items)?.name ?? null,
    }))
}

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className?: string, text?: string) {
  const e = doc.createElement(tag)
  if (className) e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

export function createHistoryScreen(doc: Document, root: HTMLElement, config: HistoryScreenConfig): HistoryScreen {
  const scroller = el(doc, 'div', 'hs-scroll scroll-fade')
  const title = el(doc, 'h1', 'hs-title', HISTORY.title)
  title.id = 'hs-title'

  // Summary card.
  const summary = el(doc, 'section', 'ds-card hs-summary')
  summary.setAttribute('aria-label', 'Streaks')
  const streakRow = el(doc, 'div', 'hs-streak')
  const streakNumber = el(doc, 'p', 'hs-streak-number')
  const streakText = el(doc, 'div', 'hs-streak-text')
  const streakLabel = el(doc, 'p', 'hs-streak-label')
  const best = el(doc, 'p', 'hs-best')
  const nextUp = el(doc, 'p', 'hs-next')
  streakText.append(streakLabel, best, nextUp)
  streakRow.append(streakNumber, streakText)
  const freezes = el(doc, 'p', 'hs-freezes')
  const flakes = el(doc, 'span', 'hs-flakes')
  flakes.setAttribute('aria-hidden', 'true')
  const freezesText = el(doc, 'span', 'hs-freezes-text')
  freezes.append(flakes, freezesText)
  const wake = el(doc, 'div', 'hs-wake')
  const wakeName = el(doc, 'span', 'hs-row-name', HISTORY.wakeTitle)
  const wakeValue = el(doc, 'span', 'hs-row-value')
  const wakeNote = el(doc, 'p', 'hs-note', HISTORY.wakeNote)
  wake.append(wakeName, wakeValue, wakeNote)
  const weekTitle = el(doc, 'h2', 'hs-subtitle', HISTORY.weekTitle)
  weekTitle.id = 'hs-week'
  const weekList = el(doc, 'ul', 'hs-week')
  weekList.setAttribute('aria-labelledby', 'hs-week')
  summary.append(streakRow, freezes, wake, weekTitle, weekList)

  // Calendar card.
  const calendar = el(doc, 'section', 'ds-card hs-calendar')
  const monthBar = el(doc, 'div', 'hs-month-bar')
  const prev = el(doc, 'button', 'hs-month-btn')
  prev.type = 'button'
  prev.innerHTML = ICONS.chevronLeft
  prev.setAttribute('aria-label', HISTORY.prevMonth)
  const next = el(doc, 'button', 'hs-month-btn')
  next.type = 'button'
  next.innerHTML = ICONS.chevronRight
  next.setAttribute('aria-label', HISTORY.nextMonth)
  const monthName = el(doc, 'h2', 'hs-month')
  monthName.id = 'hs-month'
  monthName.setAttribute('aria-live', 'polite')
  monthBar.append(prev, monthName, next)
  calendar.setAttribute('aria-labelledby', 'hs-month')
  const heads = el(doc, 'div', 'hs-weekdays')
  heads.setAttribute('aria-hidden', 'true')
  for (const w of weekColumns(config.streaks.weekStart)) {
    const h = el(doc, 'span', 'hs-weekday', WEEKDAY_LETTERS[w])
    h.title = WEEKDAY_NAMES[w]
    heads.append(h)
  }
  const grid = el(doc, 'div', 'hs-grid')
  calendar.append(monthBar, heads, grid)

  // The tapped day.
  const detail = el(doc, 'section', 'ds-card hs-day')
  detail.setAttribute('aria-live', 'polite')
  const detailTitle = el(doc, 'h2', 'ds-card-title hs-day-title')
  const detailList = el(doc, 'ul', 'hs-day-list')
  const detailEmpty = el(doc, 'p', 'ds-empty hs-day-empty')
  detail.append(detailTitle, detailList, detailEmpty)

  scroller.append(title, summary, calendar, detail)
  root.replaceChildren(scroller)
  const refreshFade = watchScrollFade(scroller)

  let month: string | null = null
  let selected: string | null = null
  let last: HistoryScreenState | null = null
  let calendarSignature = ''
  /** The first log's day as of the last render, or null before any log. */
  let firstDay: string | null = null

  /** Today, and past days from the first log on. Everything else is faded and inert. */
  function tappable(key: string, today: string): boolean {
    return key === today || (key < today && firstDay !== null && key >= firstDay)
  }

  prev.addEventListener('click', () => moveMonth(-1))
  next.addEventListener('click', () => moveMonth(1))
  grid.addEventListener('click', (e) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('button.hs-cell')
    const key = button?.dataset.day
    if (!key) return
    if (key !== selected) {
      selected = key
      if (last) render(last)
    }
    // Bring the day's card into view, so the tap visibly does something. Focus stays on the day.
    detail.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' })
  })

  function reducedMotion(): boolean {
    return doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  }

  function moveMonth(delta: number) {
    if (!month || !last) return
    month = shiftMonth(month, delta)
    render(last)
    // Keep focus on a usable button if this one just became disabled at a bound.
    const btn = delta < 0 ? prev : next
    if (btn.disabled) (delta < 0 ? next : prev).focus()
  }

  function render(state: HistoryScreenState) {
    last = state
    const { events, settings, tasks, now } = state
    const today = dayKey(now)
    const streak = overallStreak(events, now, config.streaks)
    firstDay = firstLogDay(events, now)
    const bounds = monthBounds(firstDay, today)
    if (month === null || month > bounds.max) month = bounds.max
    if (month < bounds.min) month = bounds.min
    // Only a tappable day can stay selected (undoing the first log can make one untappable).
    if (selected === null || !tappable(selected, today)) selected = today

    // Summary.
    streakNumber.textContent = String(streak.current)
    streakNumber.hidden = streak.current === 0
    streakLabel.textContent =
      streak.current > 0
        ? `${streak.current === 1 ? 'day' : 'days'} ${HISTORY.streakLabel}`
        : streak.days.size > 0
          ? HISTORY.freshStart
          : HISTORY.noLogs
    best.textContent = bestStreak(streak.best)
    best.hidden = streak.best === 0
    // A gentle "Next surprise at 30 days", until the last milestone has been reached.
    const upcoming = nextMilestone(streak.best, config.streaks.milestones)
    nextUp.textContent = upcoming !== null ? nextSurprise(upcoming) : ''
    nextUp.hidden = upcoming === null
    flakes.innerHTML = ICONS.snowflake.repeat(streak.freezesHeld)
    flakes.hidden = streak.freezesHeld === 0
    freezesText.textContent = freezesLine(streak.freezesHeld, config.streaks.freezeEveryDays)

    const w = wakeStreak(events, tasks, settings, now)
    // While the wake-up task is archived its streak isn't shown. Archiving isn't dated,
    // so on unarchiving, days with a target while it was archived count as days it
    // wasn't logged: the streak usually comes back at 0 (best kept), shown as a fresh start.
    const wakeTask = tasks.some((t) => t.rules.kind === 'wakeUp' && !t.archived)
    wake.hidden = !wakeTask || (!w.hasTargets && w.best === 0)
    wakeValue.textContent = w.current > 0 ? dayCount(w.current) : w.best > 0 ? HISTORY.wakeFresh : HISTORY.weekNone
    if (w.best > w.current) wakeValue.textContent += ` · best ${w.best}`

    const shown = weeklyTasks(tasks)
    const counts = weeklyCounts(events, shown, now, config.streaks)
    weekList.replaceChildren(
      ...counts.map((c, i) => {
        const li = el(doc, 'li', 'hs-row')
        li.append(
          el(doc, 'span', 'hs-row-name', shown[i]?.name ?? HISTORY.unknownTask),
          el(doc, 'span', 'hs-row-value', weekLine(c.thisWeek, c.bestWeek)),
        )
        return li
      }),
    )

    // Calendar: rebuilt only when something on it changed, so a tick never swaps a
    // button out from under a finger or drops focus.
    monthName.textContent = monthTitle(month)
    prev.disabled = month <= bounds.min
    next.disabled = month >= bounds.max
    const cells = monthCells(month, config.streaks.weekStart)
    const statusOf = (key: string): DayStatus | null => streak.days.get(key) ?? null
    const sig = `${month}|${today}|${firstDay}|${selected}|${cells.map((c) => (c ? statusOf(c) ?? '-' : '_')).join(',')}`
    if (sig !== calendarSignature) {
      const hadFocus = grid.contains(doc.activeElement)
      calendarSignature = sig
      grid.replaceChildren(...cells.map((key) => cell(key, today, key ? statusOf(key) : null)))
      if (hadFocus) grid.querySelector<HTMLElement>('button.hs-cell.is-selected')?.focus({ preventScroll: true })
    }

    // The selected day.
    const entries = dayEntries(events, selected, tasks, config.items)
    detailTitle.textContent = friendlyDay(selected, today)
    detailList.replaceChildren(
      ...entries.map((e) => {
        const li = el(doc, 'li', 'hs-entry')
        const top = el(doc, 'div', 'hs-entry-top')
        top.append(el(doc, 'span', 'hs-entry-name', e.taskName), el(doc, 'span', 'hs-entry-xp', historyLogXp(e.xp, e.treat)))
        li.append(top)
        if (e.itemName) li.append(el(doc, 'span', 'hs-entry-item', historyFound(e.itemName)))
        return li
      }),
    )
    detailList.hidden = entries.length === 0
    const status = statusOf(selected)
    detailEmpty.textContent =
      selected === today ? HISTORY.todayEmpty : status === 'frozen' ? HISTORY.frozenDay : HISTORY.quietDay
    detailEmpty.hidden = entries.length > 0
    refreshFade()
  }

  function cell(key: string | null, today: string, status: DayStatus | null): HTMLElement {
    if (key === null) {
      const blank = el(doc, 'span', 'hs-cell is-blank')
      blank.setAttribute('aria-hidden', 'true')
      return blank
    }
    const isToday = key === today
    const day = String(Number(key.slice(8)))
    if (!tappable(key, today)) {
      // Same inner parts as a button, so the numbers line up across the row.
      const plain = el(doc, 'span', `hs-cell ${key > today ? 'is-future' : 'is-before'}`)
      plain.append(el(doc, 'span', 'hs-cell-num', day), el(doc, 'span', 'hs-cell-mark'))
      plain.setAttribute('aria-hidden', 'true')
      return plain
    }
    const button = el(doc, 'button', 'hs-cell')
    button.type = 'button'
    button.dataset.day = key
    if (status) button.dataset.status = status
    button.classList.toggle('is-today', isToday)
    button.classList.toggle('is-selected', key === selected)
    button.setAttribute('aria-pressed', String(key === selected))
    button.setAttribute('aria-label', calendarDayLabel(key, status, isToday))
    const num = el(doc, 'span', 'hs-cell-num', day)
    const mark = el(doc, 'span', 'hs-cell-mark')
    if (status === 'frozen') mark.innerHTML = ICONS.snowflake
    button.append(num, mark)
    return button
  }

  return {
    render,
    reset() {
      month = null
      selected = null
    },
  }
}
