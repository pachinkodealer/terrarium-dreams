// Shared between browser and server. An entry describes how something was
// written — never the words themselves.

export interface Weather {
  fog: number    // circling / vagueness: long pauses, slow start
  cloud: number  // rewriting: how much was deleted
  drift: number  // agitation: how fast the air moves
  light: number  // sitting with it: the pause before letting go
  growth: number // how much was given
}

// A dream symbol: the metaphor of an entry, compressed into a few engraved
// strokes on a 100×100 face (like an alchemical or tarot mark), plus a short
// name. It's all that's kept from the words — and only sometimes.
export const STONE_TONES = ['slate', 'sand', 'moss', 'rust', 'night'] as const
export const INK_TONES = ['gold', 'silver', 'copper'] as const
export const STROKE_KINDS = ['circle', 'ring', 'arc', 'line', 'dot'] as const
export type StoneTone = (typeof STONE_TONES)[number]
export type InkTone = (typeof INK_TONES)[number]

export interface SymbolStroke {
  kind: (typeof STROKE_KINDS)[number]
  // circle (filled), ring (outline), arc (outline from start° to end°), dot: centre + radius
  cx: number; cy: number; r: number; start: number; end: number
  // line: from (x1,y1) to (x2,y2)
  x1: number; y1: number; x2: number; y2: number
}

export interface DreamSymbol {
  name: string
  stone: StoneTone
  ink: InkTone
  strokes: SymbolStroke[]
}

export const MAX_STROKES = 14

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
  symbol?: DreamSymbol // left by some entries, never most
  seen?: DreamSymbol   // what they saw in the entry's blot, read as a symbol
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

const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null

/**
 * The single gate for symbols, whether they come from the model or from
 * storage: only known stroke kinds, coordinates clamped onto the face, a
 * bounded stroke count, and a short plain-text name. Nothing is ever drawn
 * from raw markup, so a strange or hostile response can't inject anything.
 */
export function parseSymbol(raw: unknown): DreamSymbol | null {
  if (!raw || typeof raw !== 'object') return null
  const s = raw as Record<string, unknown>
  const stone = oneOf(s.stone, STONE_TONES), ink = oneOf(s.ink, INK_TONES)
  const name = typeof s.name === 'string'
    ? s.name.toLowerCase().replace(/[^a-z' -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40)
    : ''
  if (!stone || !ink || !name || !Array.isArray(s.strokes)) return null

  const strokes: SymbolStroke[] = []
  for (const rawStroke of s.strokes.slice(0, MAX_STROKES)) {
    if (!rawStroke || typeof rawStroke !== 'object') continue
    const k = rawStroke as Record<string, unknown>
    const kind = oneOf(k.kind, STROKE_KINDS)
    const c = (key: string, min: number, max: number, fallback: number) => num(k[key], min, max) ?? fallback
    if (!kind) continue
    strokes.push({
      kind,
      cx: c('cx', 0, 100, 50), cy: c('cy', 0, 100, 50), r: c('r', 0.5, 48, 4),
      start: c('start', -360, 720, 0), end: c('end', -360, 720, 180),
      x1: c('x1', 0, 100, 50), y1: c('y1', 0, 100, 50), x2: c('x2', 0, 100, 50), y2: c('y2', 0, 100, 50),
    })
  }
  return strokes.length ? { name, stone, ink, strokes } : null
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
  const symbol = parseSymbol(e.symbol)
  const seen = parseSymbol(e.seen)
  return {
    id: e.id, writtenAt: new Date(at).toISOString(), weather,
    hesitation, dwell, longPauses: Math.round(longPauses), medianGap, deleteRatio,
    length: Math.round(length),
    ...(symbol ? { symbol } : {}),
    ...(seen ? { seen } : {}),
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
