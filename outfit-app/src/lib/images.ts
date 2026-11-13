import { alphaBounds, fitSize, toPixels } from './crop'
import type { ItemImages } from './api'
import type { Box } from './types'

export const ANALYZE_MAX = 1568 // lange Seite für die Fotoanalyse
export const WORK_MAX = 2048 // lange Seite, aus der Teile ausgeschnitten werden
export const FULL_MAX = 1024 // gespeichertes Teil
export const THUMB_MAX = 400 // Vorschau im Schrank

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

/** Öffnet ein Foto und dreht es so, wie die Kamera es aufgenommen hat. */
export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('Dieses Bild kann der Browser nicht öffnen.')
  }
}

function scaled(source: ImageBitmap | HTMLCanvasElement, max: number): HTMLCanvasElement {
  const { w, h } = fitSize(source.width, source.height, max)
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(source, 0, 0, w, h)
  return c
}

export function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Bild konnte nicht gespeichert werden.'))), type, quality),
  )
}

/** Verkleinerte Arbeitskopie eines Fotos; das Original wird danach nicht mehr gebraucht. */
export async function workCopy(file: Blob): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await loadBitmap(file)
  const canvas = scaled(bitmap, WORK_MAX)
  bitmap.close()
  return { blob: await toBlob(canvas, 'image/jpeg', 0.9), width: canvas.width, height: canvas.height }
}

/** JPEG als Base64 für die Fotoanalyse. */
export async function analysisImage(work: Blob): Promise<{ data: string; width: number; height: number }> {
  const bitmap = await loadBitmap(work)
  const canvas = scaled(bitmap, ANALYZE_MAX)
  bitmap.close()
  const blob = await toBlob(canvas, 'image/jpeg', 0.85)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { data: btoa(bin), width: canvas.width, height: canvas.height }
}

/** Schneidet einen Rahmen aus der Arbeitskopie aus (höchstens FULL_MAX groß). */
export async function cropFromWork(work: Blob, box: Box): Promise<HTMLCanvasElement> {
  const bitmap = await loadBitmap(work)
  const px = toPixels(box, bitmap.width, bitmap.height)
  const { w, h } = fitSize(px.w, px.h, FULL_MAX)
  const c = makeCanvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, px.x, px.y, px.w, px.h, 0, 0, w, h)
  bitmap.close()
  return c
}

/** Macht alles außerhalb der Maske durchsichtig (Maske: ein Wert 0–255 pro Pixel). */
export function applyMask(canvas: HTMLCanvasElement, mask: Uint8ClampedArray): HTMLCanvasElement {
  const ctx = canvas.getContext('2d')!
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height)
  for (let i = 0; i < mask.length; i++) img.data[i * 4 + 3] = mask[i]
  ctx.putImageData(img, 0, 0)
  return canvas
}

/** Schneidet durchsichtigen Rand weg und erzeugt die Dateien zum Speichern. */
export async function finalize(canvas: HTMLCanvasElement): Promise<ItemImages & { preview: string; avgHex: string }> {
  const ctx = canvas.getContext('2d')!
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const bounds = alphaBounds(pixels, canvas.width, canvas.height)
  let trimmed = canvas
  if (bounds && (bounds.w < canvas.width || bounds.h < canvas.height)) {
    trimmed = makeCanvas(bounds.w, bounds.h)
    trimmed.getContext('2d')!.drawImage(canvas, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h)
  }
  let full = await toBlob(scaled(trimmed, FULL_MAX), 'image/webp', 0.9)
  // Safari kann kein WebP schreiben und liefert dann PNG: kleiner speichern, damit die Datei nicht riesig wird.
  if (full.type !== 'image/webp') full = await toBlob(scaled(trimmed, 768), 'image/png')
  const thumbCanvas = scaled(trimmed, THUMB_MAX)
  let thumb = await toBlob(thumbCanvas, 'image/webp', 0.85)
  if (thumb.type !== 'image/webp') thumb = await toBlob(thumbCanvas, 'image/png')
  return { full, thumb, aspect: trimmed.width / trimmed.height, preview: URL.createObjectURL(thumb), avgHex: averageHex(pixels) }
}

/** Durchschnittsfarbe aller sichtbaren Pixel – Ersatz, wenn keine Farbe erkannt wurde. */
export function averageHex(data: Uint8ClampedArray): string {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 128) continue
    r += data[i]
    g += data[i + 1]
    b += data[i + 2]
    n++
  }
  if (n === 0) return '#888888'
  const hex = (v: number) => Math.round(v / n).toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
