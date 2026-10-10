'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import {
  maskEmail, normalizeEmail, normalizeName, parseEntries, parseWeather,
  type EntryQualities, type Weather,
} from '@/lib/jar'
import { Garden, derivePlants } from '@/components/Garden'

const CALM: Weather = { fog: 0.25, cloud: 0.2, drift: 1, light: 0.4, growth: 0.35 }

// Outline of the jar in a 300×380 box: neck at the top, shoulders curving out
// to a wide body with rounded base. Clips the scene and draws the glass edge.
const JAR_PATH =
  'M114 60 L186 60 L186 84 C186 104 278 100 278 140 L278 342 ' +
  'C278 360 266 372 248 372 L52 372 C34 372 22 360 22 342 ' +
  'L22 140 C22 100 114 104 114 84 Z'

// How long written words take to drift away after Enter. Matches .releasing in globals.css.
const RELEASE_MS = 2600

// The garden lives in this browser until it's kept by email. Qualities only — no words.
const STORE_KEY = 'terrarium-dreams:garden:v1'
const MAX_LOCAL_ENTRIES = 500

// Spores drifting up through the glass: [left %, delay s, duration s, size px]
const MOTES: [number, number, number, number][] = [
  [18, 0, 13, 2], [31, 4, 16, 1.5], [44, 9, 12, 2.5], [57, 2, 15, 1.5], [66, 6, 14, 2],
  [74, 11, 17, 1.5], [24, 13, 15, 2], [50, 7, 18, 1.5], [82, 3, 13, 2],
]

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function observe(w: Weather, dwell: number, longPauses: number): string {
  if (w.cloud > 0.4) return 'the glass keeps clouding where you went back over it.'
  if (w.fog > 0.5 && longPauses > 2) return 'mist settled in the gaps — you circled something.'
  if (w.light > 0.6 && dwell > 5) return 'it went quiet after you stopped. the light held.'
  if (w.drift > 1.8) return 'the air kept moving. nothing settled yet.'
  return 'it took what you gave it.'
}

interface SavedGarden { name: string | null; weather: Weather; entries: EntryQualities[] }

function readSavedGarden(): SavedGarden {
  try {
    const raw = localStorage.getItem(STORE_KEY)
    if (raw) {
      const saved = JSON.parse(raw)
      const entries = parseEntries(saved.entries)
      return {
        name: normalizeName(saved.name),
        weather: parseWeather(saved.weather) ?? entries.at(-1)?.weather ?? CALM,
        entries,
      }
    }
  } catch { /* private mode or corrupt data: start a fresh garden */ }
  return { name: null, weather: CALM, entries: [] }
}

const noopSubscribe = () => () => {}

/**
 * The garden lives in this browser's storage, which the server can't see —
 * so the jar renders only once in the browser, starting from what's saved.
 */
export function Terrarium() {
  const inBrowser = useSyncExternalStore(noopSubscribe, () => true, () => false)
  return inBrowser ? <TerrariumGarden /> : <div className="room" style={{ minHeight: 640 }} />
}

function TerrariumGarden() {
  const [saved] = useState(readSavedGarden)
  const [text, setText] = useState('')
  const [weather, setWeather] = useState<Weather>(saved.weather)
  const [observation, setObservation] = useState<string | null>(null)
  // While true, the words are drifting away and the box can't be written in.
  const [releasing, setReleasing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // The garden: one entry's qualities per plant, plus the name on the tag.
  const [entries, setEntries] = useState<EntryQualities[]>(saved.entries)
  const [name, setName] = useState<string | null>(saved.name)
  const [fresh, setFresh] = useState<string | null>(null)

  // "who tends this garden?" — one line that understands a name or an email.
  const [tend, setTend] = useState('')
  const [tendMsg, setTendMsg] = useState<string | null>(null)
  const [tendOpen, setTendOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const tendRef = useRef<HTMLInputElement>(null)

  // Timing lives in refs — it must never cause a re-render while someone writes.
  const focusAt = useRef<number | null>(null)
  const firstInput = useRef<number | null>(null)
  const lastInput = useRef<number | null>(null)
  const gaps = useRef<number[]>([])
  const deletions = useRef(0)

  useEffect(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ name, weather, entries: entries.slice(-MAX_LOCAL_ENTRIES) }))
    } catch { /* storage full or blocked: the garden still works for this visit */ }
  }, [name, weather, entries])

  const plants = useMemo(() => derivePlants(entries), [entries])

  function resetTiming() {
    focusAt.current = null
    firstInput.current = null
    lastInput.current = null
    gaps.current = []
    deletions.current = 0
  }

  // React's onChange is the native `input` event — measured there, not on
  // keydown, because phone keyboards, autocorrect and IME don't reliably fire
  // keydown per character.
  function onInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const now = Date.now()
    const native = e.nativeEvent as InputEvent
    if (native.inputType?.startsWith('delete')) deletions.current += 1
    if (firstInput.current == null) firstInput.current = now
    else if (lastInput.current != null) gaps.current.push(now - lastInput.current)
    lastInput.current = now
    setText(e.currentTarget.value)
  }

  function settle() {
    const written = text.trim()
    if (releasing) return
    if (written.length < 2 || firstInput.current == null || lastInput.current == null) return
    const now = Date.now()

    const hesitation = (firstInput.current - (focusAt.current ?? firstInput.current)) / 1000
    const dwell = (now - lastInput.current) / 1000
    const sorted = [...gaps.current].sort((a, b) => a - b)
    const medianGap = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
    const longPauses = gaps.current.filter(g => g > 1400).length
    const deleteRatio = deletions.current / Math.max(written.length, 1)

    const next: Weather = {
      fog: clamp(0.12 + longPauses * 0.07 + hesitation * 0.03, 0.08, 0.78),
      cloud: clamp(0.08 + deleteRatio * 1.9, 0.05, 0.72),
      drift: clamp(2.2 - medianGap / 420, 0.45, 2.4),
      light: clamp(0.18 + Math.min(dwell, 12) * 0.055, 0.15, 0.92),
      growth: clamp(0.3 + Math.min(written.length, 420) / 620, 0.3, 1),
    }

    // Only how it was written is kept. The words themselves leave with the fade.
    const entry: EntryQualities = {
      id: crypto.randomUUID(),
      writtenAt: new Date(now).toISOString(),
      hesitation, dwell, longPauses, medianGap, deleteRatio,
      length: written.length,
      weather: next,
    }

    // The glass turns and the new plant grows as the words leave; the
    // observation arrives once they're gone, and the box clears.
    resetTiming()
    setObservation(null)
    setReleasing(true)
    setWeather(next)
    setEntries(prev => [...prev, entry])
    setFresh(entry.id)
    window.setTimeout(() => {
      setText('')
      setReleasing(false)
      setObservation(observe(next, dwell, longPauses))
      textareaRef.current?.focus()
    }, RELEASE_MS)
  }

  async function onTend() {
    const value = tend.trim()
    if (!value || sending) return

    if (!value.includes('@')) {
      const n = normalizeName(value)
      if (!n) return
      setName(n)
      setTend('')
      setTendMsg(`Hello, ${n}. Leave an email any time and we'll send a key to come back to it from anywhere.`)
      return
    }

    const email = normalizeEmail(value)
    if (!email) { setTendMsg("That doesn't look like an email — check it and try again."); return }

    setSending(true)
    try {
      const res = await fetch('/api/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, weather, entries }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.status === 'sent') {
        setTend('')
        setTendMsg(`A key is on its way to ${maskEmail(email)}. Open it to keep this garden anywhere.`)
      } else if (res.ok && data.status === 'recently_sent') {
        setTendMsg(`A key went to that address a little while ago — check there. Another can be sent in ${data.minutes} min.`)
      } else {
        throw new Error(String(res.status))
      }
    } catch {
      setTendMsg("Couldn't send a key just now. Your garden is still kept here, on this device.")
    } finally {
      setSending(false)
    }
  }

  function openTend() {
    setTendOpen(true)
    requestAnimationFrame(() => tendRef.current?.focus())
  }

  // The seedling in the middle grows with the garden's age.
  const g = clamp(0.3 + entries.length * 0.05, 0.3, 1)
  const showTend = tendOpen || entries.length > 0 || name != null
  const tagName = name && name.length > 12 ? `${name.slice(0, 11)}…` : name
  const vars = {
    '--fog': weather.fog,
    '--cloud': weather.cloud,
    '--drift': weather.drift,
    '--light': weather.light,
  } as CSSProperties

  return (
    <div className="room" style={vars}>
      <h1 className="title">Terrarium Dreams</h1>

      <div className="vessel">
      <div className="halo" aria-hidden />
      <div className="shadow" aria-hidden />
      <div className="jar" style={{ clipPath: `path('${JAR_PATH}')` }} aria-hidden>
        <div className="shaft" />
        <div className="mist" />
        <div className="cond" />
        <div className="motes">
          {MOTES.map(([left, delay, dur, size], i) => (
            <span key={i} style={{ left: `${left}%`, width: size, height: size, animationDelay: `-${delay}s`, animationDuration: `${dur}s` }} />
          ))}
        </div>
        <div className="ground" />
        <svg className="sprout" viewBox="0 0 120 120" fill="none">
          <path
            d={`M60 118 C60 ${100 - g * 14} 60 ${92 - g * 22} 60 ${74 - g * 24}`}
            stroke="#5e9150" strokeWidth="2.5" strokeLinecap="round"
          />
          <path
            d="M60 86 C44 82 36 72 36 62 C48 62 58 72 60 86Z" fill="#6aa156"
            style={{ transform: `scale(${0.75 + g * 0.4})`, transformOrigin: '60px 80px' }}
          />
          <path
            d="M60 76 C76 72 84 62 84 52 C72 52 62 62 60 76Z" fill="#7cb565"
            style={{ transform: `scale(${0.7 + g * 0.45})`, transformOrigin: '60px 72px' }}
          />
        </svg>
        <Garden plants={plants} fresh={fresh} />
      </div>

      {/* the glass itself: edge, light on the curves, lip, cork and the tag */}
      <svg className="glass" viewBox="0 0 300 380" fill="none">
        <defs>
          <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".3" stopColor="#fff" stopOpacity=".3" />
            <stop offset=".75" stopColor="#fff" stopOpacity=".1" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cork" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#6a4f37" />
            <stop offset=".45" stopColor="#a07c57" />
            <stop offset="1" stopColor="#57412e" />
          </linearGradient>
        </defs>

        <path d={JAR_PATH} stroke="rgba(255,255,255,.24)" strokeWidth="1.5" />
        {/* light catching the curved glass */}
        <path d="M40 150 C33 210 33 280 41 340" stroke="url(#sheen)" strokeWidth="6" strokeLinecap="round" />
        <path d="M262 165 C266 190 266 215 263 236" stroke="rgba(255,255,255,.1)" strokeWidth="3" strokeLinecap="round" />
        <path d="M128 98 C110 104 72 110 56 122" stroke="rgba(255,255,255,.14)" strokeWidth="2" strokeLinecap="round" />

        {/* lip of the neck */}
        <rect x="108" y="58" width="84" height="9" rx="4.5" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.26)" />
        {/* cork */}
        <path d="M113 18 Q113 12 119 12 L181 12 Q187 12 187 18 L184 60 L116 60 Z" fill="url(#cork)" />
        <ellipse cx="150" cy="13" rx="35" ry="3.5" fill="#b08c66" />
        <g fill="#3e2f22" opacity=".55">
          <circle cx="128" cy="30" r="1.2" /><circle cx="160" cy="24" r="1" />
          <circle cx="171" cy="44" r="1.3" /><circle cx="140" cy="50" r="1" />
          <circle cx="152" cy="37" r=".9" />
        </g>

        {/* the tag, tied to the cork */}
        <path d="M183 46 Q204 66 222 92" stroke="#c9b596" strokeWidth="1" />
        <g
          className="tag" role="button" tabIndex={0}
          aria-label={name ? `${name}'s garden. Change who tends it` : 'Name this garden'}
          onClick={openTend}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openTend() } }}
        >
          <g transform="translate(219 89) rotate(11)">
            <path d="M0 6 L8 0 L70 0 Q74 0 74 4 L74 30 Q74 34 70 34 L8 34 L0 28 Z" fill="#eadfc8" />
            <circle cx="7" cy="17" r="2.2" fill="#2a2724" />
            {tagName ? (
              <>
                <text x="41" y="16" textAnchor="middle" className="tag-name">{tagName}&apos;s</text>
                <text x="41" y="28" textAnchor="middle" className="tag-sub">garden</text>
              </>
            ) : (
              <>
                <text x="41" y="16" textAnchor="middle" className="tag-name muted">unnamed</text>
                <text x="41" y="28" textAnchor="middle" className="tag-sub">tap to name</text>
              </>
            )}
          </g>
        </g>
      </svg>
      </div>

      <div className="write">
        <textarea
          ref={textareaRef}
          value={text}
          readOnly={releasing}
          className={releasing ? 'releasing' : undefined}
          placeholder="a dream, or what's on your mind…"
          aria-label="Write a dream or what's on your mind"
          onFocus={() => { if (focusAt.current == null) focusAt.current = Date.now() }}
          onChange={onInput}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); settle() }
          }}
        />
        <p className="hint">press ⏎ to let it settle</p>
      </div>

      <p className={`observation ${observation ? 'on' : ''}`} aria-live="polite">
        {observation ?? ' '}
      </p>

      <form
        className={`tend ${showTend ? 'on' : ''}`}
        onSubmit={e => { e.preventDefault(); onTend() }}
        aria-hidden={!showTend}
      >
        <input
          ref={tendRef}
          value={tend}
          onChange={e => setTend(e.target.value)}
          placeholder={name ? 'an email, to keep it anywhere' : 'who tends this garden? a name, or an email'}
          aria-label="A name for this garden, or an email to keep it"
          autoComplete="email"
          spellCheck={false}
          disabled={sending || !showTend}
          tabIndex={showTend ? 0 : -1}
        />
        <p className="tend-msg" aria-live="polite">{sending ? 'sending a key…' : tendMsg ?? ' '}</p>
      </form>
    </div>
  )
}
