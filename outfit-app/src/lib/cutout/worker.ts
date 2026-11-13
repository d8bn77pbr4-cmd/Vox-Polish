/// <reference lib="webworker" />
// Stellt Teile frei – läuft im Hintergrund, damit die App nicht einfriert.
// „clothes“: erkennt Kleidung an Personen auf dem ganzen Foto. „background“: entfernt den Hintergrund eines Ausschnitts.
import { env, pipeline, RawImage } from '@huggingface/transformers'

env.allowLocalModels = false

const CLOTHES_MODEL = 'Xenova/segformer_b2_clothes'
const BACKGROUND_MODEL = 'briaai/RMBG-1.4'
const MIN_COVER = 0.03

export interface CutoutRequest {
  id: number
  kind: 'clothes' | 'background'
  bitmap: ImageBitmap
}
export type CutoutReply =
  | { id: number; kind: 'clothes'; labels: string[]; map: Uint8Array; width: number; height: number }
  | { id: number; kind: 'background'; mask: Uint8ClampedArray | null }
  | { id: number; error: string }
  | { loading: true; progress: number }

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

function toRaw(bitmap: ImageBitmap): RawImage {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return new RawImage(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height, 4)
}

self.onmessage = async (event: MessageEvent<CutoutRequest>) => {
  const { id, kind, bitmap } = event.data
  try {
    const image = toRaw(bitmap)
    if (kind === 'clothes') {
      const model = await clothesModel()
      const parts: { label: string; mask: RawImage }[] = await model(image)
      const labels = ['']
      const map = new Uint8Array(image.width * image.height)
      for (const part of parts) {
        const index = labels.push(part.label) - 1
        const data = part.mask.data
        const step = part.mask.channels
        for (let i = 0; i < map.length; i++) if (data[i * step] > 127) map[i] = index
      }
      post({ id, kind, labels, map, width: image.width, height: image.height }, [map.buffer])
      return
    }
    const model = await backgroundModel()
    const result = await model(image)
    const cut: RawImage = Array.isArray(result) ? result[0] : result
    let mask: Uint8ClampedArray | null = null
    if (cut.channels === 4) {
      mask = new Uint8ClampedArray(cut.width * cut.height)
      let visible = 0
      for (let i = 0; i < mask.length; i++) {
        mask[i] = cut.data[i * 4 + 3]
        if (mask[i] > 127) visible++
      }
      if (cut.width !== image.width || cut.height !== image.height || visible / mask.length < MIN_COVER) mask = null
    }
    post({ id, kind, mask }, mask ? [mask.buffer] : [])
  } catch (err) {
    post({ id, error: err instanceof Error ? err.message : String(err) })
  }
}
