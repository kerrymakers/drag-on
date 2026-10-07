// Helpers for tests only.
import type { GameEvent, LogEvent, RewardRoll, Task, UndoEvent } from '../game/types'

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

/** A reward roll that brings nothing, for logs where the reward isn't under test. */
export const NO_REWARD: RewardRoll = { chance: 0.9999, pick: 0 }

/** A log with a treat on top, as createLogEvent would make on a treat roll. */
export const treatLog = (
  task: Pick<Task, 'id' | 'xp'>,
  timestamp: number,
  bonusXp: number,
  id = `log-${++n}`,
): LogEvent => ({ ...log(task, timestamp, id), reward: { kind: 'treat', bonusXp } })

/** A log that brought an item, as createLogEvent would make on a rare roll. */
export const itemLog = (
  task: Pick<Task, 'id' | 'xp'>,
  timestamp: number,
  itemId: string,
  id = `log-${++n}`,
): LogEvent => ({ ...log(task, timestamp, id), reward: { kind: 'item', itemId } })
