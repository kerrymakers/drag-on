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
//   - evolution look rule (script's reading of the agreed rule; no code yet): at Juvenile
//     the look is the highest stat, ties to config stat order; afterwards it changes only
//     when another stat strictly overtakes the current look's stat.
//
// PROJECTED (the spec describes these but there is no code yet; numbers here
// are this script's reading of SPEC.md, not the app's behaviour):
//   - treats (20%/log), rare items (3%/log),
//     overall streak, streak freezes (1 per 7-day streak, max 2), milestone items (7/30/100).

import { createLogEvent, dayKey, dragonStage, moodFor, statTotals, totalXp, weekdayOf } from '../src/game'
import type { GameEvent, LogEvent, MoodId, StatId, Task } from '../src/game'
import { MOODS } from '../src/config/mood'
import { TASKS } from '../src/config/tasks'
import { STAGES } from '../src/config/stages'
import { STATS } from '../src/config/stats'
import { DEFAULT_SETTINGS } from '../src/config/settings'
import { TIME_ZONE } from '../src/config/time'

const DAYS = Number(process.argv[2] ?? 365)
const RUNS = Number(process.argv[3] ?? 300)
// Optional what-if, applied in memory only (config files are never changed):
// Variants set absolute values, never relative ones, so they can't double-apply.
//   --variant=evo     avoided = 15xp max 2/day, read = 25xp (now the real config, so a no-op)
//   --variant=juv     Juvenile threshold = 1300 (now the real config, so a no-op)
//   --variant=rare6   rare item chance 3% -> 6% (projection)
//   --variant=heart20 / heart25  selfcare XP 15 -> 20 / 25
//   --margin=N       look rule what-if: overtaking stat must lead by more than N% of the current look's XP
//   --variant=mood35  sleepy from 3 days, grumpy from 5 (instead of config/mood.ts)
const VARIANT = process.argv.find((a) => a.startsWith('--variant='))?.split('=')[1] ?? null
const EXACT = process.argv.includes('--exact')
const MARGIN = Number(process.argv.find((a) => a.startsWith('--margin='))?.split('=')[1] ?? 0) / 100
// Chance the app is opened (at 12:00) on a day with no log. Log days always count as an open.
const PEEK_CHANCE = 0.3
const MOOD_LIST =
  VARIANT === 'mood35'
    ? MOODS.map((m) => (m.id === 'sleepy' ? { ...m, fromDays: 3 } : m.id === 'grumpy' ? { ...m, fromDays: 5 } : m))
    : MOODS
const BASE_SEED = 20261005
const START = { y: 2026, m: 10, d: 5 } // a Monday; crosses the Oct and Mar clock changes

// Spec-implied odds (projection only, no reward config exists yet).
const TREAT_CHANCE = 0.2
const RARE_CHANCE = VARIANT === 'rare6' ? 0.06 : 0.03
const MILESTONES = [7, 30, 100]
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
  name: string
  plan: (day: number, rng: () => number, ctx: RunCtx) => DayPlan | null // null = no logging at all
}
interface RunCtx {
  gaps: Array<[number, number]> // [startDay, endDay) with no logging
}

const keen: Profile = {
  name: 'Keen',
  plan: (_d, rng) =>
    rng() < 0.05
      ? null // the odd day off (ill, travel)
      : { wakeOnTime: 0.9, wakeLateTry: 0.5, gym: 0.7, walk: 0.8, read: 0.8, selfcare: 0.6, avoided: 1.8 },
}
const typical: Profile = {
  name: 'Typical',
  plan: (_d, rng) =>
    rng() < 0.08
      ? null
      : { wakeOnTime: 0.6, wakeLateTry: 0.2, gym: 0.36, walk: 0.25, read: 0.25, selfcare: 0.3, avoided: 0.35 },
}
const patchy: Profile = {
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
// Habit-focused typicals, to test whether different habits give different looks.
const gymFan: Profile = {
  name: 'Typical, gym-focused (gym 4x/wk, walks, little else)',
  plan: (_d, rng) =>
    rng() < 0.08 ? null : { wakeOnTime: 0.4, wakeLateTry: 0.2, gym: 0.57, walk: 0.5, read: 0.15, selfcare: 0.2, avoided: 0.2 },
}
const reader: Profile = {
  name: 'Typical, reader (reads most days, gym 1x/wk)',
  plan: (_d, rng) =>
    rng() < 0.08 ? null : { wakeOnTime: 0.5, wakeLateTry: 0.2, gym: 0.15, walk: 0.2, read: 0.85, selfcare: 0.3, avoided: 0.3 },
}
const heart: Profile = {
  name: 'Typical, heart-focused (self-care most days, moderate rest)',
  plan: (_d, rng) =>
    rng() < 0.08
      ? null
      : { wakeOnTime: 0.5, wakeLateTry: 0.2, gym: 0.25, walk: 0.3, read: 0.25, selfcare: 0.85, avoided: 0.3 },
}
const PROFILES = [keen, typical, patchy, gymFan, reader, heart]

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
  lookChanges: number // look changes after Juvenile under the strict-overtake rule
  logs: number
  refused: Record<string, number>
  activeDays: number
  dailyLogDays: boolean[]
  rewards: { treats: number; rares: number; milestoneItems: number; milestoneFirsts: number }
  rareDays: number[]
  streak: { longest: number; freezesEarned: number; freezesUsed: number; breaks: number }
  mood: Record<MoodId, number> // moodFor at 12:00 each day (after the first log)
  firstOpenMood: Record<MoodId, number> // moodFor just before the first log of each log day
  welcomeBack: { onLog: number; onPeek: number; peeksTotal: number }
  stageRecords: number // logs carrying stageReached
  longestGapWithoutNew: number // days between "new things" (stage, rare item, milestone)
  longestGapStagesOnly: number
  comebacks: Array<{ gapLen: number; xpWeekAfter: number }>
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
const STAGE_LIST = VARIANT === 'juv' ? STAGES.map((s) => (s.id === 'juvenile' ? { ...s, xpFrom: 1300 } : s)) : STAGES
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

function simulate(profile: Profile, seed: number): RunResult {
  const rng = mulberry32(seed)
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
  let look: StatId | null = null
  let lookAtJuvenile: StatId | null = null
  let lookChanges = 0
  let logs = 0
  let id = 0
  const rewards = { treats: 0, rares: 0, milestoneItems: 0, milestoneFirsts: 0 }
  const rareDays: number[] = []
  const newThingDays: number[] = [0]
  const stageDays: number[] = [0]
  const milestonesSeen = new Set<number>()
  const zeroMoods = () => Object.fromEntries(MOODS.map((m) => [m.id, 0])) as Record<MoodId, number>
  const mood = zeroMoods()
  const firstOpenMood = zeroMoods()
  const welcomeBack = { onLog: 0, onPeek: 0, peeksTotal: 0 }
  let stageRecords = 0

  for (let i = 0; i < DAYS; i++) {
    const { y, m, d } = calendarDay(i)
    const plan = profile.plan(i, rng, ctx)
    // Fast path: the rules only look at today's logs, and the stage logic only needs total
    // XP and the highest recorded stage. So instead of the full log we pass one synthetic
    // "carry" log from yesterday holding exactly those two values, plus today's logs.
    // --exact passes the full log instead, to check the two agree.
    const yKey = calendarDay(i - 1)
    const carry: LogEvent = {
      id: 'carry',
      type: 'log',
      taskId: '__carry__',
      timestamp: londonInstant(yKey.y, yKey.m, yKey.d, 12, 0),
      xpAwarded: totalXp(events),
      stageReached: dragonStage(events, STAGE_LIST).id,
    }
    const todays: GameEvent[] = EXACT ? events : [carry]
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
    for (const a of attempts) {
      const t = task(a.taskId)
      const ev = createLogEvent(t, todays, DEFAULT_SETTINGS, a.ts, `e${id++}`, STAGE_LIST)
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
      if (look !== null) {
        // Strict overtake: switch only if some stat is now strictly above the current look.
        const lead = topStat(stats)
        if (stats[lead] > stats[look] * (1 + MARGIN)) {
          look = lead
          lookChanges++
        }
      }
      logs++
      loggedToday = true
      // Projected reward roll.
      const r = rng()
      if (r < RARE_CHANCE) {
        rewards.rares++
        rareDays.push(i + 1)
        newThingDays.push(i + 1)
      } else if (r < RARE_CHANCE + TREAT_CHANCE) rewards.treats++
    }
    dailyLogDays.push(loggedToday)
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
          look = topStatAtJuvenile // ties already go to config order in topStat
          lookAtJuvenile = look
        }
      }
    }
  }

  // Check the running totals against the real statTotals over the whole log.
  for (const st of statTotals(events, TASK_LIST, STATS))
    if (st.xp !== stats[st.stat.id]) throw new Error(`statTotals mismatch for ${st.stat.id}`)

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
        newThingDays.push(i + 1)
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
    lookEnd: look,
    lookChanges,
    logs,
    refused,
    activeDays: dailyLogDays.filter(Boolean).length,
    dailyLogDays,
    rewards,
    rareDays,
    streak: { longest, freezesEarned, freezesUsed, breaks },
    mood,
    firstOpenMood,
    welcomeBack,
    stageRecords,
    longestGapWithoutNew: maxGap(newThingDays),
    longestGapStagesOnly: stageDays.reduce((g, d, k) => (k ? Math.max(g, d - stageDays[k - 1]!) : g), 0),
    comebacks,
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
console.log(`Variant: ${VARIANT ?? 'none (real config)'}${MARGIN ? `, look margin ${MARGIN * 100}%` : ''}`)
console.log(`Stages: ${STAGE_LIST.map((s) => `${s.name} ${s.xpFrom}`).join(', ')}`)
console.log(`Tasks: ${TASK_LIST.map((t) => `${t.id} ${t.xp}xp/${t.stat}${t.rules.kind === 'maxPerDay' ? ` max${t.rules.max}` : ''}`).join(', ')}\n`)

for (const p of PROFILES) {
  const runs = Array.from({ length: RUNS }, (_, k) => simulate(p, BASE_SEED + k * 7919))
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
  console.log(`Look at end (strict-overtake rule): ${statShare((r) => r.lookEnd)}`)
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
  console.log('-- projections (spec only, no code yet) --')
  const per180 = (n: number) => r1((n / DAYS) * 180)
  console.log(
    `Per 180 days: treats ${per180(mean(runs.map((r) => r.rewards.treats)))}, rare drops ${per180(
      mean(runs.map((r) => r.rewards.rares)),
    )}, milestone items ${per180(mean(runs.map((r) => r.rewards.milestoneItems)))} (first-time ${r1(
      mean(runs.map((r) => r.rewards.milestoneFirsts)),
    )} over ${DAYS}d)`,
  )
  console.log(
    `First rare item day: median ${med(runs.map((r) => r.rareDays[0] ?? DAYS + 1))}; avg gap between rares ${r1(
      DAYS / Math.max(1, mean(runs.map((r) => r.rewards.rares))),
    )} days`,
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
