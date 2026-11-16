export type Category = 'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'accessory'
export type Length = 'short' | 'mid' | 'long'
export type AccessoryType = 'hat' | 'bag' | 'scarf' | 'belt' | 'glasses' | 'jewelry' | 'other'
export type Season = 'spring' | 'summer' | 'autumn' | 'winter'

export interface ItemColor {
  hex: string
  name: string
}

/** Die beschreibenden Felder eines Teils (kommen aus der Fotoanalyse oder vom Nutzer). */
export interface ItemAttrs {
  name: string
  category: Category
  subcategory: string
  length: Length | null
  accessory_type: AccessoryType | null
  colors: ItemColor[]
  pattern: string
  material: string
  warmth: number // 1 (luftig) – 5 (sehr warm)
  formality: number // 1 (lässig) – 5 (festlich)
  seasons: Season[]
  tags: string[]
}

export interface Item extends ItemAttrs {
  id: string
  user_id: string
  image_path: string
  thumb_path: string
  aspect: number // Breite / Höhe des freigestellten Bildes
  price: number | null
  is_wishlist: boolean
  created_at: string
}

export interface Adjust {
  dx: number
  dy: number
  scale: number
}

export interface Outfit {
  id: string
  user_id: string
  date: string // YYYY-MM-DD
  item_ids: string[]
  source: 'daily' | 'manual' | 'doll'
  rating: -1 | 0 | 1
  worn: boolean
  adjust: Record<string, Adjust>
  created_at: string
}

/** Körpermaße in cm. */
export interface Measurements {
  height: number
  shoulders: number
  bust: number
  waist: number
  hips: number
  inseam: number
}

export interface Profile {
  user_id: string
  display_name: string
  measurements: Partial<Measurements>
  skin_tone: string
  place_name: string | null
  lat: number | null
  lon: number | null
}

export interface Weather {
  tMax: number
  tMin: number
  rainProb: number // 0–100
  code: number
}

/** Rahmen relativ zum Foto, alle Werte 0–1. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface DetectedItem extends ItemAttrs {
  box: Box
  worn: boolean
}

export const CATEGORIES: { id: Category; label: string; plural: string }[] = [
  { id: 'top', label: 'Oberteil', plural: 'Oberteile' },
  { id: 'bottom', label: 'Unterteil', plural: 'Hosen & Röcke' },
  { id: 'dress', label: 'Kleid', plural: 'Kleider' },
  { id: 'outerwear', label: 'Jacke', plural: 'Jacken' },
  { id: 'shoes', label: 'Schuhe', plural: 'Schuhe' },
  { id: 'accessory', label: 'Accessoire', plural: 'Accessoires' },
]

export const SEASONS: { id: Season; label: string }[] = [
  { id: 'spring', label: 'Frühling' },
  { id: 'summer', label: 'Sommer' },
  { id: 'autumn', label: 'Herbst' },
  { id: 'winter', label: 'Winter' },
]

export const ACCESSORY_TYPES: { id: AccessoryType; label: string }[] = [
  { id: 'hat', label: 'Hut / Mütze' },
  { id: 'bag', label: 'Tasche' },
  { id: 'scarf', label: 'Schal' },
  { id: 'belt', label: 'Gürtel' },
  { id: 'glasses', label: 'Brille' },
  { id: 'jewelry', label: 'Schmuck' },
  { id: 'other', label: 'Sonstiges' },
]

export const LENGTHS: { id: Length; label: string }[] = [
  { id: 'short', label: 'kurz' },
  { id: 'mid', label: 'mittel' },
  { id: 'long', label: 'lang' },
]

export function categoryLabel(c: Category): string {
  return CATEGORIES.find((x) => x.id === c)?.label ?? c
}

export function seasonOf(date: Date): Season {
  const m = date.getMonth() + 1
  if (m >= 3 && m <= 5) return 'spring'
  if (m >= 6 && m <= 8) return 'summer'
  if (m >= 9 && m <= 11) return 'autumn'
  return 'winter'
}

/** Lokales Datum als YYYY-MM-DD. */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000)
}
