import { describe, expect, it } from 'vitest'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { dragonProgress } from '../game/state'
import type { GameEvent, Stage } from '../game/types'
import { LOGGED, LOOK_CHANGE, TREAT_FLOAT, loggedToast, LOOK_NAMES, LOOK_REVEAL, STAGE_UP, STAGE_UP_FALLBACK, celebrationCopy, lookLabel, progressLabel } from './copy'

const from = (id: string) => STAGES.find((s) => s.id === id)!.xpFrom
const labelFor = (events: GameEvent[], stages: readonly Stage[]) => {
  const p = dragonProgress(events, stages)
  return progressLabel(p.stage.id, p.xpToNext, p.next?.name ?? null)
}
const logOf = (xp: number, stageReached?: string): GameEvent => ({
  id: `l${xp}`,
  type: 'log',
  taskId: 'gym',
  timestamp: 0,
  xpAwarded: xp,
  ...(stageReached ? { stageReached } : {}),
})

describe('progressLabel', () => {
  it('counts down to hatching for an egg', () => {
    expect(labelFor([logOf(30)], STAGES)).toBe('70 XP to hatch')
  })

  it('names the next stage after hatching', () => {
    expect(labelFor([logOf(120)], STAGES)).toBe(`${from('whelp') - 120} XP to Whelp`)
  })

  it('stays positive when the stage is held ahead of the XP', () => {
    // Hatchling held at 120 XP after its threshold was raised to 150.
    const harder = STAGES.map((s) => (s.id === 'hatchling' ? { ...s, xpFrom: 150 } : s))
    expect(labelFor([logOf(120, 'hatchling')], harder)).toBe(`${from('whelp') - 120} XP to Whelp`)
  })

  it('says fully grown at the last stage', () => {
    expect(labelFor([logOf(100_000)], STAGES)).toBe('Fully grown')
  })
})

describe('stage-up copy', () => {
  it('has a message for every stage after the egg', () => {
    for (const s of STAGES.slice(1)) {
      expect(STAGE_UP[s.id]?.message, s.id).toBeTruthy()
      expect(STAGE_UP[s.id]?.button, s.id).toBeTruthy()
    }
  })
})

describe('look copy', () => {
  it('names every stat in config, warmly', () => {
    for (const s of STATS) {
      expect(LOOK_NAMES[s.id], s.id).toBeTruthy()
      expect(lookLabel(s.id)).toBe(`${LOOK_NAMES[s.id]} dragon`)
      expect(LOOK_REVEAL[s.id], s.id).toContain(LOOK_NAMES[s.id])
      expect(LOOK_CHANGE[s.id]?.message, s.id).toContain(LOOK_NAMES[s.id])
    }
  })

  it('a stage-up with a new look keeps the stage words and names the look underneath', () => {
    const c = celebrationCopy('juvenile', 'wisdom')
    expect(c.message).toBe(STAGE_UP.juvenile?.message)
    expect(c.button).toBe(STAGE_UP.juvenile?.button)
    expect(c.sub).toBe(LOOK_REVEAL.wisdom)
  })

  it('a stage-up without a new look has no extra line', () => {
    expect(celebrationCopy('adult', null)).toEqual({ ...STAGE_UP.adult, sub: null })
    expect(celebrationCopy('mystery', null)).toEqual({ ...STAGE_UP_FALLBACK, sub: null })
  })

  it('a new look on its own uses the look words', () => {
    expect(celebrationCopy(null, 'heart')).toEqual({ ...LOOK_CHANGE.heart, sub: null })
  })
})

describe('LOGGED and TREAT_FLOAT', () => {
  it('reads as before for a normal log', () => {
    expect(LOGGED(25, 'Read for 20 minutes')).toBe('+25 XP · Read for 20 minutes')
    expect(LOGGED(25, 'Read for 20 minutes', 0)).toBe('+25 XP · Read for 20 minutes')
  })

  it('shows a treat as the total, leaving the breakdown to the floats', () => {
    expect(LOGGED(25, 'Read for 20 minutes', 13)).toBe('Treat! +38 XP · Read for 20 minutes')
    expect(TREAT_FLOAT(13)).toBe('+13 treat')
  })

  it('splits the toast so only the task name can shorten', () => {
    expect(loggedToast(25, 'Read for 20 minutes')).toEqual({ lead: '+25 XP · ', name: 'Read for 20 minutes' })
    expect(loggedToast(25, 'Read for 20 minutes', 13)).toEqual({ lead: 'Treat! +38 XP · ', name: 'Read for 20 minutes' })
  })
})

