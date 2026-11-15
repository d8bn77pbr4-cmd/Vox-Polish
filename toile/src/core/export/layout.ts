import type { Garment } from '../model';
import type { PatternPiece } from '../pattern/types';
import type { Vec2 } from '../geometry/vec';
import { resolveGarment } from '../resolve';
import { getTemplate, defaultParams } from '../templates/registry';
import { measurementsFor, SIZE_SYSTEMS } from '../sizing/charts';
import { piecePolygon, saOutline, pieceAnchor } from '../pattern/piece';
import { bbox } from '../geometry/path';
import { proportionalScale } from '../sizing/grading';
import { scalePiece } from '../pattern/piece';

export interface ExportPiece {
  id: string; name: string; cut: string; grain: number; ox: number; oy: number;
  sizes: { label: string; seam: Vec2[]; cut: Vec2[]; dx: number; dy: number }[];
  internal: PatternPiece['internal']; notches: { a: Vec2; b: Vec2 }[]; b: ReturnType<typeof bbox>;
}
export interface ExportSet { garment: string; pieces: ExportPiece[]; width: number; height: number; seamAllowance: boolean; sizes: string[] }

/** Pieces of a garment for export, nested by size at their anchor and shelf-packed on a 1400 mm wide sheet. */
export function exportSet(g: Garment, opts: { sizes?: string[]; seamAllowance: boolean; sheetWidth?: number }, notchFn?: (p: PatternPiece) => { a: Vec2; b: Vec2 }[]): ExportSet {
  const t = getTemplate(g.templateId);
  const cur = resolveGarment(g);
  const labels = g.size.system === 'custom' ? ['Maß'] : (opts.sizes?.length ? opts.sizes : [g.size.label]);
  const piecesBySize = labels.map((label) => {
    if (g.size.system === 'custom' || label === (g.size as { label?: string }).label) return { label, pieces: cur.pieces };
    const m = measurementsFor({ system: g.size.system, label });
    const out = t.build(m, { ...defaultParams(t), ...g.params });
    const sc = g.baseMeasurements ? proportionalScale(g.baseMeasurements, m, t.gradeKeys) : { sx: 1, sy: 1 };
    const pieces = out.pieces.map((p) => (g.overrides[p.id] ? scalePiece(g.overrides[p.id], sc.sx, sc.sy) : p)).concat(g.custom.map((c) => scalePiece(c, sc.sx, sc.sy)));
    return { label, pieces };
  });
  const W = opts.sheetWidth ?? 1400, gap = 30;
  let x = 0, y = 0, rowH = 0, maxX = 0;
  const pieces: ExportPiece[] = [];
  for (const ref of cur.pieces) {
    const a0 = pieceAnchor(ref);
    const sizes = piecesBySize.map(({ label, pieces: ps }) => {
      const p = ps.find((q) => q.id === ref.id) ?? ref, a = pieceAnchor(p);
      return { label, seam: piecePolygon(p, 0.8), cut: opts.seamAllowance ? saOutline(p) : piecePolygon(p, 0.8), dx: a0.x - a.x, dy: a0.y - a.y };
    });
    const all = sizes.flatMap((s) => s.cut.map((q) => ({ x: q.x + s.dx, y: q.y + s.dy })));
    const b = bbox(all);
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    if (x > 0 && x + w > W) { x = 0; y += rowH + gap; rowH = 0; }
    pieces.push({ id: ref.id, name: ref.name, cut: ref.cut.count === 2 ? '2× gegengleich' : '1×', grain: ref.grain, ox: x - b.minX, oy: y - b.minY, sizes, internal: ref.internal, notches: notchFn ? notchFn(ref) : [], b });
    x += w + gap; rowH = Math.max(rowH, h); maxX = Math.max(maxX, x);
  }
  return { garment: g.name, pieces, width: Math.max(maxX - gap, 1), height: y + rowH, seamAllowance: opts.seamAllowance, sizes: labels };
}
export const allSizeLabels = (g: Garment) => (g.size.system === 'custom' ? [] : SIZE_SYSTEMS[g.size.system].labels);
export const sizeHue = (i: number, n: number) => (n <= 1 ? 0 : 210 - (i / (n - 1)) * 210);
