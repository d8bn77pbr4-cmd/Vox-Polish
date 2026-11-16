import type { Item, Measurements } from './types'

export const DEFAULT_MEASUREMENTS: Measurements = {
  height: 170,
  shoulders: 40,
  bust: 92,
  waist: 76,
  hips: 98,
  inseam: 78,
}

export const MEASURE_RANGES: Record<keyof Measurements, [number, number]> = {
  height: [140, 210],
  shoulders: [30, 60],
  bust: [70, 150],
  waist: [55, 150],
  hips: [70, 160],
  inseam: [60, 100],
}

export const MEASURE_LABELS: Record<keyof Measurements, string> = {
  height: 'Körpergröße',
  shoulders: 'Schulterbreite',
  bust: 'Brustumfang',
  waist: 'Taillenumfang',
  hips: 'Hüftumfang',
  inseam: 'Innenbeinlänge',
}

/** Füllt fehlende Maße auf und hält alles in einem Bereich, in dem die Puppe gültig bleibt. */
export function clampMeasurements(m: Partial<Record<keyof Measurements, unknown>> | null | undefined): Measurements {
  const out = { ...DEFAULT_MEASUREMENTS }
  for (const key of Object.keys(DEFAULT_MEASUREMENTS) as (keyof Measurements)[]) {
    const raw = m?.[key]
    const v = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN
    const [min, max] = MEASURE_RANGES[key]
    out[key] = Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : DEFAULT_MEASUREMENTS[key]
  }
  return out
}

export const VIEW = { w: 400, h: 800 }
const TOP = 40
const FIG = 720 // Höhe der Figur in der Zeichnung

export interface Geo {
  cx: number
  y: {
    headTop: number
    chin: number
    shoulder: number
    bust: number
    waist: number
    hip: number
    crotch: number
    knee: number
    ankle: number
    floor: number
  }
  /** Halbe Breiten in Pixeln. */
  half: { head: number; neck: number; shoulder: number; bust: number; waist: number; hip: number }
  head: { cx: number; cy: number; rx: number; ry: number }
  /** Wo die Hand hängt (für Taschen). */
  hand: { x: number; y: number }
  shapes: {
    torso: string
    neck: string
    legL: string
    legR: string
    armL: string
    armR: string
    footL: string
    footR: string
  }
}

type Pt = [number, number]
const f = (n: number) => (Math.round(n * 10) / 10).toString()

/** Geschlossene, weiche Kurve durch alle Punkte (Catmull-Rom). */
function smooth(pts: Pt[]): string {
  const n = pts.length
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n]
    const p1 = pts[i]
    const p2 = pts[(i + 1) % n]
    const p3 = pts[(i + 2) % n]
    d +=
      `C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)}` +
      ` ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)}` +
      ` ${f(p2[0])},${f(p2[1])}`
  }
  return d + 'Z'
}

const mirror = (pts: Pt[], cx: number): Pt[] => pts.map(([x, y]) => [2 * cx - x, y])

/** Rechnet Körpermaße in die Umrisse der Figur um. */
export function bodyGeometry(input: Partial<Measurements> | null | undefined): Geo {
  const m = clampMeasurements(input)
  const s = FIG / m.height // Pixel pro cm
  const cx = VIEW.w / 2
  const at = (fraction: number) => TOP + fraction * FIG

  const crotchF = Math.min(0.6, Math.max(0.46, 1 - m.inseam / m.height))
  const y = {
    headTop: at(0),
    chin: at(0.13),
    shoulder: at(0.185),
    bust: at(0.28),
    waist: at(0.39),
    hip: at(0.5),
    crotch: at(crotchF),
    knee: at(crotchF + (0.96 - crotchF) * 0.5),
    ankle: at(0.96),
    floor: at(1),
  }
  if (y.hip > y.crotch - 8) y.hip = y.crotch - 8

  // Umfang → sichtbare Breite von vorn (Körperquerschnitt als Ellipse).
  const cap = (v: number) => Math.min(150, v)
  const half = {
    head: FIG * 0.046,
    neck: FIG * 0.021,
    shoulder: cap((m.shoulders * s) / 2),
    bust: cap((m.bust * 0.34 * s) / 2),
    waist: cap((m.waist * 0.35 * s) / 2),
    hip: cap((m.hips * 0.36 * s) / 2),
  }

  const neckBase = y.chin + (y.shoulder - y.chin) * 0.45
  const torsoRight: Pt[] = [
    [cx + half.neck, neckBase],
    [cx + half.shoulder * 0.72, y.shoulder - FIG * 0.004],
    [cx + half.shoulder, y.shoulder + FIG * 0.014],
    [cx + Math.min(half.shoulder * 0.96, half.bust * 1.04), y.bust - FIG * 0.035],
    [cx + half.bust, y.bust],
    [cx + half.waist, y.waist],
    [cx + half.hip, y.hip],
    [cx + half.hip * 0.97, y.crotch],
    [cx + half.hip * 0.5, y.crotch + FIG * 0.012],
  ]
  const torso = smooth([...torsoRight, [cx, y.crotch + FIG * 0.004], ...mirror(torsoRight, cx).reverse()])

  const kneeHalf = Math.min(FIG * 0.06, Math.max(FIG * 0.022, half.hip * 0.2))
  const ankleHalf = kneeHalf * 0.58
  const kneeC = cx + half.hip * 0.46
  const ankleC = cx + half.hip * 0.42
  const calfY = y.knee + (y.ankle - y.knee) * 0.35
  const legRight: Pt[] = [
    [cx + half.hip * 0.5, y.hip],
    [cx + half.hip * 0.97, y.hip + (y.crotch - y.hip) * 0.3],
    [cx + half.hip * 0.93, y.crotch + (y.knee - y.crotch) * 0.25],
    [kneeC + kneeHalf, y.knee],
    [kneeC + kneeHalf * 1.02, calfY],
    [ankleC + ankleHalf, y.ankle],
    [ankleC, y.ankle + FIG * 0.012],
    [ankleC - ankleHalf, y.ankle],
    [kneeC - kneeHalf * 0.95, calfY],
    [kneeC - kneeHalf, y.knee],
    [cx + 3, y.crotch + (y.knee - y.crotch) * 0.2],
    [cx + 1.5, y.crotch - FIG * 0.01],
  ]

  const armHalf = FIG * 0.026 + (m.bust - 92) * 0.0006 * FIG
  const sx = cx + half.shoulder - armHalf * 0.5
  const sy = y.shoulder + armHalf
  const ex = cx + half.shoulder + armHalf * 0.9 + 4
  const ey = y.waist
  const wx = cx + half.shoulder + armHalf * 1.4 + 10
  const wy = y.crotch - FIG * 0.01
  const armRight: Pt[] = [
    [sx + armHalf, sy - armHalf * 0.3],
    [ex + armHalf * 0.85, ey],
    [wx + armHalf * 0.55, wy],
    [wx + armHalf * 0.2, wy + FIG * 0.055],
    [wx - armHalf * 0.55, wy],
    [ex - armHalf * 0.85, ey],
    [sx - armHalf * 0.7, sy + armHalf * 1.2],
  ]

  const footRx = Math.max(13, ankleHalf * 1.6)
  const footRy = (y.floor - y.ankle) * 0.62
  const foot = (c: number): Pt[] => [
    [c - footRx * 0.8, y.floor - footRy],
    [c + footRx * 0.4, y.floor - footRy * 2],
    [c + footRx * 1.2, y.floor - footRy * 0.9],
    [c + footRx * 0.9, y.floor],
    [c - footRx * 0.9, y.floor],
  ]
  const footRight = foot(ankleC + 2)

  const neck =
    `M${f(cx - half.neck)},${f(y.chin - FIG * 0.012)}L${f(cx + half.neck)},${f(y.chin - FIG * 0.012)}` +
    `L${f(cx + half.neck * 1.15)},${f(neckBase + FIG * 0.012)}L${f(cx - half.neck * 1.15)},${f(neckBase + FIG * 0.012)}Z`

  return {
    cx,
    y,
    half,
    head: { cx, cy: (y.headTop + y.chin) / 2, rx: half.head, ry: (y.chin - y.headTop) / 2 },
    hand: { x: wx, y: wy + FIG * 0.03 },
    shapes: {
      torso,
      neck,
      legR: smooth(legRight),
      legL: smooth(mirror(legRight, cx)),
      armR: smooth(armRight),
      armL: smooth(mirror(armRight, cx)),
      footR: smooth(footRight),
      footL: smooth(mirror(footRight, cx)),
    },
  }
}

export interface Placement {
  x: number
  y: number
  w: number
  h: number
  /** Ebene: höhere Werte liegen weiter vorn. */
  z: number
}

type Placeable = Pick<Item, 'category' | 'length' | 'accessory_type' | 'aspect'>

/** Größte Fläche mit Seitenverhältnis `aspect`, die in maxW × maxH passt. */
function contain(maxW: number, maxH: number, aspect: number) {
  const w = Math.min(maxW, maxH * aspect)
  return { w, h: w / aspect }
}

/** Legt ein Teil mit fester Höhe an und sorgt dafür, dass es mindestens `minW` breit ist. */
function byHeight(h: number, aspect: number, minW: number) {
  const w = Math.max(h * aspect, minW)
  return { w, h: w / aspect }
}

/** Wo ein freigestelltes Teil auf der Figur sitzt. */
export function placement(item: Placeable, geo: Geo): Placement {
  const a = Number.isFinite(item.aspect) && item.aspect > 0 ? item.aspect : 1
  const { cx, y, half } = geo
  const shoulderW = half.shoulder * 2
  const hipW = half.hip * 2
  const torso = y.crotch - y.shoulder
  const len = item.length ?? 'mid'
  const centered = (size: { w: number; h: number }, top: number, z: number): Placement => ({
    x: cx - size.w / 2,
    y: top,
    ...size,
    z,
  })

  switch (item.category) {
    case 'top': {
      const size = contain(shoulderW * 1.75, torso * (len === 'short' ? 0.8 : len === 'long' ? 1.25 : 1), a)
      return centered(size, y.shoulder - size.h * 0.06, 3)
    }
    case 'outerwear': {
      const size = contain(shoulderW * 1.9, torso * (len === 'short' ? 0.95 : len === 'long' ? 1.7 : 1.15), a)
      return centered(size, y.shoulder - size.h * 0.07, 5)
    }
    case 'bottom': {
      const end = len === 'short' ? y.waist + (y.knee - y.waist) * 0.72 : len === 'mid' ? y.knee + 12 : y.ankle + 6
      const top = y.waist - 6 // Bund sitzt knapp über der Taille
      return centered(byHeight(end - top, a, hipW * 1.05), top, 2)
    }
    case 'dress': {
      const end =
        len === 'short' ? y.crotch + (y.knee - y.crotch) * 0.45 : len === 'long' ? y.ankle : y.knee + 10
      const top = y.shoulder - 8
      return centered(byHeight(end - top, a, hipW * 1.05), top, 3)
    }
    case 'shoes': {
      const size = contain(hipW * 1.05, (y.floor - y.headTop) * 0.2, a)
      return centered(size, y.floor + 6 - size.h, 1)
    }
    case 'accessory': {
      const headW = half.head * 2
      const headH = y.chin - y.headTop
      switch (item.accessory_type) {
        case 'hat': {
          const size = contain(headW * 1.7, headH * 1.3, a)
          return centered(size, y.headTop + headH * 0.38 - size.h, 7)
        }
        case 'glasses': {
          const size = contain(headW * 1.05, headH * 0.35, a)
          return centered(size, y.headTop + headH * 0.45 - size.h / 2, 7)
        }
        case 'scarf': {
          const size = contain(shoulderW * 0.8, torso * 0.6, a)
          return centered(size, y.chin - 4, 6)
        }
        case 'jewelry': {
          const size = contain(shoulderW * 0.45, torso * 0.35, a)
          return centered(size, y.chin + 6, 6)
        }
        case 'belt': {
          const size = contain(half.waist * 2 * 1.2, torso * 0.2, a)
          return centered(size, y.waist + (y.hip - y.waist) * 0.3 - size.h / 2, 4)
        }
        case 'bag': {
          const size = contain(hipW * 0.75, torso * 0.75, a)
          return { x: geo.hand.x - size.w * 0.35, y: geo.hand.y - size.h * 0.15, ...size, z: 6 }
        }
        default: {
          const size = contain(hipW * 0.6, torso * 0.5, a)
          return { x: cx - half.shoulder - size.w - 34, y: y.waist, ...size, z: 6 }
        }
      }
    }
  }
}
