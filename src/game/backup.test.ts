import { describe, expect, it } from 'vitest'
import { BACKUP_REMINDER_DAYS } from '../config/backup'
import { at, log, undo } from '../testing/helpers'
import { backupDue } from './backup'

const gym = { id: 'gym', xp: 40 }
const DAYS = 14

describe('backupDue', () => {
  it('is configured at 14 days', () => {
    expect(BACKUP_REMINDER_DAYS).toBe(14)
  })

  it('is never due with no logs', () => {
    expect(backupDue([], undefined, at('2027-01-01T12:00:00Z'), DAYS)).toBe(false)
    expect(backupDue([], at('2026-01-01T12:00:00Z'), at('2027-01-01T12:00:00Z'), DAYS)).toBe(false)
  })

  it('is never due when every log was undone', () => {
    const a = log(gym, at('2026-09-01T18:00:00+01:00'))
    const events = [a, undo(a, at('2026-09-01T18:01:00+01:00'))]
    expect(backupDue(events, undefined, at('2026-10-09T12:00:00+01:00'), DAYS)).toBe(false)
  })

  it('counts from the last backup: not due at exactly 14 days, due at 15', () => {
    const events = [log(gym, at('2026-08-01T18:00:00+01:00'))]
    const backup = at('2026-09-01T20:00:00+01:00')
    expect(backupDue(events, backup, at('2026-09-15T12:00:00+01:00'), DAYS)).toBe(false) // 14 days
    expect(backupDue(events, backup, at('2026-09-16T03:59:00+01:00'), DAYS)).toBe(false) // still day 14
    expect(backupDue(events, backup, at('2026-09-16T04:00:00+01:00'), DAYS)).toBe(true) // day 15 begins
  })

  it('counts game days, so a backup at 01:00 belongs to the day before', () => {
    const events = [log(gym, at('2026-08-01T18:00:00+01:00'))]
    // 01:00 on 2 Sep is game day 1 Sep, so 15 days later is 16 Sep.
    const backup = at('2026-09-02T01:00:00+01:00')
    expect(backupDue(events, backup, at('2026-09-15T12:00:00+01:00'), DAYS)).toBe(false)
    expect(backupDue(events, backup, at('2026-09-16T12:00:00+01:00'), DAYS)).toBe(true)
  })

  it('with no backup ever, counts from the first active log', () => {
    const first = log(gym, at('2026-09-01T07:00:00+01:00'))
    const later = log(gym, at('2026-09-10T07:00:00+01:00'))
    expect(backupDue([first, later], undefined, at('2026-09-15T12:00:00+01:00'), DAYS)).toBe(false)
    expect(backupDue([first, later], undefined, at('2026-09-16T12:00:00+01:00'), DAYS)).toBe(true)
  })

  it('skips an undone first log when counting from the first log', () => {
    const first = log(gym, at('2026-09-01T07:00:00+01:00'))
    const kept = log(gym, at('2026-09-05T07:00:00+01:00'))
    const events = [first, undo(first, at('2026-09-01T07:01:00+01:00')), kept]
    expect(backupDue(events, undefined, at('2026-09-16T12:00:00+01:00'), DAYS)).toBe(false)
    expect(backupDue(events, undefined, at('2026-09-20T12:00:00+01:00'), DAYS)).toBe(true)
  })

  it('a fresh backup clears it', () => {
    const events = [log(gym, at('2026-08-01T18:00:00+01:00'))]
    const now = at('2026-10-09T12:00:00+01:00')
    expect(backupDue(events, undefined, now, DAYS)).toBe(true)
    expect(backupDue(events, now, now, DAYS)).toBe(false)
  })

  it('handles clock changes by counting calendar days', () => {
    // 20 Oct to 3 Nov 2026 crosses the end of BST: still exactly 14 days.
    const events = [log(gym, at('2026-10-01T18:00:00+01:00'))]
    const backup = at('2026-10-20T12:00:00+01:00')
    expect(backupDue(events, backup, at('2026-11-03T23:00:00Z'), DAYS)).toBe(false)
    expect(backupDue(events, backup, at('2026-11-04T04:00:00Z'), DAYS)).toBe(true)
  })
})
