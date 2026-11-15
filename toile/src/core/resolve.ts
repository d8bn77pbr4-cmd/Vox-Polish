import type { PatternPiece, Seam, Pom, Side } from './pattern/types';
import type { Measurements } from './sizing/measurements';
import type { Garment, Surface } from './model';
import { baseLayer, defaultMaterialFor, measurementsOf } from './model';
import { getTemplate, defaultParams } from './templates/registry';
import { proportionalScale } from './sizing/grading';
import { mirrorPiece, scalePiece } from './pattern/piece';

export interface Instance { key: string; pieceId: string; side: Side; mirrored: boolean; piece: PatternPiece }
export interface Resolved { pieces: PatternPiece[]; seams: Seam[]; pom: Pom[]; instances: Instance[]; m: Measurements; warnings: string[] }

const cache = new Map<string, Resolved>();

export function resolveGarment(g: Garment): Resolved {
  const key = JSON.stringify([g.templateId, g.params, g.size, g.overrides, g.custom, g.customSeams, g.baseMeasurements]);
  const hit = cache.get(key);
  if (hit) return hit;
  const t = getTemplate(g.templateId);
  const m = measurementsOf(g);
  const warnings: string[] = [];
  const out = t.build(m, { ...defaultParams(t), ...g.params });
  const sc = g.baseMeasurements ? proportionalScale(g.baseMeasurements, m, t.gradeKeys) : { sx: 1, sy: 1 };
  const grade = (p: PatternPiece) => (sc.sx === 1 && sc.sy === 1 ? p : scalePiece(p, sc.sx, sc.sy));
  const pieces = out.pieces.map((p) => (g.overrides[p.id] ? grade(g.overrides[p.id]) : p));
  for (const c of g.custom) pieces.push(grade(c));
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const valid = (s: Seam) => [s.a, s.b].every((e) => {
    const p = byId.get(e.piece);
    return !!p && p.nodes.some((n) => n.id === e.from) && p.nodes.some((n) => n.id === e.to) && (p.cut.count === 1 || !!e.side);
  });
  const seams: Seam[] = [];
  for (const s of [...out.seams, ...g.customSeams]) {
    if (valid(s)) seams.push(s);
    else warnings.push(`Naht „${s.id}“ passt nicht mehr zu den Schnittteilen und wird ignoriert.`);
  }
  const instances: Instance[] = [];
  for (const p of pieces) {
    if (p.cut.count === 2) {
      instances.push({ key: `${p.id}:L`, pieceId: p.id, side: 'L', mirrored: false, piece: p });
      instances.push({ key: `${p.id}:R`, pieceId: p.id, side: 'R', mirrored: true, piece: mirrorPiece(p) });
    } else instances.push({ key: `${p.id}:C`, pieceId: p.id, side: 'C', mirrored: false, piece: p });
  }
  const res: Resolved = { pieces, seams, pom: out.pom, instances, m, warnings };
  if (cache.size > 60) cache.delete(cache.keys().next().value!);
  cache.set(key, res);
  return res;
}

export function linkedFrom(g: Garment, key: string): string | null {
  return g.linkSides && key.endsWith(':R') ? key.slice(0, -1) + 'L' : null;
}

const fallback = new Map<string, Surface>();
export function surfaceFor(g: Garment, key: string): Surface {
  const k = linkedFrom(g, key) ?? key;
  const s = g.surfaces[k];
  if (s) return s;
  const fk = g.templateId + '|' + k;
  if (!fallback.has(fk)) {
    const pieceId = k.split(':')[0];
    const p = resolveGarment(g).pieces.find((x) => x.id === pieceId);
    fallback.set(fk, { layers: [baseLayer(p ? defaultMaterialFor(g.templateId, p) : getTemplate(g.templateId).defaultMaterial)] });
  }
  return fallback.get(fk)!;
}
