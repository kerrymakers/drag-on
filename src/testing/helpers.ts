// Helpers for tests only.
import type { GameEvent, LogEvent, Task, UndoEvent } from '../game/types'

/** Parse an ISO time with an explicit offset, e.g. at('2026-10-05T06:45:00+01:00'). */
export const at = (iso: string): number => {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) throw new Error(`Bad test time: ${iso}`)
  return t
}

let n = 0
export const log = (task: Pick<Task, 'id' | 'xp'>, timestamp: number, id = `log-${++n}`): LogEvent => ({
  id,
  type: 'log',
  taskId: task.id,
  timestamp,
  xpAwarded: task.xp,
})

export const undo = (target: GameEvent, timestamp: number, id = `undo-${++n}`): UndoEvent => ({
  id,
  type: 'undo',
  targetEventId: target.id,
  timestamp,
})
