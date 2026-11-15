import type { PatternPiece } from '../core/pattern/types';
import type { Vec2 } from '../core/geometry/vec';
import { piecePolygon, saOutline } from '../core/pattern/piece';
import { bbox, pointAtLength, flattenPath, polygonArea } from '../core/geometry/path';

export interface PieceGeo { piece: PatternPiece; poly: Vec2[]; sa: Vec2[]; b: ReturnType<typeof bbox>; d: string; ox: number; oy: number }

export function pathD(p: PatternPiece): string {
  const n = p.nodes;
  let d = `M${n[0].x} ${n[0].y}`;
  for (let i = 0; i < n.length; i++) {
    const a = n[i], b = n[(i + 1) % n.length];
    if (a.hout || b.hin) { const c1 = a.hout ?? a, c2 = b.hin ?? b; d += ` C${c1.x} ${c1.y} ${c2.x} ${c2.y} ${b.x} ${b.y}`; }
    else d += ` L${b.x} ${b.y}`;
  }
  return d + ' Z';
}
const polyD = (pts: Vec2[]) => 'M' + pts.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L') + ' Z';
export { polyD };

export function layoutPieces(pieces: PatternPiece[], stored: Record<string, Vec2>, withSA = true): PieceGeo[] {
  const out: PieceGeo[] = [];
  let x = 0, y = 0, rowH = 0;
  for (const p of pieces) {
    const poly = piecePolygon(p), sa = withSA ? saOutline(p) : poly, b = bbox(sa);
    const w = b.maxX - b.minX, h = b.maxY - b.minY;
    let pos = stored[p.id];
    if (!pos) {
      if (x > 0 && x + w > 2600) { x = 0; y += rowH + 80; rowH = 0; }
      pos = { x, y };
      x += w + 70; rowH = Math.max(rowH, h);
    }
    out.push({ piece: p, poly, sa, b, d: pathD(p), ox: pos.x - b.minX, oy: pos.y - b.minY });
  }
  return out;
}

export function notchMarks(p: PatternPiece): { a: Vec2; b: Vec2 }[] {
  const res: { a: Vec2; b: Vec2 }[] = [];
  for (const nt of p.notches) {
    const i = p.nodes.findIndex((n) => n.id === nt.at);
    if (i < 0) continue;
    const f = flattenPath(p.nodes), full = f.pts, start = f.nodeIdx[i];
    const sg = polygonArea(full) > 0 ? 1 : -1;
    const ring = [...full.slice(start), ...full.slice(0, start), full[start]];
    const offs = nt.double ? [nt.offset - 3, nt.offset + 3] : [nt.offset];
    for (const o of offs) {
      const q = pointAtLength(ring, o), q2 = pointAtLength(ring, o + 0.5);
      const dx = q2.x - q.x, dy = q2.y - q.y, l = Math.hypot(dx, dy) || 1;
      res.push({ a: q, b: { x: q.x + ((sg * dy) / l) * 6, y: q.y + ((-sg * dx) / l) * 6 } });
    }
  }
  return res;
}
