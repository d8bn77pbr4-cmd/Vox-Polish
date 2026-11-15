import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore as useZustand } from 'zustand';
import { produceWithPatches, applyPatches, enablePatches } from 'immer';
import type { Project } from '../core/model';
import { createHistory, type HistoryEntry } from './history';

enablePatches();

export type Workspace = 'mappe' | 'schnitt' | 'design' | 'anprobe';
export type ToolId =
  | 'select' | 'direct' | 'addPoint' | 'delPoint' | 'curve' | 'pen' | 'measure' | 'notch' | 'sew' | 'hand'
  | 'move' | 'brush' | 'eraser' | 'eyedropper' | 'fill' | 'text' | 'trim';
export interface BrushSettings { brush: string; size: number; opacity: number; hardness: number; flow: number; spacing: number; smoothing: number }
export interface UiState {
  workspace: Workspace; split: boolean; tool: ToolId;
  garmentId: string | null; instanceKey: string | null; layerId: string | null;
  selection: { pieceId?: string; nodeIds: string[] };
  brush: BrushSettings; color: string;
  simQuality: 'draft' | 'standard' | 'fine'; fitMap: boolean; light: 'studio' | 'day' | 'runway';
  grading: boolean; showSA: boolean; paint3d: boolean; dirty: boolean; toast: string | null; trimType: string;
}
export interface AppState {
  project: Project | null;
  ui: UiState;
  version: number;
  openProject(p: Project): void;
  closeProject(): void;
  update(label: string, recipe: (d: Project) => void, key?: string): void;
  /** change without an undo step (e.g. asset ids after saving) */
  silent(recipe: (d: Project) => void): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  setUi(p: Partial<UiState>): void;
  pushRaster(e: Extract<HistoryEntry, { kind: 'raster' }>): void;
  toast(msg: string): void;
}

export const defaultUi = (): UiState => ({
  workspace: 'mappe', split: false, tool: 'select', garmentId: null, instanceKey: null, layerId: null,
  selection: { nodeIds: [] },
  brush: { brush: 'ink', size: 12, opacity: 1, hardness: 0.8, flow: 1, spacing: 0.15, smoothing: 0.5 },
  color: '#1b1b1d', simQuality: 'standard', fitMap: false, light: 'studio', grading: false, showSA: true, paint3d: false,
  dirty: false, toast: null, trimType: 'button4',
});

/** Raster undo hook, registered by the render layer. */
export const rasterHooks: { apply: (layerId: string, rect: { x: number; y: number; w: number; h: number }, data: ImageData) => void } = { apply: () => {} };

export function createAppStore(): StoreApi<AppState> {
  const history = createHistory(150);
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  return createStore<AppState>((set, get) => ({
    project: null, ui: defaultUi(), version: 0,
    openProject(p) { history.clear(); set({ project: p, version: get().version + 1, ui: { ...get().ui, workspace: p.garments.length ? 'schnitt' : 'schnitt', garmentId: p.garments[0]?.id ?? null, instanceKey: null, layerId: null, selection: { nodeIds: [] } } }); },
    closeProject() { history.clear(); set({ project: null, ui: { ...get().ui, workspace: 'mappe', garmentId: null } }); },
    update(label, recipe, key) {
      const cur = get().project;
      if (!cur) return;
      const [next, patches, inverse] = produceWithPatches(cur, recipe);
      if (!patches.length) return;
      history.push({ kind: 'patch', label, patches, inverse, key, time: Date.now() });
      set({ project: { ...next, updatedAt: Date.now() }, version: get().version + 1, ui: { ...get().ui, dirty: true } });
    },
    silent(recipe) {
      const cur = get().project;
      if (!cur) return;
      const [next] = produceWithPatches(cur, recipe);
      set({ project: next });
    },
    undo() {
      const e = history.undo();
      if (!e) return;
      if (e.kind === 'patch') set({ project: applyPatches(get().project!, e.inverse), version: get().version + 1, ui: { ...get().ui, dirty: true } });
      else { rasterHooks.apply(e.layerId, e.rect, e.before); set({ version: get().version + 1, ui: { ...get().ui, dirty: true } }); }
    },
    redo() {
      const e = history.redo();
      if (!e) return;
      if (e.kind === 'patch') set({ project: applyPatches(get().project!, e.patches), version: get().version + 1, ui: { ...get().ui, dirty: true } });
      else { rasterHooks.apply(e.layerId, e.rect, e.after); set({ version: get().version + 1, ui: { ...get().ui, dirty: true } }); }
    },
    canUndo: () => history.canUndo(),
    canRedo: () => history.canRedo(),
    setUi(p) { set({ ui: { ...get().ui, ...p } }); },
    pushRaster(e) { history.push(e); set({ version: get().version + 1, ui: { ...get().ui, dirty: true } }); },
    toast(msg) {
      clearTimeout(toastTimer);
      set({ ui: { ...get().ui, toast: msg } });
      toastTimer = setTimeout(() => set({ ui: { ...get().ui, toast: null } }), 2600);
    },
  }));
}

export const appStore = createAppStore();
export function useApp<T>(sel: (s: AppState) => T): T { return useZustand(appStore, sel); }
