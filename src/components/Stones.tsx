import type { DreamSymbol, EntryQualities, InkTone, StoneTone, SymbolStroke } from '@/lib/jar'
import { BlotMark, type BlotShape } from '@/components/Blot'
import { soilY, type Plant } from '@/components/Garden'

const STONE: Record<StoneTone, [string, string]> = {
  slate: ['#5d6873', '#2f363d'],
  sand: ['#c4b48f', '#8a7a5b'],
  moss: ['#6e8562', '#3c4a35'],
  rust: ['#9b634a', '#5e3627'],
  night: ['#3a4060', '#171a28'],
}
const INK: Record<InkTone, string> = { gold: '#f0cf78', silver: '#dfe6ec', copper: '#e09a6c' }

// Degrees → point on a circle (0° east, clockwise, as SVG's y axis points down).
function at(cx: number, cy: number, r: number, deg: number): [number, number] {
  const a = (deg * Math.PI) / 180
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)]
}

function Stroke({ s, ink, width }: { s: SymbolStroke; ink: string; width: number }) {
  switch (s.kind) {
    case 'circle': return <circle cx={s.cx} cy={s.cy} r={s.r} fill={ink} />
    case 'dot': return <circle cx={s.cx} cy={s.cy} r={Math.max(1.6, Math.min(s.r, 4))} fill={ink} />
    case 'ring': return <circle cx={s.cx} cy={s.cy} r={s.r} fill="none" stroke={ink} strokeWidth={width} />
    case 'line':
      return <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={ink} strokeWidth={width} strokeLinecap="round" />
    case 'arc': {
      let sweep = s.end - s.start
      if (sweep < 0) sweep += 360
      if (sweep >= 359.5) return <circle cx={s.cx} cy={s.cy} r={s.r} fill="none" stroke={ink} strokeWidth={width} />
      const [x0, y0] = at(s.cx, s.cy, s.r, s.start)
      const [x1, y1] = at(s.cx, s.cy, s.r, s.start + sweep)
      const large = sweep > 180 ? 1 : 0
      return (
        <path d={`M${x0} ${y0} A${s.r} ${s.r} 0 ${large} 1 ${x1} ${y1}`}
          fill="none" stroke={ink} strokeWidth={width} strokeLinecap="round" />
      )
    }
  }
}

/** The engraved mark, drawn in a 100×100 face. */
export function SymbolMark({ symbol, width = 2.6, color }: { symbol: DreamSymbol; width?: number; color?: string }) {
  const ink = color ?? INK[symbol.ink]
  return <g>{symbol.strokes.map((s, i) => <Stroke key={i} s={s} ink={ink} width={width} />)}</g>
}

export interface PlacedStone { id: string; entryId: string; seen: boolean; symbol: DreamSymbol; x: number; y: number }

/**
 * Each symbol rests on the soil just in front of the plant its entry grew.
 * What was seen in that entry's blot rests on the plant's other side.
 */
export function placeStones(plants: Plant[], byId: Map<string, EntryQualities>): PlacedStone[] {
  return plants.flatMap(p => {
    const e = byId.get(p.id)
    if (!e) return []
    const toward = p.x < 150 ? 1 : -1
    const at = (dx: number) => Math.max(44, Math.min(256, p.x + dx))
    const placed: PlacedStone[] = []
    if (e.symbol) {
      const x = at(13 * toward)
      placed.push({ id: p.id, entryId: p.id, seen: false, symbol: e.symbol, x, y: soilY(x) + 9 })
    }
    if (e.seen) {
      const x = at(-12 * toward)
      placed.push({ id: `${p.id}:seen`, entryId: p.id, seen: true, symbol: e.seen, x, y: soilY(x) + 10 })
    }
    return placed
  })
}

/** Stones in the jar. They sit outside the clipped scene so they can be tapped. */
export function StoneLayer({ stones, hidden, glint, onOpen }: {
  stones: PlacedStone[]; hidden: string | null; glint: string | null; onOpen: (id: string) => void
}) {
  return (
    <svg className="stones" viewBox="0 0 300 380">
      {stones.filter(s => s.entryId !== hidden).map(s => {
        const [light, dark] = STONE[s.symbol.stone]
        return (
          // Position lives on the outer group: the inner one's CSS animation
          // sets `transform`, which would otherwise replace the translate.
          <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
          <g
            className={s.id === glint ? 'stone glint' : 'stone'}
            role="button" tabIndex={0}
            aria-label={s.seen
              ? `Sea glass: what you saw, "${s.symbol.name}". Look closer`
              : `A stone marked "${s.symbol.name}". Look closer`}
            onClick={() => onOpen(s.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(s.id) } }}
          >
            {s.seen ? (
              // sea glass: smaller, rounder, the light coming through it
              <>
                <ellipse cx="0" cy="3.5" rx="9" ry="2.6" fill="rgba(0,0,0,.4)" />
                <ellipse cx="0" cy="0" rx="8.6" ry="6.6" fill={light} fillOpacity=".55" stroke="rgba(235,245,240,.55)" strokeWidth=".8" />
                <ellipse cx="-2.6" cy="-2.6" rx="3" ry="1.4" fill="rgba(255,255,255,.35)" />
                <g transform="translate(-5.4 -4.6) scale(.108 .092)">
                  <SymbolMark symbol={s.symbol} width={7} />
                </g>
              </>
            ) : (
              <>
                <ellipse cx="0" cy="4" rx="11" ry="3" fill="rgba(0,0,0,.45)" />
                <ellipse cx="0" cy="0" rx="10.5" ry="7.5" fill={dark} />
                <ellipse cx="-1" cy="-1.2" rx="9.2" ry="6" fill={light} />
                <g transform="translate(-6.5 -5.2) scale(.13 .104)">
                  <SymbolMark symbol={s.symbol} width={7} />
                </g>
              </>
            )}
            <circle className="stone-hit" cx="0" cy="0" r="16" fill="transparent" />
          </g>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * Holding a stone up to the light: the symbol at full size, and its name. For
 * sea glass, the blot it came from hangs faintly behind it.
 */
export function StoneViewer({ symbol, blot, onClose }: { symbol: DreamSymbol; blot?: BlotShape; onClose: () => void }) {
  const [light, dark] = STONE[symbol.stone]
  const id = `face-${symbol.stone}`
  return (
    <div
      className="viewer" role="dialog" aria-modal="true" aria-label={symbol.name}
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div className="viewer-card" onClick={e => e.stopPropagation()}>
        <div className="viewer-face">
        {blot && <BlotMark shape={blot} className="viewer-blot" />}
        <svg viewBox="0 0 100 100" className={blot ? 'viewer-stone glassy' : 'viewer-stone'} aria-hidden>
          <defs>
            <radialGradient id={id} cx="38%" cy="32%" r="75%">
              <stop offset="0" stopColor={light} />
              <stop offset="1" stopColor={dark} />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="47" fill={`url(#${id})`} />
          <circle cx="50" cy="50" r="46.5" fill="none" stroke="rgba(255,255,255,.12)" />
          {/* engraved: a dark offset beneath the ink */}
          <g transform="translate(.6 .8)" opacity=".55" style={{ filter: 'blur(.4px)' }}>
            <SymbolMark symbol={symbol} width={2.6} color="#000" />
          </g>
          <SymbolMark symbol={symbol} width={2.4} />
        </svg>
        </div>
        <p className="viewer-name">{symbol.name}</p>
        {blot && <p className="viewer-sub">what you saw in the glass</p>}
        <button type="button" className="clear-link" onClick={onClose} autoFocus>set it back down</button>
      </div>
    </div>
  )
}
