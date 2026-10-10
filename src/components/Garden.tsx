import type { EntryQualities } from '@/lib/jar'

// Each entry plants one thing, chosen by HOW it was written — never by what.
export type PlantKind = 'flower' | 'moss' | 'fern' | 'grass' | 'mushroom' | 'leafy'

export interface Plant {
  id: string
  kind: PlantKind
  x: number      // in the jar's 300-wide box
  y: number      // where it meets the soil
  scale: number
  hue: string    // petal / cap colour
  sway: number   // seconds per sway, so the garden never moves in lockstep
}

/** Most visible quality wins, in this order. */
export function plantKindFor(e: EntryQualities): PlantKind {
  if (e.dwell > 5) return 'flower'                         // sat with it before letting go
  if (e.deleteRatio > 0.12) return 'moss'                  // went back over it
  if (e.longPauses > 2 || e.hesitation > 5) return 'fern'  // circled something
  if (e.length > 220) return 'mushroom'                    // gave a lot
  if (e.longPauses === 0 && e.medianGap < 180) return 'grass' // one breath through
  return 'leafy'
}

const PETALS = ['#f2a7bd', '#f4c58e', '#c9adf0', '#f3e3a1', '#a6d6ec', '#f6b0a0']
const CAPS = ['#d9875f', '#c96f6f', '#d6a25c']
const MAX_VISIBLE = 28

// Stable pseudo-random numbers from an entry id, so a garden regrows identically.
function seeded(id: string) {
  let h = 2166136261
  for (let i = 0; i < id.length; i++) { h ^= id.charCodeAt(i); h = Math.imul(h, 16777619) }
  return () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h ^= h >>> 13; return ((h >>> 0) % 10000) / 10000 }
}

// The soil mounds toward the middle (an ellipse spanning x -12..312, top at y 288).
export function soilY(x: number): number {
  const dx = (x - 150) / 162
  return 288 + 20 * (1 - Math.sqrt(Math.max(0, 1 - dx * dx))) + 4
}

/** Lays out the most recent entries along the soil, keeping clear of the seedling in the middle. */
export function derivePlants(entries: EntryQualities[]): Plant[] {
  const plants: Plant[] = []
  for (const e of entries.slice(-MAX_VISIBLE)) {
    const rand = seeded(e.id)
    let best = 0, bestGap = -1
    for (let i = 0; i < 10; i++) {
      let x = 48 + rand() * 204
      if (x > 136 && x < 164) x += x < 150 ? -28 : 28 // the seedling's spot
      const gap = Math.min(999, ...plants.map(p => Math.abs(p.x - x)))
      if (gap > bestGap) { bestGap = gap; best = x }
    }
    const kind = plantKindFor(e)
    plants.push({
      id: e.id,
      kind,
      x: best,
      y: soilY(best),
      scale: 1.25 + Math.min(e.length, 400) / 400 * 0.75,
      hue: (kind === 'mushroom' ? CAPS : PETALS)[Math.floor(rand() * (kind === 'mushroom' ? CAPS.length : PETALS.length))],
      sway: 5 + rand() * 4,
    })
  }
  // Draw back-to-front: plants lower in the jar (nearer the glass) on top.
  return plants.sort((a, b) => a.y - b.y)
}

function Shape({ kind, hue }: { kind: PlantKind; hue: string }) {
  switch (kind) {
    case 'grass':
      return (
        <g stroke="#86b86c" strokeWidth="1.7" strokeLinecap="round" fill="none">
          <path d="M-1 0 Q-4 -13 -8 -22" /><path d="M0 0 Q1 -16 2 -30" />
          <path d="M1 0 Q6 -11 10 -20" stroke="#6fa058" /><path d="M-2 0 Q-8 -8 -13 -13" stroke="#6fa058" />
        </g>
      )
    case 'moss':
      return (
        <g>
          <ellipse cx="0" cy="-3" rx="13" ry="5" fill="#4f7a3d" />
          <circle cx="-7" cy="-5" r="5" fill="#68934c" /><circle cx="2" cy="-7" r="6" fill="#77a457" />
          <circle cx="9" cy="-4" r="4.5" fill="#5c8745" /><circle cx="-1" cy="-4" r="3" fill="#8bb866" />
        </g>
      )
    case 'fern':
      return (
        <g fill="none" strokeLinecap="round">
          {[-28, 0, 26].map(r => (
            <g key={r} transform={`rotate(${r})`}>
              <path d="M0 0 C1 -16 6 -28 13 -32 C18 -34 19 -28 15 -27" stroke="#5f9550" strokeWidth="5" strokeDasharray="1 2.6" />
              <path d="M0 0 C1 -16 6 -28 13 -32 C18 -34 19 -28 15 -27" stroke="#4e7f42" strokeWidth="1.4" />
            </g>
          ))}
        </g>
      )
    case 'flower':
      return (
        <g>
          <path d="M0 0 Q3 -18 0 -36" stroke="#5e9150" strokeWidth="1.8" fill="none" strokeLinecap="round" />
          <path d="M1 -14 C8 -16 12 -22 12 -26 C6 -25 2 -20 1 -14Z" fill="#6ea35a" />
          <g transform="translate(0 -38)">
            {[0, 72, 144, 216, 288].map(a => (
              <ellipse key={a} cx="0" cy="-4.6" rx="3.4" ry="4.6" fill={hue} transform={`rotate(${a})`} />
            ))}
            <circle r="2.6" fill="#f6d86f" />
          </g>
        </g>
      )
    case 'mushroom':
      return (
        <g>
          <circle cx="0" cy="-16" r="15" fill={hue} opacity=".18" />
          <path d="M-3 0 L-2.5 -13 L2.5 -13 L3 0Z" fill="#ece3d2" />
          <path d="M-12 -12 C-11 -24 11 -24 12 -12 Z" fill={hue} />
          <circle cx="-5" cy="-17" r="1.5" fill="#fbf2e2" /><circle cx="3" cy="-19" r="1.2" fill="#fbf2e2" />
          <circle cx="7" cy="-14" r="1" fill="#fbf2e2" />
        </g>
      )
    default: // leafy
      return (
        <g>
          <path d="M0 0 C0 -10 0 -20 0 -28" stroke="#5e9150" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M0 -12 C-9 -14 -14 -21 -14 -27 C-6 -27 -1 -20 0 -12Z" fill="#6aa156" />
          <path d="M0 -19 C9 -21 14 -28 14 -34 C6 -34 1 -27 0 -19Z" fill="#7cb565" />
        </g>
      )
  }
}

/** The plants, drawn inside the jar. `fresh` is the one just planted, which grows in. */
export function Garden({ plants, fresh }: { plants: Plant[]; fresh: string | null }) {
  return (
    <svg className="garden" viewBox="0 0 300 380" aria-hidden>
      {plants.map(p => (
        <g key={p.id} transform={`translate(${p.x} ${p.y}) scale(${p.scale})`}>
          <g className={p.id === fresh ? 'plant grow' : 'plant'}>
            <g className="sway" style={{ animationDuration: `${p.sway}s`, animationDelay: `-${p.sway / 2}s` }}>
              <Shape kind={p.kind} hue={p.hue} />
            </g>
          </g>
        </g>
      ))}
    </svg>
  )
}
