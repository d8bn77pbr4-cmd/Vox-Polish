export interface Hsl {
  h: number // 0–360
  s: number // 0–1
  l: number // 0–1
}

export function hexToHsl(hex: string): Hsl {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return { h: 0, s: 0, l: 0.5 }
  let v = m[1]
  if (v.length === 3) v = v.split('').map((c) => c + c).join('')
  const r = parseInt(v.slice(0, 2), 16) / 255
  const g = parseInt(v.slice(2, 4), 16) / 255
  const b = parseInt(v.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  return { h, s, l }
}

/**
 * Neutrale Farben passen zu allem: Schwarz, Weiß, Grau, Beige/Creme, Dunkelblau (Jeans, Navy)
 * und dunkles Braun.
 */
export function isNeutral(hex: string): boolean {
  const { h, s, l } = hexToHsl(hex)
  if (l < 0.14 || l > 0.9) return true
  if (s < 0.16) return true
  if (h >= 20 && h <= 55 && s < 0.45 && l > 0.6) return true // Beige, Creme, Sand
  if (h >= 200 && h <= 250 && l < 0.34) return true // Navy, dunkler Jeansstoff
  if (h >= 10 && h <= 40 && l < 0.26) return true // dunkles Braun
  return false
}

function hueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Wie gut zwei Farben zusammenpassen, 0 (beißt sich) bis 1 (passt sicher). */
export function pairHarmony(a: string, b: string): number {
  const na = isNeutral(a)
  const nb = isNeutral(b)
  if (na && nb) return 0.9
  if (na || nb) return 1
  const d = hueDiff(hexToHsl(a).h, hexToHsl(b).h)
  if (d <= 30) return 0.9 // Ton in Ton
  if (d >= 150) return 0.8 // Komplementär
  if (d >= 100) return 0.6 // Dreiklang
  return 0.35 // weder ähnlich noch gegensätzlich
}

const FAMILIES: [number, string][] = [
  [15, 'Rot'],
  [45, 'Orange'],
  [70, 'Gelb'],
  [165, 'Grün'],
  [200, 'Türkis'],
  [255, 'Blau'],
  [290, 'Lila'],
  [345, 'Pink'],
  [360, 'Rot'],
]

/** Grobe Farbfamilie für den Filter im Schrank. */
export function colorFamily(hex: string): string {
  const { h, s, l } = hexToHsl(hex)
  if (l < 0.14) return 'Schwarz'
  if (l > 0.9 && s < 0.5) return 'Weiß'
  if (s < 0.16) return 'Grau'
  if (h >= 20 && h <= 55 && s < 0.45 && l > 0.6) return 'Beige'
  if (h >= 10 && h <= 40 && l < 0.4) return 'Braun'
  return FAMILIES.find(([max]) => h <= max)![1]
}

export const FAMILY_SWATCH: Record<string, string> = {
  Schwarz: '#1c1b1a',
  Weiß: '#ffffff',
  Grau: '#9a9895',
  Beige: '#dccbb0',
  Braun: '#6b4a32',
  Rot: '#c9372c',
  Orange: '#e58a2c',
  Gelb: '#e8c93a',
  Grün: '#4d8f55',
  Türkis: '#3aa6a6',
  Blau: '#3b62b8',
  Lila: '#7d55b0',
  Pink: '#d9609a',
}
