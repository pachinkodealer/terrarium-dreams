import Anthropic from '@anthropic-ai/sdk'
import { readEntry, reflectionEnabled, type Manner } from '@/lib/reflect'

// Reads one entry for a symbol. The words live only in this request: they are
// never logged, never stored, and never echoed back.

export const maxDuration = 60

const MAX_CHARS = 2000

// Best-effort per-visitor limit (in memory, per server instance), so one
// visitor can't run up the bill. Readings are rare by design anyway.
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 12
const recent = new Map<string, number[]>()

function allow(ip: string): boolean {
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter(t => now - t < WINDOW_MS)
  if (hits.length >= MAX_PER_WINDOW) { recent.set(ip, hits); return false }
  hits.push(now)
  recent.set(ip, hits)
  if (recent.size > 5000) for (const [k, v] of recent) if (!v.some(t => now - t < WINDOW_MS)) recent.delete(k)
  return true
}

const n = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0)

export async function POST(request: Request) {
  if (!reflectionEnabled()) return Response.json({ symbol: null, care: false, off: true }, { status: 503 })

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!allow(ip)) return Response.json({ symbol: null, care: false }, { status: 429 })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: 'bad request' }, { status: 400 }) }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  if (text.length < 2 || text.length > MAX_CHARS) return Response.json({ error: 'bad request' }, { status: 400 })

  const m = (body.manner ?? {}) as Record<string, unknown>
  const manner: Manner = {
    hesitation: n(m.hesitation, 3600), dwell: n(m.dwell, 3600),
    longPauses: n(m.longPauses, 10_000), deleteRatio: n(m.deleteRatio, 100),
  }

  try {
    return Response.json(await readEntry(text, manner, body.kind === 'seen' ? 'seen' : 'entry'))
  } catch (err) {
    // Log only the kind of failure — never the request, which holds the words.
    const status = err instanceof Anthropic.APIError ? err.status : 'unknown'
    console.error(`reflect: model call failed (status ${status})`)
    return Response.json({ symbol: null, care: false }, { status: 502 })
  }
}
