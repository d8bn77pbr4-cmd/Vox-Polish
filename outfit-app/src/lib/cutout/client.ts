import type { LabelMap } from './labels'
import type { CutoutReply, CutoutRequest } from './worker'

type Done = Exclude<CutoutReply, { loading: true } | { error: string }>

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (reply: Done) => void; reject: (e: Error) => void }>()
let progressListener: ((percent: number) => void) | null = null

function start(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (event: MessageEvent<CutoutReply>) => {
    const msg = event.data
    if ('loading' in msg) {
      progressListener?.(msg.progress)
      return
    }
    const job = pending.get(msg.id)
    if (!job) return
    pending.delete(msg.id)
    if ('error' in msg) job.reject(new Error(msg.error))
    else job.resolve(msg)
  }
  worker.onerror = () => {
    for (const job of pending.values()) job.reject(new Error('Freistellen ist abgestürzt.'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function ask(kind: CutoutRequest['kind'], bitmap: ImageBitmap): Promise<Done> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    start().postMessage({ id, kind, bitmap } satisfies CutoutRequest, [bitmap])
  })
}

/** Meldet den Lade-Fortschritt der Freistell-Modelle (0–100), nur beim ersten Mal nötig. */
export function onModelProgress(listener: ((percent: number) => void) | null) {
  progressListener = listener
}

/** Erkennt Kleidung an Personen auf dem ganzen Foto (einmal pro Foto, gilt für alle getragenen Teile). */
export async function clothesMap(photo: HTMLCanvasElement): Promise<LabelMap> {
  const reply = await ask('clothes', await createImageBitmap(photo))
  if (reply.kind !== 'clothes') throw new Error('Unerwartete Antwort')
  return { labels: reply.labels, map: reply.map, width: reply.width, height: reply.height }
}

/** Entfernt den Hintergrund eines Ausschnitts. Liefert die Maske oder null, wenn nichts übrig bliebe. */
export async function removeBackground(crop: HTMLCanvasElement): Promise<Uint8ClampedArray | null> {
  const reply = await ask('background', await createImageBitmap(crop))
  if (reply.kind !== 'background') throw new Error('Unerwartete Antwort')
  return reply.mask
}
