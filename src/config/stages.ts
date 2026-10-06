import type { Stage } from '../game/types'

// Total XP at which each stage begins. Rebalancing recalculates from history.
// Rebalanced 2026-10-06 for treats (+~10% XP): see SPEC.md, Growth stages.
export const STAGES: readonly Stage[] = [
  { id: 'egg', name: 'Egg', xpFrom: 0 },
  { id: 'hatchling', name: 'Hatchling', xpFrom: 100 },
  { id: 'whelp', name: 'Whelp', xpFrom: 600 },
  { id: 'juvenile', name: 'Juvenile', xpFrom: 1500 },
  { id: 'adult', name: 'Adult', xpFrom: 4000 },
  { id: 'elder', name: 'Elder', xpFrom: 8300 },
]
