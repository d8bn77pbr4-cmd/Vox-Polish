import type { Garment, Layer, LayerKind, Material, Project, Surface, Trim, PatternSpec } from '../core/model';
import { uid, baseLayer, defaultMaterialFor } from '../core/model';
import { resolveGarment, linkedFrom } from '../core/resolve';
import { appStore } from './store';
import { gOf } from './actions';
import { surfaceFrame } from '../render2d/frame';
import { cloneRasterInto } from '../render2d/raster';
import { TRIM_CATALOG, ligneToMm } from '../core/textile/catalog';
import { bbox } from '../core/geometry/path';
import { surfaceOutline } from '../render2d/frame';

const S = () => appStore.getState();
/** deep copy that also works on immer drafts */
const dclone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const common = (name: string) => ({ id: uid('l_'), name, visible: true, locked: false, opacity: 1, blend: 'normal' as const });

/** The surface key edits go to (linked R edits land on L). */
export const editKey = (g: Garment, key: string) => linkedFrom(g, key) ?? key;

function surf(g: Garment, key: string): Surface {
  const k = editKey(g, key);
  if (!g.surfaces[k]) {
    const p = resolveGarment(g).pieces.find((x) => x.id === k.split(':')[0]);
    g.surfaces[k] = { layers: [baseLayer(p ? defaultMaterialFor(g.templateId, p) : 'jersey180')] };
  }
  return g.surfaces[k];
}
export function updateSurface(gid: string, key: string, fn: (s: Surface, g: Garment, d: Project) => void, label = 'Ebene ändern', coalesce?: string) {
  S().update(label, (d) => { const g = gOf(d, gid); fn(surf(g, key), g, d); }, coalesce);
}
export function updateLayer(gid: string, key: string, layerId: string, patch: Partial<Layer>, label = 'Ebene ändern', coalesce?: string) {
  updateSurface(gid, key, (s) => { const l = s.layers.find((x) => x.id === layerId); if (l) Object.assign(l, patch); }, label, coalesce ?? `${layerId}:${Object.keys(patch).join(',')}`);
}
export function instancePiece(g: Garment, key: string) {
  return resolveGarment(g).instances.find((i) => i.key === editKey(g, key))?.piece;
}
export function pieceSize(g: Garment, key: string) {
  const p = instancePiece(g, key);
  if (!p) return { w: 300, h: 400, minY: 0 };
  const b = bbox(surfaceOutline(p));
  return { w: b.maxX - b.minX, h: b.maxY - b.minY, minY: b.minY, minX: b.minX };
}
export function addLayer(gid: string, key: string, kind: LayerKind, extra: Record<string, unknown> = {}): string {
  const g = S().project!.garments.find((x) => x.id === gid)!;
  const sz = pieceSize(g, key);
  let layer: Layer;
  const ps = instancePiece(g, key);
  switch (kind) {
    case 'fill': layer = { ...common('Farbe'), kind: 'fill', color: S().ui.color, ...extra } as Layer; break;
    case 'pattern': layer = { ...common('Muster'), kind: 'pattern', pattern: { type: 'stripes', colors: ['#f4f1ea', '#1c2541'], scale: 20, angle: 0 } as PatternSpec, ...extra } as Layer; break;
    case 'paint': layer = { ...common('Malebene'), kind: 'paint', assetId: null, frame: ps ? surfaceFrame(ps) : { x0: -200, y0: -10, pxPerMm: 2, w: 800, h: 1000 }, ...extra } as Layer; break;
    case 'text': layer = { ...common('Text'), kind: 'text', text: 'TOILE', font: 'Cormorant Garamond', size: Math.max(12, sz.w * 0.1), color: S().ui.color, x: 0, y: sz.minY + sz.h * 0.3, rot: 0, tracking: 2, ...extra } as Layer; break;
    case 'image': layer = { ...common('Druck'), kind: 'image', assetId: '', x: 0, y: sz.minY + sz.h * 0.3, w: sz.w * 0.4, rot: 0, adjust: { hue: 0, sat: 0, bright: 0, contrast: 0 }, ...extra } as Layer; break;
    default: layer = baseLayer('jersey180');
  }
  updateSurface(gid, key, (s) => {
    const sel = S().ui.layerId;
    const i = s.layers.findIndex((l) => l.id === sel);
    s.layers.splice(i >= 0 ? i + 1 : s.layers.length, 0, layer);
  }, 'Ebene hinzufügen');
  S().setUi({ layerId: layer.id });
  return layer.id;
}
export function removeLayer(gid: string, key: string, layerId: string) {
  updateSurface(gid, key, (s) => { if (s.layers.find((l) => l.id === layerId)?.kind === 'base') return; s.layers = s.layers.filter((l) => l.id !== layerId); }, 'Ebene löschen');
  S().setUi({ layerId: null });
}
export function moveLayer(gid: string, key: string, layerId: string, dir: 1 | -1) {
  updateSurface(gid, key, (s) => {
    const i = s.layers.findIndex((l) => l.id === layerId), j = i + dir;
    if (i < 0 || j < 1 || j >= s.layers.length || s.layers[i].kind === 'base') return;
    [s.layers[i], s.layers[j]] = [s.layers[j], s.layers[i]];
  }, 'Ebene verschieben');
}
export function duplicateLayer(gid: string, key: string, layerId: string) {
  updateSurface(gid, key, (s) => {
    const i = s.layers.findIndex((l) => l.id === layerId); if (i < 0 || s.layers[i].kind === 'base') return;
    const c = { ...dclone(s.layers[i]), id: uid('l_'), name: s.layers[i].name + ' Kopie' } as Layer;
    if (c.kind === 'paint') { cloneRasterInto(layerId, c.id, false); }
    s.layers.splice(i + 1, 0, c);
  }, 'Ebene duplizieren');
}
/** Applies a material to one instance, all instances of the piece, or the whole garment. */
export function applyMaterial(gid: string, key: string, materialId: string, scope: 'piece' | 'same' | 'garment') {
  S().update('Stoff zuweisen', (d) => {
    const g = gOf(d, gid);
    const keys = resolveGarment(g).instances.map((i) => i.key).filter((k) => scope === 'garment' || (scope === 'same' ? k.split(':')[0] === key.split(':')[0] : k === editKey(g, key)));
    for (const k of keys) { const s = surf(g, k); const b = s.layers.find((l) => l.kind === 'base'); if (b && b.kind === 'base') b.materialId = materialId; }
  });
}
export function addMaterial(m: Partial<Material>): string {
  const id = uid('m_');
  S().update('Neuer Stoff', (d) => { const base = d.materials[0]; d.materials.push({ ...dclone(base), name: 'Neuer Stoff', textureAssetId: null, ...m, id }); });
  return id;
}
export function updateMaterial(id: string, patch: Partial<Material>, coalesce?: string) {
  S().update('Stoff ändern', (d) => { const m = d.materials.find((x) => x.id === id); if (m) Object.assign(m, patch); }, coalesce ?? `mat:${id}:${Object.keys(patch).join(',')}`);
}
/** Copies L's surface to R (positions mirrored, paint rasters flipped). */
export function copyLeftToRight(gid: string, pieceId?: string) {
  S().update('Von links übernehmen', (d) => {
    const g = gOf(d, gid);
    for (const inst of resolveGarment(g).instances) {
      if (inst.side !== 'R' || (pieceId && inst.pieceId !== pieceId)) continue;
      const L = g.surfaces[`${inst.pieceId}:L`]; if (!L) continue;
      g.surfaces[inst.key] = { layers: L.layers.map((l) => {
        const c = { ...dclone(l), id: uid('l_') } as Layer;
        if (c.kind === 'image' || c.kind === 'text') { c.x = -c.x; c.rot = -c.rot; }
        if (c.kind === 'paint' && l.kind === 'paint') { c.assetId = null; c.frame = { ...l.frame, x0: -(l.frame.x0 + l.frame.w / l.frame.pxPerMm) }; cloneRasterInto(l.id, c.id, true); }
        return c;
      }) };
      g.trims = g.trims.filter((t) => t.key !== inst.key).concat(g.trims.filter((t) => t.key === `${inst.pieceId}:L`).map((t) => ({ ...t, id: uid('t_'), key: inst.key, x: -t.x, rot: -t.rot })));
    }
  });
}
export function setLinkSides(gid: string, on: boolean) {
  if (!on) { S().update('Seiten trennen', (d) => { gOf(d, gid).linkSides = false; }); copyLeftToRight(gid); }
  else S().update('Seiten koppeln', (d) => { gOf(d, gid).linkSides = true; });
}
// ---- trims ----
export function addTrim(gid: string, key: string, type: Trim['type'], x: number, y: number): string {
  const cat = TRIM_CATALOG.find((t) => t.type === type)!;
  const size = cat.unit === 'L' ? ligneToMm(cat.sizes[Math.min(3, cat.sizes.length - 1)]) : cat.sizes[Math.min(1, cat.sizes.length - 1)];
  const id = uid('t_');
  S().update('Zutat setzen', (d) => {
    const g = gOf(d, gid), k = editKey(g, key), mir = k !== key;
    g.trims.push({ id, type, key: k, x: mir ? -x : x, y, size, color: cat.color, finish: cat.finishes[0], rot: 0, length: type === 'zipper' ? 300 : type === 'drawcord' ? 400 : undefined, text: type === 'label' ? 'TOILE' : undefined });
  });
  return id;
}
export function updateTrim(gid: string, id: string, patch: Partial<Trim>, coalesce?: string) {
  S().update('Zutat ändern', (d) => { const t = gOf(d, gid).trims.find((x) => x.id === id); if (t) Object.assign(t, patch); }, coalesce ?? `trim:${id}:${Object.keys(patch).join(',')}`);
}
export function removeTrim(gid: string, id: string) { S().update('Zutat entfernen', (d) => { const g = gOf(d, gid); g.trims = g.trims.filter((t) => t.id !== id); }); }
