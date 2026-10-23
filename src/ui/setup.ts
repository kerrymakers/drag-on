// First-run setup (Milestone 9, slice 2): on a new phone, a few short steps before the
// egg arrives: a name and colour, the starting tasks, the wake-up times (only with the
// wake-up task on) and an optional weekly goal. A full-screen dialog, not an overlay:
// a stray tap must never close a form. Every step has Skip (leave this step as it is),
// and Skip setup goes straight to the egg, keeping what's on the open step (a typed
// name, say). Nothing is saved until the end, in one go (onFinish, see applySetup).
//
// Back (from the second step on), the back gesture or Escape go back a step; on the
// first step the gesture does nothing. If the browser closes the dialog anyway (Chrome
// lets a page hold back the gesture only once without a fresh tap), that counts as Skip
// setup, so the open step's values are kept too.
//
// Only the egg is ever shown here: nothing about later stages, looks or items.

import { renderDragon, type DragonLook } from '../art'
import type { GoalConfig } from '../config/goal'
import type { SetupChoices } from '../game/setup'
import type { Goal, Task, WakeSchedule } from '../game/types'
import { createColourPicker } from './colour-picker'
import { SETTINGS, SETUP, setupStepLabel, setupTaskLabel } from './copy'
import { createGoalEditor } from './goal-editor'
import { createWakeEditor } from './wake-editor'

export interface SetupConfig {
  /** The tasks in use (the active ones are offered, all on). */
  tasks: readonly Task[]
  /** The wake schedule in force now, to start from. */
  wakeSchedule: WakeSchedule
  /** The longest name allowed (config). */
  nameMax: number
  /** The time a day gets when switched on (config). */
  defaultWakeTime: string
  /** The weekly goal's bounds (config). */
  goal: GoalConfig
  /** The most days a week a goal on `task` can ask for this week, with `schedule` saved. */
  goalMaxDays(task: Task, schedule: WakeSchedule): number
  /** The dragon as it looks now (the egg) in `colour`, for the preview. */
  previewLook(colour: string | undefined): DragonLook
  reducedMotion(): boolean
  /** Done or skipped: the choices made (a skipped step leaves its choice out). */
  onFinish(choices: SetupChoices): void
}

type StepId = 'name' | 'tasks' | 'wake' | 'goal'

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

export function openSetup(doc: Document, config: SetupConfig): void {
  const offered = config.tasks.filter((t) => !t.archived)
  const wakeTask = offered.find((t) => t.rules.kind === 'wakeUp')

  // What each step holds while it's open; copied into `choices` on Next.
  let colour: string | undefined
  const keep = new Set(offered.map((t) => t.id))
  let schedule: WakeSchedule = { ...config.wakeSchedule }
  let goal: Goal | null = null
  const choices: SetupChoices = {}

  const dialog = el(doc, 'dialog', 'setup')
  dialog.id = 'setup'
  dialog.setAttribute('aria-labelledby', 'su-title')
  if (config.reducedMotion()) dialog.classList.add('is-calm')
  const frame = el(doc, 'div', 'su-frame')
  const top = el(doc, 'div', 'su-top')
  const dots = el(doc, 'p', 'su-dots')
  dots.setAttribute('role', 'img')
  const skipAll = button(doc, 'su-link su-skip-all', SETUP.skipAll)
  skipAll.id = 'su-skip-all'
  const back = button(doc, 'su-link su-back', SETUP.back)
  back.id = 'su-back'
  top.append(back, dots, skipAll)
  const body = el(doc, 'div', 'su-body')
  const title = el(doc, 'h1', 'su-title')
  title.id = 'su-title'
  title.tabIndex = -1
  const intro = el(doc, 'p', 'su-intro')
  body.append(title, intro)
  const actions = el(doc, 'div', 'su-actions')
  const next = button(doc, 'ss-button is-primary su-next', SETUP.next)
  next.id = 'su-next'
  const skip = button(doc, 'su-link su-skip', SETUP.skip)
  skip.id = 'su-skip'
  actions.append(next, skip)
  frame.append(top, body, actions)
  dialog.append(frame)

  // Step 1: name and colour, over the egg.
  const nameStep = el(doc, 'div', 'su-step su-name')
  const egg = el(doc, 'div', 'su-egg')
  egg.setAttribute('aria-hidden', 'true')
  const nameInput = el(doc, 'input', 'ss-input')
  nameInput.id = 'su-name'
  nameInput.type = 'text'
  nameInput.placeholder = SETTINGS.namePlaceholder
  nameInput.autocomplete = 'off'
  nameInput.spellcheck = false
  nameInput.maxLength = config.nameMax * 4 // a rough guard; cleanDragonName cuts it properly
  nameInput.setAttribute('autocapitalize', 'words')
  nameInput.enterKeyHint = 'next'
  nameInput.setAttribute('aria-label', SETTINGS.nameLabel)
  const swatches = createColourPicker(doc, 'su-colour', (id) => {
    colour = id
    swatches.render(colour, false)
    renderDragon(egg, config.previewLook(colour))
  })
  nameStep.append(egg, nameInput, swatches.el)
  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.isComposing) return
    e.preventDefault()
    goNext()
  })

  // Step 2: the starting tasks, all on. At least one stays on.
  const tasksStep = el(doc, 'div', 'su-step su-tasks')
  const taskList = el(doc, 'ul', 'su-task-list')
  const keepNote = el(doc, 'p', 'ss-note su-keep-note', SETUP.tasksKeepOne)
  keepNote.id = 'su-keep-note'
  const taskSwitches = offered.map((task) => {
    const li = el(doc, 'li', 'su-task')
    const name = el(doc, 'span', 'su-task-name', task.name)
    name.setAttribute('aria-hidden', 'true')
    const toggle = button(doc, 'ss-switch', '')
    toggle.dataset.task = task.id
    toggle.setAttribute('role', 'switch')
    toggle.setAttribute('aria-label', setupTaskLabel(task.name))
    toggle.append(el(doc, 'span', 'ss-switch-track'))
    // The whole row is the switch's tap area.
    li.addEventListener('click', (e) => {
      if (e.target !== toggle && !toggle.contains(e.target as Node)) toggle.click()
    })
    toggle.addEventListener('click', () => {
      if (keep.has(task.id)) {
        if (keep.size > 1) keep.delete(task.id)
      } else keep.add(task.id)
      showTasks()
    })
    li.append(name, toggle)
    taskList.append(li)
    return toggle
  })
  tasksStep.append(taskList, keepNote)
  function showTasks() {
    for (const toggle of taskSwitches) {
      const on = keep.has(toggle.dataset.task ?? '')
      toggle.setAttribute('aria-checked', String(on))
      // The last one on can't go off; the note says why.
      toggle.setAttribute('aria-disabled', String(on && keep.size === 1))
    }
    keepNote.hidden = keep.size > 1
  }

  // Step 3: the wake-up times.
  const wakeStep = el(doc, 'div', 'su-step su-wake')
  const wakeEditor = createWakeEditor(doc, {
    idPrefix: 'su',
    defaultWakeTime: config.defaultWakeTime,
    onChange(next) {
      schedule = next
    },
  })
  wakeStep.append(wakeEditor.el)

  // Step 4: an optional weekly goal, on one of the tasks chosen.
  const goalStep = el(doc, 'div', 'su-step su-goal')
  const goalEditor = createGoalEditor(doc, {
    idPrefix: 'su',
    goal: config.goal,
    maxDays: (task) => config.goalMaxDays(task, choices.wakeSchedule ?? config.wakeSchedule),
    onChange(next) {
      goal = next
      showGoal()
    },
  })
  goalStep.append(...goalEditor.els)
  /** The tasks as they'll be: unchosen ones archived (so the goal can't pick them). */
  function chosenTasks(): Task[] {
    const kept = choices.keepTasks ? new Set(choices.keepTasks) : null
    return offered.map((t) => (kept && !kept.has(t.id) ? { ...t, archived: true } : t))
  }
  function showGoal() {
    goalEditor.render(goal, chosenTasks(), false)
  }

  const STEPS: Record<StepId, { el: HTMLElement; title: string; intro: string }> = {
    name: { el: nameStep, title: SETUP.nameTitle, intro: SETUP.nameIntro },
    tasks: { el: tasksStep, title: SETUP.tasksTitle, intro: SETUP.tasksIntro },
    wake: { el: wakeStep, title: SETUP.wakeTitle, intro: SETUP.wakeIntro },
    goal: { el: goalStep, title: SETUP.goalTitle, intro: SETUP.goalIntro },
  }
  /** The steps in use: wake-up times only while the wake-up task is on. */
  function steps(): StepId[] {
    const wakeOn = wakeTask !== undefined && (choices.keepTasks ?? [wakeTask.id]).includes(wakeTask.id)
    return wakeOn ? ['name', 'tasks', 'wake', 'goal'] : ['name', 'tasks', 'goal']
  }
  let at = 0

  function show() {
    const list = steps()
    const id = list[at]!
    const step = STEPS[id]
    dialog.dataset.step = id
    title.textContent = step.title
    intro.textContent = step.intro
    for (const s of Object.values(STEPS)) s.el.remove()
    body.append(step.el)
    body.scrollTop = 0
    // Replay the step's little entrance.
    body.classList.remove('is-entering')
    void body.offsetWidth
    body.classList.add('is-entering')
    dots.replaceChildren(...list.map((_, i) => el(doc, 'span', i === at ? 'su-dot is-current' : i < at ? 'su-dot is-done' : 'su-dot')))
    dots.setAttribute('aria-label', setupStepLabel(at + 1, list.length))
    next.textContent = at === list.length - 1 ? SETUP.finish : SETUP.next
    back.hidden = at === 0
    if (id === 'name') {
      swatches.render(colour, false)
      renderDragon(egg, config.previewLook(colour))
    } else if (id === 'tasks') showTasks()
    else if (id === 'wake') wakeEditor.render(schedule, false)
    else showGoal()
    title.focus({ preventScroll: true })
  }

  /** Saves (or, when skipped, leaves out) the open step's choice. */
  function record(id: StepId, skipped: boolean) {
    if (id === 'name') {
      if (skipped) {
        delete choices.name
        delete choices.colour
      } else {
        choices.name = nameInput.value
        if (colour) choices.colour = colour
        else delete choices.colour
      }
    } else if (id === 'tasks') {
      if (skipped) delete choices.keepTasks
      else choices.keepTasks = offered.filter((t) => keep.has(t.id)).map((t) => t.id)
      // Back here and the wake-up task went off: its times from before don't apply.
      if (!steps().includes('wake')) delete choices.wakeSchedule
    } else if (id === 'wake') {
      if (skipped) delete choices.wakeSchedule
      else choices.wakeSchedule = { ...schedule }
    } else if (skipped) delete choices.goal
    else choices.goal = goal
    // A goal on a task that's now off can't stay.
    const on = (g: Goal | null | undefined) => !g || chosenTasks().some((t) => !t.archived && t.id === g.taskId)
    if (!on(goal)) goal = null
    if (!on(choices.goal)) delete choices.goal
  }

  function advance(skipped: boolean) {
    if (finished) return
    record(steps()[at]!, skipped)
    if (at >= steps().length - 1) return finish()
    at++
    show()
  }
  const goNext = () => advance(false)

  let finished = false
  function finish() {
    if (finished) return
    finished = true
    if (dialog.open) dialog.close()
    dialog.remove()
    config.onFinish(choices)
  }

  /** Straight to the egg, keeping what's on the open step. */
  function finishNow() {
    if (finished) return
    record(steps()[at]!, false)
    finish()
  }
  function goBack() {
    if (finished || at === 0) return
    at--
    show()
  }

  next.addEventListener('click', goNext)
  skip.addEventListener('click', () => advance(true))
  skipAll.addEventListener('click', finishNow)
  back.addEventListener('click', goBack)
  // Escape or the back gesture: back a step, never out of setup by accident.
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault()
    goBack()
  })
  // Closed some other way (a browser that won't wait): that's Skip setup.
  dialog.addEventListener('close', finishNow)

  doc.body.append(dialog)
  dialog.showModal()
  show()
}
