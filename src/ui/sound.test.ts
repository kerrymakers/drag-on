import { describe, expect, it } from 'vitest'
import { createSoundPlayer, logSounds, MAX_NOTE_GAIN, SOUNDS, soundLength, type AudioLike, type SoundId } from './sound'

const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} })

/** A pretend AudioContext that counts what it's asked to play. */
function fakeAudio(state = 'running') {
  const fake = {
    currentTime: 0,
    state,
    destination: {},
    started: 0,
    resumed: 0,
    resume() {
      fake.resumed++
      return Promise.resolve()
    },
    createOscillator: () => ({ type: '', frequency: param(), connect() {}, start: () => void fake.started++, stop() {} }),
    createGain: () => ({ gain: param(), connect() {} }),
  }
  return fake
}

describe('the sounds', () => {
  it('are all short, and quiet', () => {
    for (const [id, notes] of Object.entries(SOUNDS) as [SoundId, (typeof SOUNDS)[SoundId]][]) {
      expect(notes.length, id).toBeGreaterThan(0)
      expect(soundLength(id), id).toBeLessThanOrEqual(id === 'stageUp' ? 1 : 0.7)
      for (const n of notes) expect(n.gain, id).toBeLessThanOrEqual(MAX_NOTE_GAIN)
    }
    // The everyday ones are the shortest.
    expect(soundLength('tap')).toBeLessThan(0.15)
    expect(soundLength('log')).toBeLessThan(0.25)
  })
})

describe('logSounds', () => {
  const none = { treat: false, item: false, stageUp: false, newLook: false }

  it('gives every log a sound straight away: a chirp, or a jingle for a treat or a find', () => {
    expect(logSounds(none)).toEqual({ now: 'log', reveal: null, card: null })
    expect(logSounds({ ...none, treat: true })).toEqual({ now: 'treat', reveal: null, card: null })
    expect(logSounds({ ...none, item: true })).toEqual({ now: 'item', reveal: null, card: null })
    // Meeting the weekly goal: the jingle on the tap, and still the fanfare for a stage-up.
    expect(logSounds({ ...none, treat: true, goal: true })).toEqual({ now: 'item', reveal: null, card: null })
    expect(logSounds({ ...none, treat: true, goal: true, stageUp: true })).toEqual({ now: 'item', reveal: 'stageUp', card: null })
    // Granting the secret wish: the treat jingle.
    expect(logSounds({ ...none, wish: true })).toEqual({ now: 'treat', reveal: null, card: null })
  })

  it('saves the fanfare for the stage-up reveal, and a find after it for its card', () => {
    expect(logSounds({ ...none, stageUp: true })).toEqual({ now: 'log', reveal: 'stageUp', card: null })
    expect(logSounds({ treat: true, item: false, stageUp: true, newLook: true })).toEqual({ now: 'treat', reveal: 'stageUp', card: null })
    expect(logSounds({ ...none, item: true, stageUp: true })).toEqual({ now: 'log', reveal: 'stageUp', card: 'item' })
    // A new look alone gets the gentler sparkle.
    expect(logSounds({ ...none, newLook: true })).toEqual({ now: 'log', reveal: 'item', card: null })
  })
})

describe('createSoundPlayer', () => {
  it('stays silent while off, and makes no audio until the first sound', () => {
    let on = false
    let made = 0
    const audio = fakeAudio()
    const player = createSoundPlayer(() => on, () => (made++, audio as unknown as AudioLike))
    player.play('log')
    expect(made).toBe(0)
    on = true
    player.play('log')
    player.play('tap')
    expect(made).toBe(1)
    expect(audio.started).toBe(SOUNDS.log.length + SOUNDS.tap.length)
  })

  it('wakes a suspended context', () => {
    const audio = fakeAudio('suspended')
    createSoundPlayer(() => true, () => audio as unknown as AudioLike).play('treat')
    expect(audio.resumed).toBe(1)
  })

  it('never throws: no Web Audio, a blocked one, or a broken one is just silence', () => {
    expect(() => createSoundPlayer(() => true, () => null).play('log')).not.toThrow()
    let tries = 0
    const blocked = createSoundPlayer(() => true, () => {
      tries++
      throw new Error('not allowed')
    })
    expect(() => blocked.play('log')).not.toThrow()
    blocked.play('stageUp')
    expect(tries).toBe(1)
    const broken = { ...fakeAudio(), createOscillator: () => { throw new Error('closed') } }
    expect(() => createSoundPlayer(() => true, () => broken as unknown as AudioLike).play('item')).not.toThrow()
    // With no AudioContext at all (as here, in Node), the default is silent too.
    expect(() => createSoundPlayer(() => true).play('tap')).not.toThrow()
  })
})
