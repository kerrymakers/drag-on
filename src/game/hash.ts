// Small fixed picks from a string key, shared by game logic and copy. Pure.

/** A 32-bit hash of `key` (×31, like Java's String.hashCode, unsigned). */
export function stringHash(key: string): number {
  let hash = 0
  for (const ch of key) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return hash
}

/**
 * stringHash, well stirred (murmur3's finaliser). Keys that differ by one character
 * (one day and the next, say) land far apart, so picks from them don't run in order.
 */
export function mixedHash(key: string): number {
  let h = stringHash(key)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/** One of `list`, fixed for a given key (by stringHash), or null if the list is empty. */
export function pickFor<T>(list: readonly T[], key: string): T | null {
  if (list.length === 0) return null
  return list[stringHash(key) % list.length] ?? null
}
