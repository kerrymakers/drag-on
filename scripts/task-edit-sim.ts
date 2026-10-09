// Milestone 6 slice 3 balance sim: what task editing (XP 5-60, times a day 1-3, up to
// N active tasks) does to stage pacing, rewards, items and the evolution look.
// Uses the real createLogEvent (availability, treats, rare roll, pity, streak milestones,
// stageReached) with config/rewards.ts, config/streaks.ts and config/stages.ts, and the
// real evolutionLook/lookChange/statTotals. Task lists are what-ifs built in memory from
// config/tasks.ts; config files are never changed.
// Run from the repo root:
//   nice -n 10 npx vite-node scripts/task-edit-sim.ts [days] [runs] [--scenarios=a,b] [--profiles=a,b] [--exact] [--pityDays=N] [--pity=N] [--items=N] [--margin=N]
// The compact carried log (day markers, finds, last <=pity logs since a find) is the same
// trick as streak-sim.ts; --exact passes the full log instead, to check they agree.
import './sim-speedups'
import {
  createLogEvent, dayKey, overallStreak, weekdayOf, foundItems, rewardItemId, logXp, stageFor, evolutionLook, lookChange, statTotals,
} from '../src/game'
import { addTask, updateTask } from '../src/game/tasks'
import { daysBetween } from '../src/game/day'
import type { Evolution, GameEvent, LogEvent, StatId, Task } from '../src/game'
import { TASKS, EFFORT_LEVELS, TASK_LIMITS } from '../src/config/tasks'
import { STAGES } from '../src/config/stages'
import { STATS } from '../src/config/stats'
import { DEFAULT_SETTINGS } from '../src/config/settings'
import { TIME_ZONE } from '../src/config/time'
import { REWARDS } from '../src/config/rewards'
import { STREAKS } from '../src/config/streaks'
import { EVOLVES_AT_STAGE, LOOK_CHANGE_MARGIN } from '../src/config/evolution'

// The sims set XP directly on their what-if tasks, so no effort level overrides it.
const NO_LEVELS: readonly never[] = []

const args = process.argv.slice(2)
const pos = args.filter((a) => !a.startsWith('--'))
const DAYS = Number(pos[0] ?? 365)
const RUNS = Number(pos[1] ?? 100)
const EXACT = args.includes('--exact')
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const SF = arg('scenarios')?.split(',') ?? null
const PF = arg('profiles')?.split(',') ?? null
const BASE_SEED = 20261009
const START = { y: 2026, m: 10, d: 5 }
// --margin=N: what-if look margin of N% (in memory only)
const EVO_RULES = { evolvesAt: EVOLVES_AT_STAGE, margin: arg('margin') !== undefined ? Number(arg('margin')) / 100 : LOOK_CHANGE_MARGIN }
// What-if (sim only): --pityDays=N turns the real 30-log rule off and instead forces an
// item on the next log once N days with a log have passed with no item (forced rare roll).
const PITY_DAYS = arg('pityDays') ? Number(arg('pityDays')) : null
// What-if (sim only): --pity=N uses the real rule with N logs; --items=N trims the pool to
// its first N items (e.g. 18 to compare with the pre-M7-slice-3 pool). In memory only.
const PITY_LOGS = arg('pity') !== undefined ? Number(arg('pity')) : REWARDS.itemPityLogs
const ITEM_N = arg('items') !== undefined ? Number(arg('items')) : REWARDS.items.length
const RCFG = { ...REWARDS, items: REWARDS.items.slice(0, ITEM_N), itemPityLogs: PITY_DAYS === null ? PITY_LOGS : 0 }

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
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
function londonInstant(y: number, m: number, d: number, hh: number, mm: number): number {
  for (const off of [0, 1]) {
    const t = Date.UTC(y, m - 1, d, hh - off, mm)
    const [h, mi] = fmt.format(t).split(':').map(Number)
    if (h === hh && mi === mm) return t
  }
  throw new Error('no instant')
}
const cal = (i: number) => {
  const dt = new Date(Date.UTC(START.y, START.m - 1, START.d + i))
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() }
}

// ---------- task lists (what-ifs) ----------
// A sim task: the real Task plus how often each profile does it. `p` is the chance per
// slot per day (slot k only tried if slot k-1 was), `hour` the log time.
interface SimTask { task: Task; kind: 'base' | 'extra'; hour: number }
const base = (id: string, xp?: number, max?: number): SimTask => {
  const t = TASKS.find((x) => x.id === id)!
  const rules = max === undefined ? t.rules : max === 1 ? { kind: 'oncePerDay' as const } : { kind: 'maxPerDay' as const, max }
  const hour = { wake: 6, gym: 18, walk: 13, read: 22, selfcare: 20, avoided: 10 }[id] ?? 12
  return { task: { ...t, xp: xp ?? t.xp, rules: t.rules.kind === 'wakeUp' ? t.rules : rules }, kind: 'base', hour }
}
let extraN = 0
const extra = (stat: StatId, xp: number, times: number): SimTask => {
  const k = extraN++
  return {
    task: { id: `x${k}`, name: `Extra ${k}`, stat, xp, rules: times === 1 ? { kind: 'oncePerDay' } : { kind: 'maxPerDay', max: times }, archived: false },
    kind: 'extra',
    hour: 8 + (k % 6) * 2,
  }
}
const BASE6 = () => ['wake', 'gym', 'walk', 'read', 'selfcare', 'avoided'].map((id) => base(id))
const statCycle: StatId[] = ['heart', 'wisdom', 'discipline', 'strength']
const extras = (n: number, xp: number, times: number) => Array.from({ length: n }, (_, k) => extra(statCycle[k % 4]!, xp, times))

// Effort levels (Milestone 7, slice 1): task lists built through the real updateTask/addTask
// with the real EFFORT_LEVELS and TASK_LIMITS, then logged with effortLevels: EFFORT_LEVELS,
// so the XP and times a day are exactly what the app would allow.
type LevelEdit = { effort: string; times?: number }
const HOURS: Record<string, number> = { wake: 6, gym: 18, walk: 13, read: 22, selfcare: 20, avoided: 10 }
function viaApp(edits: Record<string, LevelEdit>, adds: { stat: StatId; effort: string; times: number }[] = []): SimTask[] {
  let list: Task[] = TASKS.map((t) => ({ ...t }))
  for (const [id, e] of Object.entries(edits)) {
    const lvl = EFFORT_LEVELS.find((l) => l.id === e.effort)!
    list = updateTask(list, id, { effort: e.effort, timesADay: e.times ?? lvl.maxTimesADay }, TASK_LIMITS, EFFORT_LEVELS)
  }
  adds.forEach((a, k) => {
    const next = addTask(list, { name: `Extra ${k}`, stat: a.stat, effort: a.effort, timesADay: a.times }, `my-x${k}`, TASK_LIMITS, EFFORT_LEVELS)
    if (!next) throw new Error(`addTask refused extra ${k} (cap ${TASK_LIMITS.maxActive}?)`)
    list = next
  })
  return list.map((t, k) => ({ task: t, kind: t.id.startsWith('my-') ? 'extra' : 'base', hour: HOURS[t.id] ?? 8 + ((k - 6) % 6) * 2 }))
}
const ALL6 = ['wake', 'gym', 'walk', 'read', 'selfcare', 'avoided']
const allAt = (effort: string, times?: number) => Object.fromEntries(ALL6.map((id) => [id, { effort, times }]))
const two = (effort: string, times: number) => [{ stat: 'heart' as StatId, effort, times }, { stat: 'wisdom' as StatId, effort, times }]

interface Scenario { key: string; name: string; tasks: () => SimTask[]; shiftAt?: number; levels?: boolean }
const SCENARIOS: Scenario[] = [
  { key: 'base', name: 'Current 6 tasks (baseline)', tasks: BASE6 },
  { key: 'plus10', name: 'Every current task +10 XP (wake 40, gym 50, walk 25, read 35, selfcare 35, avoided 25)', tasks: () => [base('wake', 40), base('gym', 50), base('walk', 25), base('read', 35), base('selfcare', 35), base('avoided', 25)] },
  { key: 'max50', name: 'Every current task at 50 XP', tasks: () => ['wake', 'gym', 'walk', 'read', 'selfcare', 'avoided'].map((id) => base(id, 50)) },
  { key: 'max60', name: 'Every current task at 60 XP', tasks: () => ['wake', 'gym', 'walk', 'read', 'selfcare', 'avoided'].map((id) => base(id, 60)) },
  { key: 'add2', name: 'Current + 2 new tasks (25 XP, once a day) = 8', tasks: () => [...BASE6(), ...extras(2, 25, 1)] },
  { key: 'add4', name: 'Current + 4 new tasks (25 XP, once a day) = 10', tasks: () => [...BASE6(), ...extras(4, 25, 1)] },
  { key: 'add4x3', name: 'Current + 4 new tasks (25 XP, 3 a day) = 10', tasks: () => [...BASE6(), ...extras(4, 25, 3)] },
  { key: 'add2x60', name: 'Current + 2 new tasks (60 XP, once a day) = 8', tasks: () => [...BASE6(), ...extras(2, 60, 1)] },
  { key: 'all60x3', name: 'Worst case: 10 tasks all 60 XP, 3 a day (wake once)', tasks: () => [...['wake', 'gym', 'walk', 'read', 'selfcare'].map((id) => base(id, 60, 3)), base('avoided', 60, 3), ...extras(4, 60, 3)] },
  { key: 'cap8x60x3', name: 'Worst case with cap 8, max 50, 3 a day', tasks: () => [...['wake', 'gym', 'walk', 'read', 'selfcare'].map((id) => base(id, 50, 3)), base('avoided', 50, 3), ...extras(2, 50, 3)] },
  { key: 'water', name: 'Current + "drank water" 5 XP x3, done almost every slot', tasks: () => [...BASE6(), { ...extra('heart', 5, 3), kind: 'extra', hour: 9 }] },
  { key: 'water15', name: 'Current + "drank water" 15 XP x3, done almost every slot', tasks: () => [...BASE6(), { ...extra('heart', 15, 3), kind: 'extra', hour: 9 }] },
  { key: 'cap8d50', name: 'Worst case, cap 8 and xp x times <= 50: 6 tasks at 50 once, 2 at 15 x3 (avoided 25 x2)', tasks: () => [...['wake', 'gym', 'walk', 'read', 'selfcare'].map((id) => base(id, 50, 1)), base('avoided', 25, 2), extra('heart', 50, 1), extra('wisdom', 15, 3)] },
  { key: 'Lbase', name: 'LEVELS: built-in tasks with the real effort levels', tasks: () => viaApp({}), levels: true },
  { key: 'LallHard', name: 'LEVELS: every task (wake too) "Really hard" (40, once)', tasks: () => viaApp(allAt('hard')), levels: true },
  { key: 'Ladd2', name: 'LEVELS: built-in + 2 new tasks at the default (nudge, once)', tasks: () => viaApp({}, two('nudge', 1)), levels: true },
  { key: 'Ladd2eff', name: 'LEVELS: built-in + 2 new "Takes effort" tasks, twice a day', tasks: () => viaApp({}, two('effort', 2)), levels: true },
  { key: 'Lhard8', name: 'LEVELS worst: 8 active, all "Really hard" (40 x1)', tasks: () => viaApp(allAt('hard'), two('hard', 1)), levels: true },
  { key: 'Lnudge8', name: 'LEVELS worst: 8 active, all "A little nudge" x3 (wake nudge)', tasks: () => viaApp(allAt('nudge'), two('nudge', 3)), levels: true },
  { key: 'Lnudge8x2', name: 'WHAT-IF: as Lnudge8 but nudge capped at 2 a day', tasks: () => viaApp(allAt('nudge', 2), two('nudge', 2)), levels: true },
  { key: 'Lwater', name: 'LEVELS: built-in + one easy daily "nudge" x3 habit (e.g. drank water)', tasks: () => viaApp({}, [{ stat: 'heart', effort: 'nudge', times: 3 }]), levels: true },
  { key: 'Lwaterx2', name: 'WHAT-IF: as Lwater but nudge capped at 2 a day', tasks: () => viaApp({}, [{ stat: 'heart', effort: 'nudge', times: 2 }]), levels: true },
  { key: 'Leffort8', name: 'LEVELS worst: 8 active, all "Takes effort" x2 (wake effort)', tasks: () => viaApp(allAt('effort'), two('effort', 2)), levels: true },
  { key: 'Lmax8', name: 'LEVELS ceiling: wake "Really hard", other 7 "Takes effort" x2 (390 XP/day max)', tasks: () => viaApp({ ...allAt('effort'), wake: { effort: 'hard' } }, two('effort', 2)), levels: true },
  { key: 'str3', name: 'Current + 3 Strength tasks at 60 XP, once a day', tasks: () => [...BASE6(), extra('strength', 60, 1), extra('strength', 60, 1), extra('strength', 60, 1)] },
  { key: 'str3shift', name: 'str3 to day 120, then those archived and reads daily (does the look ever change?)', tasks: () => [...BASE6(), extra('strength', 60, 1), extra('strength', 60, 1), extra('strength', 60, 1)], shiftAt: 120 },
]

// ---------- profiles ----------
// Base-task chances as in simulate.ts/streak-sim.ts. `extra` is the per-slot chance for added
// tasks; "water" style tasks get `easy` (an easy habit done most days).
interface Plan { wake: number; gym: number; walk: number; read: number; selfcare: number; avoided: number; extra: number; easy: number }
interface Profile { key: string; name: string; init?: (r: () => number) => any; plan: (d: number, r: () => number, st: any) => Plan | null }
const PROFILES: Profile[] = [
  { key: 'typical', name: 'Typical', plan: (_d, r) => (r() < 0.08 ? null : { wake: 0.6, gym: 0.36, walk: 0.25, read: 0.25, selfcare: 0.3, avoided: 0.35, extra: 0.3, easy: 0.85 }) },
  { key: 'keen', name: 'Keen', plan: (_d, r) => (r() < 0.05 ? null : { wake: 0.9, gym: 0.7, walk: 0.8, read: 0.8, selfcare: 0.6, avoided: 1.8, extra: 0.7, easy: 0.95 }) },
  {
    key: 'patchy', name: 'Patchy',
    init: (r) => {
      const g1 = 21 + Math.floor(r() * 30); const g2 = 100 + Math.floor(r() * 50)
      return { gaps: [[g1, g1 + 5 + Math.floor(r() * 4)], [g2, g2 + 10 + Math.floor(r() * 5)]] }
    },
    plan: (d, r, st) => {
      if (st.gaps.some(([a, b]: number[]) => d >= a! && d < b!)) return null
      if (Math.floor(d / 7) % 2 === 0) return { wake: 0.65, gym: 0.4, walk: 0.3, read: 0.3, selfcare: 0.35, avoided: 0.5, extra: 0.35, easy: 0.8 }
      if (r() < 0.45) return null
      return { wake: 0.25, gym: 0.12, walk: 0.15, read: 0.1, selfcare: 0.25, avoided: 0.15, extra: 0.15, easy: 0.5 }
    },
  },
]
function poisson(l: number, rng: () => number) {
  const L = Math.exp(-l); let k = 0; let p = 1
  do { k++; p *= rng() } while (p > L)
  return k - 1
}

interface Run {
  stageDay: Record<string, number | null>
  xp: number; logs: number; activeDays: number; treats: number; treatXp: number
  itemDays: number[]; collectionDay: number | null
  newThingGap180: number; shortestStageGap: number
  newThingGapAll: number; itemGapMax: number; noveltyEnd: number
  look: string; firstLook: string | null; lookChanges: number; shiftLookDay: number | null
  topShare: number
}

function simulate(sc: Scenario, p: Profile, seed: number): Run {
  extraN = 0
  const sts = sc.tasks()
  const rng = mulberry32(seed)
  const rr = mulberry32(seed ^ 0x7ea7)
  const st = p.init?.(rng) ?? {}
  const events: GameEvent[] = []
  const dayMarkers: LogEvent[] = []
  const finds: LogEvent[] = []
  const since: LogEvent[] = []
  let xp = 0, logs = 0, activeDays = 0, treats = 0, treatXp = 0
  const itemDays: number[] = []
  let collectionDay: number | null = null
  const stageDay: Record<string, number | null> = Object.fromEntries(STAGES.map((s) => [s.id, null]))
  stageDay[STAGES[0]!.id] = 0
  let evo: Evolution = { look: 'neutral', seen: [] }
  let firstLook: string | null = null
  let lookChanges = 0
  let shiftLookDay: number | null = null
  let id = 0
  let lastFindDay = -1
  let logDaysSinceFind = 0 // completed days with a log since the last find
  const pityDaysNow = () => logDaysSinceFind
  // Speed-up with identical results (--exact skips it), as in streak-sim.ts: the real
  // streakMilestoneReached walks the whole streak twice per log. Only the first log of a
  // game day can add to the count, taking it from `current` (through yesterday) to
  // current + 1, and a milestone fires only if best < m <= current + 1. So at most one
  // walk per day finds the milestones a log could reach; createLogEvent gets just those,
  // and none (so no walk at all) otherwise. The walk is reused only while the context
  // hasn't changed (same game day, no log since). It's skipped when no milestone is in
  // reach: best never goes down, and current grows by at most 1 a day, so `current` is at
  // most the last walk's current plus the days since it.
  let walkKey = ''
  let lastWalk = { dayKey: '', current: 0, best: 0 } // dayKey '' = no walk yet: always walk
  const possibleMilestones = (ctx: () => readonly GameEvent[], now: number, todayLogs: readonly LogEvent[]): number[] => {
    if (STREAKS.milestones.every((m) => m <= lastWalk.best)) return []
    const day = dayKey(now)
    if (todayLogs.some((e) => dayKey(e.timestamp) === day)) return []
    const key = `${day}|${todayLogs.length}`
    if (walkKey !== key) {
      if (lastWalk.dayKey !== '') {
        const most = lastWalk.current + daysBetween(lastWalk.dayKey, day)
        if (!STREAKS.milestones.some((m) => lastWalk.best < m && m <= most + 1)) return []
      }
      walkKey = key
      const s = overallStreak(ctx(), now, STREAKS)
      lastWalk = { dayKey: day, current: s.current, best: s.best }
    }
    return STREAKS.milestones.filter((m) => lastWalk.best < m && m <= lastWalk.current + 1)
  }
  for (let i = 0; i < DAYS; i++) {
    const { y, m, d } = cal(i)
    const plan0 = p.plan(i, rng, st)
    const shifted = sc.shiftAt !== undefined && i >= sc.shiftAt
    const plan = plan0 && shifted ? { ...plan0, gym: 0.1, walk: 0.2, read: 0.9 } : plan0
    const noon = londonInstant(y, m, d, 12, 0)
    const attempts: { t: Task; ts: number }[] = []
    if (plan) {
      for (const s of sts) {
        const t = s.task
        if (shifted && s.kind === 'extra') continue // archived
        if (t.rules.kind === 'wakeUp') {
          const target = DEFAULT_SETTINGS.wakeSchedule[weekdayOf(dayKey(noon))]
          if (target != null && rng() < plan.wake) {
            const [th, tm] = target.split(':').map(Number) as [number, number]
            const mins = th * 60 + tm + Math.floor(rng() * 16)
            attempts.push({ t, ts: londonInstant(y, m, d, Math.floor(mins / 60), mins % 60) })
          }
          continue
        }
        const limit = t.rules.kind === 'oncePerDay' ? 1 : t.rules.max
        let n: number
        if (t.id === 'avoided') n = Math.min(limit, poisson(plan.avoided, rng))
        else {
          const pr = s.kind === 'base' ? plan[t.id as 'gym'] : (sc.key.startsWith('water') || sc.key.startsWith('Lwater')) ? plan.easy : plan.extra
          n = 0
          while (n < limit && rng() < pr) n++
        }
        for (let k = 0; k < n; k++) attempts.push({ t, ts: londonInstant(y, m, d, Math.min(23, s.hour + k * 4), (id + k) % 60) })
      }
    }
    attempts.sort((a, b) => a.ts - b.ts)
    const today: LogEvent[] = []
    for (const a of attempts) {
      const inCarry = new Set<LogEvent>([...finds, ...since])
      // Stage holding needs the max stageReached; a carried record marker holds it.
      // Compact carried log, with one XP marker first (on the first logged day, so it adds no
      // streak day and counts before every find) so totalXp and the held stage match.
      const carried = new Set<LogEvent>([...today, ...finds, ...since])
      // The day markers only matter to the streak walk. Every other check createLogEvent
      // makes (availability, XP, held stage, finds, pity) ignores them: no XP, reward or
      // stage, a task id no task has, and they sit before every find. That last part relies
      // on activeLogs keeping the order events were added (not sorting by timestamp): the
      // pity count (logsSinceFind) walks back from the end of the array to the last find,
      // so markers placed before the finds are never counted. So they're only added when a
      // milestone is in reach (and so the real function walks the streak).
      const fast = !(EXACT || finds.length === 0)
      const head: GameEvent[] = fast
        ? [{ id: 'xpcarry', type: 'log', taskId: '__xp__', timestamp: events[0]!.timestamp, xpAwarded: xp - [...carried].reduce((s, e) => s + logXp(e), 0), stageReached: stageFor(xp, STAGES).id }]
        : []
      const tail: GameEvent[] = fast ? [...today.filter((e) => !inCarry.has(e)), ...finds, ...since] : []
      const withMarkers = (): GameEvent[] => (fast ? [...head, ...dayMarkers, ...tail] : events)
      const roll = { chance: rr(), pick: rr() }
      if (PITY_DAYS !== null && pityDaysNow() >= PITY_DAYS && finds.length < RCFG.items.length) roll.chance = 0
      const milestones = EXACT ? STREAKS.milestones : possibleMilestones(withMarkers, a.ts, today)
      const streaks = EXACT ? STREAKS : { ...STREAKS, milestones }
      const ctx: GameEvent[] = !fast ? events : milestones.length > 0 ? withMarkers() : [...head, ...tail]
      const ev = createLogEvent(a.t, ctx, DEFAULT_SETTINGS, a.ts, `e${id++}`, roll, { stages: STAGES, rewards: RCFG, streaks, effortLevels: sc.levels ? EFFORT_LEVELS : NO_LEVELS })
      if (!ev) continue
      events.push(ev); today.push(ev); logs++
      xp += logXp(ev)
      if (ev.reward && (ev.reward as { kind?: string }).kind === 'treat') { treats++; treatXp += logXp(ev) - ev.xpAwarded }
      if (rewardItemId(ev) !== null) {
        itemDays.push(i + 1)
        if (itemDays.length === RCFG.items.length) collectionDay = i + 1
        finds.push(ev); since.length = 0; lastFindDay = i; logDaysSinceFind = 0
      } else {
        since.push(ev)
        if (since.length > Math.max(1, RCFG.itemPityLogs) + 1) since.shift()
      }
    }
    if (today.length && lastFindDay !== i) logDaysSinceFind++
    if (today.length) { activeDays++; dayMarkers.push({ id: `m${i}`, type: 'log', taskId: '__m__', timestamp: noon, xpAwarded: 0 }) }
    for (const s of STAGES) if (stageDay[s.id] == null && xp >= s.xpFrom) stageDay[s.id] = i + 1
    if (today.length) {
      const tasks = sts.map((s) => s.task)
      const next = evolutionLook(events, tasks, STATS, STAGES, EVO_RULES)
      const ch = lookChange(evo, next)
      if (evo.look === 'neutral' && next.look !== 'neutral') firstLook = next.look
      else if (ch) { lookChanges++; if (shifted && shiftLookDay === null) shiftLookDay = i + 1 }
      evo = next
    }
  }
  if (foundItems(events, RCFG.items).length !== itemDays.length) throw new Error('find mismatch')
  const totals = statTotals(events, sts.map((s) => s.task), STATS)
  const sum = totals.reduce((s, t) => s + t.xp, 0)
  const top = Math.max(...totals.map((t) => t.xp))
  const stageDays = STAGES.slice(1).map((s) => stageDay[s.id]).filter((x): x is number => x != null)
  let shortestStageGap = Infinity
  for (let k = 1; k < stageDays.length; k++) shortestStageGap = Math.min(shortestStageGap, stageDays[k]! - stageDays[k - 1]!)
  const all = [0, ...[...itemDays, ...stageDays].filter((x) => x <= 180).sort((a, b) => a - b), Math.min(180, collectionDay ?? 180)]
  let gap = 0
  for (let k = 1; k < all.length; k++) gap = Math.max(gap, all[k]! - all[k - 1]!)
  // Whole run: longest stretch with no new stage or item until both run out (collection and
  // Elder, or the end of the run if either never happens), and longest stretch between finds.
  const elderDay = stageDay[STAGES[STAGES.length - 1]!.id]
  const noveltyEnd = Math.min(DAYS, Math.max(collectionDay ?? DAYS, elderDay ?? DAYS))
  const allW = [0, ...[...itemDays, ...stageDays].filter((x) => x <= noveltyEnd).sort((a, b) => a - b), noveltyEnd]
  let gapAll = 0
  for (let k = 1; k < allW.length; k++) gapAll = Math.max(gapAll, allW[k]! - allW[k - 1]!)
  const itW = [0, ...itemDays, collectionDay ?? DAYS]
  let itemGapMax = 0
  for (let k = 1; k < itW.length; k++) itemGapMax = Math.max(itemGapMax, itW[k]! - itW[k - 1]!)
  return {
    newThingGapAll: gapAll, itemGapMax, noveltyEnd,
    stageDay, xp, logs, activeDays, treats, treatXp, itemDays, collectionDay, newThingGap180: gap, shortestStageGap,
    look: evo.look, firstLook, lookChanges, shiftLookDay, topShare: sum ? top / sum : 0,
  }
}

const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))]! }
const med = (xs: number[]) => (xs.length ? pct(xs, 50) : NaN)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const r1 = (n: number) => Math.round(n * 10) / 10
const dist = (xs: Record<string, number>) => Object.entries(xs).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')

console.log(`Task edit sim: ${DAYS} days x ${RUNS} runs${EXACT ? ' (exact)' : ''}${PITY_DAYS !== null ? `; WHAT-IF pity by ${PITY_DAYS} log days (30-log rule off)` : ''}; stages ${STAGES.map((s) => s.xpFrom).join('/')}; treat ${REWARDS.treatChance} x${REWARDS.treatBonusShare}; rare ${REWARDS.rareChance}, pity ${RCFG.itemPityLogs}, ${RCFG.items.length} items; milestones ${STREAKS.milestones.join('/')}\n`)
for (const sc of SCENARIOS.filter((s) => !SF || SF.includes(s.key))) {
  console.log(`=== ${sc.name} [${sc.key}] ===`)
  for (const p of PROFILES.filter((x) => !PF || PF.includes(x.key))) {
    const runs = Array.from({ length: RUNS }, (_, k) => simulate(sc, p, BASE_SEED + k * 7919))
    const sd = (id: string) => { const xs = runs.map((r) => r.stageDay[id]).filter((x): x is number => x != null); return xs.length === RUNS ? `${med(xs)}` : xs.length ? `${med(xs)} (${Math.round(xs.length / RUNS * 100)}%)` : '-' }
    const cd = runs.map((r) => r.collectionDay).filter((x): x is number => x != null)
    const looks: Record<string, number> = {}
    for (const r of runs) looks[r.firstLook ?? 'none'] = (looks[r.firstLook ?? 'none'] ?? 0) + 1
    console.log(`  ${p.name.padEnd(8)} hatch ${sd('hatchling')}, whelp ${sd('whelp')}, juv ${sd('juvenile')}, adult ${sd('adult')}, elder ${sd('elder')} | XP/active day ${Math.round(mean(runs.map((r) => r.xp / Math.max(1, r.activeDays))))}, logs/active day ${r1(mean(runs.map((r) => r.logs / Math.max(1, r.activeDays))))}`)
    console.log(`           treats/wk ${r1(mean(runs.map((r) => r.treats / (DAYS / 7))))} (${Math.round(mean(runs.map((r) => r.treatXp / r.xp)) * 100)}% of XP) | items by d30/90 ${med(runs.map((r) => r.itemDays.filter((x) => x <= 30).length))}/${med(runs.map((r) => r.itemDays.filter((x) => x <= 90).length))}, collection ${cd.length ? med(cd) : '-'}${cd.length < RUNS ? ` (${Math.round(cd.length / RUNS * 100)}%)` : ''} | longest gap w/o stage or item to d180 ${med(runs.map((r) => r.newThingGap180))} | shortest stage-to-stage ${med(runs.map((r) => r.shortestStageGap))}d`)
    const el = runs.map((r) => r.stageDay[STAGES[STAGES.length - 1]!.id]).filter((x): x is number => x != null)
    const lead = runs.filter((r) => r.collectionDay != null && r.stageDay[STAGES[STAGES.length - 1]!.id] != null).map((r) => r.collectionDay! - r.stageDay[STAGES[STAGES.length - 1]!.id]!)
    console.log(`           collection p10/50/90 ${cd.length ? `${pct(cd, 10)}/${pct(cd, 50)}/${pct(cd, 90)}` : '-'} vs elder ${el.length ? med(el) : '-'} (collection minus elder, median ${lead.length ? med(lead) : '-'}) | longest gap w/o stage or item, whole run med/p90 ${med(runs.map((r) => r.newThingGapAll))}/${pct(runs.map((r) => r.newThingGapAll), 90)} | longest gap between finds med/p90 ${med(runs.map((r) => r.itemGapMax))}/${pct(runs.map((r) => r.itemGapMax), 90)}`)
    console.log(`           first look: ${dist(looks)} | look changes/run ${r1(mean(runs.map((r) => r.lookChanges)))} | top stat share ${Math.round(mean(runs.map((r) => r.topShare)) * 100)}%${sc.shiftAt !== undefined ? ` | look changed after shift: ${runs.filter((r) => r.shiftLookDay != null).length}/${RUNS}, day ${med(runs.map((r) => r.shiftLookDay).filter((x): x is number => x != null))}` : ''}`)
  }
  console.log('')
}
