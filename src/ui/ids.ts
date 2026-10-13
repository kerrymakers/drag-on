/** A unique id for a new event. randomUUID needs a secure context, so fall back if it's missing. */
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * A seed for the dragon's daily secret wish (see missionFor), made once. Math.random is
 * plenty: it only has to differ from phone to phone, not be secret.
 */
export function newMissionSeed(): string {
  return Math.floor(Math.random() * 2 ** 32).toString(36).padStart(7, '0')
}
