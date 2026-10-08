// Balance simulation for Drag-on.
//
// Run with:  npx vite-node scripts/simulate.ts [days] [runs] [--exact]
//   --exact  passes the full event log to createLogEvent instead of the fast
//            carry-forward summary (slow; use with few runs to check they agree).
//
// MEASURED (uses the real code in src/game/ and src/config/):
//   - which logs are accepted (createLogEvent + taskAvailability: wake-up window,
//     no-target weekends, once-per-day, avoided daily limit from config), XP per log, totalXp,
//     dragonStage + stageReached (stage holding), moodFor with config/mood.ts,
//     dayKey (Europe/London, 04:00 boundary, including clock changes).
//   - stat totals: the real statTotals() (src/game/stats.ts), applied to each accepted log
//     and checked against statTotals() over the whole log at the end of every run.
//   - evolution look: the real evolutionLook() + lookChange() (src/game/evolution.ts) with
//     config/evolution.ts, re-run after every accepted log so every change is counted.
//
//   - treats: the real rollReward() via createLogEvent with config/rewards.ts; bonus XP
//     counted by the real totalXp/statTotals (logXp). Reward rolls use their own RNG
//     stream, so each run is paired with a no-treat twin (same behaviour, treatChance 0)
//     to measure exactly how much treats change stage days and looks.
//   - rare items: the real rollReward() picks among the items not found yet (config/items.ts),
//     and the real foundItems() counts them (checked at the end of every run). The days
//     items are found and the day the collection is complete are reported. Once every item
//     is found, a rare roll gives a treat (also real code).
//
// PROJECTED (the spec describes these but there is no code yet; numbers here
// are this script's reading of SPEC.md, not the app's behaviour):
//   - overall streak, streak freezes (1 per 7-day streak, max 2), milestone items (STREAK_MILESTONES).
//     Milestone items are counted separately and don't come out of config/items.ts here.

import { createLogEvent, rollReward, dayKey, dragonStage, evolutionLook, foundItems, lookChange, moodFor, rewardItemId, statTotals, totalXp, weekdayOf } from '../src/game'
import type { Evolution, GameEvent, LogEvent, MoodId, StatId, Task } from '../src/game'
import { EVOLVES_AT_STAGE, LOOK_CHANGE_MARGIN } from '../src/config/evolution'
import { MOODS } from '../src/config/mood'
import { TASKS } from '../src/config/tasks'
import { STAGES } from '../src/config/stages'
import { STATS } from '../src/config/stats'
import { DEFAULT_SETTINGS } from '../src/config/settings'
import { TIME_ZONE } from '../src/config/time'
import { REWARDS } from '../src/config/rewards'
import type { RewardConfig } from '../src/config/rewards'
import { STREAKS, STREAK_MILESTONES } from '../src/config/streaks'
// The fast path can't see the whole log, so the real streak milestones are off here
// (milestones: []); --milestones=first projects them. For measured streaks, freezes and
// milestone items on the full log, a slower full-log sim is needed (M5 balance check).
const SIM_STREAKS = { ...STREAKS, milestones: [] as number[] }

const DAYS = Number(process.argv[2] ?? 365)
const RUNS = Number(process.argv[3] ?? 300)
// Optional what-if, applied in memory only (config files are never changed):
// Variants set absolute values, never relative ones, so they can't double-apply.
//   --variant=evo     avoided = 15xp max 2/day, read = 25xp (now the real config, so a no-op)
//   --variant=juv     Juvenile threshold = 1300 (now the real config, so a no-op)
//   --variant=rare6   rare item chance 3% -> 6% (projection)
//   --variant=heart20 / heart25  selfcare XP 15 -> 20 / 25
//   --margin=N       look rule what-if: overrides LOOK_CHANGE_MARGIN with N% (in memory only)
//   --profiles=a,b   only run profiles whose key is listed (see PROFILES)
//   --variant=mood35  sleepy from 3 days, grumpy from 5 (instead of config/mood.ts)
// Item pacing what-ifs (in memory only):
//   --rare=N         rare chance N% (overrides config)
//   --items=N        item pool of N (the real items, trimmed or padded with unnamed sim-only ids)
//   Bad-luck protection is real code (rollReward, config ITEM_PITY_LOGS) and on by default.
//   --pity=Nl        what-if: the real rule with N logs instead of the config value
//   --pity=Nd        what-if (sim only): real rule off; if no item for N game days, the next log brings one
//   --pity=off       real rule off
//   --milestones=first|repeat  PROJECTION of M5: streak milestones (STREAK_MILESTONES) take a guaranteed
//                    item from the same pool (via the real rollReward with a forced rare roll).
//                    first = each milestone once ever; repeat = every time a streak reaches it.
//   --no-twins       skip the no-treat twin runs (faster; treat comparison lines are skipped)
const VARIANT = process.argv.find((a) => a.startsWith('--variant='))?.split('=')[1] ?? null
const EXACT = process.argv.includes('--exact')
const MARGIN_ARG = process.argv.find((a) => a.startsWith('--margin='))?.split('=')[1]
const MARGIN = MARGIN_ARG === undefined ? LOOK_CHANGE_MARGIN : Number(MARGIN_ARG) / 100
const PROFILE_FILTER = process.argv.find((a) => a.startsWith('--profiles='))?.split('=')[1]?.split(',') ?? null
// Chance the app is opened (at 12:00) on a day with no log. Log days always count as an open.
const PEEK_CHANCE = 0.3
const MOOD_LIST =
  VARIANT === 'mood35'
    ? MOODS.map((m) => (m.id === 'sleepy' ? { ...m, fromDays: 3 } : m.id === 'grumpy' ? { ...m, fromDays: 5 } : m))
    : MOODS
const BASE_SEED = 20261005
const START = { y: 2026, m: 10, d: 5 } // a Monday; crosses the Oct and Mar clock changes

// Real reward config; what-ifs applied in memory only.
//   --treat=N   treat chance N%   --bonus=N  treat bonus share N%
const TREAT_ARG = process.argv.find((a) => a.startsWith('--treat='))?.split('=')[1]
const BONUS_ARG = process.argv.find((a) => a.startsWith('--bonus='))?.split('=')[1]
const REWARD_CFG: RewardConfig = {
  ...REWARDS,
  rareChance: VARIANT === 'rare6' ? 0.06 : REWARDS.rareChance,
  treatChance: TREAT_ARG === undefined ? REWARDS.treatChance : Number(TREAT_ARG) / 100,
  treatBonusShare: BONUS_ARG === undefined ? REWARDS.treatBonusShare : Number(BONUS_ARG) / 100,
}
const RARE_ARG = process.argv.find((a) => a.startsWith('--rare='))?.split('=')[1]
const ITEMS_ARG = process.argv.find((a) => a.startsWith('--items='))?.split('=')[1]
if (RARE_ARG !== undefined) REWARD_CFG.rareChance = Number(RARE_ARG) / 100
if (ITEMS_ARG !== undefined) {
  const n = Number(ITEMS_ARG)
  const real = REWARDS.items.slice(0, n)
  const pad = Array.from({ length: Math.max(0, n - real.length) }, (_, k) => ({ ...REWARDS.items[0]!, id: `sim-extra-${k}` }))
  REWARD_CFG.items = [...real, ...pad]
}
const PITY_ARG = process.argv.find((a) => a.startsWith('--pity='))?.split('=')[1]
// Only the days rule is simulated here; the logs rule is the real one, set on the config.
const PITY_DAYS = PITY_ARG?.endsWith('d') ? Number(PITY_ARG.slice(0, -1)) : null
if (PITY_ARG === 'off' || PITY_DAYS !== null) REWARD_CFG.itemPityLogs = 0
else if (PITY_ARG?.endsWith('l')) REWARD_CFG.itemPityLogs = Number(PITY_ARG.slice(0, -1))
else if (PITY_ARG !== undefined) throw new Error(`--pity=${PITY_ARG}: use Nl, Nd or off`)
const MILESTONE_MODE = (process.argv.find((a) => a.startsWith('--milestones='))?.split('=')[1] ?? null) as 'first' | 'repeat' | null
const NO_TWINS = process.argv.includes('--no-twins')
if (EXACT && MILESTONE_MODE) throw new Error('--exact is not supported with --milestones')
const NO_TREATS: RewardConfig = { ...REWARD_CFG, treatChance: 0 }
// Stage thresholds what-if: --stages=100,500,1300,3500,7000
const STAGES_ARG = process.argv.find((a) => a.startsWith('--stages='))?.split('=')[1]?.split(',').map(Number)
const MILESTONES: readonly number[] = STREAK_MILESTONES
const FREEZE_EVERY = 7
const FREEZE_MAX = 2

// ---------- seeded RNG ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- London wall-clock -> instant (script-only helper) ----------
const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
function londonInstant(y: number, m: number, d: number, hh: number, mm: number): number {
  for (const offsetH of [0, 1]) {
    const t = Date.UTC(y, m - 1, d, hh - offsetH, mm)
    const [h, mi] = fmt.format(t).split(':').map(Number)
    if (h === hh && mi === mm) return t
  }
  throw new Error(`No instant for ${y}-${m}-${d} ${hh}:${mm}`)
}
function calendarDay(i: number): { y: number; m: number; d: number } {
  const dt = new Date(Date.UTC(START.y, START.m - 1, START.d + i))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

// ---------- user profiles ----------
interface DayPlan {
  wakeOnTime: number // chance, on target days, of getting up on time and logging it in the window
  wakeLateTry: number // chance of trying to log it after the window anyway (should be refused)
  gym: number
  walk: number
  read: number
  selfcare: number
  avoided: number // expected avoided-task logs attempted per day (may exceed 3; the cap is real)
}
interface Profile {
  key: string
  name: string
  plan: (day: number, rng: () => number, ctx: RunCtx) => DayPlan | null // null = no logging at all
}
interface RunCtx {
  gaps: Array<[number, number]> // [startDay, endDay) with no logging
}

const keen: Profile = {
  key: 'keen',
  name: 'Keen',
  plan: (_d, rng) =>
    rng() < 0.05
      ? null // the odd day off (ill, travel)
      : { wakeOnTime: 0.9, wakeLateTry: 0.5, gym: 0.7, walk: 0.8, read: 0.8, selfcare: 0.6, avoided: 1.8 },
}
const typical: Profile = {
  key: 'typical',
  name: 'Typical',
  plan: (_d, rng) =>
    rng() < 0.08
      ? null
      : { wakeOnTime: 0.6, wakeLateTry: 0.2, gym: 0.36, walk: 0.25, read: 0.25, selfcare: 0.3, avoided: 0.35 },
}
const patchy: Profile = {
  key: 'patchy',
  name: 'Patchy',
  plan: (d, rng, ctx) => {
    if (ctx.gaps.some(([a, b]) => d >= a && d < b)) return null
    const goodWeek = Math.floor(d / 7) % 2 === 0
    if (goodWeek)
      return { wakeOnTime: 0.65, wakeLateTry: 0.2, gym: 0.4, walk: 0.3, read: 0.3, selfcare: 0.35, avoided: 0.5 }
    if (rng() < 0.45) return null
    return { wakeOnTime: 0.25, wakeLateTry: 0.1, gym: 0.12, walk: 0.15, read: 0.1, selfcare: 0.25, avoided: 0.15 }
  },
}
// Light: logs most weeks but not much; wake 2/5 weekdays, gym about once a week.
const light: Profile = {
  key: 'light',
  name: 'Light (wake ~2/5, gym ~1x/wk, a little else, ~20% days off)',
  plan: (_d, rng) =>
    rng() < 0.2
      ? null
      : { wakeOnTime: 0.4, wakeLateTry: 0.2, gym: 0.17, walk: 0.2, read: 0.15, selfcare: 0.2, avoided: 0.2 },
}
// Habit-focused typicals, to test whether different habits give different looks.
const gymFan: Profile = {
  key: 'gym',
  name: 'Typical, gym-focused (gym 4x/wk, walks, little else)',
  plan: (_d, rng) =>
    rng() < 0.08 ? null : { wakeOnTime: 0.4, wakeLateTry: 0.2, gym: 0.57, walk: 0.5, read: 0.15, selfcare: 0.2, avoided: 0.2 },
}
const reader: Profile = {
  key: 'reader',
  name: 'Typical, reader (reads most days, gym 1x/wk)',
  plan: (_d, rng) =>
    rng() < 0.08 ? null : { wakeOnTime: 0.5, wakeLateTry: 0.2, gym: 0.15, walk: 0.2, read: 0.85, selfcare: 0.3, avoided: 0.3 },
}
const heart: Profile = {
  key: 'heart',
  name: 'Typical, heart-focused (self-care most days, moderate rest)',
  plan: (_d, rng) =>
    rng() < 0.08
      ? null
      : { wakeOnTime: 0.5, wakeLateTry: 0.2, gym: 0.25, walk: 0.3, read: 0.25, selfcare: 0.85, avoided: 0.3 },
}
// Balanced: aims for roughly equal XP per stat (about 15/day each).
const balanced: Profile = {
  key: 'balanced',
  name: 'Balanced (about equal XP per stat)',
  plan: (_d, rng) =>
    rng() < 0.08 ? null : { wakeOnTime: 0.5, wakeLateTry: 0.2, gym: 0.25, walk: 0.35, read: 0.65, selfcare: 0.65, avoided: 0.3 },
}
// Light self-care: self-care 4-5 days a week, not much else. Is Heart reachable without being extreme?
const heartLight: Profile = {
  key: 'heartlite',
  name: 'Self-care 4-5x/wk, light on everything else',
  plan: (_d, rng) =>
    rng() < 0.08 ? null : { wakeOnTime: 0.4, wakeLateTry: 0.2, gym: 0.15, walk: 0.25, read: 0.2, selfcare: 0.65, avoided: 0.2 },
}
// Early riser: the wake-up habit sticks, plus chores; little else.
const riser: Profile = {
  key: 'riser',
  name: 'Early riser (wake 4/5 weekdays, chores)',
  plan: (_d, rng) =>
    rng() < 0.08 ? null : { wakeOnTime: 0.8, wakeLateTry: 0.2, gym: 0.2, walk: 0.25, read: 0.25, selfcare: 0.25, avoided: 0.6 },
}
// Habit shift: gym-heavy for the first 120 days, then swaps the gym for reading.
const shifter: Profile = {
  key: 'shift',
  name: 'Shifter (gym-heavy to day 120, then reader)',
  plan: (d, rng) =>
    rng() < 0.08
      ? null
      : d < 120
        ? { wakeOnTime: 0.4, wakeLateTry: 0.2, gym: 0.57, walk: 0.5, read: 0.15, selfcare: 0.2, avoided: 0.2 }
        : { wakeOnTime: 0.4, wakeLateTry: 0.2, gym: 0.1, walk: 0.2, read: 0.85, selfcare: 0.2, avoided: 0.2 },
}
// Lapsing: typical for 2 months, then rare logging (about 1 day a week).
const lapsing: Profile = {
  key: 'lapsing',
  name: 'Lapsing (typical to day 60, then ~1 day a week)',
  plan: (d, rng) =>
    d < 60
      ? rng() < 0.08
        ? null
        : { wakeOnTime: 0.6, wakeLateTry: 0.2, gym: 0.36, walk: 0.25, read: 0.25, selfcare: 0.3, avoided: 0.35 }
      : rng() < 0.85
        ? null
        : { wakeOnTime: 0.6, wakeLateTry: 0.2, gym: 0.36, walk: 0.25, read: 0.25, selfcare: 0.3, avoided: 0.35 },
}
const ALL_PROFILES = [keen, typical, light, patchy, balanced, gymFan, reader, heart, heartLight, riser, shifter, lapsing]
const PROFILES = PROFILE_FILTER ? ALL_PROFILES.filter((p) => PROFILE_FILTER.includes(p.key)) : ALL_PROFILES

function poisson(lambda: number, rng: () => number): number {
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= rng()
  } while (p > L)
  return k - 1
}

// ---------- one run ----------
interface RunResult {
  stageDay: Record<string, number | null> // first game day index (1-based) at each stage
  xpByDay: number[]
  stats: Record<StatId, number>
  topStatAtJuvenile: StatId | null
  topStatEnd: StatId
  lookAtJuvenile: StatId | null
  lookEnd: StatId | null
  lookChanges: number // look changes after the first look (real evolutionLook + lookChange)
  lookChangeDays: number[]
  looksSeen: StatId[]
  juvenileDayByLook: number | null // game day the look first left 'neutral'
  logs: number
  refused: Record<string, number>
  activeDays: number
  dailyLogDays: boolean[]
  rewards: { treats: number; rares: number; milestoneItems: number; milestoneFirsts: number }
  rareDays: number[] // game days (1-based) an item was found, one entry per item
  collectionDay: number | null // game day the last item was found
  streak: { longest: number; freezesEarned: number; freezesUsed: number; breaks: number }
  mood: Record<MoodId, number> // moodFor at 12:00 each day (after the first log)
  firstOpenMood: Record<MoodId, number> // moodFor just before the first log of each log day
  welcomeBack: { onLog: number; onPeek: number; peeksTotal: number }
  stageRecords: number // logs carrying stageReached
  longestGapWithoutNew: number // days between "new things" (stage, rare item, milestone)
  longestGapStagesOnly: number
  comebacks: Array<{ gapLen: number; xpWeekAfter: number }>
  treatDays: boolean[] // per day: at least one treat
  treatXp: number
  rareBandRolls: number
  milestoneFinds: number // items taken from the pool by projected milestones
  pityFinds: number // items brought by bad-luck protection
}

const TASK_LIST: readonly Task[] =
  VARIANT === 'evo'
    ? TASKS.map((t) =>
        t.id === 'avoided'
          ? { ...t, xp: 15, rules: { kind: 'maxPerDay', max: 2 } }
          : t.id === 'read'
            ? { ...t, xp: 25 }
            : t,
      )
    : VARIANT === 'heart20' || VARIANT === 'heart25'
      ? TASKS.map((t) => (t.id === 'selfcare' ? { ...t, xp: VARIANT === 'heart20' ? 20 : 25 } : t))
      : TASKS
const STAGE_LIST = STAGES_ARG
  ? STAGES.map((s, k) => (k === 0 ? s : { ...s, xpFrom: STAGES_ARG[k - 1]! }))
  : VARIANT === 'juv'
    ? STAGES.map((s) => (s.id === 'juvenile' ? { ...s, xpFrom: 1300 } : s))
    : STAGES
const TASK_BY_ID = new Map<string, Task>(TASK_LIST.map((t) => [t.id, t]))
const task = (id: string): Task => {
  const t = TASK_BY_ID.get(id)
  if (!t) throw new Error(`Missing task ${id}`)
  return t
}

function topStat(stats: Record<StatId, number>): StatId {
  let best: StatId = STATS[0]!.id
  for (const s of STATS) if (stats[s.id] > stats[best]) best = s.id
  return best
}

function simulate(profile: Profile, seed: number, rewardCfg: RewardConfig = REWARD_CFG): RunResult {
  const rng = mulberry32(seed)
  // Own stream for reward rolls, so the no-treat twin logs exactly the same tasks.
  const rewardRng = mulberry32(seed ^ 0x7ea7)
  // Separate stream so app-open sampling can't shift the behaviour stream.
  const peekRng = mulberry32(seed ^ 0x5eed)
  const ctx: RunCtx = { gaps: [] }
  if (profile === patchy) {
    // One 5-8 day gap in the first two months, and one 10-14 day "holiday" gap later.
    const g1 = 21 + Math.floor(rng() * 30)
    ctx.gaps.push([g1, g1 + 5 + Math.floor(rng() * 4)])
    const g2 = 100 + Math.floor(rng() * 50)
    ctx.gaps.push([g2, g2 + 10 + Math.floor(rng() * 5)])
  }

  const events: GameEvent[] = []
  const stats = Object.fromEntries(STATS.map((s) => [s.id, 0])) as Record<StatId, number>
  const stageDay: Record<string, number | null> = Object.fromEntries(
    STAGE_LIST.map((s) => [s.id, null]),
  )
  stageDay[STAGE_LIST[0]!.id] = 0
  const xpByDay: number[] = []
  const refused: Record<string, number> = {}
  const dailyLogDays: boolean[] = []
  let topStatAtJuvenile: StatId | null = null
  let lookAtJuvenile: StatId | null = null
  let lookChanges = 0
  const lookChangeDays: number[] = []
  let juvenileDayByLook: number | null = null
  const rules = { evolvesAt: EVOLVES_AT_STAGE, margin: MARGIN }
  let evo: Evolution = { look: 'neutral', seen: [] }
  let logs = 0
  let id = 0
  const rewards = { treats: 0, rares: 0, milestoneItems: 0, milestoneFirsts: 0 }
  const rareDays: number[] = []
  let collectionDay: number | null = null
  // Fast path: the rare roll needs to know what's been found, so each find is carried
  // forward as a 0-XP log (the last carried log holds the XP).
  const carriedFinds: LogEvent[] = []
  // Fast path: the real bad-luck protection counts the logs since the last find, so
  // those are carried forward too, as 0-XP logs (only the count matters, up to the threshold).
  const sinceFind: LogEvent[] = []
  const sinceCap = Math.max(1, rewardCfg.itemPityLogs)
  const newThingDays: number[] = [0]
  const stageDays: number[] = [0]
  const milestonesSeen = new Set<number>()
  const zeroMoods = () => Object.fromEntries(MOODS.map((m) => [m.id, 0])) as Record<MoodId, number>
  const mood = zeroMoods()
  const firstOpenMood = zeroMoods()
  const welcomeBack = { onLog: 0, onPeek: 0, peeksTotal: 0 }
  let stageRecords = 0
  const treatDays: boolean[] = []
  let treatXp = 0
  let rareBandRolls = 0
  let milestoneFinds = 0
  let pityFinds = 0
  let lastFindDay = 0 // game day (1-based) of the last find; 0 = start
  let logsSinceFind = 0
  // Inline projected streak, only used for --milestones (mirrors the post-loop projection).
  const ms = { streak: 0, freezes: 0, seen: new Set<number>() }
  const itemsLeft = () => rewards.rares < rewardCfg.items.length
  const recordFind = (itemId: string, day: number, ts: number) => {
    rewards.rares++
    rareDays.push(day)
    newThingDays.push(day)
    lastFindDay = day
    logsSinceFind = 0
    sinceFind.length = 0
    if (rewards.rares === rewardCfg.items.length) collectionDay = day
    carriedFinds.push({ id: `find-${itemId}`, type: 'log', taskId: '__find__', timestamp: ts, xpAwarded: 0, reward: { kind: 'item', itemId } })
  }

  for (let i = 0; i < DAYS; i++) {
    const { y, m, d } = calendarDay(i)
    const plan = profile.plan(i, rng, ctx)
    // Fast path: the rules only look at today's logs, and the stage logic only needs total
    // XP and the highest recorded stage. So instead of the full log we pass one synthetic
    // set of carried logs from earlier days holding exactly those two values (on the last
    // one), the finds and the logs since the last find (for rollReward), plus today's logs.
    // --exact passes the full log instead, to check the two agree.
    const yKey = calendarDay(i - 1)
    const yNoon = londonInstant(yKey.y, yKey.m, yKey.d, 12, 0)
    // The carried XP and highest stage ride on the last carried log, so the carried logs
    // stay in append order (finds, then the logs since the last find) for the pity count.
    const carried: GameEvent[] = [...carriedFinds, ...sinceFind]
    const last = carried.at(-1) as LogEvent | undefined
    if (last) carried[carried.length - 1] = { ...last, xpAwarded: totalXp(events), stageReached: dragonStage(events, STAGE_LIST).id }
    else if (events.length > 0) throw new Error('carried nothing after a log')
    const todays: GameEvent[] = EXACT ? events : carried
    const attempts: Array<{ taskId: string; ts: number }> = []
    if (plan) {
      const target = DEFAULT_SETTINGS.wakeSchedule[weekdayOf(dayKey(londonInstant(y, m, d, 12, 0)))]
      if (target != null) {
        // Also try at weekends occasionally? No: the button is hidden. Weekday attempts only.
        const [th, tm] = target.split(':').map(Number) as [number, number]
        if (rng() < plan.wakeOnTime) {
          const mins = th * 60 + tm + Math.floor(rng() * 16) // 0-15 min after target, inside grace
          attempts.push({ taskId: 'wake', ts: londonInstant(y, m, d, Math.floor(mins / 60), mins % 60) })
        } else if (rng() < plan.wakeLateTry) {
          const mins = th * 60 + tm + 16 + Math.floor(rng() * 90) // after the grace window
          attempts.push({ taskId: 'wake', ts: londonInstant(y, m, d, Math.floor(mins / 60), mins % 60) })
        }
      } else if (rng() < 0.1) {
        // Weekend: a stray attempt should be refused (no target that day).
        attempts.push({ taskId: 'wake', ts: londonInstant(y, m, d, 8, 0) })
      }
      if (rng() < plan.gym) attempts.push({ taskId: 'gym', ts: londonInstant(y, m, d, 18, 30) })
      if (rng() < plan.walk) attempts.push({ taskId: 'walk', ts: londonInstant(y, m, d, 13, 0) })
      if (rng() < plan.selfcare) attempts.push({ taskId: 'selfcare', ts: londonInstant(y, m, d, 20, 0) })
      if (rng() < plan.read) {
        // Sometimes read after midnight: should still count for this game day.
        const late = rng() < 0.2
        const n = calendarDay(i + 1)
        attempts.push({
          taskId: 'read',
          ts: late ? londonInstant(n.y, n.m, n.d, 0, 30) : londonInstant(y, m, d, 22, 0),
        })
      }
      const avoidedTries = poisson(plan.avoided, rng)
      for (let k = 0; k < avoidedTries; k++)
        attempts.push({ taskId: 'avoided', ts: londonInstant(y, m, d, 10 + k, 0) })
    }
    attempts.sort((a, b) => a.ts - b.ts)

    let loggedToday = false
    let treatToday = false
    for (const a of attempts) {
      const t = task(a.taskId)
      const roll = { chance: rewardRng(), pick: rewardRng() }
      let forced = false
      if (PITY_DAYS !== null && itemsLeft()) {
        const due = i + 1 - lastFindDay > PITY_DAYS
        if (due && roll.chance >= rewardCfg.rareChance) {
          roll.chance = 0
          forced = true
        }
      }
      const ev = createLogEvent(t, todays, DEFAULT_SETTINGS, a.ts, `e${id++}`, roll, { stages: STAGE_LIST, rewards: rewardCfg, streaks: SIM_STREAKS })
      if (!ev) {
        refused[a.taskId] = (refused[a.taskId] ?? 0) + 1
        continue
      }
      if (dayKey(ev.timestamp) !== dayKey(londonInstant(y, m, d, 12, 0)))
        throw new Error('dayKey put a log on the wrong game day')
      if (!loggedToday) {
        // The moment of opening the app to log: mood before this log lands.
        const before = moodFor(events, a.ts, MOOD_LIST).mood
        firstOpenMood[before]++
        if (before === 'sleepy' || before === 'grumpy') welcomeBack.onLog++
      }
      if (ev.stageReached !== undefined) stageRecords++
      if (!EXACT) todays.push(ev)
      events.push(ev)
      for (const st of statTotals([ev], TASK_LIST, STATS)) stats[st.stat.id] += st.xp
      {
        const next = evolutionLook(events, TASK_LIST, STATS, STAGE_LIST, rules)
        if (evo.look === 'neutral' && next.look !== 'neutral') {
          lookAtJuvenile = next.look
          juvenileDayByLook = i + 1
        } else if (lookChange(evo, next)) {
          lookChanges++
          lookChangeDays.push(i + 1)
        }
        evo = next
      }
      logs++
      loggedToday = true
      // Real rewards on the event.
      if (ev.reward?.kind === 'treat') {
        rewards.treats++
        treatXp += ev.reward.bonusXp
        treatToday = true
      }
      if (roll.chance < rewardCfg.rareChance && !forced) rareBandRolls++
      logsSinceFind++
      const itemId = rewardItemId(ev)
      if (itemId !== null) {
        // Forced by the days what-if, or brought by the real protection outside the rare band.
        if (forced || !(roll.chance < rewardCfg.rareChance)) pityFinds++
        recordFind(itemId, i + 1, yNoon)
      } else {
        sinceFind.push({ id: `since-${ev.id}`, type: 'log', taskId: '__since__', timestamp: ev.timestamp, xpAwarded: 0 })
        if (sinceFind.length > sinceCap) sinceFind.shift()
      }
    }
    if (MILESTONE_MODE) {
      // PROJECTED M5: overall streak with freezes; a milestone takes an item from the pool.
      if (loggedToday) {
        ms.streak++
        if (ms.streak % FREEZE_EVERY === 0 && ms.freezes < FREEZE_MAX) ms.freezes++
        if (MILESTONES.includes(ms.streak) && (MILESTONE_MODE === 'repeat' || !ms.seen.has(ms.streak))) {
          ms.seen.add(ms.streak)
          newThingDays.push(i + 1)
          const res = rollReward(task('walk'), carriedFinds, { chance: 0, pick: rewardRng() }, rewardCfg)
          if (res?.kind === 'item') {
            milestoneFinds++
            recordFind(res.itemId, i + 1, yNoon)
          }
        }
      } else if (ms.streak > 0) {
        if (ms.freezes > 0) ms.freezes--
        else ms.streak = 0
      }
    }
    dailyLogDays.push(loggedToday)
    treatDays.push(treatToday)
    const noon = londonInstant(y, m, d, 12, 0)
    if (events.length > 0) {
      const md = moodFor(events.filter((e) => e.timestamp <= noon || dayKey(e.timestamp) !== dayKey(noon)), noon, MOOD_LIST).mood
      mood[md]++
      if (!loggedToday && peekRng() < PEEK_CHANCE) {
        welcomeBack.peeksTotal++
        if (md === 'sleepy' || md === 'grumpy') welcomeBack.onPeek++
      }
    }

    const xp = totalXp(events)
    xpByDay.push(xp)
    for (const s of STAGE_LIST) {
      if (stageDay[s.id] == null && dragonStage(events, STAGE_LIST).xpFrom >= s.xpFrom) {
        stageDay[s.id] = i + 1
        newThingDays.push(i + 1)
        stageDays.push(i + 1)
        if (s.id === 'juvenile') {
          topStatAtJuvenile = topStat(stats)
        }
      }
    }
  }

  // Check the running totals against the real statTotals over the whole log.
  for (const st of statTotals(events, TASK_LIST, STATS))
    if (st.xp !== stats[st.stat.id]) throw new Error(`statTotals mismatch for ${st.stat.id}`)
  if (foundItems(events, rewardCfg.items).length + milestoneFinds !== rewards.rares)
    throw new Error('foundItems disagrees with the finds counted')
  if (new Set(carriedFinds.map((f) => f.id)).size !== carriedFinds.length || rewards.rares > rewardCfg.items.length)
    throw new Error('an item was found twice')
  if (juvenileDayByLook !== null && juvenileDayByLook !== stageDay['juvenile'])
    throw new Error('first look did not appear on the Juvenile day')

  // Projected streaks and freezes (overall "days with at least one log").
  let streak = 0
  let longest = 0
  let freezes = 0
  let freezesEarned = 0
  let freezesUsed = 0
  let breaks = 0
  dailyLogDays.forEach((logged, i) => {
    if (logged) {
      streak++
      longest = Math.max(longest, streak)
      if (streak % FREEZE_EVERY === 0 && freezes < FREEZE_MAX) {
        freezes++
        freezesEarned++
      }
      if (MILESTONES.includes(streak)) {
        rewards.milestoneItems++
        if (!MILESTONE_MODE) newThingDays.push(i + 1)
        if (!milestonesSeen.has(streak)) {
          milestonesSeen.add(streak)
          rewards.milestoneFirsts++
        }
      }
    } else if (streak > 0) {
      if (freezes > 0) {
        freezes--
        freezesUsed++
      } else {
        streak = 0
        breaks++
      }
    }
  })

  // Comebacks: after any run of 4+ empty days, XP earned in the 7 days after returning.
  const comebacks: RunResult['comebacks'] = []
  let empty = 0
  dailyLogDays.forEach((logged, i) => {
    if (!logged) empty++
    else {
      if (empty >= 4 && i + 7 <= DAYS) {
        const before = xpByDay[i - 1] ?? 0
        comebacks.push({ gapLen: empty, xpWeekAfter: (xpByDay[i + 6] ?? 0) - before })
      }
      empty = 0
    }
  })

  const maxGap = (days: number[]) => {
    const s = [...new Set(days)].sort((a, b) => a - b)
    s.push(DAYS)
    let g = 0
    for (let k = 1; k < s.length; k++) g = Math.max(g, s[k]! - s[k - 1]!)
    return g
  }

  return {
    stageDay,
    xpByDay,
    stats,
    topStatAtJuvenile,
    topStatEnd: topStat(stats),
    lookAtJuvenile,
    lookEnd: evo.look === 'neutral' ? null : evo.look,
    lookChanges,
    lookChangeDays,
    looksSeen: evo.seen,
    juvenileDayByLook,
    logs,
    refused,
    activeDays: dailyLogDays.filter(Boolean).length,
    dailyLogDays,
    rewards,
    rareDays,
    collectionDay,
    streak: { longest, freezesEarned, freezesUsed, breaks },
    mood,
    firstOpenMood,
    welcomeBack,
    stageRecords,
    longestGapWithoutNew: maxGap(newThingDays),
    longestGapStagesOnly: stageDays.reduce((g, d, k) => (k ? Math.max(g, d - stageDays[k - 1]!) : g), 0),
    comebacks,
    treatDays,
    treatXp,
    rareBandRolls,
    milestoneFinds,
    pityFinds,
  }
}

// ---------- reporting ----------
function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!
}
const med = (xs: number[]) => pct(xs, 50)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const r1 = (n: number) => Math.round(n * 10) / 10

console.log(`Drag-on balance sim: ${DAYS} days x ${RUNS} runs per profile, base seed ${BASE_SEED}`)
console.log(`Variant: ${VARIANT ?? 'none (real config)'}; look margin ${r1(MARGIN * 100)}%${MARGIN_ARG === undefined ? ' (config)' : ' (what-if)'}, evolves at ${EVOLVES_AT_STAGE}`)
console.log(
  `Rewards: rare ${r1(REWARD_CFG.rareChance * 100)}%, treat ${r1(REWARD_CFG.treatChance * 100)}%, ${REWARD_CFG.items.length} items, bad-luck protection ${
    REWARD_CFG.itemPityLogs >= 1 ? `after ${REWARD_CFG.itemPityLogs} logs` : PITY_DAYS !== null ? `after ${PITY_DAYS} days (sim what-if)` : 'off'
  }${MILESTONE_MODE ? `, milestone items ${MILESTONE_MODE} (projection)` : ''}`,
)
console.log(`Stages: ${STAGE_LIST.map((s) => `${s.name} ${s.xpFrom}`).join(', ')}`)
console.log(`Tasks: ${TASK_LIST.map((t) => `${t.id} ${t.xp}xp/${t.stat}${t.rules.kind === 'maxPerDay' ? ` max${t.rules.max}` : ''}`).join(', ')}\n`)

for (const p of PROFILES) {
  const runs = Array.from({ length: RUNS }, (_, k) => simulate(p, BASE_SEED + k * 7919))
  const twins = NO_TWINS ? runs : Array.from({ length: RUNS }, (_, k) => simulate(p, BASE_SEED + k * 7919, NO_TREATS))
  console.log(`=== ${p.name} ===`)
  const xp180 = runs.map((r) => r.xpByDay[179] ?? NaN)
  const xpEnd = runs.map((r) => r.xpByDay[DAYS - 1]!)
  console.log(
    `XP/day avg ${r1(mean(xpEnd) / DAYS)} | XP day 180 median ${med(xp180)} | XP day ${DAYS} median ${med(xpEnd)}`,
  )
  console.log(
    `Active days ${r1((mean(runs.map((r) => r.activeDays)) / DAYS) * 100)}% | logs/active day ${r1(
      mean(runs.map((r) => r.logs / Math.max(1, r.activeDays))),
    )}`,
  )
  const refusedAll: Record<string, number> = {}
  for (const r of runs)
    for (const [k, v] of Object.entries(r.refused)) refusedAll[k] = (refusedAll[k] ?? 0) + v
  console.log(
    `Refused by real rules (per run avg): ${Object.entries(refusedAll)
      .map(([k, v]) => `${k} ${r1(v / RUNS)}`)
      .join(', ')}`,
  )
  console.log('Day stage reached (p10 / median / p90; "-" = not reached by end, % reached):')
  for (const s of STAGE_LIST.slice(1)) {
    const ds = runs.map((r) => r.stageDay[s.id]).filter((x): x is number => x != null)
    const reached = (ds.length / RUNS) * 100
    console.log(
      `  ${s.name.padEnd(10)} ${ds.length ? `${pct(ds, 10)} / ${med(ds)} / ${pct(ds, 90)}` : '-'}  (${r1(reached)}% reached)`,
    )
  }
  const statShare = (pick: (r: RunResult) => StatId | null) => {
    const c: Record<string, number> = {}
    for (const r of runs) {
      const s = pick(r)
      if (s) c[s] = (c[s] ?? 0) + 1
    }
    return Object.entries(c)
      .map(([k, v]) => `${k} ${r1((v / RUNS) * 100)}%`)
      .join(', ')
  }
  console.log(`Top stat at Juvenile: ${statShare((r) => r.topStatAtJuvenile)}`)
  console.log(`Top stat at end:      ${statShare((r) => r.topStatEnd)}`)
  console.log(`Look at Juvenile (real evolutionLook): ${statShare((r) => r.lookAtJuvenile)}`)
  console.log(`Look at end:          ${statShare((r) => r.lookEnd)}`)
  {
    const seenN = runs.map((r) => r.looksSeen.length)
    const c: Record<number, number> = {}
    for (const n of seenN) c[n] = (c[n] ?? 0) + 1
    console.log(
      `Distinct looks seen: mean ${r1(mean(seenN))} | ${Object.entries(c)
        .map(([k, v]) => `${k}: ${r1((v / RUNS) * 100)}%`)
        .join(', ')} | ever had: ${STATS.map(
        (s) => `${s.id} ${r1((runs.filter((r) => r.looksSeen.includes(s.id)).length / RUNS) * 100)}%`,
      ).join(', ')}`,
    )
    const mismatch = runs.filter((r) => r.lookEnd !== null && r.lookEnd !== r.topStatEnd).length
    console.log(`Look at end differs from top stat at end: ${r1((mismatch / RUNS) * 100)}% of runs`)
    const changeDays = runs.flatMap((r) => r.lookChangeDays)
    if (changeDays.length)
      console.log(`Look change days (all runs): p10 ${pct(changeDays, 10)}, median ${med(changeDays)}, p90 ${pct(changeDays, 90)}`)
  }
  {
    const lc = runs.map((r) => r.lookChanges)
    const juvDays = runs.map((r) => r.stageDay['juvenile']).filter((x): x is number => x != null)
    const firstChange = runs.filter((r) => r.lookChanges > 0).length
    console.log(
      `Look changes after Juvenile: mean ${r1(mean(lc))}, median ${med(lc)}, p90 ${pct(lc, 90)}, max ${Math.max(...lc)} | runs with any change ${r1(
        (firstChange / RUNS) * 100,
      )}% (Juvenile median day ${med(juvDays)})`,
    )
  }
  const statAvg = STATS.map((s) => `${s.id} ${Math.round(mean(runs.map((r) => r.stats[s.id])))}`)
  console.log(`Avg stat XP at end: ${statAvg.join(', ')}`)
  console.log(
    `Longest wait between two stage-ups (measured): median ${med(runs.map((r) => r.longestGapStagesOnly))} days`,
  )
  console.log('-- treats (measured, real rollReward) --')
  if (!NO_TWINS) {
    console.log('Paired with no-treat twin (same logs, treatChance 0): stage day median no-treat -> treats, days saved p10/median/p90')
    for (const s of STAGE_LIST.slice(1)) {
      const pairs = runs
        .map((r, k) => [twins[k]!.stageDay[s.id], r.stageDay[s.id]] as const)
        .filter((x): x is readonly [number, number] => x[0] != null && x[1] != null)
      if (!pairs.length) continue
      const saved = pairs.map(([a, b]) => a - b)
      const twinDs = twins.map((r) => r.stageDay[s.id]).filter((x): x is number => x != null)
      const ds = runs.map((r) => r.stageDay[s.id]).filter((x): x is number => x != null)
      console.log(
        `  ${s.name.padEnd(10)} ${med(twinDs)} -> ${med(ds)} | saved ${pct(saved, 10)} / ${med(saved)} / ${pct(saved, 90)} | reached ${r1((twinDs.length / RUNS) * 100)}% -> ${r1((ds.length / RUNS) * 100)}%`,
      )
    }
    const xpUp = runs.map((r, k) => r.xpByDay[DAYS - 1]! / twins[k]!.xpByDay[DAYS - 1]! - 1)
    console.log(`  XP boost from treats: median ${r1(med(xpUp) * 100)}%, p10 ${r1(pct(xpUp, 10) * 100)}%, p90 ${r1(pct(xpUp, 90) * 100)}%`)
    const lookDiff = runs.filter((r, k) => r.lookEnd !== twins[k]!.lookEnd).length
    const juvLookDiff = runs.filter((r, k) => r.lookAtJuvenile !== twins[k]!.lookAtJuvenile).length
    console.log(
      `  Look changes: ${r1(mean(twins.map((r) => r.lookChanges)))} -> ${r1(mean(runs.map((r) => r.lookChanges)))} per run | first look differs from twin ${r1((juvLookDiff / RUNS) * 100)}%, end look differs ${r1((lookDiff / RUNS) * 100)}%`,
    )
    const heartTwin = twins.filter((r) => r.looksSeen.includes('heart')).length
    const heartReal = runs.filter((r) => r.looksSeen.includes('heart')).length
    console.log(`  Ever a Heart look: ${r1((heartTwin / RUNS) * 100)}% -> ${r1((heartReal / RUNS) * 100)}%`)
    // Frequency as felt by the user.
    const perActive = mean(runs.map((r) => r.rewards.treats / Math.max(1, r.activeDays)))
    const dayShare = mean(runs.map((r) => r.treatDays.filter(Boolean).length / Math.max(1, r.activeDays)))
    const weeks = Math.floor(DAYS / 7)
    const weeksWith = (r: RunResult) => {
      let n = 0
      let active = 0
      for (let w = 0; w < weeks; w++) {
        const slice = r.dailyLogDays.slice(w * 7, w * 7 + 7)
        if (!slice.some(Boolean)) continue
        active++
        if (r.treatDays.slice(w * 7, w * 7 + 7).some(Boolean)) n++
      }
      return n / Math.max(1, active)
    }
    const drought = (r: RunResult) => {
      // Longest run of consecutive active (log) days with no treat.
      let g = 0
      let cur = 0
      r.dailyLogDays.forEach((l, i) => {
        if (!l) return
        if (r.treatDays[i]) cur = 0
        else g = Math.max(g, ++cur)
      })
      return g
    }
    const droughtLogs = (r: RunResult) => r.logs / Math.max(1, r.rewards.treats)
    console.log(
      `  Treats/week ${r1(mean(runs.map((r) => r.rewards.treats)) / (DAYS / 7))} | per log day ${r1(perActive)} | log days with >=1 treat ${r1(dayShare * 100)}% | active weeks with >=1 treat ${r1(mean(runs.map(weeksWith)) * 100)}%`,
    )
    console.log(
      `  Longest run of log days without a treat: median ${med(runs.map(drought))}, p90 ${pct(runs.map(drought), 90)} | logs per treat ${r1(mean(runs.map(droughtLogs)))} | bonus XP/run ${Math.round(mean(runs.map((r) => r.treatXp)))}`,
    )
    // A few named seeds, to show how different two players' journeys look.
    const show = runs.slice(0, 6).map((r, k) => {
      const ds = STAGE_LIST.slice(1).map((s) => `${r.stageDay[s.id] ?? '-'}(${twins[k]!.stageDay[s.id] ?? '-'})`)
      return `    seed#${k}: ${ds.join(' ')} treats ${r.rewards.treats}`
    })
    console.log(`  Sample seeds, stage days with treats (no-treat twin): ${STAGE_LIST.slice(1).map((s) => s.name).join(' ')}`)
    console.log(show.join('\n'))
  }
  console.log(`-- rare items (measured, real rollReward + foundItems, ${REWARD_CFG.items.length} items) --`)
  {
    const total = REWARD_CFG.items.length
    const dayOf = (r: RunResult, k: number) => r.rareDays[k] ?? null
    const fmtDays = (ds: number[], n: number) =>
      ds.length ? `${pct(ds, 10)} / ${med(ds)} / ${pct(ds, 90)} (${r1((ds.length / n) * 100)}% by day ${DAYS})` : `- (none by day ${DAYS})`
    console.log('  Day the Nth item is found (p10 / median / p90):')
    for (const k of [0, 1, 2, Math.floor(total / 2) - 1, total - 2, total - 1].filter((v, j, a) => v >= 0 && a.indexOf(v) === j)) {
      const ds = runs.map((r) => dayOf(r, k)).filter((x): x is number => x != null)
      console.log(`    #${String(k + 1).padEnd(3)} ${fmtDays(ds, RUNS)}`)
    }
    const complete = runs.map((r) => r.collectionDay).filter((x): x is number => x != null)
    console.log(`  Collection complete: ${fmtDays(complete, RUNS)}`)
    const by = (d: number) => runs.map((r) => r.rareDays.filter((x) => x <= d).length)
    console.log(
      `  Items found by day 30 / 90 / 180 / ${DAYS} (median): ${[30, 90, 180, DAYS].map((d) => med(by(Math.min(d, DAYS)))).join(' / ')} of ${total}`,
    )
    const gaps = runs.flatMap((r) => r.rareDays.map((d, k) => d - (k === 0 ? 0 : r.rareDays[k - 1]!)))
    if (gaps.length)
      console.log(`  Days between finds: p10 ${pct(gaps, 10)}, median ${med(gaps)}, p90 ${pct(gaps, 90)}, mean ${r1(mean(gaps))}`)
    // Dry spells, as felt: within the first min(180, DAYS) days and before the collection is complete.
    const H = Math.min(180, DAYS)
    const itemDrought = (r: RunResult) => {
      const end = Math.min(H, r.collectionDay ?? H)
      const ds = [0, ...r.rareDays.filter((d) => d <= end), end]
      let g = 0
      for (let k = 1; k < ds.length; k++) g = Math.max(g, ds[k]! - ds[k - 1]!)
      return g
    }
    const dr = runs.map(itemDrought)
    console.log(`  Longest gap with no item, days 1-${H} (until complete): p10 ${pct(dr, 10)}, median ${med(dr)}, p90 ${pct(dr, 90)} | runs with a 30+ day gap ${r1((dr.filter((g) => g >= 30).length / RUNS) * 100)}%, 45+ ${r1((dr.filter((g) => g >= 45).length / RUNS) * 100)}%`)
    // "Something new every week or so": share of 7-day weeks (days 1-H) with a stage-up or a find.
    const weekly = (r: RunResult, withItems: boolean) => {
      const days = new Set<number>([...Object.values(r.stageDay).filter((d): d is number => d != null && d > 0), ...(withItems ? r.rareDays : [])])
      let n = 0
      const W = Math.floor(H / 7)
      for (let w = 0; w < W; w++) for (let d = w * 7 + 1; d <= w * 7 + 7; d++) if (days.has(d)) { n++; break }
      return n / W
    }
    const fortnightMax = (r: RunResult) => {
      const days = [0, ...new Set([...Object.values(r.stageDay).filter((d): d is number => d != null && d > 0), ...r.rareDays].filter((d) => d <= H))].sort((a, b) => a - b)
      days.push(H)
      let g = 0
      for (let k = 1; k < days.length; k++) g = Math.max(g, days[k]! - days[k - 1]!)
      return g
    }
    const fm = runs.map(fortnightMax)
    console.log(`  Weeks (days 1-${H}) with a stage-up or item: ${r1(mean(runs.map((r) => weekly(r, true))) * 100)}% (stages alone ${r1(mean(runs.map((r) => weekly(r, false))) * 100)}%) | longest stretch with neither: median ${med(fm)}, p90 ${pct(fm, 90)}`)
    const coll = runs.map((r) => r.collectionDay ?? DAYS + 1)
    const elder = runs.map((r) => r.stageDay['elder'] ?? DAYS + 1)
    const afterElder = runs.map((r, k) => coll[k]! - elder[k]!)
    console.log(`  Collection complete minus Elder day: p10 ${pct(afterElder, 10)}, median ${med(afterElder)}, p90 ${pct(afterElder, 90)} (negative = complete before Elder)`)
    if (MILESTONE_MODE || REWARD_CFG.itemPityLogs >= 1 || PITY_DAYS !== null)
      console.log(`  Items per run from milestones ${r1(mean(runs.map((r) => r.milestoneFinds)))}, from bad-luck protection ${r1(mean(runs.map((r) => r.pityFinds)))}`)
    const rareAfter = mean(runs.map((r) => r.rareBandRolls - (r.rewards.rares - r.milestoneFinds - r.pityFinds)))
    console.log(`  Rare-band rolls after the collection was complete (became treats): ${r1(rareAfter)}/run`)
    console.log('  Sample seeds, item days:')
    console.log(runs.slice(0, 4).map((r, k) => `    seed#${k}: ${r.rareDays.join(', ') || '-'}${r.collectionDay ? ` (complete day ${r.collectionDay})` : ''}`).join('\n'))
  }
  console.log('-- projections (spec only, no code yet) --')
  const per180 = (n: number) => r1((n / DAYS) * 180)
  console.log(
    `Per 180 days: treats ${per180(mean(runs.map((r) => r.rewards.treats)))}, items found ${per180(
      mean(runs.map((r) => r.rewards.rares)),
    )}, milestone items ${per180(mean(runs.map((r) => r.rewards.milestoneItems)))} (first-time ${r1(
      mean(runs.map((r) => r.rewards.milestoneFirsts)),
    )} over ${DAYS}d)`,
  )
  console.log(
    `Longest overall streak: median ${med(runs.map((r) => r.streak.longest))}, p90 ${pct(
      runs.map((r) => r.streak.longest),
      90,
    )} | freezes earned ${r1(mean(runs.map((r) => r.streak.freezesEarned)))}, used ${r1(
      mean(runs.map((r) => r.streak.freezesUsed)),
    )}, streak breaks ${r1(mean(runs.map((r) => r.streak.breaks)))}`,
  )
  const moodLine = (pick: (r: RunResult) => Record<MoodId, number>) =>
    MOODS.map((mo) => `${mo.id} ${r1(mean(runs.map((r) => pick(r)[mo.id])))}`).join(', ')
  console.log(`[measured] Mood at 12:00, days/run: ${moodLine((r) => r.mood)}`)
  console.log(`[measured] Mood on opening to make the day's first log: ${moodLine((r) => r.firstOpenMood)}`)
  console.log(
    `[measured] Welcome-back opens/run (sleepy or grumpy): on a log day ${r1(
      mean(runs.map((r) => r.welcomeBack.onLog)),
    )}, on a no-log peek ${r1(mean(runs.map((r) => r.welcomeBack.onPeek)))} of ${r1(
      mean(runs.map((r) => r.welcomeBack.peeksTotal)),
    )} peeks (peek chance ${PEEK_CHANCE}) | logs with stageReached ${r1(mean(runs.map((r) => r.stageRecords)))}`,
  )
  console.log(
    `Longest stretch with nothing new (stage/rare/milestone): median ${med(
      runs.map((r) => r.longestGapWithoutNew),
    )}, p90 ${pct(runs.map((r) => r.longestGapWithoutNew), 90)} days`,
  )
  const cb = runs.flatMap((r) => r.comebacks)
  if (cb.length)
    console.log(
      `Comebacks after 4+ empty days: ${r1(cb.length / RUNS)}/run, avg gap ${r1(
        mean(cb.map((c) => c.gapLen)),
      )} days, XP in week after return ${Math.round(mean(cb.map((c) => c.xpWeekAfter)))}`,
    )
  console.log('')
}
