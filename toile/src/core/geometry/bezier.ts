import type { Vec2 } from './vec';

export function cubicPoint(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const u = 1 - t;
  const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** Flattens a cubic into points (excluding p0, including p3) with max chord deviation ~tol. */
export function flattenCubic(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, tol = 0.3): Vec2[] {
  const dd = Math.hypot(p0.x - 2 * p1.x + p2.x, p0.y - 2 * p1.y + p2.y) + Math.hypot(p1.x - 2 * p2.x + p3.x, p1.y - 2 * p2.y + p3.y);
  const n = Math.max(1, Math.min(256, Math.ceil(Math.sqrt((3 * dd) / (4 * tol)))));
  const out: Vec2[] = [];
  for (let i = 1; i <= n; i++) out.push(cubicPoint(p0, p1, p2, p3, i / n));
  return out;
}
