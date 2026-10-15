import { useId } from 'react'
import type { EntryQualities } from '@/lib/jar'

// A Rorschach blot breathed onto the glass. Its shape comes only from how an
// entry was written — never from the words — so the jar hands back something
// formless that is still yours, and asks what you see in it.

interface Blob { x: number; y: number; rx: number; ry: number; rot: number }
export interface BlotShape { seed: number; blobs: Blob[]; holes: Blob[]; spatter: Blob[]; soft: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const round = (v: number) => Math.round(v * 100) / 100

/** Keeps a blob inside the frame (so no edge is cut flat), on its own side of the fold. */
function fit(x: number, y: number, rx: number, ry: number, rot: number): Blob {
  const reach = Math.max(rx, ry)
  return {
    x: round(clamp(x, 6 + reach, 100)), y: round(clamp(y, 6 + reach, 144 - reach)),
    rx: round(rx), ry: round(ry), rot: round(rot),
  }
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function random(seed: number) {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * The left half of a blot in a 200×150 box, folded at x = 100. The same entry
 * always makes the same blot.
 *  - pauses while writing → more lobes reaching outward
 *  - slow, spaced-out writing → the lobes sprawl further
 *  - a long wait before starting → a hollow at the centre of the fold
 *  - rewriting → flecks of ink thrown off the edges
 *  - sitting with it before letting go → softer, rounder edges
 */
export function blotFor(e: EntryQualities): BlotShape {
  const seed = hash(e.id)
  const rand = random(seed)
  const lobes = 4 + Math.min(4, e.longPauses)
  const spread = clamp(0.9 + e.medianGap / 800, 0.9, 1.5)
  const hollow = e.hesitation > 3
  const blobs: Blob[] = []
  const add = (x: number, y: number, r: number) =>
    blobs.push(fit(x, y, r * (0.8 + rand() * 0.6), r * (0.6 + rand() * 0.5), rand() * 180))

  // the spine, pressed along the fold
  const top = 18 + rand() * 14, bottom = 118 + rand() * 16
  for (let y = top; y <= bottom; y += 7) {
    if (hollow && y > 58 && y < 92) continue
    const r = 6 + rand() * 9
    blobs.push(fit(100 - rand() * 6, y + rand() * 4, r, r * (0.8 + rand() * 0.5), 0))
  }

  // a body or two: the heavy masses either side of the fold
  for (let i = 0; i < 1 + Math.floor(rand() * 2); i++) {
    add(70 + rand() * 18, 40 + rand() * 70, 14 + rand() * 10)
  }

  // lobes, each a walk out from the spine, thinning as it goes, now and then
  // throwing off a smaller branch
  for (let i = 0; i < lobes; i++) {
    let x = 96
    let y = top + rand() * (bottom - top)
    let angle = Math.PI + (rand() - 0.5) * 2
    let r = 11 + rand() * 9
    const steps = 4 + Math.floor(rand() * 3)
    for (let s = 0; s < steps; s++) {
      x += Math.cos(angle) * r * 1.15 * spread
      y += Math.sin(angle) * r * 1.15 * spread
      // a lobe stops short of the frame rather than being pressed flat against it
      if (x - r * 1.4 < 6 || y - r * 1.4 < 6 || y + r * 1.4 > 144) break
      add(x, y, r)
      if (r > 5 && rand() < 0.3) {
        const a = angle + (rand() < 0.5 ? -1 : 1) * (0.8 + rand() * 0.6)
        add(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3, r * 0.55)
      }
      angle += (rand() - 0.5) * 1.2
      r *= 0.74 + rand() * 0.16
    }
  }

  // the openings a blot always seems to have: eyes, windows, a gap between hands
  const holes: Blob[] = []
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
    const r = 2.5 + rand() * 4.5
    holes.push(fit(62 + rand() * 30, top + 10 + rand() * (bottom - top - 20), r, r * (0.5 + rand() * 0.6), rand() * 180))
  }

  const spatter: Blob[] = []
  const flecks = Math.round(Math.min(e.deleteRatio, 0.5) * 30)
  for (let i = 0; i < flecks; i++) {
    const r = 0.9 + rand() * 1.8
    spatter.push(fit(18 + rand() * 76, 14 + rand() * 122, r, r * (0.7 + rand() * 0.5), rand() * 180))
  }

  return { seed, blobs, holes, spatter, soft: round(clamp(2.8 + e.dwell * 0.15, 2.8, 4.4)) }
}

/** Not every entry clouds the glass — about one in three, once the garden has begun. */
export function offersBlot(e: EntryQualities, gardenSize: number, sinceLast: number): boolean {
  if (gardenSize < 3 || sinceLast < 2) return false
  return gardenSize === 3 || hash(e.id + ':blot') % 3 === 0
}

function Blobs({ blobs }: { blobs: Blob[] }) {
  return (
    <>
      {blobs.map((b, i) => (
        <ellipse key={i} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} transform={`rotate(${b.rot} ${b.x} ${b.y})`} />
      ))}
    </>
  )
}

/**
 * Overlapping ellipses melted together (blur, then a hard alpha edge), roughened
 * with a little turbulence, then folded: the half is drawn once and mirrored,
 * so it's symmetric down to the ragged edge. Takes its colour from `color`.
 */
export function BlotMark({ shape, className }: { shape: BlotShape; className?: string }) {
  const id = `blot${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden fill="currentColor">
      <defs>
        <filter id={`${id}-rough`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency=".05" numOctaves="2" seed={shape.seed % 997} />
          <feDisplacementMap in="SourceGraphic" scale="7" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id={`${id}-melt`} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation={shape.soft} />
          <feColorMatrix values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9" />
        </filter>
        <mask id={`${id}-holes`}>
          <rect width="200" height="150" fill="#fff" />
          <g fill="#000" filter={`url(#${id}-rough)`}>
            <g id={`${id}-hole`}><Blobs blobs={shape.holes} /></g>
            <use href={`#${id}-hole`} transform="translate(200 0) scale(-1 1)" />
          </g>
        </mask>
      </defs>
      <g mask={`url(#${id}-holes)`}>
        <g filter={`url(#${id}-melt)`}>
          <g id={`${id}-half`} filter={`url(#${id}-rough)`}><Blobs blobs={shape.blobs} /></g>
          <use href={`#${id}-half`} transform="translate(200 0) scale(-1 1)" />
        </g>
      </g>
      <g id={`${id}-flecks`}><Blobs blobs={shape.spatter} /></g>
      <use href={`#${id}-flecks`} transform="translate(200 0) scale(-1 1)" />
    </svg>
  )
}
