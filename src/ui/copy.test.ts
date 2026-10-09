import { describe, expect, it } from 'vitest'
import { STAGES } from '../config/stages'
import { STATS } from '../config/stats'
import { dragonProgress } from '../game/state'
import type { GameEvent, Stage } from '../game/types'
import { COLLECTION, DRAGON_SCREEN, FREEZE_EARNED, ITEM_FOUND, milestoneFound, nextSurprise, UNDONE, UNDONE_ITEM, collectionCount, collectionLine, foundTileLabel, friendlyDay, itemFoundLine, itemFoundSaved, undoneToast, wearToast } from './copy'
import { ITEMS } from '../config/items'
import { IMPORT_CONFIRM, IMPORT_REFUSED, SETTINGS, importDropped, lastBackupLine } from './copy'
import { LOGGED, LOOK_CHANGE, TREAT_FLOAT, loggedToast, LOOK_NAMES, LOOK_REVEAL, STAGE_UP, STAGE_UP_FALLBACK, celebrationCopy, lookLabel, progressLabel } from './copy'

const from = (id: string) => STAGES.find((s) => s.id === id)!.xpFrom
const labelFor = (events: GameEvent[], stages: readonly Stage[]) => {
  const p = dragonProgress(events, stages)
  return progressLabel(p.stage.id, p.xpToNext, p.next !== null)
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

  it('counts down to growing after hatching, never naming a stage not reached yet', () => {
    expect(labelFor([logOf(120)], STAGES)).toBe(`${from('whelp') - 120} XP to grow`)
    for (const xp of [120, from('whelp'), from('juvenile'), from('adult')]) {
      const label = labelFor([logOf(xp)], STAGES)
      for (const stage of STAGES) expect(label).not.toContain(stage.name)
    }
  })

  it('stays positive when the stage is held ahead of the XP', () => {
    // Hatchling held at 120 XP after its threshold was raised to 150.
    const harder = STAGES.map((s) => (s.id === 'hatchling' ? { ...s, xpFrom: 150 } : s))
    expect(labelFor([logOf(120, 'hatchling')], harder)).toBe(`${from('whelp') - 120} XP to grow`)
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

describe('look copy', () => {
  it('names every stat in config, warmly', () => {
    for (const s of STATS) {
      expect(LOOK_NAMES[s.id], s.id).toBeTruthy()
      expect(lookLabel(s.id)).toBe(`${LOOK_NAMES[s.id]} dragon`)
      expect(LOOK_REVEAL[s.id], s.id).toContain(LOOK_NAMES[s.id])
      expect(LOOK_CHANGE[s.id]?.message, s.id).toContain(LOOK_NAMES[s.id])
    }
  })

  it('a stage-up with a new look keeps the stage words and names the look underneath', () => {
    const c = celebrationCopy('juvenile', 'wisdom')
    expect(c.message).toBe(STAGE_UP.juvenile?.message)
    expect(c.button).toBe(STAGE_UP.juvenile?.button)
    expect(c.sub).toBe(LOOK_REVEAL.wisdom)
  })

  it('a stage-up without a new look has no extra line', () => {
    expect(celebrationCopy('adult', null)).toEqual({ ...STAGE_UP.adult, sub: null })
    expect(celebrationCopy('mystery', null)).toEqual({ ...STAGE_UP_FALLBACK, sub: null })
  })

  it('a new look on its own uses the look words', () => {
    expect(celebrationCopy(null, 'heart')).toEqual({ ...LOOK_CHANGE.heart, sub: null })
  })
})

describe('LOGGED and TREAT_FLOAT', () => {
  it('reads as before for a normal log', () => {
    expect(LOGGED(25, 'Read for 20 minutes')).toBe('+25 XP · Read for 20 minutes')
    expect(LOGGED(25, 'Read for 20 minutes', 0)).toBe('+25 XP · Read for 20 minutes')
  })

  it('shows a treat as the total, leaving the breakdown to the floats', () => {
    expect(LOGGED(25, 'Read for 20 minutes', 13)).toBe('Treat! +38 XP · Read for 20 minutes')
    expect(TREAT_FLOAT(13)).toBe('+13 treat')
  })

  it('splits the toast so only the task name can shorten', () => {
    expect(loggedToast(25, 'Read for 20 minutes')).toEqual({ lead: '+25 XP · ', name: 'Read for 20 minutes' })
    expect(loggedToast(25, 'Read for 20 minutes', 13)).toEqual({ lead: 'Treat! +38 XP · ', name: 'Read for 20 minutes' })
  })
})


describe('item copy', () => {
  it('says a log found something, with the base XP (items are worth none)', () => {
    expect(LOGGED(25, 'Read for 20 minutes', 0, true)).toBe('Found something! +25 XP · Read for 20 minutes')
    expect(loggedToast(25, 'Read for 20 minutes', 0, true)).toEqual({ lead: 'Found something! +25 XP · ', name: 'Read for 20 minutes' })
    expect(loggedToast(25, 'Read', 0, false)).toEqual({ lead: '+25 XP · ', name: 'Read' })
  })

  it('undoing a find says so gently; a normal undo is unchanged', () => {
    expect(undoneToast(false)).toBe(UNDONE)
    expect(undoneToast(false)).toBe('Undone')
    expect(undoneToast(true)).toBe(UNDONE_ITEM)
    expect(UNDONE_ITEM.startsWith('Undone')).toBe(true)
  })

  it('gives every item a warm line from the list, the same every time', () => {
    for (const item of ITEMS) {
      const line = itemFoundLine(item.id)
      expect(ITEM_FOUND.lines, item.id).toContain(line)
      expect(itemFoundLine(item.id)).toBe(line)
    }
    expect(ITEM_FOUND.lines).toContain(itemFoundLine(''))
    expect(ITEM_FOUND.lines).toContain(itemFoundLine('an id from a later version'))
  })

  it('never guilt-trips', () => {
    const all = [
      ...ITEM_FOUND.lines,
      ITEM_FOUND.heading,
      ITEM_FOUND.button,
      ITEM_FOUND.saved,
      UNDONE_ITEM,
      COLLECTION.empty,
      COLLECTION.some,
      COLLECTION.all,
      COLLECTION.unknownLabel,
    ]
    for (const text of all) expect(text, text).not.toMatch(/\b(missed|failed|lost|only|should|never|yet to)\b/i)
  })
})

describe('collection copy', () => {
  it('counts what has been found', () => {
    expect(collectionCount(0, 12)).toBe('0 of 12 found')
    expect(collectionCount(3, 12)).toBe('3 of 12 found')
    expect(collectionCount(12, 12)).toBe('12 of 12 found')
  })

  it('has a friendly line for none, some and all', () => {
    expect(collectionLine(0, 12)).toBe(COLLECTION.empty)
    expect(collectionLine(1, 12)).toBe(COLLECTION.some)
    expect(collectionLine(11, 12)).toBe(COLLECTION.some)
    expect(collectionLine(12, 12)).toBe(COLLECTION.all)
    expect(collectionLine(13, 12)).toBe(COLLECTION.all)
  })

  it('names a found tile with when it was found, reusing friendlyDay', () => {
    const today = '2026-10-07'
    expect(foundTileLabel('Tiny thing', friendlyDay('2026-10-07', today))).toBe('Tiny thing, found today')
    expect(foundTileLabel('Tiny thing', friendlyDay('2026-10-06', today))).toBe('Tiny thing, found yesterday')
    expect(foundTileLabel('Tiny thing', friendlyDay('2026-10-01', today))).toBe('Tiny thing, found 1 Oct')
    expect(foundTileLabel('Tiny thing', friendlyDay('2025-12-25', today))).toBe('Tiny thing, found 25 Dec 2025')
  })
})

describe('wearing copy', () => {
  it('says what went on, mid-sentence, or that it came off', () => {
    expect(wearToast('Ribbon bow', true, false)).toBe('Wearing the ribbon bow')
    expect(wearToast('Tiny book', false, false)).toBe(COLLECTION.takenOff)
    expect(wearToast('Tiny book', false, true)).toBe('Taken off')
  })

  it('before hatching, keeps the choice for hatching day', () => {
    expect(wearToast('Paper crown', true, true)).toBe('Saving the paper crown for hatching day')
  })

  it('reads well for every item', () => {
    for (const item of ITEMS) {
      const t = wearToast(item.name, true, false)
      expect(t, item.id).toMatch(/^Wearing the [a-z]/)
      expect(t.length, item.id).toBeLessThanOrEqual(32) // fits a toast at 360px
      expect(wearToast(item.name, true, true).length, item.id).toBeLessThanOrEqual(44)
    }
  })

  it('says where a find went, and whether it went straight on', () => {
    expect(itemFoundSaved(false, false)).toBe(ITEM_FOUND.saved)
    expect(itemFoundSaved(false, true)).toBe(ITEM_FOUND.saved)
    expect(itemFoundSaved(true, false)).toBe(ITEM_FOUND.savedWearing)
    expect(itemFoundSaved(true, true)).toBe(ITEM_FOUND.savedWearingEgg)
  })

  it('never guilt-trips', () => {
    const all = [
      ITEM_FOUND.savedWearing,
      ITEM_FOUND.savedWearingEgg,
      COLLECTION.wearing,
      COLLECTION.wearHint,
      COLLECTION.eggLine,
      COLLECTION.takenOff,
      DRAGON_SCREEN.wearingTitle,
      DRAGON_SCREEN.wearingEmpty,
      DRAGON_SCREEN.wearingEgg,
    ]
    for (const text of all) expect(text, text).not.toMatch(/\b(missed|failed|lost|only|should|never|yet to|must)\b/i)
  })
})

describe('streak milestone and freeze copy', () => {
  it('adds a freeze note on its own, keeping the lead and name as they were', () => {
    expect(loggedToast(25, 'Read', 0, false, true)).toEqual({ lead: '+25 XP · ', name: 'Read', note: FREEZE_EARNED })
    expect(loggedToast(25, 'Read', 13, false, true)).toEqual({ lead: 'Treat! +38 XP · ', name: 'Read', note: FREEZE_EARNED })
    expect(loggedToast(25, 'Read', 0, true, true).note).toBe(FREEZE_EARNED)
    expect(loggedToast(25, 'Read', 0, false, false)).not.toHaveProperty('note')
    expect(LOGGED(25, 'Read', 0, false, true)).toBe('+25 XP · Read …and a streak freeze!')
  })

  it('celebrates a milestone find without naming or hinting at anything to come', () => {
    expect(milestoneFound(7)).toEqual({ heading: '7 days together!', line: 'I found you something to celebrate.' })
    expect(milestoneFound(100).heading).toBe('100 days together!')
    expect(nextSurprise(30)).toBe('Next surprise at 30 days')
  })

  it('never guilt-trips', () => {
    const all = [FREEZE_EARNED, milestoneFound(7).heading, milestoneFound(7).line, nextSurprise(30)]
    for (const text of all) expect(text, text).not.toMatch(/\b(missed|failed|lost|only|should|never|yet to|don't)\b/i)
  })
})

describe('settings and backup copy', () => {
  it('says when the last backup was, in friendly words', () => {
    expect(lastBackupLine(null)).toBe(SETTINGS.neverBackedUp)
    expect(lastBackupLine('Today')).toBe('Last backup: today')
    expect(lastBackupLine('Yesterday')).toBe('Last backup: yesterday')
    expect(lastBackupLine('5 Oct')).toBe('Last backup: 5 Oct')
  })

  it('counts left-out entries in the singular and plural', () => {
    expect(importDropped(1)).toBe("1 entry couldn't be read and will be left out.")
    expect(importDropped(3)).toBe("3 entries couldn't be read and will be left out.")
  })

  it('refuses gently and always says nothing changed', () => {
    for (const line of Object.values(IMPORT_REFUSED)) expect(line).toMatch(/nothing (here )?has changed/i)
  })

  it('makes clear that importing replaces what is on this phone', () => {
    expect(IMPORT_CONFIRM.replaces).toMatch(/replaces everything on this phone/)
  })
})
