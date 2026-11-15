import type { Patch } from 'immer';

export type HistoryEntry =
  | { kind: 'patch'; label: string; patches: Patch[]; inverse: Patch[]; key?: string; time: number }
  | { kind: 'raster'; label: string; layerId: string; rect: { x: number; y: number; w: number; h: number }; before: ImageData; after: ImageData };

export function createHistory(limit = 150) {
  let past: HistoryEntry[] = [];
  let future: HistoryEntry[] = [];
  return {
    push(e: HistoryEntry) {
      const last = past[past.length - 1];
      if (e.kind === 'patch' && last?.kind === 'patch' && e.key && last.key === e.key && e.time - last.time < 600) {
        past[past.length - 1] = { ...last, patches: [...last.patches, ...e.patches], inverse: [...e.inverse, ...last.inverse], time: e.time, label: e.label };
      } else {
        past.push(e);
        if (past.length > limit) past = past.slice(past.length - limit);
      }
      future = [];
    },
    undo(): HistoryEntry | null { const e = past.pop(); if (!e) return null; future.push(e); return e; },
    redo(): HistoryEntry | null { const e = future.pop(); if (!e) return null; past.push(e); return e; },
    canUndo: () => past.length > 0,
    canRedo: () => future.length > 0,
    clear() { past = []; future = []; },
    peekLabel: () => past[past.length - 1]?.label ?? '',
  };
}
export type History = ReturnType<typeof createHistory>;
