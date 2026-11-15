import type { Body } from '../sim/body';
import { bodyDistance } from '../sim/body';

export interface MeshData { positions: Float32Array; uvs: Float32Array; indices: Uint32Array }

/** Radius of the avatar (plus gap) along a horizontal ray at height y. */
export function radiusAt(body: Body, y: number, th: number, gap: number) {
  const n = [0, 0, 0];
  let lo = 0, hi = 0.5;
  for (let k = 0; k < 30; k++) { const r = (lo + hi) / 2; if (bodyDistance(body, Math.sin(th) * r, y, Math.cos(th) * r, n) < gap) lo = r; else hi = r; }
  return (lo + hi) / 2;
}

/** Belt ribbon around the avatar. uvOf maps strap coordinates (mm along, mm across) to texture uv. */
export function beltGeometry(body: Body, p: { width: number; position: number; extra: number }, gap: number, strapLen: number, uvOf: (x: number, y: number) => [number, number]) {
  const y = body.waistY - p.position * (body.waistY - body.hipY);
  const N = 120, w = p.width / 1000, th = 0.004;
  const ring: [number, number][] = [];
  for (let i = 0; i <= N; i++) { const a = (i / N) * Math.PI * 2; const r = radiusAt(body, y, a, gap) + th; ring.push([Math.sin(a) * r, Math.cos(a) * r]); }
  let C = 0; const arc = [0];
  for (let i = 1; i <= N; i++) { C += Math.hypot(ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]); arc.push(C); }
  // strap: from buckle at front (x=0 mm) around, then the tip overlaps the front again
  const tail = Math.min(0.14, Math.max(0.04, (strapLen / 1000) - C));
  const pts: { x: number; z: number; s: number; out: number }[] = [];
  for (let i = 0; i <= N; i++) pts.push({ x: ring[i][0], z: ring[i][1], s: arc[i], out: 0 });
  const r0 = Math.hypot(ring[0][0], ring[0][1]) + 0.005;
  for (let i = 1; i <= 24; i++) { const f = (tail * i) / 24, ang = f / r0; pts.push({ x: Math.sin(ang) * r0, z: Math.cos(ang) * r0, s: C + f, out: 0.005 }); }
  const P: number[] = [], U: number[] = [], I: number[] = [];
  for (const q of pts) {
    for (const dy of [w / 2, -w / 2]) {
      P.push(q.x, y + dy, q.z);
      const uv = uvOf(Math.min(strapLen, q.s * 1000), dy > 0 ? 0 : p.width);
      U.push(uv[0], uv[1]);
    }
  }
  for (let i = 0; i < pts.length - 1; i++) { const a = i * 2; I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  return { mesh: { positions: Float32Array.from(P), uvs: Float32Array.from(U), indices: Uint32Array.from(I) } as MeshData, y, frontR: ring[0][1] };
}
