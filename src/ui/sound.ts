// Little sounds, made on the spot with Web Audio: no audio files, so they work offline
// and add nothing to download. Off unless switched on in Settings (soundIsOn), and
// governed only by that switch: reduced motion doesn't change them.
//
// Every sound is short, soft and quiet. Playing one never throws and never waits:
// with no Web Audio, or a blocked one, it's a silent no-op, and the log path never
// awaits it. The AudioContext is made on the first sound, which is always inside a
// tap (Chrome only lets a page start audio from a user gesture), and woken if Chrome
// has suspended it since.

export type SoundId = 'log' | 'treat' | 'item' | 'stageUp' | 'tap'

/** One soft note: a pitch (Hz), when it starts and how long it rings (seconds), and how loud. */
export interface Note {
  freq: number
  at: number
  dur: number
  gain: number
  /** A little slide up or down to this pitch, for a squeak or a chirp. */
  slideTo?: number
  wave?: 'sine' | 'triangle'
}

/** The loudest any one note gets (out of 1). Quiet on purpose: a phone speaker carries. */
export const MAX_NOTE_GAIN = 0.1

// Pitches, in Hz.
const C5 = 523.25
const E5 = 659.25
const G5 = 783.99
const C6 = 1046.5
const E6 = 1318.51
const G6 = 1567.98
const B6 = 1975.53
const C7 = 2093.0
const D7 = 2349.32

export const SOUNDS: Record<SoundId, readonly Note[]> = {
  // A tiny squeak when the dragon is tapped.
  tap: [{ freq: 880, slideTo: 1320, at: 0, dur: 0.09, gain: 0.05, wave: 'sine' }],
  // Every log: a quick two-note chirp, up.
  log: [
    { freq: C6, at: 0, dur: 0.08, gain: 0.06, wave: 'triangle' },
    { freq: G6, slideTo: 1661, at: 0.07, dur: 0.12, gain: 0.06, wave: 'triangle' },
  ],
  // A treat: a happy little run up.
  treat: [
    { freq: C6, at: 0, dur: 0.09, gain: 0.055, wave: 'triangle' },
    { freq: E6, at: 0.07, dur: 0.09, gain: 0.055, wave: 'triangle' },
    { freq: G6, at: 0.14, dur: 0.09, gain: 0.055, wave: 'triangle' },
    { freq: C7, at: 0.21, dur: 0.18, gain: 0.05, wave: 'triangle' },
  ],
  // A find (or a new look): a twinkly sparkle that hangs in the air.
  item: [
    { freq: G6, at: 0, dur: 0.12, gain: 0.045, wave: 'sine' },
    { freq: B6, at: 0.08, dur: 0.12, gain: 0.045, wave: 'sine' },
    { freq: D7, at: 0.16, dur: 0.14, gain: 0.04, wave: 'sine' },
    { freq: G6, at: 0.26, dur: 0.12, gain: 0.035, wave: 'sine' },
    { freq: D7, at: 0.34, dur: 0.35, gain: 0.04, wave: 'sine' },
  ],
  // Growing up: a small, warm fanfare, three steps up and a held note with its fifth.
  stageUp: [
    { freq: C5, at: 0, dur: 0.13, gain: 0.07, wave: 'triangle' },
    { freq: E5, at: 0.12, dur: 0.13, gain: 0.07, wave: 'triangle' },
    { freq: G5, at: 0.24, dur: 0.13, gain: 0.07, wave: 'triangle' },
    { freq: C6, at: 0.38, dur: 0.55, gain: 0.07, wave: 'triangle' },
    { freq: G5, at: 0.38, dur: 0.55, gain: 0.035, wave: 'sine' },
  ],
}

/** How long a sound lasts, in seconds. */
export function soundLength(id: SoundId): number {
  return Math.max(...SOUNDS[id].map((n) => n.at + n.dur))
}

/** What one log brings, as far as the sounds care. */
export interface LogOutcome {
  treat: boolean
  item: boolean
  /** The dragon grew a stage. */
  stageUp: boolean
  /** A look the dragon has never had (the gentler moment). */
  newLook: boolean
  /** The log met the weekly goal (its treat is the goal treat). */
  goal?: boolean
}

/**
 * Which sounds one log plays, so they never pile up on each other:
 * - now: straight away, on the tap. Every log gets one.
 * - reveal: when the stage-up (or new-look) moment reveals the new dragon, after the
 *   tap's sound has finished.
 * - card: when the find's card opens after that moment (a tap later).
 * A find with no moment before it opens its card at once, so its jingle is the tap's
 * sound, in place of the chirp. Meeting the weekly goal gets the jingle on the tap too.
 */
export function logSounds(o: LogOutcome): { now: SoundId; reveal: SoundId | null; card: SoundId | null } {
  const moment = o.stageUp || o.newLook
  const chirp: SoundId = o.goal ? 'item' : o.treat ? 'treat' : 'log'
  return {
    now: o.item && !moment ? 'item' : chirp,
    reveal: o.stageUp ? 'stageUp' : o.newLook ? 'item' : null,
    card: o.item && moment ? 'item' : null,
  }
}

/** The bits of Web Audio used here, so tests can pass a fake. */
export interface AudioLike {
  readonly currentTime: number
  readonly state: string
  readonly destination: unknown
  resume(): Promise<void>
  createOscillator(): OscillatorLike
  createGain(): GainLike
}
interface ParamLike {
  setValueAtTime(value: number, time: number): unknown
  linearRampToValueAtTime(value: number, time: number): unknown
  exponentialRampToValueAtTime(value: number, time: number): unknown
}
interface NodeLike {
  connect(to: never): unknown
}
interface OscillatorLike extends NodeLike {
  type: string
  frequency: ParamLike
  start(when: number): void
  stop(when: number): void
}
interface GainLike extends NodeLike {
  gain: ParamLike
}

export interface SoundPlayer {
  /** Plays a sound if sounds are on. Never throws, never waits. */
  play(id: SoundId): void
}

function browserAudio(): AudioLike | null {
  const Ctor = globalThis.AudioContext ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  return Ctor ? (new Ctor() as unknown as AudioLike) : null
}

/** A tiny lead-in, so the first note's start is never already in the past. */
const LEAD = 0.01
/** Each note fades in this fast, so it starts soft rather than with a click. */
const ATTACK = 0.012

/**
 * A player that asks `isOn` each time, so the switch takes effect at once. The audio
 * context is made on the first sound played (never at start-up), and only once: if it
 * can't be made, sounds stay silent for the session.
 */
export function createSoundPlayer(isOn: () => boolean, makeAudio: () => AudioLike | null = browserAudio): SoundPlayer {
  let audio: AudioLike | null | undefined
  return {
    play(id) {
      try {
        if (!isOn()) return
        if (audio === undefined) audio = makeAudio()
        if (!audio) return
        if (audio.state === 'suspended') audio.resume().catch(() => {})
        const start = audio.currentTime + LEAD
        for (const note of SOUNDS[id]) playNote(audio, note, start)
      } catch {
        // No sound this time; the rest of the feedback is enough.
        if (audio === undefined) audio = null
      }
    },
  }
}

function playNote(audio: AudioLike, note: Note, start: number) {
  const osc = audio.createOscillator()
  const amp = audio.createGain()
  const t0 = start + note.at
  const t1 = t0 + note.dur
  osc.type = note.wave ?? 'sine'
  osc.frequency.setValueAtTime(note.freq, t0)
  if (note.slideTo) osc.frequency.exponentialRampToValueAtTime(note.slideTo, t1)
  amp.gain.setValueAtTime(0.0001, t0)
  amp.gain.linearRampToValueAtTime(Math.min(note.gain, MAX_NOTE_GAIN), t0 + ATTACK)
  amp.gain.exponentialRampToValueAtTime(0.0001, t1)
  osc.connect(amp as never)
  amp.connect(audio.destination as never)
  osc.start(t0)
  osc.stop(t1 + 0.02)
}
