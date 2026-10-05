// Creating events. The caller supplies the time and the id; nothing here reads the clock.

import { dayKey } from './day'
import { activeLogs, taskAvailability } from './state'
import type { GameEvent, LogEvent, Settings, Task, UndoEvent } from './types'

/** A new log for `task`, or null if the task's rules don't allow a log right now. */
export function createLogEvent(
  task: Task,
  events: readonly GameEvent[],
  settings: Settings,
  now: number,
  id: string,
): LogEvent | null {
  if (!taskAvailability(task, events, settings, now).canLog) return null
  return { id, type: 'log', taskId: task.id, timestamp: now, xpAwarded: task.xp }
}

/**
 * The log that "Undo last log" would undo: the most recently appended active log
 * from today. Append order (not timestamp) decides, so a phone clock change can't
 * make undo skip the log you just tapped. Logs from earlier days can't be undone.
 */
export function undoableLog(events: readonly GameEvent[], now: number): LogEvent | null {
  const today = dayKey(now)
  const logs = activeLogs(events)
  for (let i = logs.length - 1; i >= 0; i--) {
    const log = logs[i] as LogEvent
    if (dayKey(log.timestamp) === today) return log
  }
  return null
}

/** An undo for the undoable log, or null if there's nothing to undo. */
export function createUndoEvent(
  events: readonly GameEvent[],
  now: number,
  id: string,
): UndoEvent | null {
  const target = undoableLog(events, now)
  if (!target) return null
  return { id, type: 'undo', targetEventId: target.id, timestamp: now }
}
