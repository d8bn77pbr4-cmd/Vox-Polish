import type { Layer, Project, RasterFrame } from '../core/model';
import { uid } from '../core/model';
import { projectStore, saveHooks, type ProjectStore } from '../state/persistence';
import { appStore, rasterHooks } from '../state/store';

type PaintLayer = Extract<Layer, { kind: 'paint' }>;
const rasters = new Map<string, HTMLCanvasElement>();
const loading = new Set<string>();
export const dirtyRasters = new Set<string>();
const listeners = new Set<() => void>();
export function onRaster(f: () => void) { listeners.add(f); return () => listeners.delete(f); }
export const notifyRaster = () => listeners.forEach((f) => f());

export function getRaster(layer: PaintLayer): HTMLCanvasElement {
  let c = rasters.get(layer.id);
  if (!c) {
    c = document.createElement('canvas');
    c.width = layer.frame.w; c.height = layer.frame.h;
    rasters.set(layer.id, c);
    if (layer.assetId && !loading.has(layer.id)) {
      loading.add(layer.id);
      const target = c;
      void projectStore.getAsset(layer.assetId).then(async (b) => {
        if (!b) return;
        const bmp = await createImageBitmap(b);
        target.getContext('2d')!.drawImage(bmp, 0, 0);
        notifyRaster();
      });
    }
  }
  return c;
}
export function newPaintFrame(f: RasterFrame): RasterFrame { return { ...f }; }
export function cloneRasterInto(srcId: string, dstId: string, mirror: boolean) {
  const s = rasters.get(srcId); if (!s || typeof document === 'undefined') return;
  const d = document.createElement('canvas'); d.width = s.width; d.height = s.height;
  const g = d.getContext('2d')!;
  if (mirror) { g.translate(d.width, 0); g.scale(-1, 1); }
  g.drawImage(s, 0, 0); rasters.set(dstId, d); dirtyRasters.add(dstId);
}

rasterHooks.apply = (layerId, rect, data) => {
  const c = rasters.get(layerId);
  if (!c) return;
  c.getContext('2d')!.putImageData(data, rect.x, rect.y);
  dirtyRasters.add(layerId);
  notifyRaster();
};

function findPaint(p: Project, id: string): PaintLayer | undefined {
  for (const g of p.garments) for (const s of Object.values(g.surfaces)) for (const l of s.layers) if (l.id === id && l.kind === 'paint') return l;
}

export async function flushRasters(ps: ProjectStore = projectStore) {
  const p = appStore.getState().project;
  if (!p || !dirtyRasters.size) return;
  const ids = [...dirtyRasters];
  dirtyRasters.clear();
  for (const id of ids) {
    const c = rasters.get(id), layer = findPaint(p, id);
    if (!c || !layer) continue;
    const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
    if (!blob) continue;
    const assetId = layer.assetId ?? uid('a_');
    await ps.putAsset(assetId, blob);
    if (!layer.assetId) appStore.getState().silent((d) => { const l = findPaint(d, id); if (l) l.assetId = assetId; });
  }
}
saveHooks.before.push(() => flushRasters());
