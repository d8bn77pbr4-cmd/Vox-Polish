import type { CutoutReply, CutoutRequest } from './worker'

let worker: Worker | null = null
let nextId = 1
const pending = new Map<number, { resolve: (m: Uint8ClampedArray | null) => void; reject: (e: Error) => void }>()
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
    else job.resolve(msg.mask)
  }
  worker.onerror = () => {
    for (const job of pending.values()) job.reject(new Error('Freistellen ist abgestürzt.'))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

/** Meldet den Lade-Fortschritt der Freistell-Modelle (0–100), nur beim ersten Mal nötig. */
export function onModelProgress(listener: ((percent: number) => void) | null) {
  progressListener = listener
}

/**
 * Liefert eine Maske (ein Wert 0–255 je Pixel) für das Teil im Ausschnitt,
 * oder null, wenn sich nichts sinnvoll freistellen lässt.
 */
export async function segment(
  canvas: HTMLCanvasElement,
  what: { category: string; accessoryType: string | null; worn: boolean },
): Promise<Uint8ClampedArray | null> {
  const bitmap = await createImageBitmap(canvas)
  const id = nextId++
  const request: CutoutRequest = { id, bitmap, ...what }
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    start().postMessage(request, [bitmap])
  })
}
