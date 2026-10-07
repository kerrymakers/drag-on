// Which logs count: the append-only log minus anything undone. Its own module so
// rewards.ts can use it without importing state.ts (which imports rewards.ts).

import type { GameEvent, LogEvent } from './types'

/** Log events that haven't been undone, in the order they were appended. */
export function activeLogs(events: readonly GameEvent[]): LogEvent[] {
  const undone = new Set<string>()
  for (const e of events) if (e.type === 'undo') undone.add(e.targetEventId)
  return events.filter((e): e is LogEvent => e.type === 'log' && !undone.has(e.id))
}
