/// <reference lib="webworker" />
// Stellt Teile frei – läuft im Hintergrund, damit die App nicht einfriert.
// Getragene Teile: ein Modell, das Kleidung an Personen erkennt. Alles andere: Hintergrund entfernen.
import { env, pipeline, RawImage } from '@huggingface/transformers'

env.allowLocalModels = false

const CLOTHES_MODEL = 'Xenova/segformer_b2_clothes'
const BACKGROUND_MODEL = 'briaai/RMBG-1.4'

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

export interface CutoutRequest {
  id: number
  bitmap: ImageBitmap
  category: string
  accessoryType: string | null
  worn: boolean
}
export type CutoutReply =
  | { id: number; mask: Uint8ClampedArray | null; method: 'clothes' | 'background' | 'none' }
  | { id: number; error: string }
  | { progress: number; loading: true }

const MIN_COVER = 0.03
const post = (msg: CutoutReply, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(msg, transfer)

const onProgress = (p: any) => {
  if (p?.status === 'progress' && typeof p.progress === 'number') post({ progress: p.progress, loading: true })
}

let clothes: Promise<any> | null = null
let background: Promise<any> | null = null
const clothesModel = () =>
  (clothes ??= pipeline('image-segmentation', CLOTHES_MODEL, { dtype: 'q8', progress_callback: onProgress } as any))
const backgroundModel = () =>
  (background ??= pipeline('background-removal', BACKGROUND_MODEL, { dtype: 'q8', progress_callback: onProgress } as any))

function cover(mask: Uint8ClampedArray): number {
  let n = 0
  for (let i = 0; i < mask.length; i++) if (mask[i] > 127) n++
  return mask.length ? n / mask.length : 0
}

/** Glättet harte Maskenkanten mit einem kleinen Weichzeichner. */
function soften(mask: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let n = 0
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx
          if (xx < 0 || xx >= w) continue
          sum += mask[yy * w + xx]
          n++
        }
      }
      out[y * w + x] = sum / n
    }
  }
  return out
}

async function byClothes(image: RawImage, labels: string[]): Promise<Uint8ClampedArray | null> {
  const model = await clothesModel()
  const parts: { label: string; mask: RawImage }[] = await model(image)
  const mask = new Uint8ClampedArray(image.width * image.height)
  for (const part of parts) {
    if (!labels.includes(part.label)) continue
    const data = part.mask.data
    const step = part.mask.channels
    for (let i = 0; i < mask.length; i++) if (data[i * step] > mask[i]) mask[i] = data[i * step]
  }
  return cover(mask) >= MIN_COVER ? soften(mask, image.width, image.height) : null
}

async function byBackground(image: RawImage): Promise<Uint8ClampedArray | null> {
  const model = await backgroundModel()
  const result = await model(image)
  const cut: RawImage = Array.isArray(result) ? result[0] : result
  if (cut.channels !== 4) return null
  const mask = new Uint8ClampedArray(cut.width * cut.height)
  for (let i = 0; i < mask.length; i++) mask[i] = cut.data[i * 4 + 3]
  return cover(mask) >= MIN_COVER ? mask : null
}

self.onmessage = async (event: MessageEvent<CutoutRequest>) => {
  const { id, bitmap, category, accessoryType, worn } = event.data
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    bitmap.close()
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const image = new RawImage(pixels.data, canvas.width, canvas.height, 4)
    const labels = LABELS[category === 'accessory' ? (accessoryType ?? '') : category] ?? []

    let mask: Uint8ClampedArray | null = null
    let method: 'clothes' | 'background' | 'none' = 'none'
    if (worn) {
      // Am Körper getragen: nur das Kleidungs-Modell. Hintergrund entfernen würde die ganze Person ausschneiden.
      if (labels.length) mask = await byClothes(image, labels)
      if (mask) method = 'clothes'
    } else {
      mask = await byBackground(image)
      if (mask) method = 'background'
      else if (labels.length) {
        mask = await byClothes(image, labels)
        if (mask) method = 'clothes'
      }
    }
    post({ id, mask, method }, mask ? [mask.buffer] : [])
  } catch (err) {
    post({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
