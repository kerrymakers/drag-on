// The weekly goal editor: a task picker (the active tasks, or no goal) and a
// days-a-week stepper. Used by the Settings card and first-run setup; the caller saves
// each change and owns the card around it.

import type { GoalConfig } from '../config/goal'
import { cleanGoal } from '../game/goal'
import type { Goal, Task } from '../game/types'
import { SETTINGS, goalDays, goalWakeCap } from './copy'

export interface GoalEditorConfig {
  /** Starts every id inside, so two editors on one page never clash (e.g. 'ss' gives #ss-goal-task). */
  idPrefix: string
  /** The weekly goal's bounds (config). */
  goal: GoalConfig
  /** The most days a week a goal for `task` can ask for this week (fewer for wake-up). */
  maxDays(task: Task): number
  /** A new goal (null for none), after a change. */
  onChange(goal: Goal | null): void
}

export interface GoalEditor {
  /** The picker, its notes and the stepper, in order, for the caller to place. */
  els: HTMLElement[]
  /** `tasks`: every task, archived ones too; only active ones can be picked. */
  render(goal: Goal | null, tasks: readonly Task[], readOnly: boolean): void
}

const NO_GOAL = ''
/** The picker's placeholder value while the goal's task is archived (task ids are never written like this). */
const ARCHIVED_GOAL_TASK = '__archived-goal-task__'

function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, className: string, text?: string) {
  const e = doc.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

export function createGoalEditor(doc: Document, config: GoalEditorConfig): GoalEditor {
  const id = (name: string) => `${config.idPrefix}-goal-${name}`
  const picker = el(doc, 'select', 'ss-input ss-select')
  picker.id = id('task')
  picker.setAttribute('aria-label', SETTINGS.goalTaskLabel)
  const archived = el(doc, 'p', 'ss-note', SETTINGS.goalArchived)
  archived.id = id('archived')
  archived.hidden = true
  const stepper = el(doc, 'div', 'ss-stepper')
  const fewer = el(doc, 'button', 'ss-step', '−')
  fewer.type = 'button'
  fewer.id = id('fewer')
  fewer.setAttribute('aria-label', SETTINGS.goalFewer)
  const count = el(doc, 'span', 'ss-step-value')
  count.id = id('days')
  count.setAttribute('aria-live', 'polite')
  const more = el(doc, 'button', 'ss-step', '+')
  more.type = 'button'
  more.id = id('more')
  more.setAttribute('aria-label', SETTINGS.goalMore)
  stepper.append(fewer, count, more)
  const cap = el(doc, 'p', 'ss-note')
  cap.id = id('cap')
  cap.hidden = true

  let shown: Goal | null = null
  let tasksNow: readonly Task[] = []
  let readOnlyNow = false

  /** The most days a goal on `taskId` can ask for this week (at least the config's least). */
  function topDays(taskId: string): number {
    const task = tasksNow.find((t) => t.id === taskId)
    const top = task ? config.maxDays(task) : config.goal.maxDays
    return Math.max(config.goal.minDays, Math.min(config.goal.maxDays, top))
  }
  function change(goal: Goal | null) {
    shown = goal ? cleanGoal(goal, config.goal) : null
    show()
    config.onChange(shown)
  }
  picker.addEventListener('change', () => {
    const taskId = picker.value
    if (taskId === ARCHIVED_GOAL_TASK) return
    if (taskId === NO_GOAL) return change(null)
    // Keep the days already chosen, held to what the new task allows this week.
    const days = Math.min(shown?.daysPerWeek ?? config.goal.defaultDays, topDays(taskId))
    change({ taskId, daysPerWeek: Math.max(config.goal.minDays, days) })
  })
  function step(delta: number) {
    if (!shown) return
    const days = Math.min(topDays(shown.taskId), Math.max(config.goal.minDays, shown.daysPerWeek + delta))
    if (days === shown.daysPerWeek) return
    change({ ...shown, daysPerWeek: days })
  }
  fewer.addEventListener('click', () => step(-1))
  more.addEventListener('click', () => step(1))

  function show() {
    const goal = shown
    const active = tasksNow.filter((t) => !t.archived)
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
    if (picker.dataset.options !== signature) {
      picker.dataset.options = signature
      picker.replaceChildren(...options)
    }
    picker.value = resting ? ARCHIVED_GOAL_TASK : (goal?.taskId ?? NO_GOAL)
    picker.disabled = readOnlyNow
    archived.hidden = !resting
    const editing = goal !== null && !resting
    stepper.hidden = !editing
    cap.hidden = true
    if (!editing || !goal) return
    const top = topDays(goal.taskId)
    const days = Math.min(goal.daysPerWeek, top)
    count.textContent = goalDays(days)
    fewer.disabled = readOnlyNow || days <= config.goal.minDays
    more.disabled = readOnlyNow || days >= top
    if (top < config.goal.maxDays) {
      cap.textContent = goalWakeCap(top)
      cap.hidden = false
    }
  }

  return {
    els: [picker, archived, stepper, cap],
    render(goal, tasks, readOnly) {
      shown = goal
      tasksNow = tasks
      readOnlyNow = readOnly
      show()
    },
  }
}
