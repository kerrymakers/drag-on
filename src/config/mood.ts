import type { MoodLevel } from '../game/types'

// How the dragon feels, by whole game days since the last log. Ordered by fromDays.
// It never affects XP or stage; every mood is gentle and fully recoverable.
export const MOODS: readonly MoodLevel[] = [
  { id: 'happy', fromDays: 0 },
  { id: 'content', fromDays: 1 },
  { id: 'sleepy', fromDays: 3 },
  { id: 'grumpy', fromDays: 5 },
]
