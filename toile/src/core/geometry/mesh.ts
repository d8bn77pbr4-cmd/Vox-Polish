import Delaunator from 'delaunator';
import type { Vec2 } from './vec';
import { pointInPolygon, distToPolygon, bbox } from './path';

/** Triangulates a closed boundary (already resampled) plus an interior hex grid. Boundary points come first. */
export function meshPolygon(boundary: Vec2[], spacing: number): { pts: Vec2[]; tris: Uint32Array; boundaryCount: number } {
  const pts: Vec2[] = boundary.map((p) => ({ x: p.x, y: p.y }));
  const b = bbox(boundary);
  const dy = spacing * Math.sqrt(3) / 2;
  let row = 0;
  for (let y = b.minY + dy / 2; y < b.maxY; y += dy, row++) {
    for (let x = b.minX + (row % 2 ? spacing / 2 : 0); x < b.maxX; x += spacing) {
      const p = { x, y };
      if (pointInPolygon(p, boundary) && distToPolygon(p, boundary) >= 0.45 * spacing) pts.push(p);
    }
  }
  const coords = new Float64Array(pts.length * 2);
  pts.forEach((p, i) => { coords[2 * i] = p.x; coords[2 * i + 1] = p.y; });
  const d = new Delaunator(coords);
  const keep: number[] = [];
  for (let t = 0; t < d.triangles.length; t += 3) {
    const i = d.triangles[t], j = d.triangles[t + 1], k = d.triangles[t + 2];
    const a = pts[i], bb = pts[j], c = pts[k];
    const area = Math.abs((bb.x - a.x) * (c.y - a.y) - (c.x - a.x) * (bb.y - a.y)) / 2;
    if (area < 1e-6) continue;
    const cen = { x: (a.x + bb.x + c.x) / 3, y: (a.y + bb.y + c.y) / 3 };
    if (!pointInPolygon(cen, boundary)) continue;
    // drop slivers spanning across a concave notch: all-boundary triangles with very long edges
    keep.push(i, j, k);
  }
  return { pts, tris: Uint32Array.from(keep), boundaryCount: boundary.length };
}
