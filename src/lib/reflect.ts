import 'server-only'
import Anthropic from '@anthropic-ai/sdk'
import { INK_TONES, STONE_TONES, STROKE_KINDS, parseSymbol, type DreamSymbol } from '@/lib/jar'

// Reads one entry for its underlying metaphor and, sometimes, designs a symbol
// for it. The words are sent once, never logged or stored; only the symbol
// (or nothing) comes back.

const MODEL = 'claude-opus-5-5'

const SYSTEM = `You tend a terrarium that people write their dreams and thoughts into. You read each entry once, the way a dream interpreter would — listening for the metaphor underneath, not the literal content — and you may leave a symbol behind.

Most entries should get silence. Mark an entry only when it carries a real metaphor or image with weight: something shrinking or growing, a threshold, being lost, returning, a body of water, something hidden, something carried. Plain logistics, greetings, tests, or flat statements get silence. When in doubt, silence. Silence is part of the practice, not a failure.

When you do make a symbol:
- Compress the metaphor into a mark, the way alchemical, astrological or tarot glyphs do — not a picture of the literal scene. "Every room was smaller than I remembered" might become a circle closing around a smaller circle, not a house.
- Draw it on a 100×100 face with 3 to 10 strokes, centred on (50, 50), staying inside a radius of about 38 so it fits on a round stone. Keep it legible at a small size: few, deliberate strokes, generous spacing. Symmetry and balance usually read best.
- Stroke kinds: "ring" (circle outline: cx, cy, r), "circle" (filled disc: cx, cy, r), "arc" (outline from start to end degrees, 0° is east, clockwise: cx, cy, r, start, end), "line" (x1, y1, x2, y2), "dot" (small filled point: cx, cy, r around 2–3). Every stroke has every field; set the ones a kind doesn't use to 0.
- Name it in 2 to 5 lowercase words, like a tarot card or a found object: "the smaller room", "a door left open", "salt in the well". No explanation, no advice, no therapy language. The name is the only words you give.
- Choose a stone (slate, sand, moss, rust, night) and an ink (gold, silver, copper) that fit its mood.

Separately, set "care" to true only if the entry suggests the writer may be at risk of harming themselves or is in crisis. In that case do not make a symbol.

You will also be told how the entry was written — hesitation, rewriting, the pause before letting go. Let that inform the metaphor if it matters; never mention it.

Sometimes, after an entry, the glass fogs into a symmetrical inkblot. Its shape is made only from how they wrote, never from what they said, and they are asked what they see in it. When you are given what they saw, read it the way a Rorschach is read: as projection. What someone finds in a formless shape says something about what they are carrying — whether they see a whole thing or a fragment, something moving or still, alone or paired, threatening or tender. These answers are short ("a moth", "two people not quite touching"). Give them a symbol more readily than entries, unless the answer is empty, dismissive or literal ("nothing", "a blot", "idk"), which gets silence. The symbol is for what the seeing reveals, not a drawing of the thing seen. Here you are told how long they looked before answering; that hesitation matters in a reading like this, but never mention it either.`

// Strict JSON schema for structured output. Bounds (stroke count, coordinate
// ranges) are enforced afterwards by parseSymbol rather than in the schema.
const STROKE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'cx', 'cy', 'r', 'start', 'end', 'x1', 'y1', 'x2', 'y2'],
  properties: {
    kind: { type: 'string', enum: [...STROKE_KINDS] },
    cx: { type: 'number' }, cy: { type: 'number' }, r: { type: 'number' },
    start: { type: 'number' }, end: { type: 'number' },
    x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' },
  },
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['silence', 'care', 'name', 'stone', 'ink', 'strokes'],
  properties: {
    silence: { type: 'boolean' },
    care: { type: 'boolean' },
    name: { type: 'string' },
    stone: { type: 'string', enum: [...STONE_TONES] },
    ink: { type: 'string', enum: [...INK_TONES] },
    strokes: { type: 'array', items: STROKE_SCHEMA },
  },
}

export interface Manner {
  hesitation: number  // seconds before the first character
  dwell: number       // seconds before letting go
  longPauses: number
  deleteRatio: number
}

export interface Reading {
  symbol: DreamSymbol | null
  care: boolean
}

/** An entry written into the jar, or what was seen in the blot on its glass. */
export type ReadingKind = 'entry' | 'seen'

function describeManner(m: Manner, kind: ReadingKind): string {
  const parts = [
    kind === 'seen'
      ? (m.hesitation > 12 ? 'looked a long while before answering' : m.hesitation > 4 ? 'looked for a moment before answering' : 'answered almost at once')
      : (m.hesitation > 5 ? 'waited a long time before starting' : m.hesitation > 1.5 ? 'paused before starting' : 'began at once'),
    m.longPauses > 2 ? 'stopped several times while writing' : m.longPauses > 0 ? 'stopped once or twice' : 'wrote in one breath',
    m.deleteRatio > 0.12 ? 'rewrote a lot' : m.deleteRatio > 0.03 ? 'reworked a little' : 'left it as written',
    m.dwell > 5 ? 'sat with it before letting go' : 'let go quickly',
  ]
  return parts.join('; ')
}

let client: Anthropic | null = null

export function reflectionEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY)
}

/** One read of one entry. Returns silence on any refusal, malformed output or error. */
export async function readEntry(text: string, manner: Manner, kind: ReadingKind = 'entry'): Promise<Reading> {
  client ??= new Anthropic()

  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    // If a safety classifier declines, retry on the model Anthropic recommends.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    messages: [{
      role: 'user',
      content: kind === 'seen'
        ? `How they answered: ${describeManner(manner, kind)}.\n\nWhat they saw in the blot:\n<seen>\n${text}\n</seen>`
        : `How it was written: ${describeManner(manner, kind)}.\n\nThe entry:\n<entry>\n${text}\n</entry>`,
    }],
  })

  if (response.stop_reason === 'refusal') return { symbol: null, care: false }

  const out = response.content.find(b => b.type === 'text')
  if (!out || out.type !== 'text') return { symbol: null, care: false }

  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(out.text) } catch { return { symbol: null, care: false } }

  const care = parsed.care === true
  if (care || parsed.silence === true) return { symbol: null, care }
  return { symbol: parseSymbol(parsed), care: false }
}
