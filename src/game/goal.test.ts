import { describe, expect, it } from 'vitest'
import type { GoalConfig } from '../config/goal'
import { REWARDS } from '../config/rewards'
import { DEFAULT_SETTINGS } from '../config/settings'
import { STAGES } from '../config/stages'
import type { StreakConfig } from '../config/streaks'
import { EFFORT_LEVELS, TASKS } from '../config/tasks'
import { at, log, NO_REWARD, undo } from '../testing/helpers'
import { cleanGoal, goalMaxDays, goalProgress, goalRewardFor, goalWistful, isGoalTreat, withGoal } from './goal'
import { createLogEvent } from './log'
import { treatBonus } from './rewards'
import { withScheduleEdit } from './settings'
import { totalXp } from './state'
import type { GameEvent, Goal, LogEvent, Settings, Task } from './types'

/** Fixed numbers, so these tests don't move when the real config is rebalanced. */
const CONFIG: GoalConfig = { bonusXp: 30, minDays: 1, maxDays: 7, defaultDays: 3, weekStart: 'mon', wistfulBuffer: 2 }
const GOAL_TREAT = { kind: 'treat', bonusXp: 30, goal: true }

const task = (id: string): Task => {
  const t = TASKS.find((x) => x.id === id)
  if (!t) throw new Error(id)
  return t
}
const gym = task('gym')
const read = task('read')
const wake = task('wake')

// Mon 5 to Sun 11 October 2026 (BST). The next week starts Mon 12 at 04:00.
const DAYS = { mon: '05', tue: '06', wed: '07', thu: '08', fri: '09', sat: '10', sun: '11', nextMon: '12' } as const
type Day = keyof typeof DAYS
const when = (day: Day, hm = '19:00') => at(`2026-10-${DAYS[day]}T${hm}:00+01:00`)

const withGoalOn = (goal: Goal | null, base: Settings = DEFAULT_SETTINGS): Settings => withGoal(base, goal)
const GYM3 = withGoalOn({ taskId: 'gym', daysPerWeek: 3 })

/** Gym logs on the given days, each through goalRewardFor, so a meeting log holds its treat. */
function gymWeek(days: Day[], settings: Settings = GYM3, events: GameEvent[] = []): GameEvent[] {
  const out = [...events]
  for (const d of days) {
    const e: LogEvent = log(gym, when(d))
    const reward = goalRewardFor(out, e, gym, settings, CONFIG)
    if (reward) e.reward = reward
    out.push(e)
  }
  return out
}
const progress = (events: readonly GameEvent[], now: number, settings: Settings = GYM3, tasks: readonly Task[] = TASKS) =>
  goalProgress(events, tasks, settings, now, CONFIG)
const goalTreats = (events: readonly GameEvent[]) => events.filter((e) => e.type === 'log' && isGoalTreat(e)).length

describe('goalProgress', () => {
  it('is null with no goal (absent or null), and for an archived or unknown task', () => {
    expect(progress([], when('mon'), DEFAULT_SETTINGS)).toBeNull()
    expect(progress([], when('mon'), withGoalOn(null))).toBeNull()
    expect(progress([], when('mon'), GYM3, TASKS.map((t) => (t.id === 'gym' ? { ...t, archived: true } : t)))).toBeNull()
    expect(progress([], when('mon'), withGoalOn({ taskId: 'nope', daysPerWeek: 3 }))).toBeNull()
  })

  it('counts distinct days this week: two logs on one day count once, and logs past the target keep counting', () => {
    const p = progress([log(gym, when('mon', '08:00')), log(gym, when('mon', '20:00')), log(gym, when('tue'))], when('tue', '21:00'))
    expect(p).toMatchObject({ task: gym, done: 2, target: 3, met: false })
    const four = progress(gymWeek(['mon', 'tue', 'wed', 'thu']), when('thu', '21:00'))
    expect(four).toMatchObject({ done: 4, target: 3, met: true })
  })

  it('splits weeks at Monday 04:00: Monday 03:59 still belongs to Sunday', () => {
    const late = log(gym, when('nextMon', '03:59'))
    expect(progress([late], when('nextMon', '03:59'))).toMatchObject({ done: 1, daysLeft: 1 })
    expect(progress([late], when('nextMon', '04:00'))).toMatchObject({ done: 0, daysLeft: 7 })
    expect(progress([log(gym, when('nextMon', '04:00'))], when('nextMon', '10:00'))).toMatchObject({ done: 1 })
  })

  it('counts from Monday when the goal is set mid-week, and ignores other tasks and undone logs', () => {
    const tue = log(gym, when('tue'))
    const events = [log(gym, when('mon')), tue, log(read, when('tue')), undo(tue, when('tue', '19:01'))]
    // Settings hold no history: a goal set on Wednesday counts the whole week so far.
    expect(progress(events, when('wed'))).toMatchObject({ done: 1, daysLeft: 5 })
  })

  it('ignores logs dated after today (a clock that ran ahead)', () => {
    expect(progress(gymWeek(['mon', 'thu']), when('wed'))).toMatchObject({ done: 1 })
  })

  it('caps the wake-up goal at the week’s target days, by the schedule in force each day', () => {
    const wake7 = withGoalOn({ taskId: 'wake', daysPerWeek: 7 })
    expect(goalMaxDays(gym, wake7, when('mon'), CONFIG)).toBe(7)
    expect(goalMaxDays(wake, wake7, when('mon'), CONFIG)).toBe(5)
    expect(progress([], when('mon'), wake7)).toMatchObject({ target: 5 })
    // Wednesday's edit turns Thursday and Friday off: Mon to Wed keep theirs, so 3.
    const edited = withScheduleEdit(wake7, { ...wake7.wakeSchedule, thu: null, fri: null }, when('wed'))
    expect(goalMaxDays(wake, edited, when('wed'), CONFIG)).toBe(3)
    expect(progress([], when('wed'), edited)).toMatchObject({ target: 3 })
    // A wake-up goal of 2 stays 2.
    expect(progress([], when('wed'), withGoalOn({ taskId: 'wake', daysPerWeek: 2 }, edited))).toMatchObject({ target: 2 })
    // A week with no targets at all: nothing to aim for.
    const none = withGoalOn({ taskId: 'wake', daysPerWeek: 3 }, { ...DEFAULT_SETTINGS, wakeSchedule: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null } })
    expect(goalMaxDays(wake, none, when('mon'), CONFIG)).toBe(0)
    expect(progress([], when('mon'), none)).toBeNull()
  })
})

describe('goalWistful', () => {
  const wistful = (events: readonly GameEvent[], now: number, settings: Settings = GYM3, tasks: readonly Task[] = TASKS) =>
    goalWistful(progress(events, now, settings, tasks), CONFIG)
  const WEEK: Day[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  /** The days before `day` this week, the first `n` of them logged. */
  const doneBefore = (day: Day, n: number) => gymWeek(WEEK.slice(0, WEEK.indexOf(day)).slice(0, n))

  it('gym 3 a week: wistful from Thursday with none done, Friday with one, Saturday with two; quiet once out of reach or met', () => {
    // [day, days done before it, wistful that morning]
    const table: [Day, number, boolean][] = [
      ['mon', 0, false], ['tue', 0, false], ['wed', 0, false], ['thu', 0, true],
      ['thu', 1, false], ['fri', 0, true], ['fri', 1, true], ['fri', 2, false],
      ['sat', 0, false], ['sat', 1, true], ['sat', 2, true], ['sun', 1, false], ['sun', 2, true], ['sun', 3, false],
    ]
    for (const [day, n, expected] of table) expect(wistful(doneBefore(day, n), when(day, '09:00')), `${day} after ${n}`).toBe(expected)
    // The progress behind it.
    expect(progress(doneBefore('fri', 1), when('fri', '09:00'))).toMatchObject({ done: 1, daysLeft: 3, chancesLeft: 3, loggedToday: false })
  })

  it('a log of the goal task lifts it straight away, even while the week stays tight; undoing brings it back', () => {
    const before = doneBefore('sat', 1)
    expect(wistful(before, when('sat', '09:00'))).toBe(true)
    const sat = log(gym, when('sat', '09:00'))
    const after = [...before, sat]
    expect(progress(after, when('sat', '09:01'))).toMatchObject({ done: 2, loggedToday: true })
    expect(wistful(after, when('sat', '09:01'))).toBe(false)
    expect(wistful([...after, undo(sat, when('sat', '09:02'))], when('sat', '09:03'))).toBe(true)
    // Another task's log doesn't lift it.
    expect(wistful([...before, log(read, when('sat', '09:00'))], when('sat', '09:01'))).toBe(true)
  })

  it('a 7-day goal is wistful each morning until logged', () => {
    const seven = withGoalOn({ taskId: 'gym', daysPerWeek: 7 })
    expect(wistful([], when('mon', '08:00'), seven)).toBe(true)
    const mon = gymWeek(['mon'], seven)
    expect(wistful(mon, when('mon', '20:00'), seven)).toBe(false)
    expect(wistful(mon, when('tue', '08:00'), seven)).toBe(true)
  })

  it('follows the 04:00 day boundary: a 03:59 log belongs to the day before', () => {
    const late = [log(gym, when('fri', '03:59'))] // Thursday's log
    expect(progress(late, when('fri', '03:59'))).toMatchObject({ loggedToday: true })
    expect(wistful(late, when('fri', '03:59'))).toBe(false)
    // From 04:00 it's Friday: one done, two needed in three days.
    expect(wistful(late, when('fri', '04:00'))).toBe(true)
    expect(wistful([...late, log(gym, when('fri', '04:00'))], when('fri', '04:01'))).toBe(false)
  })

  it('resets on Monday: a lost or tight week is never carried over', () => {
    const tight = doneBefore('sun', 2)
    expect(wistful(tight, when('nextMon', '03:59'))).toBe(true) // still Sunday
    expect(wistful(tight, when('nextMon', '04:00'))).toBe(false)
    expect(wistful([], when('nextMon', '09:00'))).toBe(false)
  })

  it('follows a target change at once: lowered eases it, raised past reach goes quiet', () => {
    expect(wistful([], when('thu', '09:00'))).toBe(true)
    expect(wistful([], when('thu', '09:00'), withGoalOn({ taskId: 'gym', daysPerWeek: 2 }))).toBe(false)
    expect(wistful([], when('thu', '09:00'), withGoalOn({ taskId: 'gym', daysPerWeek: 5 }))).toBe(false)
    expect(wistful([], when('thu', '09:00'), withGoalOn({ taskId: 'gym', daysPerWeek: 4 }))).toBe(true)
  })

  it('is never wistful with no goal, an archived goal task, or a buffer of 0 on a roomy week', () => {
    expect(goalWistful(null, CONFIG)).toBe(false)
    expect(wistful([], when('sat', '09:00'), DEFAULT_SETTINGS)).toBe(false)
    expect(wistful([], when('thu', '09:00'), GYM3, TASKS.map((t) => (t.id === 'gym' ? { ...t, archived: true } : t)))).toBe(false)
    expect(goalWistful(progress([], when('thu', '09:00')), { wistfulBuffer: 0 })).toBe(false)
  })

  it('the wake-up goal counts only days with a wake target, and today only while its window is open', () => {
    const wake7 = withGoalOn({ taskId: 'wake', daysPerWeek: 7 }) // capped to 5: Monday to Friday
    const wakeOn = (days: Day[]) => days.map((d) => log(wake, when(d, '06:35')))
    expect(progress([], when('mon', '06:00'), wake7)).toMatchObject({ target: 5, daysLeft: 7, chancesLeft: 5 })
    expect(wistful([], when('mon', '06:00'), wake7)).toBe(true)
    // The window closes at 06:45 (06:30 plus grace): Monday's chance has gone, and so has the week.
    expect(progress([], when('mon', '06:46'), wake7)).toMatchObject({ chancesLeft: 4 })
    expect(wistful([], when('mon', '06:46'), wake7)).toBe(false)
    // Four done by Friday morning: one needed, one chance.
    expect(wistful(wakeOn(['mon', 'tue', 'wed', 'thu']), when('fri', '06:00'), wake7)).toBe(true)
    // The weekend has no wake targets, so a week not met by Friday goes quiet.
    expect(wistful(wakeOn(['mon', 'tue', 'wed', 'thu']), when('sat', '09:00'), wake7)).toBe(false)
    // Three a week: one done by Thursday morning is tight; once Thursday's window closes it's out of reach.
    const wake3 = withGoalOn({ taskId: 'wake', daysPerWeek: 3 })
    expect(wistful(wakeOn(['mon']), when('thu', '06:00'), wake3)).toBe(true)
    expect(wistful(wakeOn(['mon']), when('thu', '07:00'), wake3)).toBe(false)
  })
})

describe('goalRewardFor', () => {
  it('pays the first new day that reaches the target, once a week', () => {
    const events = gymWeek(['mon', 'tue', 'wed', 'thu'])
    expect(events.map((e) => (e as LogEvent).reward)).toEqual([undefined, undefined, GOAL_TREAT, undefined])
    // Raising the target after it was met doesn't pay a second time that week.
    const raised = withGoalOn({ taskId: 'gym', daysPerWeek: 5 })
    expect(goalTreats(gymWeek(['fri', 'sat'], raised, events))).toBe(1)
    // A new week earns it again (here a 1-day goal, met on its Monday).
    expect(goalTreats(gymWeek(['nextMon'], withGoalOn({ taskId: 'gym', daysPerWeek: 1 }), events))).toBe(2)
  })

  it('pays nothing for a second log the same day, another task, no goal, or a zero bonus', () => {
    const two = gymWeek(['mon', 'tue'])
    expect(goalRewardFor([...two, log(gym, when('tue', '08:00'))], log(gym, when('tue', '20:00')), gym, GYM3, CONFIG)).toBeUndefined()
    expect(goalRewardFor(two, log(read, when('wed')), read, GYM3, CONFIG)).toBeUndefined()
    expect(goalRewardFor(two, log(gym, when('wed')), gym, DEFAULT_SETTINGS, CONFIG)).toBeUndefined()
    expect(goalRewardFor(two, log(gym, when('wed')), gym, GYM3, { ...CONFIG, bonusXp: 0 })).toBeUndefined()
    expect(goalRewardFor(two, log(gym, when('wed')), gym, GYM3, CONFIG)).toEqual(GOAL_TREAT)
  })

  it('a target lowered to the count or below pays on the next new day, and only once', () => {
    const five = withGoalOn({ taskId: 'gym', daysPerWeek: 5 })
    const events = gymWeek(['mon', 'tue', 'wed'], five)
    expect(goalTreats(events)).toBe(0)
    // Lowered to 2 with 3 days done: the lowering itself pays nothing...
    const two = withGoalOn({ taskId: 'gym', daysPerWeek: 2 })
    expect(progress(events, when('wed', '21:00'), two)).toMatchObject({ done: 3, target: 2, met: true })
    // ...a second log on a day already counted doesn't either...
    expect(goalRewardFor(events, log(gym, when('wed', '21:00')), gym, two, CONFIG)).toBeUndefined()
    // ...and the next new day does, once.
    const later = gymWeek(['thu', 'fri'], two, events)
    expect(later.slice(3).map((e) => (e as LogEvent).reward)).toEqual([GOAL_TREAT, undefined])
    // Lowered to exactly the count: the same.
    expect(goalTreats(gymWeek(['thu'], withGoalOn({ taskId: 'gym', daysPerWeek: 3 }), events))).toBe(1)
  })

  it('undoing the meeting log takes the treat with it, and logging again earns it back', () => {
    const events = gymWeek(['mon', 'tue', 'wed'])
    const meeting = events[2] as LogEvent
    expect(isGoalTreat(meeting)).toBe(true)
    const undone = [...events, undo(meeting, when('wed', '19:05'))]
    expect(progress(undone, when('wed', '19:06'))).toMatchObject({ done: 2, met: false })
    const again = gymWeek(['wed'], GYM3, undone)
    expect(isGoalTreat(again[again.length - 1] as LogEvent)).toBe(true)
    expect(goalTreats(again.filter((e) => e !== meeting))).toBe(1)
  })

  it('caps the wake-up goal: 7 asked, 5 target days, so the fifth day pays', () => {
    const wake7 = withGoalOn({ taskId: 'wake', daysPerWeek: 7 })
    const days: Day[] = ['mon', 'tue', 'wed', 'thu']
    const events = days.map((d) => log(wake, when(d, '06:35')))
    expect(goalRewardFor(events.slice(0, 3), events[3] as LogEvent, wake, wake7, CONFIG)).toBeUndefined()
    expect(goalRewardFor(events, log(wake, when('fri', '06:35')), wake, wake7, CONFIG)).toEqual(GOAL_TREAT)
  })

  it('isGoalTreat checks the shape: only a treat with goal: true', () => {
    const base = log(gym, when('mon'))
    expect(isGoalTreat({ ...base, reward: { kind: 'treat', bonusXp: 30, goal: true } })).toBe(true)
    expect(isGoalTreat({ ...base, reward: { kind: 'treat', bonusXp: 30 } })).toBe(false)
    expect(isGoalTreat({ ...base, reward: { kind: 'item', itemId: 'x' } })).toBe(false)
    expect(isGoalTreat({ ...base, reward: { kind: 'treat', goal: 'yes' } as never })).toBe(false)
    expect(isGoalTreat(base)).toBe(false)
  })
})

describe('createLogEvent with a goal', () => {
  const STREAKS: StreakConfig = { freezeEveryDays: 7, freezeMaxHeld: 2, milestones: [], weekStart: 'mon' }
  const rules = (streaks: StreakConfig = STREAKS) => ({ stages: STAGES, rewards: REWARDS, streaks, effortLevels: EFFORT_LEVELS, goal: CONFIG })
  function logDays(days: Day[], settings: Settings, streaks?: StreakConfig, roll = NO_REWARD): GameEvent[] {
    const out: GameEvent[] = []
    for (const d of days) out.push(createLogEvent(gym, out, settings, when(d), `g-${d}`, roll, rules(streaks))!)
    return out
  }

  it('saves the goal treat on the meeting log in place of the roll, and its XP counts', () => {
    const events = logDays(['mon', 'tue', 'wed'], GYM3, STREAKS, { chance: REWARDS.rareChance, pick: 0 })
    const meeting = events[2] as LogEvent
    expect(meeting.reward).toEqual(GOAL_TREAT)
    expect(treatBonus(meeting)).toBe(30)
    expect(totalXp([meeting])).toBe(meeting.xpAwarded + 30)
  })

  it('a streak milestone on the meeting log wins, and the goal treat comes on the next new day, once', () => {
    const events = logDays(['mon', 'tue', 'wed', 'thu', 'fri'], GYM3, { ...STREAKS, milestones: [3] })
    expect((events[2] as LogEvent).reward).toMatchObject({ kind: 'item', milestone: 3 })
    expect((events[3] as LogEvent).reward).toEqual(GOAL_TREAT)
    expect((events[4] as LogEvent).reward).toBeUndefined()
    expect(goalTreats(events)).toBe(1)
  })
})

describe('cleanGoal and withGoal', () => {
  it('keeps a well-formed goal and drops anything else', () => {
    expect(cleanGoal({ taskId: 'gym', daysPerWeek: 3, extra: 1 }, CONFIG)).toEqual({ taskId: 'gym', daysPerWeek: 3 })
    expect(cleanGoal({ taskId: 'gym', daysPerWeek: 1 }, CONFIG)).toEqual({ taskId: 'gym', daysPerWeek: 1 })
    expect(cleanGoal({ taskId: 'gym', daysPerWeek: 7 }, CONFIG)).toEqual({ taskId: 'gym', daysPerWeek: 7 })
    for (const bad of [null, undefined, 'gym', 3, [], ['gym', 3], {}, { taskId: '', daysPerWeek: 3 }, { taskId: 4, daysPerWeek: 3 }, { taskId: 'gym' }, { taskId: 'gym', daysPerWeek: 0 }, { taskId: 'gym', daysPerWeek: 8 }, { taskId: 'gym', daysPerWeek: 2.5 }, { taskId: 'gym', daysPerWeek: '3' }, { taskId: 'gym', daysPerWeek: Number.NaN }]) {
      expect(cleanGoal(bad, CONFIG), JSON.stringify(bad)).toBeNull()
    }
  })

  it('withGoal sets or clears the goal and leaves everything else alone', () => {
    const set = withGoal(DEFAULT_SETTINGS, { taskId: 'read', daysPerWeek: 4 })
    expect(set).toEqual({ ...DEFAULT_SETTINGS, goal: { taskId: 'read', daysPerWeek: 4 } })
    expect(withGoal(set, null)).toEqual({ ...DEFAULT_SETTINGS, goal: null })
  })
})
