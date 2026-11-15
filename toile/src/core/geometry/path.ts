import type { Vec2 } from './vec';
import { flattenCubic } from './bezier';

export interface PathNode { id: string; x: number; y: number; hin?: Vec2 | null; hout?: Vec2 | null; smooth?: boolean }
export interface Flattened { pts: Vec2[]; nodeIdx: number[] }

/** Points of segment i → i+1 (closed path), excluding the start node, including the end node. */
export function segmentPoints(nodes: PathNode[], i: number, tol = 0.3): Vec2[] {
  const a = nodes[i], b = nodes[(i + 1) % nodes.length];
  if (!a.hout && !b.hin) return [{ x: b.x, y: b.y }];
  return flattenCubic(a, a.hout ?? a, b.hin ?? b, b, tol);
}

export function flattenPath(nodes: PathNode[], tol = 0.3): Flattened {
  const pts: Vec2[] = [];
  const nodeIdx: number[] = [];
  for (let i = 0; i < nodes.length; i++) {
    nodeIdx.push(pts.length);
    pts.push({ x: nodes[i].x, y: nodes[i].y });
    const seg = segmentPoints(nodes, i, tol);
    for (let k = 0; k < seg.length - 1; k++) pts.push(seg[k]);
  }
  return { pts, nodeIdx };
}

/** Polyline from node `fromId` forward (node order, wrapping) to `toId`, both ends included. */
export function edgePolyline(nodes: PathNode[], fromId: string, toId: string, tol = 0.3): Vec2[] {
  const n = nodes.length;
  const s = nodes.findIndex((p) => p.id === fromId);
  const e = nodes.findIndex((p) => p.id === toId);
  if (s < 0 || e < 0) throw new Error(`edge ${fromId}→${toId}: unknown node`);
  const out: Vec2[] = [{ x: nodes[s].x, y: nodes[s].y }];
  let i = s;
  do {
    out.push(...segmentPoints(nodes, i, tol));
    i = (i + 1) % n;
  } while (i !== e);
  return out;
}

export function polylineLength(pts: Vec2[]): number {
  let l = 0;
  for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return l;
}

export function pointAtLength(pts: Vec2[], s: number): Vec2 {
  if (s <= 0) return { ...pts[0] };
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (acc + l >= s && l > 0) {
      const t = (s - acc) / l;
      return { x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * t, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * t };
    }
    acc += l;
  }
  return { ...pts[pts.length - 1] };
}

/** n points (n ≥ 2) at equal arc-length spacing, ends included. */
export function resamplePolyline(pts: Vec2[], n: number): Vec2[] {
  const L = polylineLength(pts);
  const out: Vec2[] = [];
  let seg = 1, acc = 0;
  for (let k = 0; k < n; k++) {
    const s = (L * k) / (n - 1);
    while (seg < pts.length - 1) {
      const l = Math.hypot(pts[seg].x - pts[seg - 1].x, pts[seg].y - pts[seg - 1].y);
      if (acc + l >= s) break;
      acc += l; seg++;
    }
    const a = pts[seg - 1], b = pts[seg];
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    const t = l > 0 ? Math.min(1, Math.max(0, (s - acc) / l)) : 0;
    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
  out[0] = { ...pts[0] };
  out[n - 1] = { ...pts[pts.length - 1] };
  return out;
}

/** Shoelace area of a closed polygon (last point ≠ first). */
export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += pts[j].x * pts[i].y - pts[i].x * pts[j].y;
  return a / 2;
}

export function pointInPolygon(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function bbox(pts: Vec2[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  return { minX, minY, maxX, maxY };
}

/** Horizontal extent of a closed polygon at height y (outermost crossings). */
export function widthAtY(poly: Vec2[], y: number): { minX: number; maxX: number } | null {
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[j], b = poly[i];
    if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
      const x = a.y === b.y ? Math.min(a.x, b.x) : a.x + ((y - a.y) / (b.y - a.y)) * (b.x - a.x);
      const x2 = a.y === b.y ? Math.max(a.x, b.x) : x;
      if (x < minX) minX = x; if (x2 > maxX) maxX = x2;
    }
  }
  return minX === Infinity ? null : { minX, maxX };
}

export function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}

export function distToPolygon(p: Vec2, poly: Vec2[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(p, poly[j], poly[i]));
  return d;
}
