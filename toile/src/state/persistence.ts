import { createStore as idbCreate, get, set, del, keys, type UseStore } from 'idb-keyval';
import type { Project } from '../core/model';
import type { StoreApi } from 'zustand/vanilla';
import type { AppState } from './store';

export interface ProjectMeta { id: string; name: string; updatedAt: number; garments: number; thumb?: Blob }
export interface ProjectStore {
  list(): Promise<ProjectMeta[]>;
  load(id: string): Promise<Project | null>;
  save(p: Project, thumb?: Blob): Promise<void>;
  remove(id: string): Promise<void>;
  putAsset(id: string, blob: Blob): Promise<void>;
  getAsset(id: string): Promise<Blob | null>;
}

const metaOf = (p: Project, thumb?: Blob, old?: ProjectMeta): ProjectMeta => ({ id: p.id, name: p.name, updatedAt: p.updatedAt, garments: p.garments.length, thumb: thumb ?? old?.thumb });

export function memoryStore(): ProjectStore {
  const projects = new Map<string, Project>(), meta = new Map<string, ProjectMeta>(), assets = new Map<string, Blob>();
  return {
    async list() { return [...meta.values()].sort((a, b) => b.updatedAt - a.updatedAt); },
    async load(id) { const p = projects.get(id); return p ? structuredClone(p) : null; },
    async save(p, thumb) { projects.set(p.id, structuredClone(p)); meta.set(p.id, metaOf(p, thumb, meta.get(p.id))); },
    async remove(id) { projects.delete(id); meta.delete(id); },
    async putAsset(id, blob) { assets.set(id, blob); },
    async getAsset(id) { return assets.get(id) ?? null; },
  };
}

export function idbStore(): ProjectStore {
  const P: UseStore = idbCreate('toile-projects', 'kv'), A: UseStore = idbCreate('toile-assets', 'kv'), M: UseStore = idbCreate('toile-meta', 'kv');
  return {
    async list() {
      const ks = await keys(M);
      const ms = (await Promise.all(ks.map((k) => get<ProjectMeta>(k, M)))).filter(Boolean) as ProjectMeta[];
      return ms.sort((a, b) => b.updatedAt - a.updatedAt);
    },
    async load(id) { return (await get<Project>(id, P)) ?? null; },
    async save(p, thumb) { const old = await get<ProjectMeta>(p.id, M); await set(p.id, p, P); await set(p.id, metaOf(p, thumb, old), M); },
    async remove(id) { await del(id, P); await del(id, M); },
    async putAsset(id, blob) { await set(id, blob, A); },
    async getAsset(id) { return (await get<Blob>(id, A)) ?? null; },
  };
}

export const saveHooks: { before: Array<() => Promise<void>>; thumb: () => Promise<Blob | undefined> } = { before: [], thumb: async () => undefined };

export function startAutosave(store: StoreApi<AppState>, ps: ProjectStore, delay = 1500) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let saving = false;
  const flush = async () => {
    const p = store.getState().project;
    if (!p || saving) return;
    saving = true;
    try {
      for (const f of saveHooks.before) await f();
      const cur = store.getState().project!;
      await ps.save(cur, await saveHooks.thumb().catch(() => undefined));
      store.getState().setUi({ dirty: false });
    } finally { saving = false; }
  };
  const unsub = store.subscribe((s, prev) => {
    if (s.version !== prev.version && s.project) { clearTimeout(timer); timer = setTimeout(flush, delay); }
  });
  const onHide = () => { if (document.visibilityState === 'hidden') void flush(); };
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onHide);
  return { flush, stop() { unsub(); clearTimeout(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onHide); } };
}

export const projectStore: ProjectStore = typeof indexedDB !== 'undefined' ? idbStore() : memoryStore();
