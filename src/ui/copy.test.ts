import { describe, expect, it } from 'vitest'
import { STAGES } from '../config/stages'
import { dragonProgress } from '../game/state'
import type { GameEvent, Stage } from '../game/types'
import { STAGE_UP, progressLabel } from './copy'

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
    expect(labelFor([logOf(120)], STAGES)).toBe('380 XP to Whelp')
  })

  it('stays positive when the stage is held ahead of the XP', () => {
    // Hatchling held at 120 XP after its threshold was raised to 150.
    const harder = STAGES.map((s) => (s.id === 'hatchling' ? { ...s, xpFrom: 150 } : s))
    expect(labelFor([logOf(120, 'hatchling')], harder)).toBe('380 XP to Whelp')
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
