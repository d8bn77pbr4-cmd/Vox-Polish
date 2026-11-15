import { createStore as idbCreate, get, set, del, keys, type UseStore } from 'idb-keyval';
import { putImageFile, getBitmap } from '../render2d/assets';

export interface LibraryItem { id: string; name: string; w: number; h: number; addedAt: number }
const mem = new Map<string, LibraryItem>();
const L: UseStore | null = typeof indexedDB !== 'undefined' ? idbCreate('toile-library', 'kv') : null;
const listeners = new Set<() => void>();
export const onLibrary = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
const notify = () => listeners.forEach((f) => f());

export async function listLibrary(): Promise<LibraryItem[]> {
  const items = L ? ((await Promise.all((await keys(L)).map((k) => get<LibraryItem>(k, L)))).filter(Boolean) as LibraryItem[]) : [...mem.values()];
  return items.sort((a, b) => b.addedAt - a.addedAt);
}
export async function addToLibrary(blob: Blob, name: string): Promise<LibraryItem> {
  const id = await putImageFile(blob);
  const bmp = getBitmap(id);
  const item: LibraryItem = { id, name: name.replace(/\.[a-z0-9]+$/i, '') || 'Bild', w: bmp?.width ?? 0, h: bmp?.height ?? 0, addedAt: Date.now() };
  if (L) await set(id, item, L); else mem.set(id, item);
  notify();
  return item;
}
export async function renameLibrary(id: string, name: string) {
  const it = L ? await get<LibraryItem>(id, L) : mem.get(id);
  if (!it) return;
  const n = { ...it, name };
  if (L) await set(id, n, L); else mem.set(id, n);
  notify();
}
export async function removeFromLibrary(id: string) { if (L) await del(id, L); else mem.delete(id); notify(); }

/** Tries to fetch an image URL; most sites block this (CORS), then the caller shows a hint. */
export async function importFromUrl(url: string): Promise<LibraryItem> {
  const r = await fetch(url, { mode: 'cors' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const b = await r.blob();
  if (!b.type.startsWith('image/')) throw new Error('Keine Bilddatei');
  return addToLibrary(b, url.split('/').pop()?.split('?')[0] || 'Bild');
}
