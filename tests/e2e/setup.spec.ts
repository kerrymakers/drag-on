// First-run setup on a brand-new phone (M9 slice 2): name, colour, tasks, wake-up times
// and a goal, then Home. The fixtures skip setup everywhere else; this spec turns it on.
// Screenshots (with SCREENSHOTS=1): tests/screenshots/m9s2-*
import { test, expect, shot, settle, LAYOUT, type Page } from './fixtures'
import { TASKS } from '../../src/config/tasks'
import { SETTINGS, SETUP, setupHello, setupTaskLabel } from '../../src/ui/copy'

test.use({ timezoneId: 'Europe/London', locale: 'en-GB', skipSetup: false })
// Friday 23 October 2026 (BST), early, so the wake-up task is on Home too.
const FRI = new Date('2026-10-23T06:00:00+01:00')

async function open(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install({ time: FRI })
  await page.goto('./')
}

const setup = (page: Page) => page.locator('dialog#setup')
const next = (page: Page) => page.locator('#su-next')
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('drag-on:v1') ?? 'null'))

test('a new friend names their egg, picks a colour, tasks and a goal, and lands on Home', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await open(page)
  await expect(setup(page)).toBeVisible()
  await expect(page.locator('#su-title')).toHaveText(SETUP.nameTitle)

  // 1. Name and colour: the egg takes the colour straight away.
  const name = 'Ember'
  await expect(page.locator('#su-back')).toBeHidden()
  await page.getByRole('textbox', { name: SETTINGS.nameLabel }).fill(name)
  await page.locator('#su-colour [data-colour="mint"]').tap()
  await expect(page.locator('.su-egg .dragon-svg')).toHaveAttribute('data-colour', 'mint')
  await shot(page, 'm9s2-name', { settled: true })
  await next(page).tap()

  // 2. Tasks: all on; untick the walk (a tap on its row). The last one on can't go off.
  await expect(page.locator('#su-title')).toHaveText(SETUP.tasksTitle)
  const walk = page.getByRole('switch', { name: setupTaskLabel('Went for a walk') })
  await expect(walk).toHaveAttribute('aria-checked', 'true')
  await page.locator('.su-task', { hasText: 'Went for a walk' }).locator('.su-task-name').tap()
  await expect(walk).toHaveAttribute('aria-checked', 'false')
  await next(page).tap()

  // 3. Wake-up times (the wake-up task is on): Saturday gets a time.
  await expect(page.locator('#su-title')).toHaveText(SETUP.wakeTitle)
  await page.locator('#su-wake-sat-on').tap()
  await expect(page.locator('#su-wake-sat')).toHaveValue('06:30')
  await next(page).tap()

  // 4. A goal: the unticked walk isn't on offer; gym, 4 days.
  await expect(page.locator('#su-title')).toHaveText(SETUP.goalTitle)
  await expect(page.locator('#su-goal-task option[value="walk"]')).toHaveCount(0)
  await page.locator('#su-goal-task').selectOption('gym')
  await page.locator('#su-goal-more').tap()
  await expect(page.locator('#su-goal-days')).toHaveText('4 days a week')
  await expect(next(page)).toHaveText(SETUP.finish)
  // Back to the wake-up times: Saturday is still on. Then on again, the goal kept.
  await page.locator('#su-back').tap()
  await expect(page.locator('#su-wake-sat-on')).toHaveAttribute('aria-checked', 'true')
  await next(page).tap()
  await expect(page.locator('#su-goal-days')).toHaveText('4 days a week')
  await next(page).tap()

  // Home: the name, the tinted egg, no walk, the goal chip, and a hello.
  await expect(setup(page)).toHaveCount(0)
  await expect(page.locator('#dragon-name')).toHaveText(name)
  await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-stage', 'egg')
  await expect(page.locator('#dragon-art .dragon-svg')).toHaveAttribute('data-colour', 'mint')
  const shownTasks = await page.locator('#task-list button.task').evaluateAll((b) => b.map((e) => (e as HTMLElement).dataset.taskId))
  expect(shownTasks).toEqual(TASKS.filter((t) => t.id !== 'walk').map((t) => t.id))
  await expect(page.locator('#goal-chip-name')).toHaveText(/Gym/)
  await expect(page.locator('#speech')).toHaveText(setupHello(name))
  // The logging path is untouched: one tap logs.
  await page.locator('#task-list button.task[data-task-id="gym"]').tap()
  await expect(page.locator('#xp-total')).toHaveText(String(TASKS.find((t) => t.id === 'gym')!.xp))

  // The wake-up step's choice reached the settings (Home can't show Saturday's time today).
  expect((await stored(page)).settings.wakeSchedule.sat).toBe('06:30')

  // Never again: a reload opens Home.
  await page.reload()
  await expect(page.locator('#dragon-name')).toHaveText(name)
  await expect(setup(page)).toHaveCount(0)
  expect(errors).toEqual([])
})

test('every step fits, with thumb-sized targets, and Skip setup goes straight to the egg, keeping the open step', LAYOUT, async ({ page }, info) => {
  await open(page)
  const vw = page.viewportSize()!
  for (const step of ['name', 'tasks', 'wake', 'goal']) {
    await expect(setup(page)).toHaveAttribute('data-step', step)
    await settle(page)
    // Nothing wider than the screen; Next and Skip in the lower half and in view.
    expect(await page.evaluate(() => document.querySelector('.su-frame')!.scrollWidth <= window.innerWidth)).toBe(true)
    for (const id of ['#su-next', '#su-skip', '#su-skip-all', ...(step === 'name' ? [] : ['#su-back'])]) {
      const box = (await page.locator(id).boundingBox())!
      expect(box.height, id).toBeGreaterThanOrEqual(44)
      expect(box.width, id).toBeGreaterThanOrEqual(44)
      expect(box.x + box.width, id).toBeLessThanOrEqual(vw.width)
      expect(box.y + box.height, id).toBeLessThanOrEqual(vw.height)
      if (id === '#su-next' || id === '#su-skip') expect(box.y, id).toBeGreaterThan(vw.height / 2)
    }
    const targets = await page.locator('.setup .ss-swatch, .setup .ss-switch, .setup .ss-step:visible, .setup .ss-input').evaluateAll((els) =>
      els.filter((e) => (e as HTMLElement).offsetParent).map((e) => e.getBoundingClientRect()).map((r) => Math.min(r.width, r.height)),
    )
    for (const size of targets) expect(size).toBeGreaterThanOrEqual(44)
    if (step === 'goal') await page.locator('#su-goal-task').selectOption('gym')
    await shot(page, `m9s2-${step}-${info.project.name}`, { settled: true })
    if (step !== 'goal') await page.locator('#su-skip').tap()
  }
  // Skip setup from the last step: the skipped steps saved nothing (every task), and the
  // open step's goal is kept.
  await page.locator('#su-skip-all').tap()
  await expect(setup(page)).toHaveCount(0)
  await expect(page.locator('#dragon-name')).toHaveText('your dragon')
  await expect(page.locator('#task-list button.task')).toHaveCount(TASKS.length)
  expect((await stored(page)).settings.goal).toEqual({ taskId: 'gym', daysPerWeek: 3 })
})
