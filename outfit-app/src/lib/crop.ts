import type { Box } from './types'

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** Holt einen Rahmen ins Bild zurück. Liefert null, wenn danach fast nichts übrig ist. */
export function clampBox(box: Partial<Box> | null | undefined): Box | null {
  if (!box) return null
  const vals = [box.x, box.y, box.w, box.h]
  if (vals.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null
  const x0 = clamp01(box.x!)
  const y0 = clamp01(box.y!)
  const x1 = clamp01(box.x! + box.w!)
  const y1 = clamp01(box.y! + box.h!)
  const w = x1 - x0
  const h = y1 - y0
  if (w < 0.02 || h < 0.02) return null
  return { x: x0, y: y0, w, h }
}

/** Gibt dem Rahmen etwas Luft, damit beim Freistellen nichts abgeschnitten wird. */
export function padBox(box: Box, pad = 0.06): Box {
  const px = box.w * pad
  const py = box.h * pad
  const x0 = clamp01(box.x - px)
  const y0 = clamp01(box.y - py)
  const x1 = clamp01(box.x + box.w + px)
  const y1 = clamp01(box.y + box.h + py)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export function toPixels(box: Box, width: number, height: number) {
  const x = Math.round(box.x * width)
  const y = Math.round(box.y * height)
  return {
    x,
    y,
    w: Math.max(1, Math.min(width - x, Math.round(box.w * width))),
    h: Math.max(1, Math.min(height - y, Math.round(box.h * height))),
  }
}

/** Verkleinert auf höchstens `max` an der langen Seite, vergrößert nie. */
export function fitSize(w: number, h: number, max: number): { w: number; h: number } {
  const long = Math.max(w, h)
  if (long <= max) return { w, h }
  const k = max / long
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** Kleinstes Rechteck (in Pixeln) um alle sichtbaren Pixel eines RGBA-Bildes. */
export function alphaBounds(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  threshold = 24,
): { x: number; y: number; w: number; h: number } | null {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < height; y++) {
    const row = y * width * 4
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > threshold) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

/** Anteil sichtbarer Pixel einer Maske (Werte 0–255), 0–1. */
export function maskCoverage(mask: Uint8Array | Uint8ClampedArray, threshold = 127): number {
  if (mask.length === 0) return 0
  let n = 0
  for (let i = 0; i < mask.length; i++) if (mask[i] > threshold) n++
  return n / mask.length
}
