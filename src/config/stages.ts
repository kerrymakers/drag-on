import type { Stage } from '../game/types'

// Total XP at which each stage begins. Rebalancing recalculates from history.
export const STAGES: readonly Stage[] = [
  { id: 'egg', name: 'Egg', xpFrom: 0 },
  { id: 'hatchling', name: 'Hatchling', xpFrom: 100 },
  { id: 'whelp', name: 'Whelp', xpFrom: 500 },
  { id: 'juvenile', name: 'Juvenile', xpFrom: 1300 },
  { id: 'adult', name: 'Adult', xpFrom: 3500 },
  { id: 'elder', name: 'Elder', xpFrom: 7000 },
]
