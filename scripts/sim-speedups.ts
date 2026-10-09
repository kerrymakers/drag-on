// Sim-only speed-ups. Import this FIRST in every sim script (a side-effect import).
//
// Memoises Intl.DateTimeFormat formatToParts per formatter and timestamp. It's a pure
// function of those, so results are unchanged; dayKey (src/game/day.ts) is called
// millions of times in a sim and formatToParts was most of the CPU time. The patch is on
// the prototype and is looked up on every call, so order only matters for speed: game
// code calls formatToParts when dayKey runs, never at module load.
// The app never imports this file.
const memo = new WeakMap<Intl.DateTimeFormat, Map<number, Intl.DateTimeFormatPart[]>>()
const rawParts = Intl.DateTimeFormat.prototype.formatToParts
Intl.DateTimeFormat.prototype.formatToParts = function (this: Intl.DateTimeFormat, d?: Date | number) {
  if (typeof d !== 'number') return rawParts.call(this, d)
  let m = memo.get(this)
  if (!m) memo.set(this, (m = new Map()))
  let v = m.get(d)
  if (!v) m.set(d, (v = rawParts.call(this, d)))
  return v
}

export {}
