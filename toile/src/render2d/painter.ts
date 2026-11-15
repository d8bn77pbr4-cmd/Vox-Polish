import type { Layer } from '../core/model';
import { surfaceFor, linkedFrom } from '../core/resolve';
import { appStore } from '../state/store';
import { addLayer } from '../state/designActions';
import { getRaster, dirtyRasters, notifyRaster } from './raster';
import { Stroke } from './brush';

type PaintLayer = Extract<Layer, { kind: 'paint' }>;
let cur: { stroke: Stroke; layer: PaintLayer; before: HTMLCanvasElement; raster: HTMLCanvasElement; mir: number } | null = null;

function ensurePaintLayer(gid: string, key: string): PaintLayer {
  const st = appStore.getState();
  const g = st.project!.garments.find((x) => x.id === gid)!;
  const s = surfaceFor(g, key);
  const top = [...s.layers].reverse().find((l) => l.kind === 'paint' && !l.locked);
  if (top && top.kind === 'paint') return top;
  const id = addLayer(gid, key, 'paint');
  return surfaceFor(appStore.getState().project!.garments.find((x) => x.id === gid)!, key).layers.find((l) => l.id === id) as PaintLayer;
}
/** Starts a stroke on the instance at surface coords (mm). */
export function beginPaint(gid: string, key: string, x: number, y: number, pressure: number, erase = false) {
  const st = appStore.getState();
  const g = st.project!.garments.find((q) => q.id === gid)!;
  const layer = ensurePaintLayer(gid, key);
  const raster = getRaster(layer);
  const before = document.createElement('canvas'); before.width = raster.width; before.height = raster.height; before.getContext('2d')!.drawImage(raster, 0, 0);
  const stroke = new Stroke(raster.getContext('2d')!, erase ? { ...st.ui.brush, brush: 'eraser' } : st.ui.brush, st.ui.color, { erase });
  cur = { stroke, layer, before, raster, mir: linkedFrom(g, key) ? -1 : 1 };
  continuePaint(x, y, pressure);
}
export function continuePaint(x: number, y: number, pressure: number) {
  if (!cur) return;
  const f = cur.layer.frame;
  cur.stroke.add({ x: (x * cur.mir - f.x0) * f.pxPerMm, y: (y - f.y0) * f.pxPerMm, pressure });
  dirtyRasters.add(cur.layer.id); notifyRaster();
}
export function endPaint() {
  if (!cur) return;
  const r = cur.stroke.end();
  const x = Math.max(0, r.x), y = Math.max(0, r.y), w = Math.min(cur.raster.width - x, r.w), h = Math.min(cur.raster.height - y, r.h);
  if (w > 0 && h > 0) appStore.getState().pushRaster({ kind: 'raster', label: 'Pinselstrich (3D)', layerId: cur.layer.id, rect: { x, y, w, h }, before: cur.before.getContext('2d')!.getImageData(x, y, w, h), after: cur.raster.getContext('2d')!.getImageData(x, y, w, h) });
  dirtyRasters.add(cur.layer.id); notifyRaster();
  cur = null;
}
export const isPainting = () => !!cur;
