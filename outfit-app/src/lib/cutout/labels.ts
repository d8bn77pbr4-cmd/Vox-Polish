import type { Box } from '../types'

/** Ergebnis des Kleidungs-Modells für ein ganzes Foto: pro Pixel die Nummer eines Bereichs. */
export interface LabelMap {
  labels: string[]
  map: Uint8Array
  width: number
  height: number
}

/** Welche Bereiche des Kleidungs-Modells zu welcher Kategorie gehören. */
const LABELS: Record<string, string[]> = {
  top: ['Upper-clothes', 'Dress'],
  outerwear: ['Upper-clothes', 'Dress'],
  bottom: ['Pants', 'Skirt'],
  dress: ['Dress', 'Upper-clothes', 'Skirt'],
  shoes: ['Left-shoe', 'Right-shoe'],
  hat: ['Hat'],
  bag: ['Bag'],
  scarf: ['Scarf'],
  belt: ['Belt'],
  glasses: ['Sunglasses'],
}

export function labelsFor(category: string, accessoryType: string | null): string[] {
  return LABELS[category === 'accessory' ? (accessoryType ?? '') : category] ?? []
}

export const MIN_COVER = 0.03

/**
 * Maske (0–255 je Pixel, outW × outH) für die gewünschten Bereiche innerhalb eines Rahmens.
 * Liefert null, wenn dort fast nichts gefunden wurde.
 */
export function maskFromLabelMap(lm: LabelMap, box: Box, wanted: string[], outW: number, outH: number): Uint8ClampedArray | null {
  const ids = new Set(wanted.map((w) => lm.labels.indexOf(w)).filter((i) => i >= 0))
  if (ids.size === 0 || outW <= 0 || outH <= 0) return null
  const hard = new Uint8ClampedArray(outW * outH)
  let hits = 0
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(lm.height - 1, Math.max(0, Math.floor((box.y + ((y + 0.5) / outH) * box.h) * lm.height)))
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(lm.width - 1, Math.max(0, Math.floor((box.x + ((x + 0.5) / outW) * box.w) * lm.width)))
      if (ids.has(lm.map[sy * lm.width + sx])) {
        hard[y * outW + x] = 255
        hits++
      }
    }
  }
  if (hits / hard.length < MIN_COVER) return null
  return soften(hard, outW, outH, Math.max(1, Math.round(outW / lm.width / box.w)))
}

/** Glättet harte Maskenkanten (Weichzeichner mit dem angegebenen Radius, erst waagerecht, dann senkrecht). */
export function soften(mask: Uint8ClampedArray, w: number, h: number, radius = 1): Uint8ClampedArray {
  const r = Math.min(4, Math.max(1, radius))
  const tmp = new Float32Array(mask.length)
  const out = new Uint8ClampedArray(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let d = -r; d <= r; d++) {
        const xx = x + d
        if (xx < 0 || xx >= w) continue
        sum += mask[y * w + xx]
        n++
      }
      tmp[y * w + x] = sum / n
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let d = -r; d <= r; d++) {
        const yy = y + d
        if (yy < 0 || yy >= h) continue
        sum += tmp[yy * w + x]
        n++
      }
      out[y * w + x] = sum / n
    }
  }
  return out
}
