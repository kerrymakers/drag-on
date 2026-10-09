import { describe, expect, it } from 'vitest'
import { STAGES } from '../config/stages'
import type { GameEvent } from '../game/types'
import { defaultData, type SaveData } from '../storage'
import { at } from '../testing/helpers'
import { importSummary } from './settings-screen'

const NOW = at('2026-10-09T12:00:00+01:00')
const gym = (id: string, ts: number): GameEvent => ({ id, type: 'log', taskId: 'gym', timestamp: ts, xpAwarded: 40 })

function sample(): SaveData {
  return {
    ...defaultData(),
    events: [
      gym('a', at('2026-10-01T18:00:00+01:00')),
      gym('b', at('2026-10-02T18:00:00+01:00')),
      { id: 'u', type: 'undo', targetEventId: 'b', timestamp: at('2026-10-02T18:01:00+01:00') },
      gym('c', at('2026-10-03T18:00:00+01:00')),
    ],
  }
}

describe('importSummary', () => {
  it('counts active logs, names the stage the file reaches and dates the export', () => {
    const data = sample()
    expect(importSummary(data, at('2026-10-05T09:00:00+01:00'), NOW, STAGES)).toEqual({
      logs: 2,
      stage: 'Egg',
      saved: '5 Oct',
    })
  })

  it('uses this version’s thresholds for the stage', () => {
    const events: GameEvent[] = Array.from({ length: 4 }, (_, i) => gym(`g${i}`, at('2026-10-01T18:00:00+01:00') + i))
    expect(importSummary({ ...defaultData(), events }, NOW, NOW, STAGES)).toEqual({ logs: 4, stage: 'Hatchling', saved: 'Today' })
  })

  it('says null for the date when the file has none', () => {
    expect(importSummary(defaultData(), null, NOW, STAGES).saved).toBeNull()
  })

  it('adds the year for an export from another year', () => {
    expect(importSummary(defaultData(), at('2025-12-30T12:00:00Z'), NOW, STAGES).saved).toBe('30 Dec 2025')
  })
})
