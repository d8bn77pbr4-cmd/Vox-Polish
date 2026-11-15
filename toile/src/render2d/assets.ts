import { uid } from '../core/model';
import type { ProjectStore } from '../state/persistence';
import { projectStore } from '../state/persistence';

const bitmaps = new Map<string, ImageBitmap>();
const pending = new Map<string, Promise<ImageBitmap | undefined>>();
const listeners = new Set<() => void>();
let version = 0;
export const assetVersion = () => version;
export function onAssets(f: () => void) { listeners.add(f); return () => listeners.delete(f); }
const notify = () => { version++; listeners.forEach((f) => f()); };

export function getBitmap(id: string | null | undefined): ImageBitmap | undefined {
  if (!id) return undefined;
  const b = bitmaps.get(id);
  if (!b && !pending.has(id)) void loadBitmap(id);
  return b;
}
export function loadBitmap(id: string, ps: ProjectStore = projectStore): Promise<ImageBitmap | undefined> {
  if (bitmaps.has(id)) return Promise.resolve(bitmaps.get(id));
  if (!pending.has(id)) {
    pending.set(id, (async () => {
      const blob = await ps.getAsset(id);
      if (!blob) return undefined;
      const bmp = await createImageBitmap(blob);
      bitmaps.set(id, bmp); notify();
      return bmp;
    })().catch(() => undefined));
  }
  return pending.get(id)!;
}
export function cacheBitmap(id: string, bmp: ImageBitmap) { bitmaps.set(id, bmp); notify(); }

/** Stores an image (downscaled to ≤ maxSide px) and returns its asset id. */
export async function putImageFile(file: Blob, ps: ProjectStore = projectStore, maxSide = 4096): Promise<string> {
  let bmp = await createImageBitmap(file);
  let blob: Blob = file;
  const long = Math.max(bmp.width, bmp.height);
  if (long > maxSide || !/^image\/(png|jpeg|webp)$/.test(file.type)) {
    const k = Math.min(1, maxSide / long);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Bild konnte nicht verarbeitet werden'))), type, 0.92));
    bmp.close();
    bmp = await createImageBitmap(blob);
  }
  const id = uid('a_');
  await ps.putAsset(id, blob);
  cacheBitmap(id, bmp);
  return id;
}

export async function canvasToAsset(c: HTMLCanvasElement, ps: ProjectStore = projectStore): Promise<string> {
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
  return putImageFile(blob, ps);
}
