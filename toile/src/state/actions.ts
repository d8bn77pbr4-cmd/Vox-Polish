import type { Garment, Project } from '../core/model';
import { newGarment, baseLayer, defaultMaterialFor, uid } from '../core/model';
import type { PatternPiece, Seam } from '../core/pattern/types';
import { resolveGarment } from '../core/resolve';
import { getTemplate, defaultParams } from '../core/templates/registry';
import type { SizeSpec } from '../core/sizing/charts';
import { appStore } from './store';

const S = () => appStore.getState();
export const gOf = (d: Project, id: string) => d.garments.find((g) => g.id === id)!;
export const activeGarment = (): Garment | undefined => { const s = S(); return s.project?.garments.find((g) => g.id === s.ui.garmentId); };

/** Makes sure every instance of the resolved garment has its own surface entry. */
export function ensureSurfaces(g: Garment) {
  for (const inst of resolveGarment(g).instances) {
    if (!g.surfaces[inst.key]) {
      const p = resolveGarment(g).pieces.find((x) => x.id === inst.pieceId)!;
      g.surfaces[inst.key] = { layers: [baseLayer(defaultMaterialFor(g.templateId, p))] };
    }
  }
}

export function addGarment(templateId: string, silhouetteId: string) {
  let id = '';
  S().update('Kleidungsstück hinzufügen', (d) => { const g = newGarment(templateId, silhouetteId, d); id = g.id; d.garments.push(g); });
  S().setUi({ garmentId: id, instanceKey: null, layerId: null, selection: { nodeIds: [] } });
}
export function removeGarment(id: string) {
  S().update('Kleidungsstück entfernen', (d) => { d.garments = d.garments.filter((g) => g.id !== id); });
  const p = S().project!;
  S().setUi({ garmentId: p.garments[0]?.id ?? null, instanceKey: null, layerId: null });
}
export function duplicateGarment(id: string) {
  S().update('Kleidungsstück duplizieren', (d) => { const g = gOf(d, id); d.garments.push({ ...structuredClone(g), id: uid('g_'), name: g.name + ' (Kopie)' }); });
}
export function setGarmentField<K extends keyof Garment>(id: string, key: K, value: Garment[K], label = 'Ändern') {
  S().update(label, (d) => { (gOf(d, id) as Garment)[key] = value; }, `${id}:${String(key)}`);
}
export function setParam(id: string, key: string, value: number) {
  S().update('Parameter ändern', (d) => { const g = gOf(d, id); g.params[key] = value; ensureSurfaces(g); }, `${id}:param:${key}`);
}
export function setSilhouette(id: string, silId: string) {
  S().update('Silhouette wählen', (d) => {
    const g = gOf(d, id), t = getTemplate(g.templateId), sil = t.silhouettes.find((s) => s.id === silId)!;
    g.silhouetteId = silId; g.params = { ...defaultParams(t), ...sil.params }; ensureSurfaces(g);
  });
}
export function setSize(id: string, size: SizeSpec) {
  S().update('Größe ändern', (d) => { const g = gOf(d, id); g.size = size; ensureSurfaces(g); }, `${id}:size`);
}
/** Edits a piece; template pieces are detached into overrides first (stored at the size of baseMeasurements). */
export function editPiece(gid: string, pieceId: string, fn: (p: PatternPiece) => PatternPiece, key?: string, label = 'Schnittteil bearbeiten') {
  S().update(label, (d) => {
    const g = gOf(d, gid);
    const res = resolveGarment(g);
    if (g.baseMeasurements && JSON.stringify(g.baseMeasurements) !== JSON.stringify(res.m)) {
      // re-base stored geometry to the current size so the edit happens on what the user sees
      for (const k of Object.keys(g.overrides)) g.overrides[k] = structuredClone(res.pieces.find((p) => p.id === k)!);
      g.custom = g.custom.map((c) => structuredClone(res.pieces.find((p) => p.id === c.id)!));
    }
    g.baseMeasurements = res.m;
    const cur = structuredClone(res.pieces.find((p) => p.id === pieceId)!);
    const ci = g.custom.findIndex((c) => c.id === pieceId);
    if (ci >= 0) g.custom[ci] = fn(cur); else g.overrides[pieceId] = fn(cur);
    ensureSurfaces(g);
  }, key);
}
export function restorePiece(gid: string, pieceId: string) {
  S().update('Grundschnitt wiederherstellen', (d) => { const g = gOf(d, gid); delete g.overrides[pieceId]; if (!Object.keys(g.overrides).length && !g.custom.length) delete g.baseMeasurements; });
}
export function addCustomPiece(gid: string, p: PatternPiece) {
  S().update('Eigenes Teil', (d) => { const g = gOf(d, gid); g.baseMeasurements ??= resolveGarment(g).m; g.custom.push(p); ensureSurfaces(g); });
}
export function removeCustomPiece(gid: string, pieceId: string) {
  S().update('Teil löschen', (d) => { const g = gOf(d, gid); g.custom = g.custom.filter((c) => c.id !== pieceId); g.customSeams = g.customSeams.filter((s) => s.a.piece !== pieceId && s.b.piece !== pieceId); });
}
export function addSeam(gid: string, s: Seam) { S().update('Naht anlegen', (d) => { gOf(d, gid).customSeams.push(s); }); }
export function flipSeam(gid: string, sid: string) { S().update('Naht umkehren', (d) => { const s = gOf(d, gid).customSeams.find((x) => x.id === sid); if (s) s.flip = !s.flip; }); }
export function deleteSeam(gid: string, sid: string) { S().update('Naht löschen', (d) => { const g = gOf(d, gid); g.customSeams = g.customSeams.filter((x) => x.id !== sid); }); }
export function setLayout(gid: string, pieceId: string, x: number, y: number, key: string) {
  S().update('Teil verschieben', (d) => { gOf(d, gid).layout[pieceId] = { x, y }; }, key);
}
