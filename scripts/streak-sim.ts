// Milestone 5 streak balance sim. Uses the real createLogEvent (with STREAKS), overallStreak,
// rollReward/milestoneReward, foundItems. Config is never changed; what-ifs are in memory.
// Run from the repo root:
//   npx vite-node scripts/streak-sim.ts [days] [runs] [--exact] [--freeze=N] [--max=N] [--ms=7,30,60,100] [--profiles=a,b]
import {
  createLogEvent, dayKey, weekdayOf, overallStreak, foundItems, rewardItemId, rewardMilestone, logXp, stageFor,
} from '../src/game'
import type { GameEvent, LogEvent, Task } from '../src/game'
import { TASKS } from '../src/config/tasks'
import { STAGES } from '../src/config/stages'
import { DEFAULT_SETTINGS } from '../src/config/settings'
import { TIME_ZONE } from '../src/config/time'
import { REWARDS } from '../src/config/rewards'
import { STREAKS } from '../src/config/streaks'
import type { StreakConfig } from '../src/config/streaks'

// The sims set XP directly on their what-if tasks, so no effort level overrides it.
const NO_LEVELS: readonly never[] = []

const args = process.argv.slice(2)
const pos = args.filter((a) => !a.startsWith('--'))
const DAYS = Number(pos[0] ?? 365)
const RUNS = Number(pos[1] ?? 200)
const EXACT = args.includes('--exact')
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]
const SCFG: StreakConfig = {
  ...STREAKS,
  freezeEveryDays: arg('freeze') ? Number(arg('freeze')) : STREAKS.freezeEveryDays,
  freezeMaxHeld: arg('max') ? Number(arg('max')) : STREAKS.freezeMaxHeld,
  milestones: arg('ms') ? arg('ms')!.split(',').map(Number) : STREAKS.milestones,
}
const PF = arg('profiles')?.split(',') ?? null
const BASE_SEED = 20261008
const START = { y: 2026, m: 10, d: 5 }

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
function poisson(l: number, rng: () => number) {
  const L = Math.exp(-l); let k = 0; let p = 1
  do { k++; p *= rng() } while (p > L)
  return k - 1
}

interface Plan { wake: number; gym: number; walk: number; read: number; selfcare: number; avoided: number }
interface Profile { key: string; name: string; init?: (rng: () => number) => unknown; plan: (d: number, rng: () => number, st: any) => Plan | null }
const TYP: Plan = { wake: 0.6, gym: 0.36, walk: 0.25, read: 0.25, selfcare: 0.3, avoided: 0.35 }
const PROFILES: Profile[] = [
  { key: 'keen', name: 'Keen (5% random days off)', plan: (_d, r) => (r() < 0.05 ? null : { wake: 0.9, gym: 0.7, walk: 0.8, read: 0.8, selfcare: 0.6, avoided: 1.8 }) },
  { key: 'typical', name: 'Typical (8% random independent days off; the sim profile used for SPEC numbers)', plan: (_d, r) => (r() < 0.08 ? null : TYP) },
  {
    key: 'typclust', name: 'Typical, clustered days off (same ~8% off, but in 1-4 day blocks: ill, weekends away)',
    init: () => ({ off: 0 }),
    plan: (_d, r, st) => {
      if (st.off > 0) { st.off--; return null }
      if (r() < 0.032) { st.off = Math.floor(r() * 4); return null } // block of 1-4 days, mean 2.5
      return TYP
    },
  },
  {
    key: 'patchy', name: 'Patchy (good/bad weeks alternate, a 5-8 day gap and a 10-14 day holiday)',
    init: (r) => {
      const g1 = 21 + Math.floor(r() * 30); const g2 = 100 + Math.floor(r() * 50)
      return { gaps: [[g1, g1 + 5 + Math.floor(r() * 4)], [g2, g2 + 10 + Math.floor(r() * 5)]] }
    },
    plan: (d, r, st) => {
      if (st.gaps.some(([a, b]: number[]) => d >= a! && d < b!)) return null
      if (Math.floor(d / 7) % 2 === 0) return { wake: 0.65, gym: 0.4, walk: 0.3, read: 0.3, selfcare: 0.35, avoided: 0.5 }
      if (r() < 0.45) return null
      return { wake: 0.25, gym: 0.12, walk: 0.15, read: 0.1, selfcare: 0.25, avoided: 0.15 }
    },
  },
  { key: 'light', name: 'Light (20% random days off, light logging)', plan: (_d, r) => (r() < 0.2 ? null : { wake: 0.4, gym: 0.17, walk: 0.2, read: 0.15, selfcare: 0.2, avoided: 0.2 }) },
]

const TASK = new Map<string, Task>(TASKS.map((t) => [t.id, t]))
const ITEMS = REWARDS.items
const N_ITEMS = ITEMS.length

interface Run {
  logDays: boolean[]
  msDay: Record<number, number | null>
  msFromFreezeRun: Record<number, boolean>
  msReach: Record<number, number | null>
  itemDays: number[]; itemSources: { lucky: number; pity: number; milestone: number }
  collectionDay: number | null
  stageDay: Record<string, number | null>
  earned: number; wastedAtCap: number; used: number; saves: number; spentThenBroke: number; breaks: number
  best: number; currentEnd: number; heldEnd: number
  currentSamples: number[] // current streak as shown on each day (after that day)
  gapNoItem180: number; gapNoItemToCollection: number
  newThingGap180: number
}

function simulate(p: Profile, seed: number): Run {
  const rng = mulberry32(seed)
  const rr = mulberry32(seed ^ 0x7ea7)
  const st = p.init?.(rng) ?? {}
  const events: GameEvent[] = []
  // Compact carried state (see note): one marker per past logged day, the finds, the last <=30 logs since the last find.
  const dayMarkers: LogEvent[] = []
  const finds: LogEvent[] = []
  const since: LogEvent[] = []
  let xp = 0
  const logDays: boolean[] = []
  const msDay: Record<number, number | null> = Object.fromEntries(SCFG.milestones.map((m) => [m, null]))
  const itemDays: number[] = []
  const src = { lucky: 0, pity: 0, milestone: 0 }
  let collectionDay: number | null = null
  const stageDay: Record<string, number | null> = Object.fromEntries(STAGES.map((s) => [s.id, null]))
  let id = 0
  for (let i = 0; i < DAYS; i++) {
    const { y, m, d } = cal(i)
    const plan = p.plan(i, rng, st)
    const noon = londonInstant(y, m, d, 12, 0)
    const attempts: { t: string; ts: number }[] = []
    if (plan) {
      const target = DEFAULT_SETTINGS.wakeSchedule[weekdayOf(dayKey(noon))]
      if (target != null && rng() < plan.wake) {
        const [th, tm] = target.split(':').map(Number) as [number, number]
        const mins = th * 60 + tm + Math.floor(rng() * 16)
        attempts.push({ t: 'wake', ts: londonInstant(y, m, d, Math.floor(mins / 60), mins % 60) })
      }
      if (rng() < plan.gym) attempts.push({ t: 'gym', ts: londonInstant(y, m, d, 18, 30) })
      if (rng() < plan.walk) attempts.push({ t: 'walk', ts: londonInstant(y, m, d, 13, 0) })
      if (rng() < plan.selfcare) attempts.push({ t: 'selfcare', ts: londonInstant(y, m, d, 20, 0) })
      if (rng() < plan.read) attempts.push({ t: 'read', ts: londonInstant(y, m, d, 22, 0) })
      const n = poisson(plan.avoided, rng)
      for (let k = 0; k < n; k++) attempts.push({ t: 'avoided', ts: londonInstant(y, m, d, 10 + k, 0) })
    }
    attempts.sort((a, b) => a.ts - b.ts)
    const today: LogEvent[] = []
    let logged = false
    for (const a of attempts) {
      const inCarry = new Set<LogEvent>([...finds, ...since])
      const ctx: GameEvent[] = EXACT || finds.length === 0 ? events : [...dayMarkers, ...today.filter((e) => !inCarry.has(e)), ...finds, ...since]
      const roll = { chance: rr(), pick: rr() }
      const ev = createLogEvent(TASK.get(a.t)!, ctx, DEFAULT_SETTINGS, a.ts, `e${id++}`, roll, { stages: STAGES, rewards: REWARDS, streaks: SCFG, effortLevels: NO_LEVELS })
      if (!ev) continue
      logged = true
      events.push(ev)
      today.push(ev)
      xp += logXp(ev)
      const ms = rewardMilestone(ev)
      const itemId = rewardItemId(ev)
      if (ms !== null) msDay[ms] = i + 1
      else {
        // A first-time milestone with every item found brings no milestone tag; detect via streak instead (below).
      }
      if (itemId !== null) {
        itemDays.push(i + 1)
        if (ms !== null) src.milestone++
        else if (roll.chance < REWARDS.rareChance) src.lucky++
        else src.pity++
        if (itemDays.length === N_ITEMS) collectionDay = i + 1
        finds.push(ev)
        since.length = 0
      } else {
        since.push(ev)
        if (since.length > REWARDS.itemPityLogs + 1) since.shift()
      }
    }
    if (logged) dayMarkers.push({ id: `m${i}`, type: 'log', taskId: '__m__', timestamp: noon, xpAwarded: 0 })
    logDays.push(logged)
    for (const s of STAGES) if (stageDay[s.id] == null && xp >= s.xpFrom) stageDay[s.id] = i + 1
  }
  // Checks against the real functions on the full log.
  const endNow = londonInstant(cal(DAYS).y, cal(DAYS).m, cal(DAYS).d, 12, 0) // next day noon: all DAYS finished
  const real = overallStreak(events, endNow, SCFG)
  if (foundItems(events, ITEMS).length !== itemDays.length) throw new Error('find mismatch')

  // Walk the real day statuses for freeze stats.
  const statusList: string[] = []
  for (let i = 0; i < DAYS; i++) {
    const { y, m, d } = cal(i)
    statusList.push(real.days.get(dayKey(londonInstant(y, m, d, 12, 0))) ?? 'none')
  }
  let earned = 0, wasted = 0, used = 0, saves = 0, spentThenBroke = 0, breaks = 0
  let cur = 0, held = 0, best = 0
  const currentSamples: number[] = []
  const msFromFreezeRun: Record<number, boolean> = {}
  const msReach: Record<number, number | null> = Object.fromEntries(SCFG.milestones.map((m) => [m, null]))
  let runHadFreeze = false
  let pendingFrozen = 0
  for (let i = 0; i < DAYS; i++) {
    const s = statusList[i]
    if (s === 'logged') {
      if (pendingFrozen > 0) { saves++; pendingFrozen = 0 }
      cur++
      if (cur % SCFG.freezeEveryDays === 0) { if (held < SCFG.freezeMaxHeld) { held++; earned++ } else wasted++ }
      if (cur > best) {
        for (const ms of SCFG.milestones) if (cur === ms && best < ms) { msFromFreezeRun[ms] = runHadFreeze; msReach[ms] = i + 1 }
        best = cur
      }
    } else if (s === 'frozen') { held--; used++; pendingFrozen++; runHadFreeze = true }
    else if (s === 'missed') {
      if (cur > 0) { breaks++; if (pendingFrozen > 0) spentThenBroke++ }
      pendingFrozen = 0; cur = 0; runHadFreeze = false
    }
    currentSamples.push(cur)
  }
  if (best !== real.best || cur !== real.current || held !== real.freezesHeld) throw new Error(`streak replay mismatch ${best}/${real.best} ${cur}/${real.current} ${held}/${real.freezesHeld}`)
  for (const ms of SCFG.milestones) {
    if (msDay[ms] != null && msDay[ms] !== msReach[ms]) throw new Error(`milestone ${ms} day mismatch`)
    if (msReach[ms] != null && msDay[ms] == null && (collectionDay === null || collectionDay > msReach[ms]!)) throw new Error(`milestone ${ms} item missing`)
  }
  const gapIn = (days: number[], end: number) => {
    const ds = [0, ...days.filter((x) => x <= end), end]
    let g = 0
    for (let k = 1; k < ds.length; k++) g = Math.max(g, ds[k]! - ds[k - 1]!)
    return g
  }
  const stageDays = Object.values(stageDay).filter((x): x is number => x != null && x > 0)
  return {
    logDays, msDay, msFromFreezeRun, msReach, itemDays, itemSources: src, collectionDay, stageDay,
    earned, wastedAtCap: wasted, used, saves, spentThenBroke, breaks, best, currentEnd: cur, heldEnd: held, currentSamples,
    gapNoItem180: gapIn(itemDays, Math.min(180, collectionDay ?? 180)),
    gapNoItemToCollection: gapIn(itemDays, collectionDay ?? DAYS),
    newThingGap180: gapIn([...itemDays, ...stageDays].sort((a, b) => a - b), Math.min(180, DAYS)),
  }
}

const pct = (xs: number[], q: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((q / 100) * s.length))]! }
const med = (xs: number[]) => pct(xs, 50)
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const r1 = (n: number) => Math.round(n * 10) / 10
const tri = (xs: number[]) => (xs.length ? `${pct(xs, 10)} / ${med(xs)} / ${pct(xs, 90)}` : '-')

console.log(`Streak sim: ${DAYS} days x ${RUNS} runs${EXACT ? ' (exact)' : ''}; freeze every ${SCFG.freezeEveryDays}, max ${SCFG.freezeMaxHeld}, milestones ${SCFG.milestones.join('/')}; ${N_ITEMS} items, rare ${REWARDS.rareChance}, pity ${REWARDS.itemPityLogs}\n`)
for (const p of PROFILES.filter((x) => !PF || PF.includes(x.key))) {
  const runs = Array.from({ length: RUNS }, (_, k) => simulate(p, BASE_SEED + k * 7919))
  console.log(`=== ${p.name} ===`)
  console.log(`Active days ${r1(mean(runs.map((r) => r.logDays.filter(Boolean).length)) / DAYS * 100)}%`)
  for (const ms of SCFG.milestones) {
    const ds = runs.map((r) => r.msReach[ms]).filter((x): x is number => x != null)
    const viaFreeze = runs.filter((r) => r.msFromFreezeRun[ms]).length
    console.log(`  Milestone ${String(ms).padStart(3)}: reached ${r1(ds.length / RUNS * 100)}% | day p10/med/p90 ${tri(ds)} | run included a frozen day ${r1(viaFreeze / Math.max(1, ds.length) * 100)}%`)
  }
  console.log(`  Best streak by end p10/med/p90 ${tri(runs.map((r) => r.best))} | current at end ${tri(runs.map((r) => r.currentEnd))} | median of daily current streak ${med(runs.flatMap((r) => r.currentSamples))}`)
  const by = (d: number) => runs.map((r) => Math.max(...r.currentSamples.slice(0, d)))
  console.log(`  Best streak by day 30 / 90 / 180: ${med(by(30))} / ${med(by(90))} / ${med(by(Math.min(180, DAYS)))} (medians)`)
  console.log(`  Freezes/run: earned ${r1(mean(runs.map((r) => r.earned)))}, lost at cap ${r1(mean(runs.map((r) => r.wastedAtCap)))}, used ${r1(mean(runs.map((r) => r.used)))}, saved a streak ${r1(mean(runs.map((r) => r.saves)))}, spent then streak ended anyway ${r1(mean(runs.map((r) => r.spentThenBroke)))} | streak ends ${r1(mean(runs.map((r) => r.breaks)))} | held at end ${r1(mean(runs.map((r) => r.heldEnd)))}`)
  const cd = runs.map((r) => r.collectionDay).filter((x): x is number => x != null)
  console.log(`  Collection complete (${N_ITEMS} items): ${tri(cd)} (${r1(cd.length / RUNS * 100)}% by day ${DAYS}) | item sources/run lucky ${r1(mean(runs.map((r) => r.itemSources.lucky)))}, pity ${r1(mean(runs.map((r) => r.itemSources.pity)))}, milestone ${r1(mean(runs.map((r) => r.itemSources.milestone)))}`)
  const by180 = runs.map((r) => r.itemDays.filter((x) => x <= 180).length)
  console.log(`  Items by day 30/90/180: ${[30, 90, 180].map((d) => med(runs.map((r) => r.itemDays.filter((x) => x <= d).length))).join(' / ')} | longest no-item gap, days 1-180 (or to completion) p10/med/p90 ${tri(runs.map((r) => r.gapNoItem180))}, whole run to completion ${tri(runs.map((r) => r.gapNoItemToCollection))}`)
  console.log(`  Longest stretch with no stage-up or item, days 1-180: ${tri(runs.map((r) => r.newThingGap180))} | Elder day ${tri(runs.map((r) => r.stageDay['elder']).filter((x): x is number => x != null))} (${r1(runs.filter((r) => r.stageDay['elder'] != null).length / RUNS * 100)}%)`)
  void by180
  console.log('')
}
