'use client'

import { useRef, useState, type CSSProperties } from 'react'

// How it was written, never what was written. These become the glass's weather.
interface Weather {
  fog: number    // circling / vagueness: long pauses, slow start
  cloud: number  // rewriting: how much was deleted
  drift: number  // agitation: how fast the air moves
  light: number  // sitting with it: the pause before letting go
  growth: number // how much was given
}

const CALM: Weather = { fog: 0.25, cloud: 0.2, drift: 1, light: 0.35, growth: 0.35 }

// Outline of the jar in a 300×380 box: neck at the top, shoulders curving out
// to a wide body with rounded base. Clips the scene and draws the glass edge.
const JAR_PATH =
  'M114 60 L186 60 L186 84 C186 104 278 100 278 140 L278 342 ' +
  'C278 360 266 372 248 372 L52 372 C34 372 22 360 22 342 ' +
  'L22 140 C22 100 114 104 114 84 Z'

// How long written words take to drift away after Enter. Matches .releasing in globals.css.
const RELEASE_MS = 2600

const clamp =(v: number, a: number, b: number) => Math.max(a, Math.min(b, v))

function observe(w: Weather, dwell: number, longPauses: number): string {
  if (w.cloud > 0.4) return 'the glass keeps clouding where you went back over it.'
  if (w.fog > 0.5 && longPauses > 2) return 'mist settled in the gaps — you circled something.'
  if (w.light > 0.6 && dwell > 5) return 'it went quiet after you stopped. the light held.'
  if (w.drift > 1.8) return 'the air kept moving. nothing settled yet.'
  return 'it took what you gave it.'
}

export function Terrarium() {
  const [text, setText] = useState('')
  const [weather, setWeather] = useState<Weather>(CALM)
  const [observation, setObservation] = useState<string | null>(null)
  // While true, the words are drifting away and the box can't be written in.
  const [releasing, setReleasing] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Timing lives in refs — it must never cause a re-render while someone writes.
  const focusAt = useRef<number | null>(null)
  const firstInput = useRef<number | null>(null)
  const lastInput = useRef<number | null>(null)
  const gaps = useRef<number[]>([])
  const deletions = useRef(0)

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
    const entry = text.trim()
    if (releasing) return
    if (entry.length < 2 || firstInput.current == null || lastInput.current == null) return
    const now = Date.now()

    const hesitation = (firstInput.current - (focusAt.current ?? firstInput.current)) / 1000
    const dwell = (now - lastInput.current) / 1000
    const sorted = [...gaps.current].sort((a, b) => a - b)
    const medianGap = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0
    const longPauses = gaps.current.filter(g => g > 1400).length
    const deleteRatio = deletions.current / Math.max(entry.length, 1)

    const next: Weather = {
      fog: clamp(0.12 + longPauses * 0.07 + hesitation * 0.03, 0.08, 0.78),
      cloud: clamp(0.08 + deleteRatio * 1.9, 0.05, 0.72),
      drift: clamp(2.2 - medianGap / 420, 0.45, 2.4),
      light: clamp(0.18 + Math.min(dwell, 12) * 0.055, 0.15, 0.92),
      growth: clamp(0.3 + Math.min(entry.length, 420) / 620, 0.3, 1),
    }

    // The glass starts to turn as the words leave; the observation only
    // arrives once they're gone, and the box clears for the next entry.
    resetTiming()
    setObservation(null)
    setReleasing(true)
    setWeather(next)
    window.setTimeout(() => {
      setText('')
      setReleasing(false)
      setObservation(observe(next, dwell, longPauses))
      textareaRef.current?.focus()
    }, RELEASE_MS)
  }

  const g = weather.growth
  const vars = {
    '--fog': weather.fog,
    '--cloud': weather.cloud,
    '--drift': weather.drift,
    '--light': weather.light,
  } as CSSProperties

  return (
    <div className="room" style={vars}>
      <h1 className="title">Terrarium Dreams</h1>

      <div className="vessel" aria-hidden>
      <div className="shadow" />
      <div className="jar" style={{ clipPath: `path('${JAR_PATH}')` }}>
        <div className="shaft" />
        <div className="mist" />
        <div className="cond" />
        <div className="ground" />
        <svg className="sprout" viewBox="0 0 120 120" fill="none">
          <path
            d={`M60 118 C60 ${100 - g * 14} 60 ${92 - g * 22} 60 ${74 - g * 24}`}
            stroke="#4d5f44" strokeWidth="2.5" strokeLinecap="round"
          />
          <path
            d="M60 86 C44 82 36 72 36 62 C48 62 58 72 60 86Z" fill="#3e5238"
            style={{ transform: `scale(${0.75 + g * 0.4})`, transformOrigin: '60px 80px' }}
          />
          <path
            d="M60 76 C76 72 84 62 84 52 C72 52 62 62 60 76Z" fill="#465c3e"
            style={{ transform: `scale(${0.7 + g * 0.45})`, transformOrigin: '60px 72px' }}
          />
        </svg>
      </div>

      {/* the glass itself: edge, light on the curves, lip and cork */}
      <svg className="glass" viewBox="0 0 300 380" fill="none">
        <defs>
          <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset=".3" stopColor="#fff" stopOpacity=".22" />
            <stop offset=".75" stopColor="#fff" stopOpacity=".08" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="cork" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5a4330" />
            <stop offset=".45" stopColor="#8a6b4c" />
            <stop offset="1" stopColor="#4d3a2a" />
          </linearGradient>
        </defs>

        <path d={JAR_PATH} stroke="rgba(255,255,255,.15)" strokeWidth="1.5" />
        {/* light catching the curved glass */}
        <path d="M40 150 C33 210 33 280 41 340" stroke="url(#sheen)" strokeWidth="6" strokeLinecap="round" />
        <path d="M262 165 C266 190 266 215 263 236" stroke="rgba(255,255,255,.07)" strokeWidth="3" strokeLinecap="round" />
        <path d="M128 98 C110 104 72 110 56 122" stroke="rgba(255,255,255,.1)" strokeWidth="2" strokeLinecap="round" />

        {/* lip of the neck */}
        <rect x="108" y="58" width="84" height="9" rx="4.5" fill="rgba(255,255,255,.05)" stroke="rgba(255,255,255,.2)" />
        {/* cork */}
        <path d="M113 18 Q113 12 119 12 L181 12 Q187 12 187 18 L184 60 L116 60 Z" fill="url(#cork)" />
        <ellipse cx="150" cy="13" rx="35" ry="3.5" fill="#9a7a58" />
        <g fill="#3e2f22" opacity=".55">
          <circle cx="128" cy="30" r="1.2" /><circle cx="160" cy="24" r="1" />
          <circle cx="171" cy="44" r="1.3" /><circle cx="140" cy="50" r="1" />
          <circle cx="152" cy="37" r=".9" />
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
    </div>
  )
}
