import type { DreamSymbol, InkTone, StoneTone, SymbolStroke } from '@/lib/jar'
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

export interface PlacedStone { id: string; symbol: DreamSymbol; x: number; y: number }

/** Each symbol rests on the soil just in front of the plant its entry grew. */
export function placeStones(plants: Plant[], symbols: Map<string, DreamSymbol>): PlacedStone[] {
  return plants.flatMap(p => {
    const symbol = symbols.get(p.id)
    if (!symbol) return []
    const x = Math.max(44, Math.min(256, p.x + (p.x < 150 ? 13 : -13)))
    return [{ id: p.id, symbol, x, y: soilY(x) + 9 }]
  })
}

/** Stones in the jar. They sit outside the clipped scene so they can be tapped. */
export function StoneLayer({ stones, hidden, glint, onOpen }: {
  stones: PlacedStone[]; hidden: string | null; glint: string | null; onOpen: (id: string) => void
}) {
  return (
    <svg className="stones" viewBox="0 0 300 380">
      {stones.filter(s => s.id !== hidden).map(s => {
        const [light, dark] = STONE[s.symbol.stone]
        return (
          // Position lives on the outer group: the inner one's CSS animation
          // sets `transform`, which would otherwise replace the translate.
          <g key={s.id} transform={`translate(${s.x} ${s.y})`}>
          <g
            className={s.id === glint ? 'stone glint' : 'stone'}
            role="button" tabIndex={0}
            aria-label={`A stone marked "${s.symbol.name}". Look closer`}
            onClick={() => onOpen(s.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(s.id) } }}
          >
            <ellipse cx="0" cy="4" rx="11" ry="3" fill="rgba(0,0,0,.45)" />
            <ellipse cx="0" cy="0" rx="10.5" ry="7.5" fill={dark} />
            <ellipse cx="-1" cy="-1.2" rx="9.2" ry="6" fill={light} />
            <g transform="translate(-6.5 -5.2) scale(.13 .104)">
              <SymbolMark symbol={s.symbol} width={7} />
            </g>
            <circle className="stone-hit" cx="0" cy="0" r="16" fill="transparent" />
          </g>
          </g>
        )
      })}
    </svg>
  )
}

/** Holding a stone up to the light: the symbol at full size, and its name. */
export function StoneViewer({ symbol, onClose }: { symbol: DreamSymbol; onClose: () => void }) {
  const [light, dark] = STONE[symbol.stone]
  const id = `face-${symbol.stone}`
  return (
    <div
      className="viewer" role="dialog" aria-modal="true" aria-label={symbol.name}
      onClick={onClose}
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <div className="viewer-card" onClick={e => e.stopPropagation()}>
        <svg viewBox="0 0 100 100" className="viewer-stone" aria-hidden>
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
        <p className="viewer-name">{symbol.name}</p>
        <button type="button" className="clear-link" onClick={onClose} autoFocus>set it back down</button>
      </div>
    </div>
  )
}
