import type { Vec2 } from './vec';
import { polygonArea } from './path';

/** Offsets a closed polygon outward; dist[i] applies to segment i → i+1. Miter joins, clamped. */
export function offsetPolygon(poly: Vec2[], dist: number[], miterLimit = 3): Vec2[] {
  const n = poly.length;
  if (n < 3) return poly.slice();
  // positive shoelace area (clockwise on a y-down screen): (dy,-dx) points outward
  const sign = polygonArea(poly) > 0 ? 1 : -1;
  const normals: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    normals.push({ x: (sign * dy) / l, y: (-sign * dx) / l });
  }
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = (i - 1 + n) % n;
    const n0 = normals[prev], n1 = normals[i];
    const d0 = dist[prev] ?? 0, d1 = dist[i] ?? 0;
    const p = poly[i];
    // intersection of offset lines: p + n0*d0 + t*dir0 and p + n1*d1 + s*dir1
    const a0 = { x: p.x + n0.x * d0, y: p.y + n0.y * d0 };
    const a1 = { x: p.x + n1.x * d1, y: p.y + n1.y * d1 };
    const dir0 = { x: -n0.y, y: n0.x }, dir1 = { x: -n1.y, y: n1.x };
    const den = dir0.x * dir1.y - dir0.y * dir1.x;
    if (Math.abs(den) < 1e-9) { out.push(a1); continue; }
    const t = ((a1.x - a0.x) * dir1.y - (a1.y - a0.y) * dir1.x) / den;
    const q = { x: a0.x + dir0.x * t, y: a0.y + dir0.y * t };
    const md = Math.max(d0, d1) * miterLimit;
    if (Math.hypot(q.x - p.x, q.y - p.y) > md && md > 0) { out.push(a0, a1); } else out.push(q);
  }
  return out;
}
