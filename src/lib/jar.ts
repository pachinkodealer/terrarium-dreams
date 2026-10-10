// Shared between browser and server. An entry describes how something was
// written — never the words themselves.

export interface Weather {
  fog: number    // circling / vagueness: long pauses, slow start
  cloud: number  // rewriting: how much was deleted
  drift: number  // agitation: how fast the air moves
  light: number  // sitting with it: the pause before letting go
  growth: number // how much was given
}

export interface EntryQualities {
  id: string           // uuid generated in the browser; dedupes resyncs
  writtenAt: string    // ISO timestamp
  hesitation: number   // seconds before the first character
  dwell: number        // seconds before letting go
  longPauses: number   // gaps over 1.4s while writing
  medianGap: number    // ms between changes
  deleteRatio: number  // deletions per character kept
  length: number       // characters given
  weather: Weather
}

export const MAX_ENTRIES_PER_SAVE = 200
export const EMAIL_COOLDOWN_MIN = 25

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : null

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const email = raw.trim().toLowerCase()
  return email.length <= 254 && EMAIL.test(email) ? email : null
}

export function normalizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim().replace(/\s+/g, ' ').slice(0, 40)
  return name || null
}

export function parseWeather(raw: unknown): Weather | null {
  if (!raw || typeof raw !== 'object') return null
  const w = raw as Record<string, unknown>
  const fog = num(w.fog, 0, 1), cloud = num(w.cloud, 0, 1), drift = num(w.drift, 0, 3)
  const light = num(w.light, 0, 1), growth = num(w.growth, 0, 1)
  if (fog == null || cloud == null || drift == null || light == null || growth == null) return null
  return { fog, cloud, drift, light, growth }
}

/** Accepts only well-formed entries; anything else from the browser is dropped. */
export function parseEntry(raw: unknown): EntryQualities | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.id !== 'string' || !UUID.test(e.id)) return null
  const at = typeof e.writtenAt === 'string' ? Date.parse(e.writtenAt) : NaN
  if (!Number.isFinite(at) || at > Date.now() + 60_000) return null
  const weather = parseWeather(e.weather)
  const hesitation = num(e.hesitation, 0, 3600), dwell = num(e.dwell, 0, 3600)
  const longPauses = num(e.longPauses, 0, 10_000), medianGap = num(e.medianGap, 0, 3_600_000)
  const deleteRatio = num(e.deleteRatio, 0, 100), length = num(e.length, 0, 100_000)
  if (!weather || hesitation == null || dwell == null || longPauses == null ||
      medianGap == null || deleteRatio == null || length == null) return null
  return {
    id: e.id, writtenAt: new Date(at).toISOString(), weather,
    hesitation, dwell, longPauses: Math.round(longPauses), medianGap, deleteRatio,
    length: Math.round(length),
  }
}

export function parseEntries(raw: unknown): EntryQualities[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, MAX_ENTRIES_PER_SAVE).map(parseEntry).filter((e): e is EntryQualities => e != null)
}

/**
 * The no-spam rule: at most one email to an address per cooldown window.
 * Returns how many whole minutes remain, or 0 if an email may be sent now.
 */
export function minutesUntilEmailAllowed(lastSentAt: Date | null, now: Date): number {
  if (!lastSentAt) return 0
  const remainingMs = lastSentAt.getTime() + EMAIL_COOLDOWN_MIN * 60_000 - now.getTime()
  return remainingMs > 0 ? Math.ceil(remainingMs / 60_000) : 0
}

/** "sarah@gmail.com" → "s••••@gmail.com" for display. */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@')
  return `${user.slice(0, 1)}${'•'.repeat(Math.min(Math.max(user.length - 1, 2), 6))}@${domain}`
}
