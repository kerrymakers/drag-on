import type { Task } from '../game/types'

// Task ids are stable: events refer to them, so never rename an id.
export const TASKS: readonly Task[] = [
  {
    id: 'wake',
    name: 'Got up on time',
    stat: 'discipline',
    xp: 30,
    rules: { kind: 'wakeUp' },
    archived: false,
  },
  {
    id: 'gym',
    name: 'Gym / workout',
    stat: 'strength',
    xp: 40,
    rules: { kind: 'oncePerDay' },
    archived: false,
  },
  {
    id: 'walk',
    name: 'Went for a walk',
    stat: 'strength',
    xp: 15,
    rules: { kind: 'oncePerDay' },
    archived: false,
  },
  {
    id: 'read',
    name: 'Read for 20 minutes',
    stat: 'wisdom',
    xp: 25,
    rules: { kind: 'oncePerDay' },
    archived: false,
  },
  {
    id: 'avoided',
    name: "Something I've been avoiding",
    stat: 'discipline',
    xp: 15,
    rules: { kind: 'maxPerDay', max: 2 },
    archived: false,
  },
]
